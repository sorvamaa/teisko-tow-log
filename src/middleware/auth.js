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

module.exports = { requireAuth, requireAdmin, setLocals };
