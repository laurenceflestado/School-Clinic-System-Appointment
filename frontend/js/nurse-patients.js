let searchAbort = null;

async function runSearch(q) {
  const tbody = document.querySelector('#results-table tbody');
  tbody.textContent = '';
  if (!q) return;
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  try {
    const rows = await Api.get(`/patients?q=${encodeURIComponent(q)}`, { auth: true, signal: searchAbort.signal });
    rows.forEach((p) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: p.full_name }),
        el('td', { text: p.student_id }),
        el('td', { text: p.contact_number || '' }),
        el('td', {}, [el('button', { text: 'View History', onclick: () => loadHistory(p.id, p.full_name) })]),
      ]));
    });
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, 'error');
  }
}

async function loadHistory(patientId, name) {
  try {
    const data = await Api.get(`/patients/${patientId}/medical-records`, { auth: true });
    document.getElementById('history-card').style.display = 'block';
    document.getElementById('history-name').textContent = `History — ${name}`;
    const list = document.getElementById('history-list');
    list.textContent = '';
    if (!data.consultations.length) {
      list.appendChild(el('p', { class: 'hint', text: 'No past visits on record.' }));
    }
    data.consultations.forEach((c) => {
      const wrap = el('div', { class: 'card', style: 'background:#fafcfb' });
      wrap.appendChild(el('h3', { text: `${c.service_name || 'Visit'} — ${c.started_at}` }));
      wrap.appendChild(el('p', { text: `Nurse: ${c.nurse_name} — ${c.status}` }));
      if (c.chief_complaint) wrap.appendChild(el('p', { text: `Chief complaint: ${c.chief_complaint}` }));
      if (c.findings) wrap.appendChild(el('p', { text: `Findings: ${c.findings}` }));
      if (c.treatment) wrap.appendChild(el('p', { text: `Treatment: ${c.treatment}` }));
      if (c.medication_given) wrap.appendChild(el('p', { text: `Medication: ${c.medication_given}` }));
      if (c.instructions) wrap.appendChild(el('p', { text: `Instructions: ${c.instructions}` }));
      if (c.temperature) wrap.appendChild(el('p', { class: 'hint', text: `Vitals: ${c.temperature}°C, BP ${c.blood_pressure || '-'}, Pulse ${c.pulse_rate || '-'}, Resp ${c.respiratory_rate || '-'}, ${c.height_cm || '-'}cm, ${c.weight_kg || '-'}kg` }));
      list.appendChild(wrap);
    });
    document.getElementById('history-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['NURSE', 'ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());
  document.getElementById('search').addEventListener('input', (e) => runSearch(e.target.value.trim()));
});
