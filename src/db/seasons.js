const pool = require('./pool');

const SEASON_COLS = `*, to_char(start_date, 'YYYY-MM-DD') AS start_str, to_char(end_date, 'YYYY-MM-DD') AS end_str`;

async function getAllSeasons(db = pool) {
  const r = await db.query(`SELECT ${SEASON_COLS} FROM seasons ORDER BY start_date DESC`);
  return r.rows;
}

async function getSeason(id, db = pool) {
  const r = await db.query(`SELECT ${SEASON_COLS} FROM seasons WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function getOpenSeason(db = pool) {
  const r = await db.query(`SELECT ${SEASON_COLS} FROM seasons WHERE end_date IS NULL LIMIT 1`);
  return r.rows[0] || null;
}

// Kausi, jolle annettu päivämäärä (YYYY-MM-DD) kuuluu
async function getSeasonForDate(date, db = pool) {
  const r = await db.query(
    `SELECT ${SEASON_COLS} FROM seasons
     WHERE $1::date >= start_date AND (end_date IS NULL OR $1::date <= end_date)
     ORDER BY start_date DESC LIMIT 1`,
    [date]
  );
  return r.rows[0] || null;
}

// Palauttaa virheilmoituksen, jos lentopäivää ei saa kirjata tälle päivälle
async function flightDayDateError(date, db = pool) {
  const season = await getSeasonForDate(date, db);
  if (!season) return 'Päivämäärä ei kuulu millekään kaudelle.';
  if (season.end_date) return `${season.name} on suljettu. Suljetulle kaudelle ei voi kirjata tai muokata lentopäiviä.`;
  return null;
}

const fmtDate = (s) => {
  const [y, m, d] = s.split('-');
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.`;
};

// Kauden maksutilanne pilotti kerrallaan
async function computeBalances(season, db = pool) {
  const priceDaily = parseFloat(season.price_daily);
  const priceSeason = parseFloat(season.price_season);
  const pricePerTow = parseFloat(season.price_per_tow);

  const [flights, payments, exemptions] = await Promise.all([
    db.query(
      `SELECT p.id AS pilot_id, p.name, p.billing_type, to_char(fd.date, 'YYYY-MM-DD') AS date,
              COALESCE(fdp.tow_count, 0) AS tow_count
       FROM flight_day_pilots fdp
       JOIN flight_days fd ON fd.id = fdp.flight_day_id
       JOIN pilots p ON p.id = fdp.pilot_id
       WHERE fd.date >= $1 AND ($2::date IS NULL OR fd.date <= $2)
       ORDER BY fd.date`,
      [season.start_str, season.end_str]
    ),
    db.query(
      `SELECT pm.pilot_id, p.name, p.billing_type, pm.type, pm.amount, to_char(pm.date, 'YYYY-MM-DD') AS date
       FROM payments pm JOIN pilots p ON p.id = pm.pilot_id
       WHERE pm.season_id = $1`,
      [season.id]
    ),
    db.query('SELECT pilot_id, reason FROM season_exemptions WHERE season_id = $1', [season.id])
  ]);

  const exemptMap = new Map(exemptions.rows.map(e => [e.pilot_id, e.reason]));
  const byPilot = new Map();
  const get = (row) => {
    if (!byPilot.has(row.pilot_id)) {
      byPilot.set(row.pilot_id, {
        pilotId: row.pilot_id, name: row.name, billingType: row.billing_type,
        dates: [], tows: 0, dailyPaid: 0, dailyCount: 0, seasonPass: null, perTowPaid: 0, totalPaid: 0
      });
    }
    return byPilot.get(row.pilot_id);
  };

  flights.rows.forEach(f => {
    const b = get(f);
    b.dates.push(f.date);
    b.tows += parseInt(f.tow_count, 10);
  });
  payments.rows.forEach(p => {
    const b = get(p);
    const amt = parseFloat(p.amount);
    b.totalPaid += amt;
    if (p.type === 'season') b.seasonPass = p.date;
    else if (p.type === 'daily') { b.dailyPaid += amt; b.dailyCount++; }
    else b.perTowPaid += amt;
  });

  const rows = [...byPilot.values()].map(b => {
    b.days = b.dates.length;
    b.exempt = exemptMap.has(b.pilotId);
    b.exemptReason = exemptMap.get(b.pilotId) || null;
    b.owed = 0;
    b.due = 0;
    b.suggestSeasonPass = false;
    b.unpaidDays = 0;

    if (b.billingType === 'per_tow') {
      b.due = b.tows * pricePerTow;
      b.owed = b.exempt ? 0 : Math.max(0, b.due - b.totalPaid);
    } else if (b.seasonPass || b.exempt) {
      b.owed = 0;
    } else {
      b.due = b.days * priceDaily;
      b.owed = Math.max(0, b.due - b.dailyPaid);
      b.unpaidDays = Math.max(0, b.days - b.dailyCount);
      b.suggestSeasonPass = b.owed >= priceSeason;
    }

    if (b.exempt) b.status = 'exempt';
    else if (b.owed > 0) b.status = 'owes';
    else if (b.days === 0 && b.billingType !== 'per_tow') b.status = 'no_flights';
    else b.status = 'ok';

    b.dateLabels = b.dates.map(fmtDate);
    return b;
  });

  rows.sort((a, b) => (b.owed - a.owed) || a.name.localeCompare(b.name, 'fi'));

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  const totalOwedWithPasses = rows.reduce((s, r) => s + (r.suggestSeasonPass ? priceSeason : r.owed), 0);
  return { rows, totalOwed, totalOwedWithPasses, priceDaily, priceSeason, pricePerTow };
}

const eur = (n) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;

function messageFor(row, season) {
  const first = row.name.split(' ')[0];
  const lines = [];
  if (row.billingType === 'per_tow') {
    lines.push(`Hei! Teiskon hinauskirjanpidon mukaan kaudella ${season.name.replace(/^Kausi\s*/i, '')} hinauksia on kirjattu ${row.tows} kpl (${eur(parseFloat(season.price_per_tow))}/hinaus), yhteensä ${eur(row.due)}.`);
    if (row.totalPaid > 0) lines.push(`Maksettu ${eur(row.totalPaid)}, joten avoinna on ${eur(row.owed)}.`);
    else lines.push(`Avoinna on ${eur(row.owed)}.`);
  } else {
    const paidPart = row.dailyCount > 0 ? `, joista ${row.dailyCount} on maksettu` : '';
    lines.push(`Hei ${first}! Teiskon hinauskirjanpidon mukaan sinulla on kaudelta ${season.name.replace(/^Kausi\s*/i, '')} ${row.days} lentopäivää (${row.dateLabels.join(', ')})${paidPart}.`);
    lines.push(`Päivämaksuina avoinna on ${eur(row.owed)} (${row.unpaidDays} × ${eur(parseFloat(season.price_daily))}).`);
    if (row.suggestSeasonPass) lines.push(`Kausikortti ${eur(parseFloat(season.price_season))} kattaa kaikki kauden lentopäivät, joten se on edullisempi vaihtoehto.`);
  }
  if (season.payment_instructions) lines.push(season.payment_instructions.trim());
  lines.push('Kiitos!');
  return lines.join('\n');
}

function summaryMessage(rows, season) {
  const owing = rows.filter(r => r.status === 'owes');
  const lines = [`Teiskon hinaukset – ${season.name}: avoimet maksut`];
  owing.forEach(r => {
    const alt = r.suggestSeasonPass ? ` (tai kausikortti ${eur(parseFloat(season.price_season))})` : '';
    lines.push(`• ${r.name}: ${eur(r.owed)}${alt}`);
  });
  if (season.payment_instructions) lines.push('', season.payment_instructions.trim());
  return lines.join('\n');
}

module.exports = {
  getAllSeasons, getSeason, getOpenSeason, getSeasonForDate, flightDayDateError,
  computeBalances, messageFor, summaryMessage, eur
};
