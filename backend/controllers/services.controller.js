const { pool } = require('../config/db');
const { isNonEmptyString } = require('./validators');

async function list(req, res, next) {
  try {
    const activeOnly = req.query.active !== 'false';
    const sql = activeOnly ? 'SELECT * FROM services WHERE active = 1 ORDER BY name' : 'SELECT * FROM services ORDER BY name';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!isNonEmptyString(name, 100)) return res.status(400).json({ error: 'Service name is required.' });
    const [result] = await pool.query('INSERT INTO services (name, description) VALUES (?, ?)', [name.trim(), description || null]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A service with that name already exists.' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { name, description, active } = req.body;
    await pool.query('UPDATE services SET name = COALESCE(?, name), description = COALESCE(?, description), active = COALESCE(?, active) WHERE id = ?', [
      name || null,
      description === undefined ? null : description,
      active === undefined ? null : (active ? 1 : 0),
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update };
