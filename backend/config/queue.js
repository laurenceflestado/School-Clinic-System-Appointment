// Locked queue transactions: getting the next queue number for a day must
// never race two check-ins into the same number.

async function nextQueueNumber(conn, queueDate) {
  // SELECT ... FOR UPDATE against a per-day marker row-set (the queue_entries
  // themselves) serializes concurrent check-ins for the same date.
  const [rows] = await conn.query(
    'SELECT COALESCE(MAX(queue_number), 0) AS maxNum FROM queue_entries WHERE queue_date = ? FOR UPDATE',
    [queueDate]
  );
  return (rows[0].maxNum || 0) + 1;
}

async function addQueueEntry(conn, { queue_date, patient_id, appointment_id, service_id, nurse_id, is_walk_in, reason }) {
  const queue_number = await nextQueueNumber(conn, queue_date);
  const [result] = await conn.query(
    `INSERT INTO queue_entries (queue_date, queue_number, patient_id, appointment_id, service_id, nurse_id, is_walk_in, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [queue_date, queue_number, patient_id, appointment_id || null, service_id || null, nurse_id || null, is_walk_in ? 1 : 0, reason || null]
  );
  return { id: result.insertId, queue_number };
}

module.exports = { nextQueueNumber, addQueueEntry };
