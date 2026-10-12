const { pool } = require('../config/db');
const { canTransitionQueue, canTransitionAppointment } = require('../config/status');

// POST /api/consultations/start { queue_entry_id }
async function start(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { queue_entry_id } = req.body;
    if (!Number.isInteger(Number(queue_entry_id))) return res.status(400).json({ error: 'queue_entry_id is required.' });

    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM queue_entries WHERE id = ? FOR UPDATE', [queue_entry_id]);
    const entry = rows[0];
    if (!entry) {
      await conn.rollback();
      return res.status(404).json({ error: 'Queue entry not found.' });
    }
    if (req.user.role === 'NURSE' && entry.nurse_id && entry.nurse_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: 'This queue entry is assigned to another nurse.' });
    }
    if (!canTransitionQueue(entry.status, 'IN_CONSULTATION')) {
      await conn.rollback();
      return res.status(409).json({ error: `Cannot start a consultation from queue status ${entry.status}.` });
    }

    const [result] = await conn.query(
      `INSERT INTO consultations (queue_entry_id, patient_id, appointment_id, service_id, nurse_id, status, chief_complaint)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?)`,
      [entry.id, entry.patient_id, entry.appointment_id, entry.service_id, req.user.id, entry.reason]
    );
    await conn.query('UPDATE queue_entries SET status = ?, nurse_id = ? WHERE id = ?', ['IN_CONSULTATION', req.user.id, entry.id]);
    if (entry.appointment_id) {
      await conn.query('UPDATE appointments SET status = ? WHERE id = ?', ['IN_CONSULTATION', entry.appointment_id]);
    }
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'CONSULT_START', `Consultation #${result.insertId} started`]);
    await conn.commit();
    res.status(201).json({ consultation_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// PUT /api/consultations/:id — update vitals/findings while in progress.
async function update(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await pool.query('SELECT * FROM consultations WHERE id = ?', [req.params.id]);
    const consult = rows[0];
    if (!consult) return res.status(404).json({ error: 'Consultation not found.' });
    if (req.user.role === 'NURSE' && consult.nurse_id !== req.user.id) return res.status(403).json({ error: 'Not your consultation.' });
    if (consult.status !== 'IN_PROGRESS') return res.status(409).json({ error: 'Consultation is already completed.' });

    const { findings, treatment, medication_given, instructions, vitals } = req.body;

    await conn.beginTransaction();
    await conn.query(
      `UPDATE consultations SET findings = COALESCE(?, findings), treatment = COALESCE(?, treatment),
       medication_given = COALESCE(?, medication_given), instructions = COALESCE(?, instructions) WHERE id = ?`,
      [findings ?? null, treatment ?? null, medication_given ?? null, instructions ?? null, consult.id]
    );

    if (vitals) {
      const { temperature, blood_pressure, pulse_rate, respiratory_rate, height_cm, weight_kg } = vitals;
      await conn.query(
        `INSERT INTO vital_signs (consultation_id, temperature, blood_pressure, pulse_rate, respiratory_rate, height_cm, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE temperature=VALUES(temperature), blood_pressure=VALUES(blood_pressure),
           pulse_rate=VALUES(pulse_rate), respiratory_rate=VALUES(respiratory_rate),
           height_cm=VALUES(height_cm), weight_kg=VALUES(weight_kg)`,
        [consult.id, temperature ?? null, blood_pressure ?? null, pulse_rate ?? null, respiratory_rate ?? null, height_cm ?? null, weight_kg ?? null]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// POST /api/consultations/:id/complete
async function complete(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM consultations WHERE id = ? FOR UPDATE', [req.params.id]);
    const consult = rows[0];
    if (!consult) {
      await conn.rollback();
      return res.status(404).json({ error: 'Consultation not found.' });
    }
    if (req.user.role === 'NURSE' && consult.nurse_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Not your consultation.' });
    }
    if (consult.status !== 'IN_PROGRESS') {
      await conn.rollback();
      return res.status(409).json({ error: 'Consultation is already completed.' });
    }

    await conn.query('UPDATE consultations SET status = ?, completed_at = NOW() WHERE id = ?', ['COMPLETED', consult.id]);
    await conn.query('UPDATE queue_entries SET status = ? WHERE id = ?', ['COMPLETED', consult.queue_entry_id]);
    if (consult.appointment_id) {
      await conn.query('UPDATE appointments SET status = ? WHERE id = ?', ['COMPLETED', consult.appointment_id]);
    }
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'CONSULT_COMPLETE', `Consultation #${consult.id} completed`]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { start, update, complete };
