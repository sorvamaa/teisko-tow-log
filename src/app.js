require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const morgan = require('morgan');
const pool = require('./db/pool');
const { setLocals } = require('./middleware/auth');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));
app.use(morgan('short'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

app.use(setLocals);

app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/index'));
app.use('/flight-days', require('./routes/flight-days'));
app.use('/admin/pilots', require('./routes/admin/pilots'));
app.use('/admin/vehicles', require('./routes/admin/vehicles'));
app.use('/admin/payments', require('./routes/admin/payments'));
app.use('/admin/expenses', require('./routes/admin/expenses'));
app.use('/admin/summary', require('./routes/admin/summary'));
app.use('/admin/users', require('./routes/admin/users'));

app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: 'Sivua ei löytynyt.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Virhe', message: 'Palvelinvirhe.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Teisko Tow Log käynnissä portissa ${PORT}`);
});
