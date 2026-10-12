const { pool } = require('../config/db');
const { addQueueEntry } = require('../config/queue');
const { findOrCreatePatient } = require('../config/patients');
const { canTransitionAppointment, canTransitionQueue } = require('../config/status');
const settings = require('../config/settings');
const { isNonEmptyString } = require('./validators');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// POST /api/queue/checkin — public, by reference + student_id.
async function checkin(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { reference, student_id } = req.body;
    if (!isNonEmptyString(reference, 24) || !isNonEmptyString(student_id, 30)) {
      return res.status(400).json({ error: 'Reference and Student/Employee ID are required.' });
    }

    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT a.*, p.student_id, p.id AS pid FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.reference = ? FOR UPDATE`,
      [reference]
    );
    const appt = rows[0];
    if (!appt) {
      await conn.rollback();
      return res.status(404).json({ error: 'No appointment found with that reference.' });
    }
    if (appt.student_id !== student_id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Student/Employee ID does not match this appointment.' });
    }
    if (!canTransitionAppointment(appt.status, 'CHECKED_IN')) {
      await conn.rollback();
      return res.status(409).json({ error: `Cannot check in an appointment with status ${appt.status}.` });
    }

    if (settings.SELF_CHECKIN_MINUTES_BEFORE <= 0) {
      await conn.rollback();
      return res.status(403).json({ error: 'Self check-in is disabled. Please check in at the clinic with a nurse.' });
    }
    const apptDateTime = new Date(`${appt.appt_date}T${appt.appt_time}`);
    const diffMinutes = (apptDateTime.getTime() - Date.now()) / 60000;
    if (diffMinutes > settings.SELF_CHECKIN_MINUTES_BEFORE) {
      await conn.rollback();
      return res.status(403).json({ error: `Check-in opens ${settings.SELF_CHECKIN_MINUTES_BEFORE} minutes before your appointment time.` });
    }

    const { id: queueEntryId, queue_number } = await addQueueEntry(conn, {
      queue_date: appt.appt_date,
      patient_id: appt.pid,
      appointment_id: appt.id,
      service_id: null,
      nurse_id: appt.nurse_id,
      is_walk_in: false,
      reason: appt.reason,
    });

    await conn.query('UPDATE appointments SET status = ? WHERE id = ?', ['CHECKED_IN', appt.id]);
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (NULL, ?, ?)', ['CHECKIN', `Appointment ${appt.reference} checked in, queue #${queue_number}`]);

    await conn.commit();
    res.json({ ok: true, queue_number, queue_entry_id: queueEntryId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// POST /api/queue/walkin — nurse only.
async function walkin(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { student_id, full_name, contact_number, email, service_id, reason } = req.body;
    if (!isNonEmptyString(student_id, 30) || !isNonEmptyString(full_name, 120) || !isNonEmptyString(reason, 255)) {
      return res.status(400).json({ error: 'Student/Employee ID, full name, and reason are required.' });
    }
    await conn.beginTransaction();
    const patientId = await findOrCreatePatient(conn, { student_id, full_name, contact_number, email });
    const { id: queueEntryId, queue_number } = await addQueueEntry(conn, {
      queue_date: todayStr(),
      patient_id: patientId,
      appointment_id: null,
      service_id: service_id || null,
      nurse_id: req.user.id,
      is_walk_in: true,
      reason,
    });
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'WALKIN', `Walk-in queue #${queue_number} for patient #${patientId}`]);
    await conn.commit();
    res.status(201).json({ ok: true, queue_number, queue_entry_id: queueEntryId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// GET /api/queue/today — nurse/admin.
async function today(req, res, next) {
  try {
    const clauses = ['q.queue_date = ?'];
    const params = [todayStr()];
    if (req.user.role === 'NURSE') {
      clauses.push('(q.nurse_id = ? OR q.nurse_id IS NULL)');
      params.push(req.user.id);
    }
    const [rows] = await pool.query(
      `SELECT q.*, p.full_name AS patient_name, p.student_id, s.name AS service_name
       FROM queue_entries q
       JOIN patients p ON p.id = q.patient_id
       LEFT JOIN services s ON s.id = q.service_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY q.queue_number`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/queue/:id/call — moves WAITING -> CALLED.
async function call(req, res, next) {
  await transitionQueue(req, res, next, 'CALLED', 'QUEUE_CALL');
}
// POST /api/queue/:id/no-show
async function noShow(req, res, next) {
  await transitionQueue(req, res, next, 'NO_SHOW', 'QUEUE_NO_SHOW');
}

async function transitionQueue(req, res, next, targetStatus, action) {
  try {
    const [rows] = await pool.query('SELECT * FROM queue_entries WHERE id = ?', [req.params.id]);
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Queue entry not found.' });
    if (req.user.role === 'NURSE' && entry.nurse_id && entry.nurse_id !== req.user.id) {
      return res.status(403).json({ error: 'This queue entry is assigned to another nurse.' });
    }
    if (!canTransitionQueue(entry.status, targetStatus)) {
      return res.status(409).json({ error: `Cannot change queue status from ${entry.status} to ${targetStatus}.` });
    }
    const called_at = targetStatus === 'CALLED' ? new Date() : entry.called_at;
    await pool.query('UPDATE queue_entries SET status = ?, called_at = ?, nurse_id = COALESCE(nurse_id, ?) WHERE id = ?', [
      targetStatus,
      called_at,
      req.user.id,
      entry.id,
    ]);
    if (targetStatus === 'NO_SHOW' && entry.appointment_id) {
      await pool.query('UPDATE appointments SET status = ? WHERE id = ? AND status = ?', ['NO_SHOW', entry.appointment_id, 'CHECKED_IN']);
    }
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, action, `Queue #${entry.queue_number} -> ${targetStatus}`]);
    res.json({ ok: true, status: targetStatus });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkin, walkin, today, call, noShow };
