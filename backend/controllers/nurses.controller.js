const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { isNonEmptyString, isEmail } = require('./validators');

// GET /api/nurses — admin: list all nurse accounts.
async function list(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT id, staff_id, full_name, email, active, created_at FROM users WHERE role = 'NURSE' ORDER BY full_name`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/nurses — admin: create a nurse account.
async function create(req, res, next) {
  try {
    const { staff_id, full_name, email, password } = req.body;
    if (!isNonEmptyString(staff_id, 30) || !isNonEmptyString(full_name, 120) || !isEmail(email) || !isNonEmptyString(password) || password.length < 6) {
      return res.status(400).json({ error: 'Staff ID, full name, a valid email, and a password of at least 6 characters are required.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (staff_id, full_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'NURSE', 1)`,
      [staff_id, full_name.trim(), email, hash]
    );
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'NURSE_CREATE', `Created nurse ${staff_id}`]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That Staff ID or email is already in use.' });
    next(err);
  }
}

// PUT /api/nurses/:id — admin: edit name/email, or deactivate/reactivate.
async function update(req, res, next) {
  try {
    const { full_name, email, active } = req.body;
    await pool.query('UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), active = COALESCE(?, active) WHERE id = ? AND role = "NURSE"', [
      full_name || null,
      email || null,
      active === undefined ? null : (active ? 1 : 0),
      req.params.id,
    ]);
    const action = active === false ? 'NURSE_DEACTIVATE' : active === true ? 'NURSE_REACTIVATE' : 'NURSE_UPDATE';
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, action, `Nurse #${req.params.id} updated`]);
    res.json({ ok: true, note: active === false ? 'Existing schedules for this nurse are untouched — reassign appointments as needed.' : undefined });
  } catch (err) {
    next(err);
  }
}

// POST /api/nurses/:id/reset-password — admin.
async function resetPassword(req, res, next) {
  try {
    const { new_password } = req.body;
    if (!isNonEmptyString(new_password) || new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ? AND role = "NURSE"', [hash, req.params.id]);
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'NURSE_RESET_PASSWORD', `Password reset for nurse #${req.params.id}`]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, resetPassword };
