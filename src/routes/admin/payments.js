const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');
const seasons = require('../../db/seasons');

const router = express.Router();

const LIST_SQL = `SELECT p.*, to_char(p.date, 'YYYY-MM-DD') AS date_str, pi.name as pilot_name, s.name AS season_name
                  FROM payments p
                  JOIN pilots pi ON p.pilot_id = pi.id
                  JOIN seasons s ON s.id = p.season_id
                  ORDER BY p.date DESC, p.created_at DESC`;

async function renderList(res, errors) {
  const [payments, pilots, allPilots, allSeasons, openSeason] = await Promise.all([
    pool.query(LIST_SQL),
    pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name'),
    pool.query('SELECT * FROM pilots ORDER BY name'),
    seasons.getAllSeasons(),
    seasons.getOpenSeason()
  ]);
  res.render('admin/payments', {
    title: 'Hinausmaksut',
    payments: payments.rows,
    pilots: pilots.rows,
    allPilots: allPilots.rows,
    seasons: allSeasons,
    openSeason,
    eur: seasons.eur,
    errors
  });
}

const paymentValidators = [
  body('pilot_id').isInt().withMessage('Valitse pilotti'),
  body('season_id').isInt().withMessage('Valitse kausi'),
  body('payment_method').trim().notEmpty().withMessage('Maksutapa vaaditaan'),
  body('type').isIn(['daily', 'season', 'per_tow']).withMessage('Valitse tyyppi'),
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  body('amount').if(body('type').equals('per_tow'))
    .customSanitizer(v => String(v || '').replace(',', '.'))
    .isFloat({ gt: 0 }).withMessage('Anna hinausmaksun summa')
];

// Summa kauden hinnoista; per hinaus -maksun summa annetaan käsin
async function resolveAmount(reqBody) {
  const season = await seasons.getSeason(parseInt(reqBody.season_id, 10));
  if (!season) return { error: 'Kautta ei löytynyt' };
  if (reqBody.type === 'season') return { amount: season.price_season };
  if (reqBody.type === 'daily') return { amount: season.price_daily };
  return { amount: parseFloat(reqBody.amount) };
}

router.get('/', requireAdmin, async (req, res) => {
  await renderList(res, null);
});

router.post('/', requireAdmin, paymentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return renderList(res, errors.array());
  }
  const { amount, error } = await resolveAmount(req.body);
  if (error) return renderList(res, [{ msg: error }]);

  const { pilot_id, season_id, payment_method, type, date, note } = req.body;
  await pool.query(
    `INSERT INTO payments (pilot_id, season_id, amount, payment_method, type, date, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [pilot_id, season_id, amount, payment_method, type, date, note || null, req.session.userId]
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
  const { amount, error } = await resolveAmount(req.body);
  if (error) return renderList(res, [{ msg: error }]);

  const { pilot_id, season_id, payment_method, type, date, note } = req.body;
  await pool.query(
    `UPDATE payments
     SET pilot_id = $1, season_id = $2, amount = $3, payment_method = $4, type = $5, date = $6, note = $7
     WHERE id = $8`,
    [pilot_id, season_id, amount, payment_method, type, date, note || null, id]
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
