const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*,
            EXISTS(SELECT 1 FROM payments pm JOIN seasons s ON s.id = pm.season_id
                   WHERE pm.pilot_id = p.id AND pm.type = 'season' AND s.end_date IS NULL) as has_season_pass
     FROM pilots p
     ORDER BY p.active DESC, p.name`
  );
  res.render('admin/pilots', { title: 'Pilotit', pilots: result.rows, errors: null });
});

router.post('/',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const result = await pool.query('SELECT * FROM pilots ORDER BY active DESC, name');
      return res.render('admin/pilots', { title: 'Pilotit', pilots: result.rows, errors: errors.array() });
    }
    const billingType = req.body.billing_type === 'per_tow' ? 'per_tow' : 'normal';
    await pool.query('INSERT INTO pilots (name, note, billing_type) VALUES ($1, $2, $3)', [req.body.name, req.body.note || null, billingType]);
    res.redirect('/admin/pilots');
  }
);

router.post('/:id',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  async (req, res) => {
    const { name, note, active } = req.body;
    const billingType = req.body.billing_type === 'per_tow' ? 'per_tow' : 'normal';
    await pool.query(
      'UPDATE pilots SET name = $1, note = $2, active = $3, billing_type = $4 WHERE id = $5',
      [name, note || null, active === 'on', billingType, parseInt(req.params.id)]
    );
    res.redirect('/admin/pilots');
  }
);

module.exports = router;
