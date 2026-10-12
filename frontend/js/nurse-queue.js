let searchResults = [];
let searchIndex = -1;
let searchAbort = null;

function renderQueueRow(q) {
  const actions = el('td', {});
  if (q.status === 'WAITING' || q.status === 'CALLED') {
    actions.appendChild(el('button', { text: 'Start Consultation', onclick: () => startConsult(q.id, q.patient_name) }));
    actions.appendChild(document.createTextNode(' '));
    actions.appendChild(el('button', { class: 'danger', text: 'No Show', onclick: () => noShow(q.id) }));
  } else {
    actions.appendChild(el('span', { class: 'hint', text: '—' }));
  }
  const row = el('tr', {}, [
    el('td', { text: q.queue_number }),
    el('td', { text: `${q.patient_name} (${q.student_id})` }),
    el('td', { text: q.reason || '' }),
    el('td', {}, [el('span', { class: `badge badge-${q.status}`, text: q.status })]),
    actions,
  ]);
  row.dataset.queueId = q.id;
  row.dataset.status = q.status;
  return row;
}

async function loadQueue() {
  const tbody = document.querySelector('#queue-table tbody');
  tbody.textContent = '';
  try {
    const rows = await Api.get('/queue/today', { auth: true });
    document.getElementById('empty-state').style.display = rows.length ? 'none' : 'block';
    rows.forEach((q) => tbody.appendChild(renderQueueRow(q)));
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function callNext() {
  const tbody = document.querySelector('#queue-table tbody');
  const nextRow = [...tbody.querySelectorAll('tr')].find((r) => r.dataset.status === 'WAITING');
  if (!nextRow) return toast('No one is waiting.', 'info');
  try {
    await Api.post(`/queue/${nextRow.dataset.queueId}/call`, {}, { auth: true });
    toast('Patient called.', 'success');
    loadQueue();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function noShow(id) {
  try {
    await Api.post(`/queue/${id}/no-show`, {}, { auth: true });
    loadQueue();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function startConsult(queueEntryId, patientName) {
  try {
    const result = await Api.post('/consultations/start', { queue_entry_id: queueEntryId }, { auth: true });
    document.getElementById('consult-id').value = result.consultation_id;
    document.getElementById('consult-patient').textContent = patientName;
    ['v-temp', 'v-bp', 'v-pulse', 'v-resp', 'v-height', 'v-weight', 'c-findings', 'c-treatment', 'c-medication', 'c-instructions'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    document.getElementById('temp-notice').style.display = 'none';
    document.getElementById('consult-panel').style.display = 'block';
    document.getElementById('consult-panel').scrollIntoView({ behavior: 'smooth' });
    loadQueue();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeConsult() {
  document.getElementById('consult-panel').style.display = 'none';
}

function buildConsultPayload() {
  return {
    findings: document.getElementById('c-findings').value,
    treatment: document.getElementById('c-treatment').value,
    medication_given: document.getElementById('c-medication').value,
    instructions: document.getElementById('c-instructions').value,
    vitals: {
      temperature: document.getElementById('v-temp').value || null,
      blood_pressure: document.getElementById('v-bp').value || null,
      pulse_rate: document.getElementById('v-pulse').value || null,
      respiratory_rate: document.getElementById('v-resp').value || null,
      height_cm: document.getElementById('v-height').value || null,
      weight_kg: document.getElementById('v-weight').value || null,
    },
  };
}

async function saveConsult() {
  const id = document.getElementById('consult-id').value;
  try {
    await Api.put(`/consultations/${id}`, buildConsultPayload(), { auth: true });
    toast('Saved.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function completeConsult() {
  const id = document.getElementById('consult-id').value;
  try {
    await Api.put(`/consultations/${id}`, buildConsultPayload(), { auth: true });
    await Api.post(`/consultations/${id}/complete`, {}, { auth: true });
    toast('Consultation completed.', 'success');
    closeConsult();
    loadQueue();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function runPatientSearch(q) {
  const resultsDiv = document.getElementById('wi-results');
  resultsDiv.textContent = '';
  searchResults = [];
  searchIndex = -1;
  if (!q) return;
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  try {
    const rows = await Api.get(`/patients?q=${encodeURIComponent(q)}`, { auth: true, signal: searchAbort.signal });
    searchResults = rows;
    rows.forEach((p, i) => {
      const item = el('div', {
        class: 'slot-btn',
        style: 'display:block;margin-top:4px;text-align:left',
        text: `${p.full_name} (${p.student_id})`,
        onclick: () => pickPatient(p),
      });
      item.dataset.index = i;
      resultsDiv.appendChild(item);
    });
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, 'error');
  }
}

function pickPatient(p) {
  document.getElementById('wi-student-id').value = p.student_id;
  document.getElementById('wi-full-name').value = p.full_name;
  document.getElementById('wi-contact').value = p.contact_number || '';
  document.getElementById('wi-results').textContent = '';
  document.getElementById('wi-search').value = '';
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['NURSE', 'ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());

  document.getElementById('call-next-btn').addEventListener('click', callNext);
  document.getElementById('close-consult-btn').addEventListener('click', closeConsult);
  document.getElementById('save-consult-btn').addEventListener('click', (e) => { e.preventDefault(); saveConsult(); });
  document.getElementById('complete-consult-btn').addEventListener('click', (e) => { e.preventDefault(); completeConsult(); });

  document.getElementById('v-temp').addEventListener('input', (e) => {
    document.getElementById('temp-notice').style.display = Number(e.target.value) >= 38 ? 'block' : 'none';
  });

  document.getElementById('wi-search').addEventListener('input', (e) => runPatientSearch(e.target.value.trim()));

  document.getElementById('walkin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        student_id: document.getElementById('wi-student-id').value.trim(),
        full_name: document.getElementById('wi-full-name').value.trim(),
        contact_number: document.getElementById('wi-contact').value.trim(),
        reason: document.getElementById('wi-reason').value.trim(),
      };
      const result = await Api.post('/queue/walkin', payload, { auth: true });
      toast(`Added to queue as #${result.queue_number}.`, 'success');
      e.target.reset();
      loadQueue();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Keyboard shortcuts: N calls next, / focuses patient search, Esc closes consult panel.
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'n' && !typing) { e.preventDefault(); callNext(); }
    if (e.key === '/' && !typing) { e.preventDefault(); document.getElementById('wi-search').focus(); }
    if (e.key === 'Escape') { closeConsult(); document.activeElement.blur(); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement.id === 'wi-search') {
      e.preventDefault();
      const items = document.querySelectorAll('#wi-results .slot-btn');
      if (!items.length) return;
      items[searchIndex]?.classList.remove('selected');
      searchIndex = e.key === 'ArrowDown' ? Math.min(searchIndex + 1, items.length - 1) : Math.max(searchIndex - 1, 0);
      items[searchIndex].classList.add('selected');
    }
    if (e.key === 'Enter' && document.activeElement.id === 'wi-search' && searchIndex >= 0 && searchResults[searchIndex]) {
      e.preventDefault();
      pickPatient(searchResults[searchIndex]);
    }
  });

  loadQueue();
  pausableInterval(loadQueue, 10000);
});
