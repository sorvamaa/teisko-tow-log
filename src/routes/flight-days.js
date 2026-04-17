const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// Admin: lista kaikista lentopäivistä
router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT fd.*, u.name as recorder_name,
            (SELECT COALESCE(SUM(fdv.tow_count), 0) FROM flight_day_vehicles fdv WHERE fdv.flight_day_id = fd.id) as total_tows,
            (SELECT COUNT(*) FROM flight_day_pilots fdp WHERE fdp.flight_day_id = fd.id) as pilot_count
     FROM flight_days fd
     LEFT JOIN users u ON fd.recorded_by = u.id
     ORDER BY fd.date DESC`
  );
  res.render('flight-days/list', { title: 'Lentopäivät', flightDays: result.rows });
});

router.get('/new', requireAuth, async (req, res) => {
  // Jos tänään on jo lentopäivä, ohjaa muokkaamaan sitä
  const today = new Date().toISOString().split('T')[0];
  const existing = await pool.query('SELECT id FROM flight_days WHERE date = $1 LIMIT 1', [today]);
  if (existing.rows[0]) {
    return res.redirect(`/flight-days/${existing.rows[0].id}/edit`);
  }

  const isAdmin = req.session.userRole === 'admin';
  const vehiclesQuery = isAdmin
    ? 'SELECT * FROM vehicles WHERE active = true ORDER BY name'
    : "SELECT * FROM vehicles WHERE active = true AND name = 'Lada' ORDER BY name";

  const [vehicles, pilots] = await Promise.all([
    pool.query(vehiclesQuery),
    pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name')
  ]);
  res.render('flight-days/form', {
    title: 'Uusi lentopäivä',
    flightDay: null,
    vehicles: vehicles.rows,
    pilots: pilots.rows,
    errors: null,
    isAdmin
  });
});

router.post('/',
  requireAuth,
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const isAdmin = req.session.userRole === 'admin';
      const vehiclesQuery = isAdmin
        ? 'SELECT * FROM vehicles WHERE active = true ORDER BY name'
        : "SELECT * FROM vehicles WHERE active = true AND name = 'Lada' ORDER BY name";
      const [vehicles, pilots] = await Promise.all([
        pool.query(vehiclesQuery),
        pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name')
      ]);
      return res.render('flight-days/form', {
        title: 'Uusi lentopäivä',
        flightDay: req.body,
        vehicles: vehicles.rows,
        pilots: pilots.rows,
        errors: errors.array(),
        isAdmin
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { date, notes, pilot_ids } = req.body;
      const newPilotNames = req.body['new_pilot_names[]'];

      const fdResult = await client.query(
        'INSERT INTO flight_days (date, notes, recorded_by) VALUES ($1, $2, $3) RETURNING id',
        [date, notes || null, req.session.userId]
      );
      const flightDayId = fdResult.rows[0].id;

      for (const key of Object.keys(req.body)) {
        if (!key.startsWith('tow_')) continue;
        const vid = parseInt(key.replace('tow_', ''));
        const towCount = parseInt(req.body[key]) || 0;
        if (towCount > 0) {
          await client.query(
            'INSERT INTO flight_day_vehicles (flight_day_id, vehicle_id, tow_count) VALUES ($1, $2, $3)',
            [flightDayId, vid, towCount]
          );
        }
      }

      let pilotIds = pilot_ids ? (Array.isArray(pilot_ids) ? pilot_ids : [pilot_ids]) : [];

      const names = newPilotNames ? (Array.isArray(newPilotNames) ? newPilotNames : [newPilotNames]) : [];
      for (const name of names) {
        if (!name.trim()) continue;
        const newPilot = await client.query(
          'INSERT INTO pilots (name) VALUES ($1) RETURNING id',
          [name.trim()]
        );
        pilotIds.push(newPilot.rows[0].id.toString());
      }

      for (const pid of pilotIds) {
        await client.query(
          'INSERT INTO flight_day_pilots (flight_day_id, pilot_id) VALUES ($1, $2)',
          [flightDayId, parseInt(pid)]
        );
      }

      await client.query('COMMIT');
      res.redirect('/');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Flight day create error:', err);
      res.redirect('/flight-days/new');
    } finally {
      client.release();
    }
  }
);

router.get('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [fd, vehicles, pilots] = await Promise.all([
    pool.query(
      `SELECT fd.*, u.name as recorder_name
       FROM flight_days fd LEFT JOIN users u ON fd.recorded_by = u.id
       WHERE fd.id = $1`, [id]
    ),
    pool.query(
      `SELECT v.name, fdv.tow_count
       FROM flight_day_vehicles fdv
       JOIN vehicles v ON fdv.vehicle_id = v.id
       WHERE fdv.flight_day_id = $1`, [id]
    ),
    pool.query(
      `SELECT p.name, p.note
       FROM flight_day_pilots fdp
       JOIN pilots p ON fdp.pilot_id = p.id
       WHERE fdp.flight_day_id = $1
       ORDER BY p.name`, [id]
    )
  ]);

  if (!fd.rows[0]) {
    return res.status(404).render('error', { title: '404', message: 'Lentopäivää ei löytynyt.' });
  }

  // User voi nähdä vain tänään kirjatun lentopäivän
  const today = new Date().toISOString().split('T')[0];
  const fdDate = new Date(fd.rows[0].date).toISOString().split('T')[0];
  if (req.session.userRole !== 'admin' && fdDate !== today) {
    return res.redirect('/');
  }

  res.render('flight-days/show', {
    title: 'Lentopäivä',
    flightDay: fd.rows[0],
    vehicles: vehicles.rows,
    pilots: pilots.rows
  });
});

router.get('/:id/edit', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const isAdmin = req.session.userRole === 'admin';
  const vehiclesQuery = isAdmin
    ? 'SELECT * FROM vehicles WHERE active = true ORDER BY name'
    : "SELECT * FROM vehicles WHERE active = true AND name = 'Lada' ORDER BY name";

  const [fd, allVehicles, allPilots, fdVehicles, fdPilots] = await Promise.all([
    pool.query('SELECT * FROM flight_days WHERE id = $1', [id]),
    pool.query(vehiclesQuery),
    pool.query('SELECT * FROM pilots WHERE active = true ORDER BY name'),
    pool.query('SELECT vehicle_id, tow_count FROM flight_day_vehicles WHERE flight_day_id = $1', [id]),
    pool.query('SELECT pilot_id FROM flight_day_pilots WHERE flight_day_id = $1', [id])
  ]);

  if (!fd.rows[0]) {
    return res.status(404).render('error', { title: '404', message: 'Lentopäivää ei löytynyt.' });
  }

  // User voi muokata vain tänään kirjattua lentopäivää
  const today = new Date().toISOString().split('T')[0];
  const fdDate = new Date(fd.rows[0].date).toISOString().split('T')[0];
  if (!isAdmin && fdDate !== today) {
    return res.redirect('/');
  }

  const flightDay = fd.rows[0];
  flightDay.vehicleMap = {};
  fdVehicles.rows.forEach(v => { flightDay.vehicleMap[String(v.vehicle_id)] = v.tow_count; });
  flightDay.pilotIds = fdPilots.rows.map(p => p.pilot_id);

  res.render('flight-days/form', {
    title: 'Muokkaa lentopäivää',
    flightDay,
    vehicles: allVehicles.rows,
    pilots: allPilots.rows,
    errors: null,
    isAdmin
  });
});

router.post('/:id',
  requireAuth,
  body('date').isDate().withMessage('Päivämäärä vaaditaan'),
  async (req, res) => {
    const id = parseInt(req.params.id);

    // User voi päivittää vain tänään kirjatun lentopäivän
    if (req.session.userRole !== 'admin') {
      const today = new Date().toISOString().split('T')[0];
      const fd = await pool.query('SELECT date FROM flight_days WHERE id = $1', [id]);
      if (!fd.rows[0] || new Date(fd.rows[0].date).toISOString().split('T')[0] !== today) {
        return res.redirect('/');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { date, notes, pilot_ids } = req.body;
      const newPilotNames = req.body['new_pilot_names[]'];

      await client.query(
        'UPDATE flight_days SET date = $1, notes = $2, updated_at = NOW() WHERE id = $3',
        [date, notes || null, id]
      );

      // Kerää postatut ajoneuvot-tiedot
      const postedVehicles = [];
      for (const key of Object.keys(req.body)) {
        if (!key.startsWith('tow_')) continue;
        const vid = parseInt(key.replace('tow_', ''));
        const towCount = parseInt(req.body[key]) || 0;
        postedVehicles.push({ vid, towCount });
      }

      if (req.session.userRole === 'admin') {
        // Admin: pyyhi kaikki ja lisää uudet
        await client.query('DELETE FROM flight_day_vehicles WHERE flight_day_id = $1', [id]);
        for (const { vid, towCount } of postedVehicles) {
          if (towCount > 0) {
            await client.query(
              'INSERT INTO flight_day_vehicles (flight_day_id, vehicle_id, tow_count) VALUES ($1, $2, $3)',
              [id, vid, towCount]
            );
          }
        }
      } else {
        // User: päivitä vain postatut (Lada), älä koske muihin ajoneuvoihin
        for (const { vid, towCount } of postedVehicles) {
          await client.query('DELETE FROM flight_day_vehicles WHERE flight_day_id = $1 AND vehicle_id = $2', [id, vid]);
          if (towCount > 0) {
            await client.query(
              'INSERT INTO flight_day_vehicles (flight_day_id, vehicle_id, tow_count) VALUES ($1, $2, $3)',
              [id, vid, towCount]
            );
          }
        }
      }

      await client.query('DELETE FROM flight_day_pilots WHERE flight_day_id = $1', [id]);

      let pilotIds = pilot_ids ? (Array.isArray(pilot_ids) ? pilot_ids : [pilot_ids]) : [];

      const names = newPilotNames ? (Array.isArray(newPilotNames) ? newPilotNames : [newPilotNames]) : [];
      for (const name of names) {
        if (!name.trim()) continue;
        const newPilot = await client.query(
          'INSERT INTO pilots (name) VALUES ($1) RETURNING id',
          [name.trim()]
        );
        pilotIds.push(newPilot.rows[0].id.toString());
      }

      for (const pid of pilotIds) {
        await client.query(
          'INSERT INTO flight_day_pilots (flight_day_id, pilot_id) VALUES ($1, $2)',
          [id, parseInt(pid)]
        );
      }

      await client.query('COMMIT');
      res.redirect('/');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Flight day update error:', err);
      res.redirect(`/flight-days/${id}/edit`);
    } finally {
      client.release();
    }
  }
);

router.post('/:id/delete', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM flight_days WHERE id = $1', [parseInt(req.params.id)]);
  res.redirect('/flight-days');
});

module.exports = router;
