const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const settings = require('../config/settings');
const { isNonEmptyString, isEmail } = require('./validators');

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, staff_id: user.staff_id || null, patient_id: user.patient_id || null, full_name: user.full_name },
    settings.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Staff login: ADMIN or NURSE, by email or staff_id.
async function staffLogin(req, res, next) {
  try {
    const { identifier, password } = req.body;
    if (!isNonEmptyString(identifier) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Login and password are required.' });
    }
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE (email = ? OR staff_id = ?) AND role IN ('ADMIN','NURSE') LIMIT 1`,
      [identifier, identifier]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials or inactive account.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [user.id, 'LOGIN', `${user.role} login`]);

    res.json({ token: sign(user), user: { id: user.id, role: user.role, staff_id: user.staff_id, full_name: user.full_name, email: user.email } });
  } catch (err) {
    next(err);
  }
}

// Optional patient account registration, linked to an existing/created patients row.
async function patientRegister(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { student_id, full_name, email, password, contact_number } = req.body;
    if (!isNonEmptyString(student_id, 30) || !isNonEmptyString(full_name, 120) || !isEmail(email) || !isNonEmptyString(password, 100) || password.length < 6) {
      return res.status(400).json({ error: 'Student/Employee ID, full name, a valid email, and a password of at least 6 characters are required.' });
    }

    await conn.beginTransaction();
    const { findOrCreatePatient } = require('../config/patients');
    const patientId = await findOrCreatePatient(conn, { student_id, full_name, contact_number, email });

    const [existingUser] = await conn.query('SELECT id FROM users WHERE patient_id = ? OR email = ? LIMIT 1', [patientId, email]);
    if (existingUser.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'An account already exists for this Student/Employee ID or email. Try logging in instead.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      `INSERT INTO users (staff_id, full_name, email, password_hash, role, patient_id, active) VALUES (?, ?, ?, ?, 'PATIENT', ?, 1)`,
      [`P-${patientId}`, full_name.trim(), email, hash, patientId]
    );
    await conn.commit();

    const user = { id: result.insertId, role: 'PATIENT', patient_id: patientId, full_name: full_name.trim() };
    res.status(201).json({ token: sign(user), user: { id: user.id, role: 'PATIENT', full_name: user.full_name } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function patientLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ? AND role = 'PATIENT' LIMIT 1`, [email]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    res.json({ token: sign(user), user: { id: user.id, role: 'PATIENT', full_name: user.full_name } });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, staff_id, full_name, email, role, patient_id, active FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Account not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    if (!isNonEmptyString(new_password, 100) || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    const ok = await bcrypt.compare(current_password || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { staffLogin, patientRegister, patientLogin, me, changePassword };
