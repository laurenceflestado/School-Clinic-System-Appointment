// Thin fetch wrapper used by every page script. Every call is async/await,
// as documented in the README's event-driven features table.
const Api = (() => {
  const BASE = window.CLINIC_CONFIG.API_BASE;

  async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = Session.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('Cannot reach the clinic server. Is npm start running?');
    }

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // no JSON body (e.g. 204)
    }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status}).`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    get: (path, opts) => request(path, { ...opts, method: 'GET' }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
    put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  };
})();
