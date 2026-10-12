const { pool } = require('../config/db');

// GET /api/reports/summary?date= — admin: counts only, never clinical detail.
async function summary(req, res, next) {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const [apptCounts] = await pool.query(
      `SELECT status, COUNT(*) AS cnt FROM appointments WHERE appt_date = ? GROUP BY status`,
      [date]
    );

    const [capacity] = await pool.query(
      `SELECT cs.id, s.name AS service_name, u.full_name AS nurse_name, cs.start_time, cs.end_time,
              cs.slot_minutes, cs.capacity_per_slot,
              (SELECT COUNT(*) FROM appointments a WHERE a.schedule_id = cs.id AND a.status IN ('PENDING','APPROVED','CHECKED_IN','IN_CONSULTATION','COMPLETED')) AS booked
       FROM clinic_schedules cs JOIN services s ON s.id = cs.service_id JOIN users u ON u.id = cs.nurse_id
       WHERE cs.schedule_date = ? AND cs.active = 1`,
      [date]
    );

    const [waitStats] = await pool.query(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, checked_in_at, called_at)) AS avg_wait_minutes, COUNT(*) AS called_count
       FROM queue_entries WHERE queue_date = ? AND called_at IS NOT NULL`,
      [date]
    );

    res.json({
      date,
      appointments_by_status: apptCounts,
      capacity,
      avg_wait_minutes: waitStats[0].avg_wait_minutes ? Math.round(waitStats[0].avg_wait_minutes) : null,
      called_count: waitStats[0].called_count,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/audit?limit= — admin: insert-only audit trail, read-only endpoint.
async function audit(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT al.*, u.full_name AS user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, audit };
