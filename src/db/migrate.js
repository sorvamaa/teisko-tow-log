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
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

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
