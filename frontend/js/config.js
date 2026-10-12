// Central place to point the frontend at the API. Change API_PORT here if you
// changed PORT in backend/.env — see README section 11 (Troubleshooting).
window.CLINIC_CONFIG = {
  API_BASE: `${window.location.protocol}//${window.location.hostname}:3000/api`,
};
