const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
  res.render('admin/users', { title: 'Käyttäjät', users: result.rows, errors: null });
});

router.post('/',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  body('email').isEmail().normalizeEmail().withMessage('Virheellinen sähköposti'),
  body('password').isLength({ min: 6 }).withMessage('Salasanan tulee olla vähintään 6 merkkiä'),
  body('role').isIn(['admin', 'user']).withMessage('Virheellinen rooli'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
      return res.render('admin/users', { title: 'Käyttäjät', users: result.rows, errors: errors.array() });
    }

    const { name, email, password, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await pool.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [name, email, passwordHash, role]
      );
    } catch (err) {
      if (err.code === '23505') {
        const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
        return res.render('admin/users', {
          title: 'Käyttäjät', users: result.rows,
          errors: [{ msg: 'Sähköposti on jo käytössä.' }]
        });
      }
      throw err;
    }
    res.redirect('/admin/users');
  }
);

router.post('/:id',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  body('role').isIn(['admin', 'user']).withMessage('Virheellinen rooli'),
  async (req, res) => {
    const { name, role } = req.body;
    await pool.query('UPDATE users SET name = $1, role = $2, updated_at = NOW() WHERE id = $3',
      [name, role, parseInt(req.params.id)]);
    res.redirect('/admin/users');
  }
);

module.exports = router;
