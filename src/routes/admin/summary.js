const express = require('express');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/tows', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const year = new Date().getFullYear();
  const dateFrom = from || `${year}-01-01`;
  const dateTo = to || `${year}-12-31`;

  const [towsByVehicle, towsByDay, flightDayCount, pilotStats] = await Promise.all([
    pool.query(
      `SELECT v.name, COALESCE(SUM(fdv.tow_count), 0) as total_tows
       FROM vehicles v
       LEFT JOIN flight_day_vehicles fdv ON v.id = fdv.vehicle_id
       LEFT JOIN flight_days fd ON fdv.flight_day_id = fd.id AND fd.date BETWEEN $1 AND $2
       WHERE v.active = true
       GROUP BY v.id, v.name
       ORDER BY total_tows DESC`,
      [dateFrom, dateTo]
    ),
    pool.query(
      `SELECT fd.date,
              COALESCE(SUM(fdv.tow_count), 0) as total_tows,
              (SELECT COUNT(*) FROM flight_day_pilots fdp WHERE fdp.flight_day_id = fd.id) as pilot_count
       FROM flight_days fd
       LEFT JOIN flight_day_vehicles fdv ON fd.id = fdv.flight_day_id
       WHERE fd.date BETWEEN $1 AND $2
       GROUP BY fd.id, fd.date
       ORDER BY fd.date DESC`,
      [dateFrom, dateTo]
    ),
    pool.query(
      'SELECT COUNT(*) as count FROM flight_days WHERE date BETWEEN $1 AND $2',
      [dateFrom, dateTo]
    ),
    pool.query(
      `SELECT p.name, COUNT(fdp.id) as flight_days
       FROM pilots p
       JOIN flight_day_pilots fdp ON p.id = fdp.pilot_id
       JOIN flight_days fd ON fdp.flight_day_id = fd.id AND fd.date BETWEEN $1 AND $2
       GROUP BY p.id, p.name
       ORDER BY flight_days DESC`,
      [dateFrom, dateTo]
    )
  ]);

  const totalTows = towsByVehicle.rows.reduce((s, v) => s + parseInt(v.total_tows), 0);

  res.render('admin/summary-tows', {
    title: 'Hinausyhteenveto',
    dateFrom,
    dateTo,
    towsByVehicle: towsByVehicle.rows,
    towsByDay: towsByDay.rows,
    totalTows,
    flightDayCount: parseInt(flightDayCount.rows[0].count),
    pilotStats: pilotStats.rows
  });
});

router.get('/finance', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const year = new Date().getFullYear();
  const dateFrom = from || `${year}-01-01`;
  const dateTo = to || `${year}-12-31`;

  const [income, expenseTotal, paymentsByType, expenseList] = await Promise.all([
    pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE date BETWEEN $1 AND $2',
      [dateFrom, dateTo]
    ),
    pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date BETWEEN $1 AND $2',
      [dateFrom, dateTo]
    ),
    pool.query(
      `SELECT type, COUNT(*) as count, SUM(amount) as total
       FROM payments WHERE date BETWEEN $1 AND $2
       GROUP BY type`,
      [dateFrom, dateTo]
    ),
    pool.query(
      `SELECT date, amount, purchased_by, description
       FROM expenses WHERE date BETWEEN $1 AND $2
       ORDER BY date DESC`,
      [dateFrom, dateTo]
    )
  ]);

  const totalIncome = parseFloat(income.rows[0].total);
  const totalExpenses = parseFloat(expenseTotal.rows[0].total);

  res.render('admin/summary-finance', {
    title: 'Talousyhteenveto',
    dateFrom,
    dateTo,
    totalIncome,
    totalExpenses,
    result: totalIncome - totalExpenses,
    paymentsByType: paymentsByType.rows,
    expenseList: expenseList.rows
  });
});

module.exports = router;
