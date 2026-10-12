// Small hand-rolled validators (no extra dependency needed for this project's scope).

function isNonEmptyString(v, max = 255) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isTime(v) {
  return typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v);
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function bookingPayloadErrors(body) {
  const errors = [];
  if (!Number.isInteger(Number(body.service_id))) errors.push('service_id is required.');
  if (!isDate(body.appt_date)) errors.push('appt_date must be YYYY-MM-DD.');
  if (!isTime(body.appt_time)) errors.push('appt_time must be HH:MM.');
  if (!isNonEmptyString(body.student_id, 30)) errors.push('Student/Employee ID is required.');
  if (!isNonEmptyString(body.full_name, 120)) errors.push('Full name is required.');
  if (!isNonEmptyString(body.reason, 255)) errors.push('Reason is required.');
  if (body.email && !isEmail(body.email)) errors.push('Email looks invalid.');
  return errors;
}

module.exports = { isNonEmptyString, isDate, isTime, isEmail, bookingPayloadErrors };
