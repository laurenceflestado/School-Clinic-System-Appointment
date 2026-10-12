window.addEventListener('load', () => {
  document.getElementById('patient-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const result = await Api.post('/auth/patient/login', { email, password });
      Session.save(result.token, result.user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});
