async function checkExistingSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (data.authenticated) {
    window.location.href = 'dashboard.html';
  }
}

const params = new URLSearchParams(window.location.search);
if (params.get('error')) {
  document.getElementById('error').textContent = 'Anmeldung fehlgeschlagen. Bitte nochmal versuchen.';
}

document.getElementById('discord-login').addEventListener('click', () => {
  window.location.href = '/auth/login';
});

checkExistingSession();
