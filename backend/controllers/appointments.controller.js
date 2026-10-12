const { pool } = require('../config/db');
const { generateReference } = require('../config/reference');
const { findOrCreatePatient } = require('../config/patients');
const { canTransitionAppointment } = require('../config/status');
const { bookingPayloadErrors, isNonEmptyString } = require('./validators');

// POST /api/appointments — public booking. Locks the day's schedules inside
// one transaction so two simultaneous requests can't both take the last slot.
async function book(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const errors = bookingPayloadErrors(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const { service_id, appt_date, appt_time, student_id, full_name, contact_number, email, reason } = req.body;

    await conn.beginTransaction();

    // Lock every schedule for this service+date so capacity checks below are race-free.
    const [schedules] = await conn.query(
      `SELECT * FROM clinic_schedules WHERE service_id = ? AND schedule_date = ? AND active = 1 FOR UPDATE`,
      [service_id, appt_date]
    );
    const schedule = schedules.find((s) => appt_time >= s.start_time && appt_time < s.end_time);
    if (!schedule) {
      await conn.rollback();
      return res.status(400).json({ error: 'That slot is not available. Please pick another time.' });
    }
    if (appt_date === new Date().toISOString().slice(0, 10)) {
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      if (appt_time <= nowStr) {
        await conn.rollback();
        return res.status(400).json({ error: 'That time has already passed today. Please pick a later slot.' });
      }
    }

    const [bookedRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM appointments
       WHERE schedule_id = ? AND appt_time = ? AND status IN ('PENDING','APPROVED','CHECKED_IN','IN_CONSULTATION','COMPLETED') FOR UPDATE`,
      [schedule.id, appt_time]
    );
    if (bookedRows[0].cnt >= schedule.capacity_per_slot) {
      await conn.rollback();
      return res.status(409).json({ error: 'That slot just filled up. Please pick another time.' });
    }

    const patientId = await findOrCreatePatient(conn, { student_id, full_name, contact_number, email });

    // Refuse a second same-day appointment for the same patient (any active status).
    const [sameDay] = await conn.query(
      `SELECT id FROM appointments WHERE patient_id = ? AND appt_date = ? AND status IN ('PENDING','APPROVED','CHECKED_IN','IN_CONSULTATION') LIMIT 1`,
      [patientId, appt_date]
    );
    if (sameDay.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This patient already has an active appointment on that date.' });
    }

    const reference = await generateReference(conn);
    const [result] = await conn.query(
      `INSERT INTO appointments (reference, patient_id, schedule_id, nurse_id, appt_date, appt_time, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [reference, patientId, schedule.id, schedule.nurse_id, appt_date, appt_time, reason.trim()]
    );

    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (NULL, ?, ?)', ['BOOK', `Appointment ${reference} booked`]);
    await conn.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [
      schedule.nurse_id,
      'NEW_APPOINTMENT',
      `New appointment request ${reference} for ${appt_date} ${appt_time}`,
    ]);

    await conn.commit();
    res.status(201).json({ reference, appointment_id: result.insertId, status: 'PENDING' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// GET /api/appointments/status/:reference — public. Never returns medical info.
async function statusByReference(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT a.reference, a.status, a.appt_date, a.appt_time, a.reason, s.name AS service_name, u.full_name AS nurse_name, a.id
       FROM appointments a
       JOIN clinic_schedules cs ON cs.id = a.schedule_id
       JOIN services s ON s.id = cs.service_id
       JOIN users u ON u.id = a.nurse_id
       WHERE a.reference = ? LIMIT 1`,
      [req.params.reference]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No appointment found with that reference.' });

    const appt = rows[0];
    const settings = require('../config/settings');
    let canCheckInNow = false;
    if (appt.status === 'APPROVED' && settings.SELF_CHECKIN_MINUTES_BEFORE > 0) {
      const apptDateTime = new Date(`${appt.appt_date}T${appt.appt_time}`);
      const diffMinutes = (apptDateTime.getTime() - Date.now()) / 60000;
      canCheckInNow = diffMinutes <= settings.SELF_CHECKIN_MINUTES_BEFORE && diffMinutes > -120;
    }

    res.json({
      reference: appt.reference,
      status: appt.status,
      appt_date: appt.appt_date,
      appt_time: appt.appt_time,
      service_name: appt.service_name,
      nurse_name: appt.nurse_name,
      can_check_in_now: canCheckInNow,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/appointments/:reference/cancel — public, requires matching student_id.
async function cancelByReference(req, res, next) {
  try {
    const { student_id } = req.body;
    if (!isNonEmptyString(student_id, 30)) return res.status(400).json({ error: 'Student/Employee ID is required to cancel.' });

    const [rows] = await pool.query(
      `SELECT a.*, p.student_id FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.reference = ? LIMIT 1`,
      [req.params.reference]
    );
    const appt = rows[0];
    if (!appt) return res.status(404).json({ error: 'No appointment found with that reference.' });
    if (appt.student_id !== student_id) return res.status(403).json({ error: 'Student/Employee ID does not match this appointment.' });
    if (!canTransitionAppointment(appt.status, 'CANCELLED')) {
      return res.status(409).json({ error: `An appointment with status ${appt.status} cannot be cancelled.` });
    }

    await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['CANCELLED', appt.id]);
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (NULL, ?, ?)', ['CANCEL', `Appointment ${appt.reference} cancelled by patient`]);
    res.json({ ok: true, status: 'CANCELLED' });
  } catch (err) {
    next(err);
  }
}

// GET /api/appointments/mine — patient-account only.
async function mine(req, res, next) {
  try {
    if (!req.user.patient_id) return res.status(403).json({ error: 'This account is not linked to a patient record.' });
    const [rows] = await pool.query(
      `SELECT a.reference, a.status, a.appt_date, a.appt_time, a.reason, s.name AS service_name, u.full_name AS nurse_name
       FROM appointments a
       JOIN clinic_schedules cs ON cs.id = a.schedule_id
       JOIN services s ON s.id = cs.service_id
       JOIN users u ON u.id = a.nurse_id
       WHERE a.patient_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC`,
      [req.user.patient_id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/appointments — staff list (nurse sees only their own unless admin).
async function list(req, res, next) {
  try {
    const { status, date } = req.query;
    const clauses = [];
    const params = [];
    if (req.user.role === 'NURSE') {
      clauses.push('a.nurse_id = ?');
      params.push(req.user.id);
    }
    if (status) {
      clauses.push('a.status = ?');
      params.push(status);
    }
    if (date) {
      clauses.push('a.appt_date = ?');
      params.push(date);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT a.id, a.reference, a.status, a.appt_date, a.appt_time, a.reason, a.remarks,
              p.id AS patient_id, p.full_name AS patient_name, p.student_id,
              s.name AS service_name, u.full_name AS nurse_name, a.nurse_id
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN clinic_schedules cs ON cs.id = a.schedule_id
       JOIN services s ON s.id = cs.service_id
       JOIN users u ON u.id = a.nurse_id
       ${where}
       ORDER BY a.appt_date DESC, a.appt_time DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function assertNurseOwnsOrAdmin(req, appt) {
  if (req.user.role === 'ADMIN') return true;
  return req.user.role === 'NURSE' && appt.nurse_id === req.user.id;
}

// POST /api/appointments/:id/approve
async function approve(req, res, next) {
  await transitionAppointment(req, res, next, 'APPROVED', 'APPROVE');
}
// POST /api/appointments/:id/reject
async function reject(req, res, next) {
  await transitionAppointment(req, res, next, 'REJECTED', 'REJECT');
}

async function transitionAppointment(req, res, next, targetStatus, action) {
  try {
    const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    const appt = rows[0];
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
    if (!(await assertNurseOwnsOrAdmin(req, appt))) return res.status(403).json({ error: 'You can only act on appointments assigned to you.' });
    if (!canTransitionAppointment(appt.status, targetStatus)) {
      return res.status(409).json({ error: `Cannot change status from ${appt.status} to ${targetStatus}.` });
    }
    const remarks = req.body && req.body.remarks ? String(req.body.remarks).slice(0, 255) : null;
    await pool.query('UPDATE appointments SET status = ?, remarks = COALESCE(?, remarks) WHERE id = ?', [targetStatus, remarks, appt.id]);
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, action, `Appointment ${appt.reference} -> ${targetStatus}`]);
    res.json({ ok: true, status: targetStatus });
  } catch (err) {
    next(err);
  }
}

// POST /api/appointments/:id/reassign — admin only.
async function reassign(req, res, next) {
  try {
    const { nurse_id } = req.body;
    if (!Number.isInteger(Number(nurse_id))) return res.status(400).json({ error: 'nurse_id is required.' });

    const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    const appt = rows[0];
    if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

    const [nurseRows] = await pool.query(`SELECT * FROM users WHERE id = ? AND role = 'NURSE' AND active = 1`, [nurse_id]);
    if (!nurseRows[0]) return res.status(400).json({ error: 'Target nurse not found or inactive.' });

    await pool.query('UPDATE appointments SET nurse_id = ? WHERE id = ?', [nurse_id, appt.id]);
    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [
      req.user.id,
      'REASSIGN',
      `Appointment ${appt.reference} reassigned to nurse #${nurse_id}`,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { book, statusByReference, cancelByReference, mine, list, approve, reject, reassign };
