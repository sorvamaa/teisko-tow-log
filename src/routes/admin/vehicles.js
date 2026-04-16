const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM vehicles ORDER BY active DESC, name');
  res.render('admin/vehicles', { title: 'Ajoneuvot', vehicles: result.rows, errors: null });
});

router.post('/',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const result = await pool.query('SELECT * FROM vehicles ORDER BY active DESC, name');
      return res.render('admin/vehicles', { title: 'Ajoneuvot', vehicles: result.rows, errors: errors.array() });
    }
    await pool.query('INSERT INTO vehicles (name) VALUES ($1)', [req.body.name]);
    res.redirect('/admin/vehicles');
  }
);

router.post('/:id',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  async (req, res) => {
    const { name, active } = req.body;
    await pool.query(
      'UPDATE vehicles SET name = $1, active = $2 WHERE id = $3',
      [name, active === 'on', parseInt(req.params.id)]
    );
    res.redirect('/admin/vehicles');
  }
);

module.exports = router;
