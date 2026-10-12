const { pool } = require('../config/db');
const { slotsWithAvailability } = require('../config/slots');
const { isDate } = require('./validators');

// GET /api/clinic/availability?service_id=&date=
// Public: returns every active schedule for that service+date with per-slot
// remaining capacity, so the booking page can grey out full/past slots.
async function availability(req, res, next) {
  try {
    const { service_id, date } = req.query;
    if (!Number.isInteger(Number(service_id)) || !isDate(date)) {
      return res.status(400).json({ error: 'service_id and date (YYYY-MM-DD) are required.' });
    }

    const [schedules] = await pool.query(
      `SELECT cs.*, u.full_name AS nurse_name
       FROM clinic_schedules cs JOIN users u ON u.id = cs.nurse_id
       WHERE cs.service_id = ? AND cs.schedule_date = ? AND cs.active = 1
       ORDER BY cs.start_time`,
      [service_id, date]
    );

    if (schedules.length === 0) return res.json({ schedules: [] });

    const scheduleIds = schedules.map((s) => s.id);
    const [booked] = await pool.query(
      `SELECT schedule_id, appt_time, COUNT(*) AS cnt FROM appointments
       WHERE schedule_id IN (?) AND status IN ('PENDING','APPROVED','CHECKED_IN','IN_CONSULTATION','COMPLETED')
       GROUP BY schedule_id, appt_time`,
      [scheduleIds]
    );

    const bookedByScheduleAndTime = {};
    for (const row of booked) {
      bookedByScheduleAndTime[row.schedule_id] = bookedByScheduleAndTime[row.schedule_id] || {};
      bookedByScheduleAndTime[row.schedule_id][row.appt_time] = row.cnt;
    }

    const out = schedules.map((schedule) => ({
      schedule_id: schedule.id,
      nurse_name: schedule.nurse_name,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      slots: slotsWithAvailability(schedule, bookedByScheduleAndTime[schedule.id] || {}),
    }));

    res.json({ schedules: out });
  } catch (err) {
    next(err);
  }
}

module.exports = { availability };
