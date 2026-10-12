async function load() {
  const tbody = document.querySelector('#nurse-table tbody');
  tbody.textContent = '';
  try {
    const rows = await Api.get('/nurses', { auth: true });
    rows.forEach((n) => {
      const actions = el('td', {});
      actions.appendChild(el('button', {
        class: n.active ? 'danger' : 'secondary',
        text: n.active ? 'Deactivate' : 'Reactivate',
        onclick: () => toggleActive(n.id, !n.active),
      }));
      actions.appendChild(document.createTextNode(' '));
      actions.appendChild(el('button', { class: 'secondary', text: 'Reset Password', onclick: () => resetPassword(n.id) }));
      tbody.appendChild(el('tr', {}, [
        el('td', { text: n.staff_id }),
        el('td', { text: n.full_name }),
        el('td', { text: n.email }),
        el('td', {}, [el('span', { class: `badge ${n.active ? 'badge-APPROVED' : 'badge-REJECTED'}`, text: n.active ? 'Active' : 'Inactive' })]),
        actions,
      ]));
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleActive(id, active) {
  try {
    const result = await Api.put(`/nurses/${id}`, { active }, { auth: true });
    toast(active ? 'Nurse reactivated.' : 'Nurse deactivated.', 'success');
    if (result.note) toast(result.note, 'info');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function resetPassword(id) {
  const pw = prompt('New temporary password (min 6 characters):');
  if (!pw) return;
  try {
    await Api.post(`/nurses/${id}/reset-password`, { new_password: pw }, { auth: true });
    toast('Password reset.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('load', () => {
  const user = Session.requireRole(['ADMIN']);
  if (!user) return;
  document.getElementById('welcome').textContent = `Hi, ${user.full_name}`;
  document.getElementById('logout-btn').addEventListener('click', () => Session.logout());

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.post('/nurses', {
        staff_id: document.getElementById('n-staff-id').value.trim(),
        full_name: document.getElementById('n-full-name').value.trim(),
        email: document.getElementById('n-email').value.trim(),
        password: document.getElementById('n-password').value,
      }, { auth: true });
      toast('Nurse account created.', 'success');
      e.target.reset();
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load();
});
