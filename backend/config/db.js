const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const settings = require('./settings');

// Secure TLS connection required by TiDB Cloud.
const ssl = {
  minVersion: 'TLSv1.2',
};

// Pool used by every route/controller for normal queries.
const pool = mysql.createPool({
  host: settings.DB_HOST,
  port: settings.DB_PORT,
  user: settings.DB_USER,
  password: settings.DB_PASSWORD,
  database: settings.DB_NAME,
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

/**
 * Runs schema.sql and checks the database structure.
 */
async function initDb() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Secure bootstrap connection for schema initialization.
  const bootstrapConn = await mysql.createConnection({
    host: settings.DB_HOST,
    port: settings.DB_PORT,
    user: settings.DB_USER,
    password: settings.DB_PASSWORD,
    ssl,
    multipleStatements: true,
  });

  try {
    await bootstrapConn.query(schemaSql);
  } catch (err) {
    if (err && err.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(
        'MySQL rejected the username or password. Check DB_USER and DB_PASSWORD.'
      );
    }

    if (err && err.code === 'ECONNREFUSED') {
      throw new Error(
        'Database connection refused. Check your database host and port.'
      );
    }

    throw err;
  } finally {
    await bootstrapConn.end();
  }

  // Check that the required patient_id column exists.
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'patient_id'`,
    [settings.DB_NAME]
  );

  if (!rows[0] || rows[0].c === 0) {
    throw new Error(
      `Database "${settings.DB_NAME}" is missing users.patient_id. ` +
      'Check schema.sql and your database configuration.'
    );
  }
}

module.exports = { pool, initDb };