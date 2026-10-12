// Demo/seed data — fictional only. Runs once, only when the `users` table is
// still empty, so restarting the server never duplicates data.
const bcrypt = require('bcryptjs');
const { generateReference } = require('./config/reference');

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function seedIfEmpty(pool) {
  const [existing] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (existing[0].c > 0) return; // already seeded (or staff accounts already created manually)

  console.log('Seeding demo data (first run)...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const nurseHash = await bcrypt.hash('nurse123', 10);

  const [adminResult] = await pool.query(
    `INSERT INTO users (staff_id, full_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'ADMIN', 1)`,
    ['A-001', 'System Admin', 'admin@school.edu', adminHash]
  );
  const [anaResult] = await pool.query(
    `INSERT INTO users (staff_id, full_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'NURSE', 1)`,
    ['N-001', 'Nurse Ana Reyes', 'ana@school.edu', nurseHash]
  );
  const [beaResult] = await pool.query(
    `INSERT INTO users (staff_id, full_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'NURSE', 1)`,
    ['N-002', 'Nurse Bea Santos', 'bea@school.edu', nurseHash]
  );
  const anaId = anaResult.insertId;
  const beaId = beaResult.insertId;

  const services = [
    ['General Consultation', 'General check-up for common complaints'],
    ['First Aid', 'Minor injuries and immediate care'],
    ['Medicine Request', 'Dispensing of clinic-stocked over-the-counter medicine'],
    ['Medical Certificate', 'Certificate for absence or fitness to participate'],
  ];
  const serviceIds = {};
  for (const [name, description] of services) {
    const [r] = await pool.query('INSERT INTO services (name, description) VALUES (?, ?)', [name, description]);
    serviceIds[name] = r.insertId;
  }

  // Rolling schedule: Ana and Bea alternate days, ~30 days back to ~13 days ahead.
  const today = new Date();
  const serviceList = Object.values(serviceIds);
  for (let offset = -30; offset <= 13; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const dateStr = fmtDate(d);
    const nurseForDay = offset % 2 === 0 ? anaId : beaId;
    // General Consultation + First Aid every day; the other two on alternate days.
    const dayServices = offset % 2 === 0 ? [serviceIds['General Consultation'], serviceIds['First Aid']] : [serviceIds['General Consultation'], serviceIds['Medicine Request']];
    for (const serviceId of dayServices) {
      try {
        await pool.query(
          `INSERT INTO clinic_schedules (service_id, schedule_date, start_time, end_time, slot_minutes, capacity_per_slot, nurse_id)
           VALUES (?, ?, '08:00:00', '16:00:00', 20, 2, ?)`,
          [serviceId, dateStr, nurseForDay]
        );
      } catch (e) { /* ignore rare unique-key clashes on regenerate */ }
    }
  }

  // Three sample patients (fictional).
  const patients = [
    ['S-2026-0001', 'Juan Dela Cruz', '09171234567', 'juan.delacruz@student.school.edu'],
    ['S-2026-0002', 'Maria Clara', '09179876543', 'maria.clara@student.school.edu'],
    ['E-2026-0003', 'Pedro Penduko', '09175551234', 'pedro.penduko@school.edu'],
  ];
  const patientIds = [];
  for (const [student_id, full_name, contact_number, email] of patients) {
    const [r] = await pool.query('INSERT INTO patients (student_id, full_name, contact_number, email) VALUES (?, ?, ?, ?)', [
      student_id, full_name, contact_number, email,
    ]);
    patientIds.push(r.insertId);
  }

  // A few completed visits in the past, so history/reports screens have data.
  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const nurseId = i % 2 === 0 ? anaId : beaId;
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - (5 + i * 3));
    const dateStr = fmtDate(pastDate);

    const [schedRows] = await pool.query(
      `SELECT id FROM clinic_schedules WHERE nurse_id = ? AND schedule_date <= ? ORDER BY schedule_date DESC LIMIT 1`,
      [nurseId, dateStr]
    );
    const scheduleId = schedRows[0] ? schedRows[0].id : null;

    const reference = await generateReference(pool);
    const [apptResult] = await pool.query(
      `INSERT INTO appointments (reference, patient_id, schedule_id, nurse_id, appt_date, appt_time, reason, status)
       VALUES (?, ?, ?, ?, ?, '09:00:00', ?, 'COMPLETED')`,
      [reference, patientId, scheduleId, nurseId, dateStr, 'Fever and headache']
    );

    const [queueResult] = await pool.query(
      `INSERT INTO queue_entries (queue_date, queue_number, patient_id, appointment_id, nurse_id, is_walk_in, reason, status, called_at)
       VALUES (?, 1, ?, ?, ?, 0, 'Fever and headache', 'COMPLETED', NOW())`,
      [dateStr, patientId, apptResult.insertId, nurseId]
    );

    const [consultResult] = await pool.query(
      `INSERT INTO consultations (queue_entry_id, patient_id, appointment_id, nurse_id, status, chief_complaint, findings, treatment, medication_given, instructions, completed_at)
       VALUES (?, ?, ?, ?, 'COMPLETED', 'Fever and headache', 'Mild fever, no other symptoms', 'Rest and hydration advised', 'Paracetamol 500mg', 'Return if fever persists beyond 3 days', NOW())`,
      [queueResult.insertId, patientId, apptResult.insertId, nurseId]
    );

    await pool.query(
      `INSERT INTO vital_signs (consultation_id, temperature, blood_pressure, pulse_rate, respiratory_rate, height_cm, weight_kg)
       VALUES (?, 37.8, '110/70', 82, 18, 160.0, 55.0)`,
      [consultResult.insertId]
    );
  }

  // A couple of pending appointments today/tomorrow, so there's something to approve/check in.
  for (let i = 0; i < 2; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = fmtDate(d);
    const nurseId = i % 2 === 0 ? anaId : beaId;

    const [schedRows] = await pool.query(
      `SELECT id FROM clinic_schedules WHERE nurse_id = ? AND schedule_date = ? AND service_id = ? LIMIT 1`,
      [nurseId, dateStr, serviceIds['General Consultation']]
    );
    if (!schedRows[0]) continue;

    const reference = await generateReference(pool);
    await pool.query(
      `INSERT INTO appointments (reference, patient_id, schedule_id, nurse_id, appt_date, appt_time, reason, status)
       VALUES (?, ?, ?, ?, ?, '10:00:00', ?, 'PENDING')`,
      [reference, patientIds[i], schedRows[0].id, nurseId, dateStr, 'Follow-up check-up']
    );
  }

  console.log('Seed complete: 1 admin, 2 nurses, 4 services, rolling schedule, 3 patients, sample visits.');
  console.log('Admin login: admin@school.edu / admin123');
  console.log('Nurse logins: ana@school.edu / nurse123, bea@school.edu / nurse123');
}

module.exports = { seedIfEmpty };
