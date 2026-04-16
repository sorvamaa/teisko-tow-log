const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const [payments, pilots] = await Promise.all([
    pool.query(
      `SELECT p.*, pi.name as pilot_name
       FROM payments p JOIN pilots pi ON p.pilot_id = pi.id
       ORDER BY p.date DESC, p.created_at DESC`
    ),
    pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name')
  ]);
  res.render('admin/payments', {
    title: 'Hinausmaksut',
    payments: payments.rows,
    pilots: pilots.rows,
    errors: null
  });
});

router.post('/',
  requireAdmin,
  body('pilot_id').isInt().withMessage('Valitse pilotti'),
  body('payment_method').trim().notEmpty().withMessage('Maksutapa vaaditaan'),
  body('type').isIn(['daily', 'season']).withMessage('Valitse tyyppi'),
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const [payments, pilots] = await Promise.all([
        pool.query(
          `SELECT p.*, pi.name as pilot_name
           FROM payments p JOIN pilots pi ON p.pilot_id = pi.id
           ORDER BY p.date DESC`
        ),
        pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name')
      ]);
      return res.render('admin/payments', {
        title: 'Hinausmaksut',
        payments: payments.rows,
        pilots: pilots.rows,
        errors: errors.array()
      });
    }

    const { pilot_id, payment_method, type, date, note } = req.body;
    const amount = type === 'season' ? 50 : 10;
    await pool.query(
      `INSERT INTO payments (pilot_id, amount, payment_method, type, date, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pilot_id, amount, payment_method, type, date, note || null, req.session.userId]
    );
    res.redirect('/admin/payments');
  }
);

module.exports = router;
