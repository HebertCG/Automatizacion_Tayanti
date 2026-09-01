import { sb } from './supabase.js';
import { REFRESH_MS } from './config.js';
import { esDemo, simularReservaEntrante } from './demo.js';
import { toast } from './ui.js';

// Cada cuánto entra una reserva simulada en el modo demo (ms).
const DEMO_ENTRADA_MS = 35000;

let intervalo = null;
let canalRT = null;
let demoTimer = null;

// Arranca el refresco periódico + la suscripción Realtime a `reservations`.
// `onCambio` se ejecuta en cada tick y en cada cambio de la tabla.
export function iniciarTiempoReal(onCambio) {
  if (!intervalo) intervalo = setInterval(onCambio, REFRESH_MS);

  // En demo no hay Supabase: se simulan las reservas que iría tomando el bot,
  // para que se vea llegar una sola, igual que en producción.
  if (esDemo()) {
    if (!demoTimer) {
      demoTimer = setInterval(() => {
        const nueva = simularReservaEntrante();
        if (!nueva) { clearInterval(demoTimer); demoTimer = null; return; }
        toast(`Nueva reserva por WhatsApp: ${nueva.cliente} · ${nueva.personas} personas`, 'ok');
        onCambio();
      }, DEMO_ENTRADA_MS);
    }
    return;
  }

  if (!canalRT) {
    canalRT = sb.channel('reservas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => onCambio())
      .subscribe();
  }
}

export function detenerTiempoReal() {
  if (intervalo) { clearInterval(intervalo); intervalo = null; }
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  if (canalRT) { sb.removeChannel(canalRT); canalRT = null; }
}
