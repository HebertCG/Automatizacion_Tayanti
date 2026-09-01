// Punto de entrada del panel. Conecta auth, datos, render, acciones y tiempo real.
import { $, toast } from './ui.js';
import { cargarDatos } from './data.js';
import { renderKpis, renderEstado, renderDias, renderTabla } from './render.js';
import { renderRegistro } from './registro.js';
import { setupAuth, haySesion } from './auth.js';
import { setupAcciones } from './actions.js';
import { iniciarTiempoReal, detenerTiempoReal } from './realtime.js';
import { DEMO } from './demo.js';

// Distintivo en la barra superior para que nadie confunda el demo con el
// panel real del restaurante.
function marcarDemo() {
  const badge = document.createElement('span');
  badge.className = 'demo-badge';
  badge.textContent = 'Modo demo';
  badge.title = 'Datos ficticios generados en el navegador. No hay conexion con la base real.';
  document.querySelector('.top-right').prepend(badge);
}

// Trae los datos y repinta panel + registro. Si falla, avisa al staff.
async function cargar() {
  try {
    const { reservas, porDia } = await cargarDatos();
    renderKpis(reservas);
    renderEstado(reservas);
    renderDias(porDia);
    renderTabla(reservas);
    renderRegistro(reservas);
    $('updated').textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-PE', {
      timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit',
    });
  } catch (error) {
    toast('No se pudieron cargar las reservas: ' + error.message, 'err');
  }
}

// Navegación entre las vistas "Panel" y "Registro".
function setupNav() {
  $('viewnav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-vista]');
    if (!btn) return;
    const vista = btn.dataset.vista;
    document.querySelectorAll('#viewnav .navbtn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    $('vistaPanel').hidden = vista !== 'panel';
    $('vistaRegistro').hidden = vista !== 'registro';
  });
}

// Alterna entre la pantalla de login y el panel.
function mostrarApp(logueado) {
  $('app').hidden = !logueado;
  $('login').style.display = logueado ? 'none' : 'flex';
  if (logueado) { iniciarTiempoReal(cargar); cargar(); }
  else { detenerTiempoReal(); }
}

if (DEMO) marcarDemo();

setupAuth(mostrarApp);
setupAcciones(cargar);
setupNav();

(async function init() {
  mostrarApp(await haySesion());
})();
