// Slot/availability math, kept separate so it can be unit-tested on its own.

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

/**
 * Splits one schedule's [start_time, end_time) into slot_minutes-wide slots.
 * Returns an array of "HH:MM:00" slot start times.
 */
function buildSlots(schedule) {
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  const step = Number(schedule.slot_minutes);
  const slots = [];
  for (let t = start; t + step <= end; t += step) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/**
 * Given a schedule and the appointments already booked against it (grouped by
 * appt_time -> count), returns each slot with its remaining capacity and
 * whether it's in the past relative to `now` (for today's date only).
 */
function slotsWithAvailability(schedule, bookedCountsByTime, now = new Date()) {
  const slots = buildSlots(schedule);
  const isToday = schedule.schedule_date === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return slots.map((time) => {
    const booked = bookedCountsByTime[time] || 0;
    const remaining = Math.max(0, schedule.capacity_per_slot - booked);
    const isPast = isToday && timeToMinutes(time) <= nowMinutes;
    return {
      time,
      capacity: schedule.capacity_per_slot,
      booked,
      remaining,
      full: remaining <= 0,
      past: isPast,
      bookable: remaining > 0 && !isPast,
    };
  });
}

function schedulesOverlap(a, b) {
  if (a.schedule_date !== b.schedule_date) return false;
  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time);
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time);
  return aStart < bEnd && bStart < aEnd;
}

module.exports = { timeToMinutes, minutesToTime, buildSlots, slotsWithAvailability, schedulesOverlap };
