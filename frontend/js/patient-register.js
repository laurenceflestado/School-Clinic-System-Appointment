window.addEventListener('load', () => {
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        student_id: document.getElementById('student_id').value.trim(),
        full_name: document.getElementById('full_name').value.trim(),
        contact_number: document.getElementById('contact_number').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
      };
      const result = await Api.post('/auth/patient/register', payload);
      Session.save(result.token, result.user);
      toast('Account created.', 'success');
      window.location.href = 'dashboard.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});
