window.addEventListener('load', () => {
  const user = Session.getUser();
  if (user) {
    if (user.role === 'ADMIN') window.location.href = '../admin/dashboard.html';
    else if (user.role === 'NURSE') window.location.href = '../nurse/dashboard.html';
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;
      const result = await Api.post('/auth/login', { identifier, password });
      Session.save(result.token, result.user);
      window.location.href = result.user.role === 'ADMIN' ? '../admin/dashboard.html' : '../nurse/dashboard.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});
