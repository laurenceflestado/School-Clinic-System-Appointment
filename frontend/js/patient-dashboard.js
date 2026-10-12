window.addEventListener('load', async () => {
  const user = Session.requireRole(['PATIENT'], '../patient/login.html');
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout('../patient/login.html'));

  try {
    const rows = await Api.get('/appointments/mine', { auth: true });
    const tbody = document.querySelector('#appt-table tbody');
    if (!rows.length) {
      document.getElementById('empty-state').style.display = 'block';
      return;
    }
    rows.forEach((a) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: a.reference }),
        el('td', { text: a.service_name }),
        el('td', { text: a.appt_date }),
        el('td', { text: a.appt_time.slice(0, 5) }),
        el('td', { text: a.nurse_name }),
        el('td', {}, [el('span', { class: `badge badge-${a.status}`, text: a.status })]),
      ]));
    });
  } catch (err) {
    toast(err.message, 'error');
  }
});
