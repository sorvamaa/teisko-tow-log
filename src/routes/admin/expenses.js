const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM expenses ORDER BY date DESC, created_at DESC');
  res.render('admin/expenses', { title: 'Kulut', expenses: result.rows, errors: null });
});

router.post('/',
  requireAdmin,
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Summa vaaditaan'),
  body('purchased_by').trim().notEmpty().withMessage('Hankkija vaaditaan'),
  body('description').trim().notEmpty().withMessage('Kuvaus vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const result = await pool.query('SELECT * FROM expenses ORDER BY date DESC');
      return res.render('admin/expenses', { title: 'Kulut', expenses: result.rows, errors: errors.array() });
    }

    const { date, amount, purchased_by, description, note } = req.body;
    await pool.query(
      `INSERT INTO expenses (date, amount, purchased_by, description, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [date, amount, purchased_by, description, note || null, req.session.userId]
    );
    res.redirect('/admin/expenses');
  }
);

module.exports = router;
