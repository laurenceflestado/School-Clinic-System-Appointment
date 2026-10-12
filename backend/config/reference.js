const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

function randomCode(length = 6) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * CLINIC-<year>-<6 random chars>. Random, not sequential, so one reference
 * cannot be guessed from another. Retries on the rare collision.
 */
async function generateReference(pool) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `CLINIC-${year}-${randomCode(6)}`;
    const [rows] = await pool.query('SELECT id FROM appointments WHERE reference = ? LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new Error('Could not generate a unique reference code, please try again.');
}

module.exports = { generateReference };
