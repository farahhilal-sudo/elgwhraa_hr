'use strict';
/* src/schema.js — جداول قاعدة البيانات (SCHEMA) */
const { NOW } = require('./db');


/* ---------------- الجداول ---------------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  job_title TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  base_salary DOUBLE PRECISION NOT NULL DEFAULT 0,
  allowances DOUBLE PRECISION NOT NULL DEFAULT 0,
  shift_start TEXT NOT NULL DEFAULT '09:00',
  shift_end TEXT NOT NULL DEFAULT '17:00',
  hire_date TEXT NOT NULL DEFAULT (to_char(current_date, 'YYYY-MM-DD')),
  annual_leave_days INTEGER NOT NULL DEFAULT 21,
  face_descriptor TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT, check_out TEXT,
  in_lat DOUBLE PRECISION, in_lng DOUBLE PRECISION, out_lat DOUBLE PRECISION, out_lng DOUBLE PRECISION,
  in_face DOUBLE PRECISION, out_face DOUBLE PRECISION,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  hours DOUBLE PRECISION DEFAULT 0,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by INTEGER, decided_at TEXT, decision_note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS adjustments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('deduction','bonus','penalty')),
  amount DOUBLE PRECISION NOT NULL,
  reason TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS late_tiers (
  id SERIAL PRIMARY KEY,
  from_minutes INTEGER NOT NULL,
  to_minutes INTEGER,
  kind TEXT NOT NULL CHECK(kind IN ('fixed','day_fraction')),
  value DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS work_locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 150
);
CREATE TABLE IF NOT EXISTS config_items (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS payslips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  data TEXT NOT NULL,
  net DOUBLE PRECISION NOT NULL,
  paid_by INTEGER,
  paid_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE(user_id, month)
);
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  handled_by INTEGER, handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_name TEXT DEFAULT '',
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  details TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS attendance_photos (
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  photo BYTEA NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (attendance_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_photos_created ON attendance_photos(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, from_date);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_adjustments_user_month ON adjustments(user_id, month);
`;

module.exports = { SCHEMA };
