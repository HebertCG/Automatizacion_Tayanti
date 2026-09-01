import { sb } from './supabase.js';
import { $ } from './ui.js';
import { DEMO, CREDENCIALES_DEMO } from './demo.js';

// Valida el login del modo demo contra las credenciales publicadas, sin red.
function loginDemo(email, password) {
  return email.toLowerCase() === CREDENCIALES_DEMO.email
    && password === CREDENCIALES_DEMO.password;
}

// Pista visible en la pantalla de login del demo, con las credenciales ya
// escritas en los campos para que entrar sea un solo clic.
function pintarPistaDemo() {
  $('email').value = CREDENCIALES_DEMO.email;
  $('password').value = CREDENCIALES_DEMO.password;

  const pista = document.createElement('div');
  pista.className = 'demo-hint';
  pista.innerHTML = '<strong>Modo demo</strong>'
    + `<span>${CREDENCIALES_DEMO.email}</span>`
    + `<span>${CREDENCIALES_DEMO.password}</span>`
    + '<em>Datos ficticios generados en tu navegador.</em>';
  $('loginForm').insertBefore(pista, $('loginBtn'));
}

// Conecta el formulario de login y el botón de cerrar sesión.
// `onAuthChange(estaLogueado)` se llama cada vez que cambia la sesión.
export function setupAuth(onAuthChange) {
  if (DEMO) pintarPistaDemo();

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = 'Ingresando…';

    const email = $('email').value.trim();
    const password = $('password').value;
    const ok = DEMO
      ? loginDemo(email, password)
      : !(await sb.auth.signInWithPassword({ email, password })).error;

    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Ingresar';
    if (!ok) {
      $('loginError').textContent = 'Correo o contraseña incorrectos.';
      return;
    }
    onAuthChange(true);
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (!DEMO) await sb.auth.signOut();
    onAuthChange(false);
  });
}

// Indica si hay una sesión activa al cargar la página.
// En demo siempre arranca en el login, para que se vea el flujo completo.
export async function haySesion() {
  if (DEMO) return false;
  const { data } = await sb.auth.getSession();
  return Boolean(data.session);
}
