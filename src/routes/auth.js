const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

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
      req.session.mustChangePassword = user.must_change_password;

      if (user.must_change_password) {
        return res.redirect('/auth/change-password');
      }
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

// Oma salasanan vaihto
router.get('/change-password', requireAuth, (req, res) => {
  res.render('auth/change-password', {
    title: 'Vaihda salasana',
    error: null,
    success: null,
    forced: !!req.session.mustChangePassword
  });
});

router.post('/change-password',
  requireAuth,
  body('current_password').notEmpty().withMessage('Nykyinen salasana vaaditaan'),
  body('new_password').isLength({ min: 8 }).withMessage('Uusi salasana: vähintään 8 merkkiä'),
  body('new_password_confirm').custom((value, { req }) => {
    if (value !== req.body.new_password) throw new Error('Salasanat eivät täsmää');
    return true;
  }),
  async (req, res) => {
    const forced = !!req.session.mustChangePassword;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/change-password', {
        title: 'Vaihda salasana',
        error: errors.array()[0].msg,
        success: null,
        forced
      });
    }

    try {
      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(req.body.current_password, user.password_hash))) {
        return res.render('auth/change-password', {
          title: 'Vaihda salasana',
          error: 'Nykyinen salasana on virheellinen.',
          success: null,
          forced
        });
      }

      const newHash = await bcrypt.hash(req.body.new_password, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
        [newHash, req.session.userId]
      );

      req.session.mustChangePassword = false;
      res.render('auth/change-password', {
        title: 'Vaihda salasana',
        error: null,
        success: 'Salasana vaihdettu onnistuneesti.',
        forced: false
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.render('auth/change-password', {
        title: 'Vaihda salasana',
        error: 'Järjestelmävirhe.',
        success: null,
        forced
      });
    }
  }
);

module.exports = router;
