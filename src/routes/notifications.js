'use strict';
/* routes/notifications.js — الإشعارات */
const { auth, wrap } = require('../src/middleware');
const { db } = require('../src/db');


module.exports = function register(app) {

/* ----- الإشعارات ----- */
app.get('/api/notifications', auth, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id));
}));
app.post('/api/notifications/read', auth, wrap(async (req, res) => {
  await db.run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id);
  res.json({ ok: true });
}));
};
