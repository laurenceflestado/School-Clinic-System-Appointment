const { pool } = require('../config/db');
const { schedulesOverlap } = require('../config/slots');
const { isDate, isTime } = require('./validators');

// GET /api/schedules?date=&nurse_id= — admin: list schedules.
async function list(req, res, next) {
  try {
    const clauses = [];
    const params = [];
    if (req.query.date) {
      clauses.push('cs.schedule_date = ?');
      params.push(req.query.date);
    }
    if (req.query.nurse_id) {
      clauses.push('cs.nurse_id = ?');
      params.push(req.query.nurse_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT cs.*, s.name AS service_name, u.full_name AS nurse_name
       FROM clinic_schedules cs JOIN services s ON s.id = cs.service_id JOIN users u ON u.id = cs.nurse_id
       ${where} ORDER BY cs.schedule_date, cs.start_time`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function validateNoConflict(conn, candidate, excludeId) {
  // Same-service-same-date-same-start is already a UNIQUE key; here we check
  // that the assigned nurse isn't double-booked into an overlapping window
  // on any other schedule that same day.
  const [existing] = await conn.query(
    `SELECT * FROM clinic_schedules WHERE nurse_id = ? AND schedule_date = ? AND active = 1 ${excludeId ? 'AND id != ?' : ''}`,
    excludeId ? [candidate.nurse_id, candidate.schedule_date, excludeId] : [candidate.nurse_id, candidate.schedule_date]
  );
  const conflict = existing.find((s) => schedulesOverlap(s, candidate));
  return conflict || null;
}

// POST /api/schedules — admin: create.
async function create(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { service_id, schedule_date, start_time, end_time, slot_minutes, capacity_per_slot, nurse_id } = req.body;
    if (!Number.isInteger(Number(service_id)) || !isDate(schedule_date) || !isTime(start_time) || !isTime(end_time) ||
        !Number.isInteger(Number(slot_minutes)) || Number(slot_minutes) <= 0 || !Number.isInteger(Number(nurse_id))) {
      return res.status(400).json({ error: 'service_id, schedule_date, start_time, end_time, slot_minutes, and nurse_id are required.' });
    }
    if (start_time >= end_time) return res.status(400).json({ error: 'start_time must be before end_time.' });

    await conn.beginTransaction();
    const candidate = { schedule_date, start_time, end_time, nurse_id: Number(nurse_id) };
    const conflict = await validateNoConflict(conn, candidate, null);
    if (conflict) {
      await conn.rollback();
      return res.status(409).json({ error: `That nurse is already scheduled from ${conflict.start_time} to ${conflict.end_time} that day.` });
    }

    const [result] = await conn.query(
      `INSERT INTO clinic_schedules (service_id, schedule_date, start_time, end_time, slot_minutes, capacity_per_slot, nurse_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [service_id, schedule_date, start_time, end_time, slot_minutes, capacity_per_slot || 1, nurse_id]
    );
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'SCHEDULE_CREATE', `Schedule #${result.insertId} created`]);
    await conn.commit();
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A schedule for that service, date, and start time already exists.' });
    next(err);
  } finally {
    conn.release();
  }
}

// PUT /api/schedules/:id — admin: editing an existing schedule can only
// change nurse_id or capacity_per_slot once bookings exist against it.
async function update(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM clinic_schedules WHERE id = ?', [req.params.id]);
    const schedule = rows[0];
    if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });

    const [bookedRows] = await conn.query('SELECT COUNT(*) AS c FROM appointments WHERE schedule_id = ?', [schedule.id]);
    const hasBookings = bookedRows[0].c > 0;

    const { nurse_id, capacity_per_slot, schedule_date, start_time, end_time, slot_minutes, active } = req.body;

    if (hasBookings && (schedule_date || start_time || end_time || slot_minutes)) {
      return res.status(409).json({ error: 'This schedule already has bookings: only its nurse or capacity can be changed. Use Reassign for existing appointments.' });
    }

    await conn.beginTransaction();

    if (nurse_id && Number(nurse_id) !== schedule.nurse_id) {
      const candidate = { schedule_date: schedule_date || schedule.schedule_date, start_time: start_time || schedule.start_time, end_time: end_time || schedule.end_time, nurse_id: Number(nurse_id) };
      const conflict = await validateNoConflict(conn, candidate, schedule.id);
      if (conflict) {
        await conn.rollback();
        return res.status(409).json({ error: `That nurse is already scheduled from ${conflict.start_time} to ${conflict.end_time} that day.` });
      }
    }

    await conn.query(
      `UPDATE clinic_schedules SET
         nurse_id = COALESCE(?, nurse_id),
         capacity_per_slot = COALESCE(?, capacity_per_slot),
         schedule_date = COALESCE(?, schedule_date),
         start_time = COALESCE(?, start_time),
         end_time = COALESCE(?, end_time),
         slot_minutes = COALESCE(?, slot_minutes),
         active = COALESCE(?, active)
       WHERE id = ?`,
      [nurse_id || null, capacity_per_slot || null, schedule_date || null, start_time || null, end_time || null, slot_minutes || null, active === undefined ? null : (active ? 1 : 0), schedule.id]
    );
    await conn.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'SCHEDULE_UPDATE', `Schedule #${schedule.id} updated`]);
    await conn.commit();
    res.json({ ok: true, note: nurse_id && Number(nurse_id) !== schedule.nurse_id ? 'Nurse changed on the schedule. Existing appointments keep their original nurse unless explicitly reassigned.' : undefined });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { list, create, update };
