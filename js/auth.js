import { sb } from './supabase.js';
import { $ } from './ui.js';
import {
  CREDENCIALES_DEMO, esDemo, demoEnLaUrl, activarDemo, sonCredencialesDemo,
} from './demo.js';

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

// Resuelve el login. Las credenciales del demo entran siempre, vengan de
// `?demo=1` o de la URL normal; el resto va contra Supabase.
async function autenticar(email, password) {
  if (sonCredencialesDemo(email, password)) {
    activarDemo();
    return true;
  }
  // Dentro del demo no hay Supabase contra quien validar.
  if (esDemo()) return false;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  return !error;
}

// Conecta el formulario de login y el botón de cerrar sesión.
// `onAuthChange(estaLogueado)` se llama cada vez que cambia la sesión.
export function setupAuth(onAuthChange) {
  if (demoEnLaUrl()) pintarPistaDemo();

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = 'Ingresando…';

    const ok = await autenticar($('email').value, $('password').value);

    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Ingresar';
    if (!ok) {
      $('loginError').textContent = 'Correo o contraseña incorrectos.';
      return;
    }
    onAuthChange(true);
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (!esDemo()) await sb.auth.signOut();
    onAuthChange(false);
  });
}

// Indica si hay una sesión activa al cargar la página.
// En demo siempre arranca en el login, para que se vea el flujo completo.
export async function haySesion() {
  if (esDemo()) return false;
  const { data } = await sb.auth.getSession();
  return Boolean(data.session);
}
