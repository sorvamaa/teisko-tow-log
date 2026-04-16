const express = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    'SELECT id FROM flight_days WHERE date = $1 LIMIT 1',
    [today]
  );
  const todayFlightDay = result.rows[0] || null;

  res.render('index', {
    title: 'Etusivu',
    todayFlightDay,
    today
  });
});

module.exports = router;
