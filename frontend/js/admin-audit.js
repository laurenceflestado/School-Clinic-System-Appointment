let allRows = [];

function render(rows) {
  const tbody = document.querySelector('#audit-table tbody');
  tbody.textContent = '';
  rows.forEach((r) => {
    tbody.appendChild(el('tr', {}, [
      el('td', { text: r.created_at }),
      el('td', { text: r.user_name || 'System / Public' }),
      el('td', { text: r.action }),
      el('td', { text: r.details || '' }),
    ]));
  });
}

async function load() {
  try {
    allRows = await Api.get('/reports/audit?limit=200', { auth: true });
    render(allRows);
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());
  document.getElementById('filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    render(allRows.filter((r) => r.action.toLowerCase().includes(q) || (r.details || '').toLowerCase().includes(q) || (r.user_name || '').toLowerCase().includes(q)));
  });
  load();
});
