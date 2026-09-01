// Modo demo: reservas ficticias generadas en el navegador.
//
// Se activa con `?demo=1` en la URL. NO toca Supabase ni la base real: sirve
// para enseñar el panel funcionando (a un cliente, en el portafolio) sin
// exponer los nombres ni los teléfonos reales de los comensales.

// Credenciales del demo. Son públicas a propósito: no abren nada, el modo demo
// las valida aquí mismo, en el navegador, contra estos dos strings.
export const CREDENCIALES_DEMO = {
  email: 'demo@tayanti.pe',
  password: 'TayantiDemo2026',
};

// El demo arranca activo si la URL trae `?demo=1`…
const DEMO_EN_URL = new URLSearchParams(location.search).has('demo');
let demoActivo = DEMO_EN_URL;

// …pero también se enciende si alguien entra con las credenciales del demo
// desde la URL normal. Sin esto, quien copia las credenciales del README y
// las usa en la URL de siempre choca contra Supabase y recibe un
// "correo o contraseña incorrectos" que no explica nada.
export const esDemo = () => demoActivo;
export const demoEnLaUrl = () => DEMO_EN_URL;
export const activarDemo = () => { demoActivo = true; };

// ¿Este par de credenciales es el del demo?
export const sonCredencialesDemo = (email, password) =>
  email.trim().toLowerCase() === CREDENCIALES_DEMO.email
  && password === CREDENCIALES_DEMO.password;

// Días de historial hacia atrás y de reservas futuras que genera el demo.
const DIAS_ATRAS = 75;
const DIAS_ADELANTE = 6;

const NOMBRES = [
  'Ana Quispe', 'Luis Ramos', 'Marta Silva', 'Carlos Mendoza', 'Rosa Huamán',
  'Jorge Vargas', 'Elena Castro', 'Miguel Torres', 'Lucía Paredes', 'Diego Salazar',
  'Carmen Rojas', 'Andrés Flores', 'Paola Ríos', 'Víctor Chávez', 'Sofía Herrera',
  'Ricardo Núñez', 'Valeria Campos', 'Fernando Díaz', 'Isabel Peña', 'Marco Aguilar',
  'Natalia Bravo', 'Óscar Medina', 'Julia Vega', 'Raúl Espinoza', 'Daniela Cruz',
  'Alberto Suárez', 'Patricia León', 'Iván Morales', 'Gabriela Ortiz', 'Hugo Ramírez',
];

// Horario del restaurante: almuerzo y cena, en tramos de 30 minutos.
const HORAS = [
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
];

// PRNG con semilla fija (congruencial lineal): el demo se ve idéntico en cada
// carga, así una captura de pantalla sigue siendo válida mañana.
function crearRandom(semilla) {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const elegir = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];
const entre = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1));

// Fecha de hoy en hora Perú (misma convención que data.js).
const hoyPeru = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Suma `n` días a un 'YYYY-MM-DD' (a mediodía UTC para no saltar por DST).
function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = domingo

// Estado plausible según si la reserva ya pasó, es hoy o está por venir.
function estadoSegunFecha(rnd, fecha, hoy) {
  if (fecha < hoy) {
    const r = rnd();
    if (r < 0.78) return 'completada';
    if (r < 0.92) return 'cancelada';
    return 'no_show';
  }
  if (fecha === hoy) {
    const r = rnd();
    if (r < 0.35) return 'completada';
    if (r < 0.80) return 'confirmada';
    return 'pendiente';
  }
  return rnd() < 0.55 ? 'confirmada' : 'pendiente';
}

// Cuántas reservas caen ese día: los viernes y sábados llenan más. Hoy y los
// próximos días van cargados a propósito: el panel abre con el filtro "Hoy" y
// el demo tiene que verse como un servicio real, no como un salón vacío.
function reservasDelDia(rnd, fecha, hoy) {
  if (fecha === hoy) return entre(rnd, 9, 12);
  if (fecha > hoy) return entre(rnd, 5, 9);
  const dow = diaSemana(fecha);
  const finde = dow === 5 || dow === 6;
  return finde ? entre(rnd, 5, 9) : entre(rnd, 2, 5);
}

const telefonoFalso = (rnd) =>
  `+51 9${entre(rnd, 10, 99)} ${entre(rnd, 100, 999)} ${entre(rnd, 100, 999)}`;

// Construye el catálogo completo de reservas ficticias del periodo.
function generarReservas() {
  const rnd = crearRandom(20260302);
  const hoy = hoyPeru();
  const reservas = [];
  let n = 0;

  for (let offset = -DIAS_ATRAS; offset <= DIAS_ADELANTE; offset++) {
    const fecha = sumarDias(hoy, offset);
    const horasDelDia = [...HORAS];

    for (let i = 0; i < reservasDelDia(rnd, fecha, hoy); i++) {
      // Sin repetir hora dentro del mismo día, para que el salón sea creíble.
      const hora = horasDelDia.splice(Math.floor(rnd() * horasDelDia.length), 1)[0];
      if (!hora) break;

      reservas.push({
        id: `demo-${String(++n).padStart(4, '0')}`,
        cliente: elegir(rnd, NOMBRES),
        telefono: telefonoFalso(rnd),
        fecha,
        hora,
        fecha_hora: `${fecha}T${hora}:00`,
        personas: entre(rnd, 2, 8),
        estado: estadoSegunFecha(rnd, fecha, hoy),
      });
    }
  }
  return reservas;
}

// Resumen por día, equivalente a la vista `v_reservas_por_dia` (cuenta todas
// las reservas del día, sin filtrar por estado).
function agruparPorDia(reservas) {
  const acc = new Map();
  reservas.forEach((r) => {
    const prev = acc.get(r.fecha) || { fecha: r.fecha, total_reservas: 0, total_personas: 0 };
    acc.set(r.fecha, {
      fecha: r.fecha,
      total_reservas: prev.total_reservas + 1,
      total_personas: prev.total_personas + r.personas,
    });
  });
  return [...acc.values()].sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
}

// Estado del demo. Se reemplaza entero en cada cambio (nunca se muta en sitio).
let reservas = generarReservas();
let contadorNuevas = 0;

export function cargarDatosDemo() {
  return { reservas, porDia: agruparPorDia(reservas) };
}

// Cambia el estado de una reserva del demo, creando un objeto nuevo.
export function actualizarEstadoDemo(id, estado) {
  reservas = reservas.map((r) => (r.id === id ? { ...r, estado } : r));
}

// Simula una reserva recién tomada por el bot, para que se vea llegar sola.
// Devuelve la reserva creada (o null si ya se alcanzó el tope).
export function simularReservaEntrante(maximo = 4) {
  if (contadorNuevas >= maximo) return null;

  const rnd = crearRandom(Date.now() % 4294967296);
  const hoy = hoyPeru();
  const nueva = {
    id: `demo-new-${++contadorNuevas}`,
    cliente: elegir(rnd, NOMBRES),
    telefono: telefonoFalso(rnd),
    fecha: rnd() < 0.5 ? hoy : sumarDias(hoy, 1),
    hora: elegir(rnd, HORAS),
    personas: entre(rnd, 2, 6),
    estado: 'pendiente',
  };
  nueva.fecha_hora = `${nueva.fecha}T${nueva.hora}:00`;

  reservas = [...reservas, nueva];
  return nueva;
}
