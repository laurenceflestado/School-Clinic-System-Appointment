function slotsTotalCapacity(schedule) {
  const startMin = timeToMin(schedule.start_time);
  const endMin = timeToMin(schedule.end_time);
  const slotCount = Math.floor((endMin - startMin) / schedule.slot_minutes);
  return slotCount * schedule.capacity_per_slot;
}
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function load() {
  try {
    const data = await Api.get('/reports/summary', { auth: true });
    const cards = document.getElementById('summary-cards');
    cards.textContent = '';
    const statusCounts = {};
    (data.appointments_by_status || []).forEach((r) => { statusCounts[r.status] = r.cnt; });
    const makeCard = (label, value) => el('div', { class: 'card' }, [el('h3', { text: String(value) }), el('p', { class: 'hint', text: label })]);
    cards.appendChild(makeCard('Pending requests', statusCounts.PENDING || 0));
    cards.appendChild(makeCard('Approved today', statusCounts.APPROVED || 0));
    cards.appendChild(makeCard('Completed today', statusCounts.COMPLETED || 0));
    cards.appendChild(makeCard('Checked-in today', statusCounts.CHECKED_IN || 0));
    cards.appendChild(makeCard('Patients called', data.called_count || 0));
    cards.appendChild(makeCard('Avg. wait (minutes)', data.avg_wait_minutes ?? '—'));

    const tbody = document.querySelector('#capacity-table tbody');
    tbody.textContent = '';
    document.getElementById('empty-state').style.display = data.capacity.length ? 'none' : 'block';
    data.capacity.forEach((c) => {
      const total = slotsTotalCapacity(c);
      tbody.appendChild(el('tr', {}, [
        el('td', { text: c.service_name }),
        el('td', { text: c.nurse_name }),
        el('td', { text: `${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)}` }),
        el('td', { text: `${c.booked} / ${total}` }),
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
  load();
});
