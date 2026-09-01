import { sb } from './supabase.js';
import { DEMO, cargarDatosDemo, actualizarEstadoDemo } from './demo.js';

// Fecha de hoy en hora Perú, en formato YYYY-MM-DD (comparable con `fecha`).
export const hoyPeru = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Carga reservas y resumen por día desde las vistas de Supabase.
// Lanza un error si cualquiera de las dos consultas falla, para que la capa
// superior lo muestre en vez de tragárselo en silencio.
export async function cargarDatos() {
  if (DEMO) return cargarDatosDemo();

  const [reservasRes, porDiaRes] = await Promise.all([
    sb.from('v_reservas').select('*').order('fecha_hora', { ascending: true }),
    sb.from('v_reservas_por_dia').select('*').order('fecha', { ascending: true }),
  ]);

  if (reservasRes.error) throw reservasRes.error;
  if (porDiaRes.error) throw porDiaRes.error;

  return { reservas: reservasRes.data || [], porDia: porDiaRes.data || [] };
}

// Cambia el estado de una reserva. RLS solo permite UPDATE sobre `status`.
export async function actualizarEstado(id, estado) {
  if (DEMO) return actualizarEstadoDemo(id, estado);

  const { error } = await sb.from('reservations').update({ status: estado }).eq('id', id);
  if (error) throw error;
}
