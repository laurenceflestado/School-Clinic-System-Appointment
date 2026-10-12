let nurses = [];
let services = [];

async function loadServices() {
  services = await Api.get('/services?active=false');
  const list = document.getElementById('services-list');
  list.textContent = '';
  services.forEach((s) => {
    list.appendChild(el('div', { class: 'card', style: 'background:#fafcfb' }, [
      el('strong', { text: s.name }),
      el('p', { class: 'hint', text: s.description || '' }),
      el('span', { class: `badge ${s.active ? 'badge-APPROVED' : 'badge-REJECTED'}`, text: s.active ? 'Active' : 'Inactive' }),
    ]));
  });
  const select = document.getElementById('sc-service');
  select.textContent = '';
  services.filter((s) => s.active).forEach((s) => select.appendChild(el('option', { value: s.id, text: s.name })));
}

async function loadNurses() {
  nurses = await Api.get('/nurses', { auth: true });
  const active = nurses.filter((n) => n.active);
  ['sc-nurse', 'f-nurse'].forEach((id) => {
    const select = document.getElementById(id);
    const keepFirst = id === 'f-nurse';
    select.textContent = '';
    if (keepFirst) select.appendChild(el('option', { value: '', text: 'All' }));
    active.forEach((n) => select.appendChild(el('option', { value: n.id, text: n.full_name })));
  });
}

async function checkConflict() {
  const nurseId = document.getElementById('sc-nurse').value;
  const date = document.getElementById('sc-date').value;
  const start = document.getElementById('sc-start').value;
  const end = document.getElementById('sc-end').value;
  const hint = document.getElementById('conflict-hint');
  hint.textContent = '';
  if (!nurseId || !date) return;
  try {
    const existing = await Api.get(`/schedules?date=${date}&nurse_id=${nurseId}`, { auth: true });
    const conflict = existing.find((s) => start < s.end_time && s.start_time < end);
    hint.textContent = conflict ? `Note: this nurse already has ${conflict.start_time.slice(0,5)}–${conflict.end_time.slice(0,5)} that day.` : 'No conflicts found for this nurse on that date.';
  } catch (_) { /* ignore */ }
}

async function loadSchedules() {
  const tbody = document.querySelector('#schedule-table tbody');
  tbody.textContent = '';
  const params = new URLSearchParams();
  if (document.getElementById('f-date').value) params.set('date', document.getElementById('f-date').value);
  if (document.getElementById('f-nurse').value) params.set('nurse_id', document.getElementById('f-nurse').value);
  try {
    const rows = await Api.get(`/schedules?${params.toString()}`, { auth: true });
    rows.forEach((s) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: s.service_name }),
        el('td', { text: s.schedule_date }),
        el('td', { text: `${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}` }),
        el('td', { text: s.nurse_name }),
        el('td', { text: String(s.capacity_per_slot) }),
        el('td', { text: s.active ? 'Yes' : 'No' }),
      ]));
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', async () => {
  const user = Session.requireRole(['ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());

  await loadServices();
  await loadNurses();
  loadSchedules();

  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/services', { name: document.getElementById('s-name').value.trim(), description: document.getElementById('s-desc').value.trim() }, { auth: true });
      toast('Service added.', 'success');
      e.target.reset();
      loadServices();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  ['sc-nurse', 'sc-date', 'sc-start', 'sc-end'].forEach((id) => document.getElementById(id).addEventListener('change', checkConflict));

  document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/schedules', {
        service_id: Number(document.getElementById('sc-service').value),
        nurse_id: Number(document.getElementById('sc-nurse').value),
        schedule_date: document.getElementById('sc-date').value,
        slot_minutes: Number(document.getElementById('sc-slot').value),
        start_time: document.getElementById('sc-start').value,
        end_time: document.getElementById('sc-end').value,
        capacity_per_slot: Number(document.getElementById('sc-capacity').value),
      }, { auth: true });
      toast('Schedule created.', 'success');
      loadSchedules();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('f-date').addEventListener('change', loadSchedules);
  document.getElementById('f-nurse').addEventListener('change', loadSchedules);
});
