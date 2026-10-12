let currentFilter = 'PENDING';

function renderRow(a) {
  const actions = el('td', {});
  if (a.status === 'PENDING') {
    actions.appendChild(el('button', { text: 'Approve', onclick: () => act(a.id, 'approve') }));
    actions.appendChild(document.createTextNode(' '));
    actions.appendChild(el('button', { class: 'danger', text: 'Reject', onclick: () => act(a.id, 'reject') }));
  } else {
    actions.appendChild(el('span', { class: 'hint', text: '—' }));
  }
  return el('tr', {}, [
    el('td', { text: a.reference }),
    el('td', { text: `${a.patient_name} (${a.student_id})` }),
    el('td', { text: a.service_name }),
    el('td', { text: a.appt_date }),
    el('td', { text: a.appt_time.slice(0, 5) }),
    el('td', { text: a.reason }),
    el('td', {}, [el('span', { class: `badge badge-${a.status}`, text: a.status })]),
    actions,
  ]);
}

async function loadAppointments() {
  const tbody = document.querySelector('#appt-table tbody');
  tbody.textContent = '';
  try {
    const qs = currentFilter ? `?status=${currentFilter}` : '';
    const rows = await Api.get(`/appointments${qs}`, { auth: true });
    document.getElementById('empty-state').style.display = rows.length ? 'none' : 'block';
    rows.forEach((a) => tbody.appendChild(renderRow(a)));
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function act(id, action) {
  try {
    await Api.post(`/appointments/${id}/${action}`, {}, { auth: true });
    toast(`Appointment ${action}d.`, 'success');
    loadAppointments();
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['NURSE', 'ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());
  document.getElementById('change-pw-btn').addEventListener('click', () => {
    const cur = prompt('Current password:');
    if (cur === null) return;
    const next = prompt('New password (min 6 chars):');
    if (!next) return;
    Api.post('/auth/change-password', { current_password: cur, new_password: next }, { auth: true })
      .then(() => toast('Password changed.', 'success'))
      .catch((err) => toast(err.message, 'error'));
  });

  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#filter-tabs button').forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.status;
    loadAppointments();
  });

  loadAppointments();
  pausableInterval(loadAppointments, 20000);
});
