const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

function generateTempPassword() {
  // 10 merkin satunnainen salasana (kirjaimia + numeroita)
  return crypto.randomBytes(8).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
}

router.get('/', requireAdmin, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email, role, must_change_password, created_at FROM users ORDER BY name'
  );
  res.render('admin/users', {
    title: 'Käyttäjät',
    users: result.rows,
    errors: null,
    resetResult: null
  });
});

router.post('/',
  requireAdmin,
  body('name').trim().notEmpty().withMessage('Nimi vaaditaan'),
  body('email').isEmail().normalizeEmail().withMessage('Virheellinen sähköposti'),
  body('password').isLength({ min: 8 }).withMessage('Salasana: vähintään 8 merkkiä'),
  body('role').isIn(['admin', 'user']).withMessage('Virheellinen rooli'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const result = await pool.query('SELECT id, name, email, role, must_change_password, created_at FROM users ORDER BY name');
      return res.render('admin/users', {
        title: 'Käyttäjät',
        users: result.rows,
        errors: errors.array(),
        resetResult: null
      });
    }

    const { name, email, password, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await pool.query(
        'INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, TRUE)',
        [name, email, passwordHash, role]
      );
    } catch (err) {
      if (err.code === '23505') {
        const result = await pool.query('SELECT id, name, email, role, must_change_password, created_at FROM users ORDER BY name');
        return res.render('admin/users', {
          title: 'Käyttäjät',
          users: result.rows,
          errors: [{ msg: 'Sähköposti on jo käytössä.' }],
          resetResult: null
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

// Admin: resetoi käyttäjän salasana — luo väliaikainen, pakottaa vaihtoon
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);

  // Estä adminia resetoimasta omaa salasanaansa tätä kautta
  if (userId === req.session.userId) {
    return res.redirect('/admin/users');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const result = await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, updated_at = NOW()
     WHERE id = $2 RETURNING name, email`,
    [passwordHash, userId]
  );

  if (!result.rows[0]) return res.redirect('/admin/users');

  const users = await pool.query('SELECT id, name, email, role, must_change_password, created_at FROM users ORDER BY name');
  res.render('admin/users', {
    title: 'Käyttäjät',
    users: users.rows,
    errors: null,
    resetResult: {
      userName: result.rows[0].name,
      userEmail: result.rows[0].email,
      tempPassword
    }
  });
});

module.exports = router;
