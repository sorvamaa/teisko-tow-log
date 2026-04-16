const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Liian monta kirjautumisyritystä. Yritä uudelleen 15 minuutin kuluttua.'
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/login', { title: 'Kirjaudu sisään', error: null });
});

router.post('/login',
  loginLimiter,
  body('email').isEmail().normalizeEmail().withMessage('Virheellinen sähköposti'),
  body('password').notEmpty().withMessage('Salasana vaaditaan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/login', {
        title: 'Kirjaudu sisään',
        error: errors.array()[0].msg
      });
    }

    try {
      const { email, password } = req.body;
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.render('auth/login', {
          title: 'Kirjaudu sisään',
          error: 'Virheellinen sähköposti tai salasana.'
        });
      }

      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;

      res.redirect('/');
    } catch (err) {
      console.error('Login error:', err);
      res.render('auth/login', {
        title: 'Kirjaudu sisään',
        error: 'Järjestelmävirhe. Yritä uudelleen.'
      });
    }
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/auth/login');
  });
});

module.exports = router;
