const express = require('express');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');
const seasons = require('../../db/seasons');

const router = express.Router();

async function pickSeason(req) {
  const id = parseInt(req.query.season || req.body?.season_id, 10);
  if (!Number.isNaN(id)) {
    const s = await seasons.getSeason(id);
    if (s) return s;
  }
  return seasons.getOpenSeason();
}

router.get('/', requireAdmin, async (req, res) => {
  const [season, all] = await Promise.all([pickSeason(req), seasons.getAllSeasons()]);
  if (!season) return res.render('error', { title: 'Ei kautta', message: 'Yhtään kautta ei ole määritelty.' });

  const balances = await seasons.computeBalances(season);
  balances.rows.forEach(r => {
    r.message = r.status === 'owes' ? seasons.messageFor(r, season) : null;
  });
  const pilots = await pool.query('SELECT id, name FROM pilots WHERE active = true ORDER BY name');
  const exemptIds = new Set(balances.rows.filter(r => r.exempt).map(r => r.pilotId));

  res.render('admin/balances', {
    title: 'Maksutilanne',
    season,
    seasons: all,
    balances,
    summary: seasons.summaryMessage(balances.rows, season),
    pilots: pilots.rows.filter(p => !exemptIds.has(p.id)),
    eur: seasons.eur
  });
});

router.post('/exempt', requireAdmin, async (req, res) => {
  const seasonId = parseInt(req.body.season_id, 10);
  const pilotId = parseInt(req.body.pilot_id, 10);
  if (Number.isNaN(seasonId) || Number.isNaN(pilotId)) return res.redirect('/admin/balances');
  await pool.query(
    `INSERT INTO season_exemptions (season_id, pilot_id, reason) VALUES ($1, $2, $3)
     ON CONFLICT (season_id, pilot_id) DO UPDATE SET reason = EXCLUDED.reason`,
    [seasonId, pilotId, (req.body.reason || '').trim() || null]
  );
  res.redirect(`/admin/balances?season=${seasonId}`);
});

router.post('/unexempt', requireAdmin, async (req, res) => {
  const seasonId = parseInt(req.body.season_id, 10);
  const pilotId = parseInt(req.body.pilot_id, 10);
  await pool.query('DELETE FROM season_exemptions WHERE season_id = $1 AND pilot_id = $2', [seasonId, pilotId]);
  res.redirect(`/admin/balances?season=${seasonId}`);
});

module.exports = router;
