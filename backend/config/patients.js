// Find-or-create for the permanent `patients` record, plus loose name
// matching so a typo doesn't spawn a silent duplicate, and a clear name
// mismatch doesn't get silently merged either.

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Runs inside the caller's transaction connection. Looks up patients by
 * student_id. If found, the given full_name must reasonably match the
 * record on file (case/whitespace-insensitive) or the booking is refused.
 * If not found, a new patient row is created.
 */
async function findOrCreatePatient(conn, { student_id, full_name, contact_number, email }) {
  const [existing] = await conn.query('SELECT * FROM patients WHERE student_id = ? LIMIT 1', [student_id]);

  if (existing.length > 0) {
    const patient = existing[0];
    if (normalizeName(patient.full_name) !== normalizeName(full_name)) {
      const err = new Error(
        `Student/Employee ID ${student_id} is already on file under a different name. ` +
        `Double-check the ID, or contact the clinic if your name has changed.`
      );
      err.statusCode = 409;
      throw err;
    }
    // Keep contact info fresh without overwriting with blanks.
    if (contact_number || email) {
      await conn.query('UPDATE patients SET contact_number = COALESCE(?, contact_number), email = COALESCE(?, email) WHERE id = ?', [
        contact_number || null,
        email || null,
        patient.id,
      ]);
    }
    return patient.id;
  }

  const [result] = await conn.query(
    'INSERT INTO patients (student_id, full_name, contact_number, email) VALUES (?, ?, ?, ?)',
    [student_id, full_name.trim(), contact_number || null, email || null]
  );
  return result.insertId;
}

module.exports = { findOrCreatePatient, normalizeName };
