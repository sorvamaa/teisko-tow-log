const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT p.*,
            EXISTS(SELECT 1 FROM payments pm WHERE pm.pilot_id = p.id AND pm.type = 'season' AND EXTRACT(YEAR FROM pm.date) = $1) as has_season_pass
     FROM pilots p
     ORDER BY p.active DESC, p.name`,
    [year]
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
    await pool.query('INSERT INTO pilots (name, note) VALUES ($1, $2)', [req.body.name, req.body.note || null]);
    res.redirect('/admin/pilots');
  }
);

router.post('/:id',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  async (req, res) => {
    const { name, note, active } = req.body;
    await pool.query(
      'UPDATE pilots SET name = $1, note = $2, active = $3 WHERE id = $4',
      [name, note || null, active === 'on', parseInt(req.params.id)]
    );
    res.redirect('/admin/pilots');
  }
);

module.exports = router;
