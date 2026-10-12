let availabilityAbortController = null;

async function loadServices() {
  const select = document.getElementById('service');
  try {
    const services = await Api.get('/services');
    services.forEach((s) => select.appendChild(el('option', { value: s.id, text: s.name })));
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadAvailability() {
  const serviceId = document.getElementById('service').value;
  const date = document.getElementById('date').value;
  const slotsDiv = document.getElementById('slots');
  slotsDiv.textContent = '';
  document.getElementById('schedule_id').value = '';
  document.getElementById('appt_time').value = '';
  if (!serviceId || !date) return;

  // Cancel any in-flight request if the user changes date/service again quickly.
  if (availabilityAbortController) availabilityAbortController.abort();
  availabilityAbortController = new AbortController();

  slotsDiv.appendChild(el('p', { class: 'hint', text: 'Loading slots...' }));
  try {
    const data = await Api.get(`/clinic/availability?service_id=${serviceId}&date=${date}`, { signal: availabilityAbortController.signal });
    slotsDiv.textContent = '';
    if (!data.schedules.length) {
      slotsDiv.appendChild(el('p', { class: 'hint', text: 'No clinic schedule for this service on that date.' }));
      return;
    }
    data.schedules.forEach((schedule) => {
      slotsDiv.appendChild(el('p', { class: 'hint', text: `With ${schedule.nurse_name}` }));
      schedule.slots.forEach((slot) => {
        const btn = el('button', {
          type: 'button',
          class: 'slot-btn',
          text: slot.time.slice(0, 5),
          disabled: slot.bookable ? null : 'disabled',
          onclick: () => selectSlot(schedule.schedule_id, slot.time, btn),
        });
        if (!slot.bookable) btn.setAttribute('disabled', 'true');
        slotsDiv.appendChild(btn);
      });
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    slotsDiv.textContent = '';
    slotsDiv.appendChild(el('p', { class: 'hint', text: err.message }));
  }
}

function selectSlot(scheduleId, time, button) {
  document.querySelectorAll('.slot-btn.selected').forEach((b) => b.classList.remove('selected'));
  button.classList.add('selected');
  document.getElementById('schedule_id').value = scheduleId;
  document.getElementById('appt_time').value = time;
}

window.addEventListener('load', () => {
  loadServices();
  document.getElementById('date').min = new Date().toISOString().slice(0, 10);

  document.getElementById('service').addEventListener('change', loadAvailability);
  document.getElementById('date').addEventListener('change', loadAvailability);

  document.getElementById('reason').addEventListener('input', (e) => {
    document.getElementById('reason-count').textContent = e.target.value.length;
  });

  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const apptTime = document.getElementById('appt_time').value;
    if (!apptTime) return toast('Please select a time slot.', 'error');

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    try {
      const payload = {
        service_id: Number(document.getElementById('service').value),
        appt_date: document.getElementById('date').value,
        appt_time: apptTime,
        full_name: document.getElementById('full_name').value.trim(),
        student_id: document.getElementById('student_id').value.trim(),
        contact_number: document.getElementById('contact_number').value.trim(),
        email: document.getElementById('email').value.trim(),
        reason: document.getElementById('reason').value.trim(),
      };
      const result = await Api.post('/appointments', payload);
      document.getElementById('reference-out').textContent = result.reference;
      document.getElementById('result-card').style.display = 'block';
      document.getElementById('booking-form').style.display = 'none';
      document.getElementById('result-card').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
});
