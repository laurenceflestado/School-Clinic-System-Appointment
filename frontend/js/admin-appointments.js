let nurseList = [];

async function loadNurses() {
  try {
    nurseList = await Api.get('/nurses', { auth: true });
  } catch (err) { /* non-fatal */ }
}

function renderRow(a) {
  const actions = el('td', {});
  if (a.status === 'PENDING') {
    actions.appendChild(el('button', { text: 'Approve', onclick: () => act(a.id, 'approve') }));
    actions.appendChild(document.createTextNode(' '));
    actions.appendChild(el('button', { class: 'danger', text: 'Reject', onclick: () => act(a.id, 'reject') }));
    actions.appendChild(document.createTextNode(' '));
  }
  const reassignBtn = el('button', { class: 'secondary', text: 'Reassign', onclick: () => reassign(a.id, a.nurse_name) });
  actions.appendChild(reassignBtn);

  return el('tr', {}, [
    el('td', { text: a.reference }),
    el('td', { text: `${a.patient_name} (${a.student_id})` }),
    el('td', { text: a.service_name }),
    el('td', { text: a.appt_date }),
    el('td', { text: a.appt_time.slice(0, 5) }),
    el('td', { text: a.nurse_name }),
    el('td', {}, [el('span', { class: `badge badge-${a.status}`, text: a.status })]),
    actions,
  ]);
}

async function load() {
  const tbody = document.querySelector('#appt-table tbody');
  tbody.textContent = '';
  try {
    const status = document.getElementById('f-status').value;
    const date = document.getElementById('f-date').value;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (date) params.set('date', date);
    const rows = await Api.get(`/appointments?${params.toString()}`, { auth: true });
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
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function reassign(id, currentNurse) {
  const names = nurseList.map((n) => `${n.id}: ${n.full_name}`).join('\n');
  const input = prompt(`Reassign from ${currentNurse} to which nurse ID?\n${names}`);
  if (!input) return;
  try {
    await Api.post(`/appointments/${id}/reassign`, { nurse_id: Number(input) }, { auth: true });
    toast('Reassigned.', 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', async () => {
  const user = Session.requireRole(['ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());
  document.getElementById('f-status').addEventListener('change', load);
  document.getElementById('f-date').addEventListener('change', load);
  await loadNurses();
  load();
});
