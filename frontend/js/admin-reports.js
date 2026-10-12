function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function totalCapacity(c) { return Math.floor((timeToMin(c.end_time) - timeToMin(c.start_time)) / c.slot_minutes) * c.capacity_per_slot; }

async function load() {
  try {
    const date = document.getElementById('r-date').value;
    const data = await Api.get(`/reports/summary${date ? `?date=${date}` : ''}`, { auth: true });
    const statusCounts = {};
    (data.appointments_by_status || []).forEach((r) => { statusCounts[r.status] = r.cnt; });
    const cards = document.getElementById('summary-cards');
    cards.textContent = '';
    const makeCard = (label, value) => el('div', { class: 'card' }, [el('h3', { text: String(value) }), el('p', { class: 'hint', text: label })]);
    Object.entries(statusCounts).forEach(([status, cnt]) => cards.appendChild(makeCard(status, cnt)));
    cards.appendChild(makeCard('Avg. wait (minutes)', data.avg_wait_minutes ?? '—'));
    cards.appendChild(makeCard('Patients called', data.called_count || 0));

    const tbody = document.querySelector('#capacity-table tbody');
    tbody.textContent = '';
    data.capacity.forEach((c) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: c.service_name }),
        el('td', { text: c.nurse_name }),
        el('td', { text: `${c.start_time.slice(0,5)}–${c.end_time.slice(0,5)}` }),
        el('td', { text: `${c.booked} / ${totalCapacity(c)}` }),
      ]));
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());
  document.getElementById('r-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('r-date').addEventListener('change', load);
  load();
});
