const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

const LIST_SQL = `SELECT p.*, to_char(p.date, 'YYYY-MM-DD') AS date_str, pi.name as pilot_name
                  FROM payments p JOIN pilots pi ON p.pilot_id = pi.id
                  ORDER BY p.date DESC, p.created_at DESC`;

async function renderList(res, errors) {
  const [payments, pilots, allPilots] = await Promise.all([
    pool.query(LIST_SQL),
    pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name'),
    pool.query('SELECT * FROM pilots ORDER BY name')
  ]);
  res.render('admin/payments', {
    title: 'Hinausmaksut',
    payments: payments.rows,
    pilots: pilots.rows,
    allPilots: allPilots.rows,
    errors
  });
}

const paymentValidators = [
  body('pilot_id').isInt().withMessage('Valitse pilotti'),
  body('payment_method').trim().notEmpty().withMessage('Maksutapa vaaditaan'),
  body('type').isIn(['daily', 'season']).withMessage('Valitse tyyppi'),
  body('date').isDate().withMessage('Päivämäärä vaaditaan')
];

const amountFor = (type) => (type === 'season' ? 50 : 10);

router.get('/', requireAdmin, async (req, res) => {
  await renderList(res, null);
});

router.post('/', requireAdmin, paymentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return renderList(res, errors.array());
  }

  const { pilot_id, payment_method, type, date, note } = req.body;
  await pool.query(
    `INSERT INTO payments (pilot_id, amount, payment_method, type, date, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [pilot_id, amountFor(type), payment_method, type, date, note || null, req.session.userId]
  );
  res.redirect('/admin/payments');
});

router.post('/:id', requireAdmin, paymentValidators, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(404).render('error', { title: '404', message: 'Maksua ei löytynyt.' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return renderList(res, errors.array());
  }

  const { pilot_id, payment_method, type, date, note } = req.body;
  await pool.query(
    `UPDATE payments
     SET pilot_id = $1, amount = $2, payment_method = $3, type = $4, date = $5, note = $6
     WHERE id = $7`,
    [pilot_id, amountFor(type), payment_method, type, date, note || null, id]
  );
  res.redirect('/admin/payments');
});

router.post('/:id/delete', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(404).render('error', { title: '404', message: 'Maksua ei löytynyt.' });
  }
  await pool.query('DELETE FROM payments WHERE id = $1', [id]);
  res.redirect('/admin/payments');
});

module.exports = router;
