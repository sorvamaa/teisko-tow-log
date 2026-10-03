const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');
const seasons = require('../../db/seasons');

const router = express.Router();

const todayStr = () => new Date().toISOString().split('T')[0];

async function renderList(res, errors, notice) {
  const all = await seasons.getAllSeasons();
  res.render('admin/seasons', { title: 'Kaudet', seasons: all, errors, notice });
}

router.get('/', requireAdmin, async (req, res) => {
  await renderList(res, null, req.query.closed ? 'Kausi suljettu ja uusi kausi aloitettu.' : null);
});

const priceValidators = [
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  body('price_daily').isFloat({ min: 0 }).withMessage('Päivämaksu ei kelpaa'),
  body('price_season').isFloat({ min: 0 }).withMessage('Kausikortin hinta ei kelpaa'),
  body('price_per_tow').isFloat({ min: 0 }).withMessage('Hinaushinta ei kelpaa')
];

// Kauden päättäminen: vahvistussivu
router.get('/close', requireAdmin, async (req, res) => {
  const open = await seasons.getOpenSeason();
  if (!open) return res.redirect('/admin/seasons');
  const balances = await seasons.computeBalances(open);
  const lastFlight = await pool.query(
    `SELECT to_char(MAX(date), 'YYYY-MM-DD') AS d FROM flight_days WHERE date >= $1`, [open.start_str]
  );
  const endDefault = todayStr();
  const nextYear = parseInt(endDefault.slice(0, 4), 10) + 1;
  res.render('admin/season-close', {
    title: 'Päätä kausi',
    season: open,
    balances,
    endDefault,
    lastFlight: lastFlight.rows[0].d,
    newName: `Kausi ${nextYear}`,
    errors: null
  });
});

router.post('/close', requireAdmin,
  body('end_date').isDate().withMessage('Loppupäivä vaaditaan'),
  body('new_name').trim().notEmpty().withMessage('Uuden kauden nimi vaaditaan'),
  async (req, res) => {
    const open = await seasons.getOpenSeason();
    if (!open) return res.redirect('/admin/seasons');
    const errors = validationResult(req).array();
    const { end_date, new_name } = req.body;

    if (!errors.length) {
      if (end_date < open.start_str) errors.push({ msg: 'Loppupäivä ei voi olla ennen kauden alkua.' });
      const later = await pool.query('SELECT COUNT(*) AS c FROM flight_days WHERE date > $1', [end_date]);
      if (parseInt(later.rows[0].c, 10) > 0) {
        errors.push({ msg: 'Loppupäivän jälkeen on jo kirjattuja lentopäiviä. Valitse myöhäisempi loppupäivä.' });
      }
    }
    if (errors.length) {
      const balances = await seasons.computeBalances(open);
      return res.render('admin/season-close', {
        title: 'Päätä kausi', season: open, balances, endDefault: end_date || todayStr(),
        lastFlight: null, newName: new_name, errors
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE seasons SET end_date = $1, closed_at = NOW(), closed_by = $2 WHERE id = $3',
        [end_date, req.session.userId, open.id]
      );
      await client.query(
        `INSERT INTO seasons (name, start_date, price_daily, price_season, price_per_tow, payment_instructions)
         VALUES ($1, $2::date + 1, $3, $4, $5, $6)`,
        [new_name.trim(), end_date, open.price_daily, open.price_season, open.price_per_tow, open.payment_instructions]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.redirect('/admin/seasons?closed=1');
  }
);

// Kausiraportti (myös suljetuille kausille, lasketaan aina ajantasaisesta datasta)
router.get('/:id/report', requireAdmin, async (req, res) => {
  const season = await seasons.getSeason(parseInt(req.params.id, 10));
  if (!season) return res.status(404).render('error', { title: '404', message: 'Kautta ei löytynyt.' });
  const from = season.start_str;
  const to = season.end_str || '9999-12-31';

  const [days, vehicles, income, expenses, balances] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS days,
              (SELECT COALESCE(SUM(fdv.tow_count), 0) FROM flight_day_vehicles fdv
               JOIN flight_days f ON f.id = fdv.flight_day_id WHERE f.date BETWEEN $1 AND $2) AS tows
       FROM flight_days WHERE date BETWEEN $1 AND $2`, [from, to]
    ),
    pool.query(
      `SELECT v.name, SUM(fdv.tow_count) AS tows
       FROM flight_day_vehicles fdv JOIN vehicles v ON v.id = fdv.vehicle_id
       JOIN flight_days fd ON fd.id = fdv.flight_day_id
       WHERE fd.date BETWEEN $1 AND $2 GROUP BY v.name ORDER BY tows DESC`, [from, to]
    ),
    pool.query(
      `SELECT type, COUNT(*) AS count, SUM(amount) AS total FROM payments WHERE season_id = $1 GROUP BY type`,
      [season.id]
    ),
    pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, amount, purchased_by, description
       FROM expenses WHERE date BETWEEN $1 AND $2 ORDER BY date`, [from, to]
    ),
    seasons.computeBalances(season)
  ]);

  const totalIncome = income.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const totalExpenses = expenses.rows.reduce((s, r) => s + parseFloat(r.amount), 0);

  res.render('admin/season-report', {
    title: `Kausiraportti – ${season.name}`,
    season,
    stats: days.rows[0],
    vehicles: vehicles.rows,
    income: income.rows,
    expenses: expenses.rows,
    totalIncome,
    totalExpenses,
    balances,
    pilots: seasons.pilotSummary(balances.rows)
  });
});

router.post('/:id', requireAdmin, priceValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return renderList(res, errors.array());
  const { name, price_daily, price_season, price_per_tow, payment_instructions } = req.body;
  await pool.query(
    `UPDATE seasons SET name = $1, price_daily = $2, price_season = $3, price_per_tow = $4, payment_instructions = $5
     WHERE id = $6`,
    [name, price_daily, price_season, price_per_tow, payment_instructions ? payment_instructions.trim() : null, parseInt(req.params.id, 10)]
  );
  res.redirect('/admin/seasons');
});

module.exports = router;
