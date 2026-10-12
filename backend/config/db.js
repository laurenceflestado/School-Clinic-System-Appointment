const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const settings = require('./settings');

// Pool used by every route/controller for normal queries.
const pool = mysql.createPool({
  host: settings.DB_HOST,
  port: settings.DB_PORT,
  user: settings.DB_USER,
  password: settings.DB_PASSWORD,
  database: settings.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

/**
 * Runs schema.sql (idempotent: CREATE TABLE IF NOT EXISTS) against the server,
 * then sanity-checks that an already-existing database has the current shape
 * (e.g. the users.patient_id column added in v2). Throws a friendly error
 * instead of letting a cryptic MySQL error escape.
 */
async function initDb() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // A connection without a default database yet, so `CREATE DATABASE` in
  // schema.sql can run, and with multipleStatements so the whole file runs at once.
  const bootstrapConn = await mysql.createConnection({
    host: settings.DB_HOST,
    port: settings.DB_PORT,
    user: settings.DB_USER,
    password: settings.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    await bootstrapConn.query(schemaSql);
  } catch (err) {
    if (err && err.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(
        'MySQL rejected the username or password. Fix DB_USER/DB_PASSWORD in backend/.env.'
      );
    }
    if (err && err.code === 'ECONNREFUSED') {
      throw new Error('MySQL is not running. Start MySQL in the XAMPP Control Panel, then npm start again.');
    }
    throw err;
  } finally {
    await bootstrapConn.end();
  }

  // Confirm the existing database actually has the current column set.
  // If DB_NAME was reused by an older/different project, users.patient_id
  // (added in v2) or another core column will be missing.
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'patient_id'`,
      [settings.DB_NAME]
    );
    if (!rows[0] || rows[0].c === 0) {
      throw new Error(
        `Database "${settings.DB_NAME}" already has tables from an older or different version of the ` +
        `system (missing users.patient_id). Change DB_NAME in backend/.env to something new, or drop the ` +
        `old database in phpMyAdmin first, then run npm start again.`
      );
    }
  } catch (err) {
    if (err && err.message && err.message.includes('already has tables')) throw err;
    throw err;
  }
}

module.exports = { pool, initDb };
