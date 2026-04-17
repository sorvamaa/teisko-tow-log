function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  if (req.session.userRole !== 'admin') {
    return res.status(403).render('error', {
      title: 'Ei oikeuksia',
      message: 'Tämä toiminto vaatii ylläpitäjän oikeudet.'
    });
  }
  next();
}

function setLocals(req, res, next) {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    name: req.session.userName,
    role: req.session.userRole
  } : null;
  next();
}

// Pakota salasanan vaihto jos must_change_password = true
function enforcePasswordChange(req, res, next) {
  if (
    req.session.userId &&
    req.session.mustChangePassword &&
    !req.path.startsWith('/auth/change-password') &&
    !req.path.startsWith('/auth/logout') &&
    !req.path.startsWith('/css/') &&
    !req.path.startsWith('/js/')
  ) {
    return res.redirect('/auth/change-password');
  }
  next();
}

module.exports = { requireAuth, requireAdmin, setLocals, enforcePasswordChange };
