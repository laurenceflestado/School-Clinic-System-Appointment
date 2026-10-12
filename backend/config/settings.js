require('dotenv').config();

function num(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  PORT: num(process.env.PORT, 3000),
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: num(process.env.DB_PORT, 3306),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'school_clinic_system',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-to-any-long-random-text',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  SELF_CHECKIN_MINUTES_BEFORE: num(process.env.SELF_CHECKIN_MINUTES_BEFORE, 30),
};
