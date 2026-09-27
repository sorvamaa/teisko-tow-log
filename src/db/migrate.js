const pool = require('./pool');

const migration = `
-- Istuntotaulu (connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Käyttäjät
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Migraatio vanhasta sähköpostipohjaisesta tunnistautumisesta käyttäjätunnukseen.
-- Idempotentti: email-riippuvat lauseet ajetaan vain jos email-sarake on yhä olemassa.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    UPDATE users SET username = LOWER(email) WHERE username IS NULL AND email IS NOT NULL;
    ALTER TABLE users DROP COLUMN email;
  END IF;
END $$;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- Pilotit
CREATE TABLE IF NOT EXISTS pilots (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  note VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hinausajoneuvot
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lentopäivät
CREATE TABLE IF NOT EXISTS flight_days (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lentopäivän ajoneuvot ja hinausmäärät
CREATE TABLE IF NOT EXISTS flight_day_vehicles (
  id SERIAL PRIMARY KEY,
  flight_day_id INTEGER NOT NULL REFERENCES flight_days(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  tow_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (flight_day_id, vehicle_id)
);

-- Lentopäivän pilotit
CREATE TABLE IF NOT EXISTS flight_day_pilots (
  id SERIAL PRIMARY KEY,
  flight_day_id INTEGER NOT NULL REFERENCES flight_days(id) ON DELETE CASCADE,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id),
  UNIQUE (flight_day_id, pilot_id)
);

-- Hinausmaksut
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'season')),
  date DATE NOT NULL,
  note TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kulut
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  purchased_by VARCHAR(255) NOT NULL,
  description VARCHAR(500) NOT NULL,
  note TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kaudet (v1.1)
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  price_daily NUMERIC(10,2) NOT NULL DEFAULT 10,
  price_season NUMERIC(10,2) NOT NULL DEFAULT 50,
  price_per_tow NUMERIC(10,2) NOT NULL DEFAULT 5,
  payment_instructions TEXT,
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_season ON seasons ((end_date IS NULL)) WHERE end_date IS NULL;

-- Ensimmäinen kausi: kalenterivuosi, jolta vanhin kirjaus on (tai kuluva vuosi)
INSERT INTO seasons (name, start_date)
SELECT 'Kausi ' || y, make_date(y, 1, 1)
FROM (
  SELECT COALESCE(
    EXTRACT(YEAR FROM LEAST(
      (SELECT MIN(date) FROM flight_days),
      (SELECT MIN(date) FROM payments)
    ))::int,
    EXTRACT(YEAR FROM CURRENT_DATE)::int
  ) AS y
) s
WHERE NOT EXISTS (SELECT 1 FROM seasons);

CREATE TABLE IF NOT EXISTS season_exemptions (
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  pilot_id INTEGER NOT NULL REFERENCES pilots(id),
  reason VARCHAR(255),
  PRIMARY KEY (season_id, pilot_id)
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id);
UPDATE payments p SET season_id = (
  SELECT s.id FROM seasons s
  WHERE p.date >= s.start_date AND (s.end_date IS NULL OR p.date <= s.end_date)
  ORDER BY s.start_date LIMIT 1
) WHERE season_id IS NULL;
UPDATE payments SET season_id = (SELECT id FROM seasons ORDER BY start_date LIMIT 1) WHERE season_id IS NULL;
ALTER TABLE payments ALTER COLUMN season_id SET NOT NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_type_check CHECK (type IN ('daily', 'season', 'per_tow'));

ALTER TABLE pilots ADD COLUMN IF NOT EXISTS billing_type VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE pilots DROP CONSTRAINT IF EXISTS pilots_billing_type_check;
ALTER TABLE pilots ADD CONSTRAINT pilots_billing_type_check CHECK (billing_type IN ('normal', 'per_tow'));

ALTER TABLE flight_day_pilots ADD COLUMN IF NOT EXISTS tow_count INTEGER;
`;

async function migrate() {
  try {
    await pool.query(migration);
    console.log('Migraatio suoritettu onnistuneesti.');
  } catch (err) {
    console.error('Migraatio epäonnistui:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
