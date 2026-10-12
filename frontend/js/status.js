let currentReference = null;
let refreshStop = null;

async function lookup(reference) {
  try {
    const appt = await Api.get(`/appointments/status/${encodeURIComponent(reference)}`);
    currentReference = appt.reference;
    document.getElementById('status-card').style.display = 'block';
    document.getElementById('ref-out').textContent = appt.reference;
    const badge = document.getElementById('status-badge');
    badge.textContent = appt.status;
    badge.className = `badge badge-${appt.status}`;
    document.getElementById('out-service').textContent = appt.service_name;
    document.getElementById('out-date').textContent = appt.appt_date;
    document.getElementById('out-time').textContent = appt.appt_time.slice(0, 5);
    document.getElementById('out-nurse').textContent = appt.nurse_name;

    const canCancel = ['PENDING', 'APPROVED'].includes(appt.status);
    document.getElementById('cancel-box').style.display = canCancel ? 'block' : 'none';

    document.getElementById('checkin-box').style.display = appt.can_check_in_now ? 'block' : 'none';

    // auto-refresh while visible, paused in background tabs
    if (refreshStop) refreshStop();
    refreshStop = pausableInterval(() => lookup(currentReference), 15000);
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('status-card').style.display = 'none';
  }
}

window.addEventListener('load', () => {
  document.getElementById('lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    lookup(document.getElementById('reference').value.trim());
  });

  document.getElementById('checkin-btn').addEventListener('click', async () => {
    const studentId = document.getElementById('checkin-student-id').value.trim();
    if (!studentId) return toast('Enter your Student/Employee ID.', 'error');
    try {
      const result = await Api.post('/queue/checkin', { reference: currentReference, student_id: studentId });
      const box = document.getElementById('queue-out');
      box.style.display = 'block';
      box.textContent = `Your queue number: ${result.queue_number}`;
      toast('Checked in successfully.', 'success');
      lookup(currentReference);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('cancel-btn').addEventListener('click', async () => {
    const studentId = document.getElementById('cancel-student-id').value.trim();
    if (!studentId) return toast('Enter your Student/Employee ID.', 'error');
    if (!confirm('Cancel this appointment?')) return;
    try {
      await Api.post(`/appointments/${encodeURIComponent(currentReference)}/cancel`, { student_id: studentId });
      toast('Appointment cancelled.', 'success');
      lookup(currentReference);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});
