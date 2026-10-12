const { pool } = require('../config/db');

// GET /api/patients?q= — nurse/admin search by name or student_id.
async function search(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    let rows;
    if (q) {
      [rows] = await pool.query(
        `SELECT id, student_id, full_name, contact_number, email FROM patients
         WHERE full_name LIKE ? OR student_id LIKE ? ORDER BY full_name LIMIT 25`,
        [`%${q}%`, `%${q}%`]
      );
    } else {
      [rows] = await pool.query('SELECT id, student_id, full_name, contact_number, email FROM patients ORDER BY full_name LIMIT 25');
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/patients/:id/medical-records — nurse-only, audit logged every open.
async function medicalRecords(req, res, next) {
  try {
    const [patientRows] = await pool.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (!patientRows[0]) return res.status(404).json({ error: 'Patient not found.' });

    const [consults] = await pool.query(
      `SELECT c.id, c.chief_complaint, c.findings, c.treatment, c.medication_given, c.instructions,
              c.started_at, c.completed_at, c.status, u.full_name AS nurse_name, s.name AS service_name,
              v.temperature, v.blood_pressure, v.pulse_rate, v.respiratory_rate, v.height_cm, v.weight_kg
       FROM consultations c
       JOIN users u ON u.id = c.nurse_id
       LEFT JOIN services s ON s.id = c.service_id
       LEFT JOIN vital_signs v ON v.consultation_id = c.id
       WHERE c.patient_id = ? ORDER BY c.started_at DESC`,
      [req.params.id]
    );

    await pool.query('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)', [
      req.user.id,
      'VIEW_MEDICAL_RECORDS',
      `Viewed medical records for patient #${req.params.id}`,
    ]);

    res.json({ patient: patientRows[0], consultations: consults });
  } catch (err) {
    next(err);
  }
}

module.exports = { search, medicalRecords };
