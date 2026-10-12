// Shared helpers used by every page: token storage, safe DOM building,
// toasts, and the staff idle-logout timer.

const Session = (() => {
  const KEY = 'clinic_session';

  function save(token, user) {
    sessionStorage.setItem(KEY, JSON.stringify({ token, user }));
  }
  function clear() {
    sessionStorage.removeItem(KEY);
  }
  function get() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || 'null');
    } catch (_) {
      return null;
    }
  }
  function getToken() {
    const s = get();
    return s ? s.token : null;
  }
  function getUser() {
    const s = get();
    return s ? s.user : null;
  }
  function requireRole(roles, loginPage = '../shared/login.html') {
    const user = getUser();
    if (!user || !roles.includes(user.role)) {
      window.location.href = loginPage;
      return null;
    }
    return user;
  }
  function logout(redirect = '../shared/login.html') {
    clear();
    window.location.href = redirect;
  }

  return { save, clear, get, getToken, getUser, requireRole, logout };
})();

// createElement/appendChild helper — used instead of innerHTML wherever real
// patient-entered text is rendered, so it can never be interpreted as markup.
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// Toast notifications. Clicking anywhere on a toast dismisses it (event
// bubbling to the container's one listener); the toast's own "View" button
// calls stopPropagation() so it can navigate without also dismissing itself
// — a deliberate, commented exception to bubbling.
function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = el('div', { id: 'toast-container', class: 'toast-container' });
    document.body.appendChild(container);
    container.addEventListener('click', (event) => {
      const item = event.target.closest('.toast');
      if (item) item.remove();
    });
  }
  const item = el('div', { class: `toast toast-${type}` }, [el('span', { text: message })]);
  container.appendChild(item);
  setTimeout(() => item.remove(), 6000);
}

// Capture-phase activity listener so an idle timer still sees activity even
// if some element's own handler calls stopPropagation() on it.
function startIdleLogout(minutes = 15) {
  let timer;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      toast('You were logged out due to inactivity.', 'info');
      Session.logout();
    }, minutes * 60 * 1000);
  };
  ['click', 'keydown', 'mousemove', 'scroll'].forEach((evt) =>
    window.addEventListener(evt, reset, true) // capture phase
  );
  reset();
}

// online/offline banner
window.addEventListener('load', () => {
  const banner = () => {
    let b = document.getElementById('conn-banner');
    if (!navigator.onLine) {
      if (!b) {
        b = el('div', { id: 'conn-banner', class: 'conn-banner', text: 'You are offline. Some actions may not work.' });
        document.body.prepend(b);
      }
    } else if (b) {
      b.remove();
    }
  };
  window.addEventListener('online', banner);
  window.addEventListener('offline', banner);
  banner();
});

// Pause/resume timers while the tab is hidden, so nothing wastes requests
// in a background tab. Pages register their interval callback here.
function pausableInterval(callback, ms) {
  let id = setInterval(callback, ms);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(id);
    } else {
      callback();
      id = setInterval(callback, ms);
    }
  });
  return () => clearInterval(id);
}
