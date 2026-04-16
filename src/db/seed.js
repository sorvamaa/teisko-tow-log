const pool = require('./pool');
const bcrypt = require('bcrypt');

async function seed() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ['Admin', 'admin@teisko.fi', passwordHash, 'admin']
    );

    const vehicles = ['Lada', 'Markon Tojota', 'Extremen Golf'];
    for (const name of vehicles) {
      await pool.query(
        `INSERT INTO vehicles (name) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [name]
      );
    }

    console.log('Seed-data lisätty onnistuneesti.');
    console.log('Admin-tunnus: admin@teisko.fi / admin123');
  } catch (err) {
    console.error('Seed epäonnistui:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
