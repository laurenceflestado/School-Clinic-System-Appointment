const path = require('path');
const express = require('express');
const settings = require('./config/settings');
const { initDb, pool } = require('./config/db');
const corsMiddleware = require('./middleware/cors.middleware');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const { seedIfEmpty } = require('./seed');

const app = express();
app.use(express.json());
app.use(corsMiddleware);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/services', require('./routes/services.routes'));
app.use('/api/clinic', require('./routes/clinic.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/queue', require('./routes/queue.routes'));
app.use('/api/consultations', require('./routes/consultations.routes'));
app.use('/api/patients', require('./routes/patients.routes'));
app.use('/api/nurses', require('./routes/nurses.routes'));
app.use('/api/schedules', require('./routes/schedules.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/reports', require('./routes/reports.routes'));

// Fallback static hosting of the frontend, only used when Apache isn't serving it.
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  res.sendFile(path.join(frontendDir, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use('/api', notFound);
app.use(errorHandler);

async function start() {
  try {
    await initDb();
    await seedIfEmpty(pool);
    app.listen(settings.PORT, () => {
      console.log(`School Clinic API is running on http://localhost:${settings.PORT}`);
      console.log(`Open the website through Apache, for example: http://localhost/school-clinic-system/`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
}

start();
