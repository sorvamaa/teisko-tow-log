const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

const LIST_SQL = `SELECT id, to_char(date, 'YYYY-MM-DD') AS date_str, date, amount,
                         purchased_by, description, note, recorded_by, created_at
                  FROM expenses
                  ORDER BY date DESC, created_at DESC`;

async function renderList(res, errors) {
  const result = await pool.query(LIST_SQL);
  res.render('admin/expenses', { title: 'Kulut', expenses: result.rows, errors });
}

const expenseValidators = [
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Summa vaaditaan'),
  body('purchased_by').trim().notEmpty().withMessage('Hankkija vaaditaan'),
  body('description').trim().notEmpty().withMessage('Kuvaus vaaditaan')
];

router.get('/', requireAdmin, async (req, res) => {
  await renderList(res, null);
});

router.post('/', requireAdmin, expenseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return renderList(res, errors.array());
  }

  const { date, amount, purchased_by, description, note } = req.body;
  await pool.query(
    `INSERT INTO expenses (date, amount, purchased_by, description, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [date, amount, purchased_by, description, note || null, req.session.userId]
  );
  res.redirect('/admin/expenses');
});

router.post('/:id', requireAdmin, expenseValidators, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(404).render('error', { title: '404', message: 'Kulua ei löytynyt.' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return renderList(res, errors.array());
  }

  const { date, amount, purchased_by, description, note } = req.body;
  await pool.query(
    `UPDATE expenses
     SET date = $1, amount = $2, purchased_by = $3, description = $4, note = $5
     WHERE id = $6`,
    [date, amount, purchased_by, description, note || null, id]
  );
  res.redirect('/admin/expenses');
});

router.post('/:id/delete', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(404).render('error', { title: '404', message: 'Kulua ei löytynyt.' });
  }
  await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
  res.redirect('/admin/expenses');
});

module.exports = router;
