# Tayanti · Panel de Reservas

Panel web interno con el que el staff de **Tayanti Restaurante** ve y gestiona las
reservas que un bot de WhatsApp toma automáticamente las 24 horas.

Es la **cara visible** de un sistema de tres piezas:

```
WhatsApp Cloud API  ──►  n8n (agente IA + automatizaciones)  ──►  Supabase (Postgres)
                                                                         │
                                                                         ▼
                                                              Este panel (staff)
```

---

## Demo en vivo

**▶ [automatizacion-tayanti.vercel.app/?demo=1](https://automatizacion-tayanti.vercel.app/?demo=1)**

| | |
|---|---|
| **Usuario** | `demo@tayanti.pe` |
| **Contraseña** | `TayantiDemo2026` |

Con `?demo=1` las credenciales vienen ya escritas y basta pulsar **Ingresar**.
También funcionan escribiéndolas a mano en
[la URL normal](https://automatizacion-tayanti.vercel.app): entrar con ellas
enciende el modo demo, se pongan donde se pongan.

El demo **no se conecta a la base de datos real**: genera unas 370 reservas
ficticias en tu propio navegador, con ~75 días de historial y una semana por
delante. Todo funciona igual que en producción —KPIs, gráficos, filtros, cambios
de estado, el Registro mensual y la exportación a CSV— y cada 35 segundos entra
una reserva simulada para que veas el comportamiento en tiempo real.

Las credenciales de arriba son públicas a propósito: **no abren nada**. El modo
demo las valida en el navegador contra dos strings de `js/demo.js`; no existe
ninguna cuenta con ese correo. Los nombres y teléfonos que verás son inventados,
así que los datos reales de los clientes del restaurante nunca salen de Supabase.

---

## 1. El problema que resuelve

El restaurante tomaba reservas por WhatsApp de forma manual. Eso significaba:

| Problema | Consecuencia real |
|---|---|
| Alguien tenía que estar leyendo el celular | Fuera del horario de atención se perdían reservas |
| Las reservas se anotaban en cuaderno o en el chat | No había una fuente única de verdad ni historial |
| Confirmaciones y recordatorios manuales | Se olvidaban, y eso son mesas vacías por *no-show* |
| Sin visibilidad de la ocupación | Nadie sabía cuántos comensales venían mañana |
| Consultas repetidas (carta, horarios, ubicación) | Tiempo del staff gastado en responder siempre lo mismo |

**La solución:** un agente de IA sobre WhatsApp que atiende, responde dudas y
**crea, consulta, modifica y cancela reservas** directamente en la base de datos;
más este panel para que el staff supervise todo en tiempo real y pueda intervenir
cuando haga falta.

---

## 2. Cómo se automatizó con n8n

Los workflows viven en `n8n/workflows/` del repositorio de automatización.
El corazón es `03-bot-reservas.json` (**41 nodos**); el resto son automatizaciones
programadas que corren solas.

### Workflows

| Workflow | Disparador | Qué hace |
|---|---|---|
| `03-bot-reservas` | Webhook de WhatsApp | Agente IA (GPT-4o-mini) que conversa y opera las reservas |
| `04-recordatorios` | Cada hora | Envía el recordatorio por WhatsApp antes de la reserva |
| `05-aviso-staff` | Cada minuto | Notifica por Telegram cada reserva nueva |
| `06-aviso-cliente` | Cada minuto | Avisa al cliente cuando el staff cambia el estado de su reserva |
| `08-reactivar-bot` | Cada 5 minutos | Devuelve el control al bot tras 60 min sin actividad humana |
| `09-aviso-handoff` | Cada minuto | Alerta al staff por Telegram cuando alguien pide hablar con una persona |
| `10-cerrar-reservas` | Cada hora | Cierra automáticamente las reservas ya vencidas |

### Las herramientas del agente

El agente no "inventa" reservas: solo puede llamar a funciones RPC de Postgres,
que son las que validan aforo, horario y duplicados.

`crear_reserva` · `consultar_reserva` · `modificar_reserva` · `cancelar_reserva` · `pedir_humano`

Toda la lógica de negocio vive en SQL (`supabase/fn_*.sql`), no en el prompt.
Así el modelo puede equivocarse al redactar, pero **no puede romper los datos**.

### Optimizaciones aplicadas al bot

Estas son las mejoras que convirtieron un bot que funcionaba "a veces" en uno
estable y barato de operar:

#### a) Buffer de mensajes con *debounce* de 15 s

La gente escribe en ráfaga: *"hola"* → *"quisiera"* → *"reservar para 4"*.
Un bot ingenuo responde **tres veces** y con el contexto partido.

Cada mensaje se registra con `registrar_mensaje()` y recibe un `id` creciente.
El flujo espera 15 s y llama a `consumir_buffer(telefono, id)`: solo la ejecución
**más reciente** sigue adelante, ya con los tres mensajes concatenados en un solo texto.

> 3 mensajes → **1 llamada a OpenAI** → 1 respuesta coherente.
> Menos costo, menos ruido, mejor conversación.

#### b) Rate limit anti-spam (30 msg/min)

`registrar_mensaje()` devuelve `bloqueado: true` si un número supera 30 mensajes
por minuto. El flujo se corta **antes** de llegar al modelo: un usuario abusivo o
un bucle accidental no pueden disparar la factura de OpenAI.

#### c) Handoff: el bot sabe callarse

Cuando el staff responde manualmente en el chat, o el cliente pide hablar con una
persona (`pedir_humano`), se activa el flag `handoff` del cliente.
En cada mensaje entrante el flujo pregunta *¿Handoff activo?*: si lo está, el mensaje
**se registra pero el bot no responde**, así la IA nunca habla encima del humano.
`08-reactivar-bot` devuelve el control al bot tras 60 minutos de inactividad,
para que ningún chat quede huérfano.

#### d) Memoria por conversación

Memoria de ventana de 10 turnos con `sessionKey` = teléfono del cliente.
Cada persona tiene su propio hilo: el bot recuerda el contexto sin mezclar chats
ni arrastrar historiales infinitos, que encarecen cada llamada.

#### e) Verificación de firma de Meta

El webhook valida la firma HMAC de cada petición de WhatsApp antes de procesarla.
Sin eso, cualquiera con la URL podría inyectar mensajes falsos.

#### f) Avisos con patrón *outbox* en la base de datos

Los workflows `05`, `06` y `09` no vigilan tablas de negocio: consumen funciones
`procesar_avisos_*()` que entregan los pendientes y los marcan como enviados.
Es una cola: no se duplican avisos ni se pierden si n8n se reinicia.

#### g) Respuesta de respaldo

Si el agente falla o devuelve vacío, un nodo de respaldo garantiza que el cliente
**siempre** reciba una respuesta. Nadie se queda hablando solo.

---

## 3. Qué aporta este panel

El bot resuelve la entrada de datos; el panel resuelve el **control**.

- **KPIs del día** — reservas y comensales de hoy, contando solo estados activos.
- **Gráficos** — reservas por día (últimos 14) y distribución por estado.
- **Tabla operativa** — próximas reservas con acciones Confirmar / Completar / Cancelar.
  Cada cambio dispara el aviso automático al cliente vía `06-aviso-cliente`.
- **Vista Registro** — historial mensual, búsqueda por cliente, filtro por estado
  y exportación a CSV para contabilidad.
- **Tiempo real** — refresco cada 20 s más suscripción *Realtime* de Supabase:
  una reserva creada por el bot aparece en pantalla sin recargar.

---

## 4. El sistema en uso

Recorrido completo de una reserva, desde el mensaje del cliente hasta el cierre
automático. Los datos de este ejemplo son ficticios.

### Paso 1 · El cliente escribe en ráfaga

Un sábado a las 19:42, un número desconocido escribe tres mensajes seguidos:

```
19:42:03  Cliente →  buenas
19:42:07  Cliente →  quisiera reservar
19:42:15  Cliente →  para 4 personas mañana 8pm
```

Un bot ingenuo respondería **tres veces**, cada una con contexto incompleto.

### Paso 2 · El buffer los junta en uno solo

Cada mensaje llama a `registrar_mensaje()` y recibe un `id` creciente.
Las tres ejecuciones esperan 15 s y consultan `consumir_buffer()`:

```
id=1041  →  consumir_buffer() → { listo: false }   ← llegó uno más nuevo, se detiene
id=1042  →  consumir_buffer() → { listo: false }   ← llegó uno más nuevo, se detiene
id=1043  →  consumir_buffer() → { listo: true,
                                   texto: "buenas quisiera reservar
                                           para 4 personas mañana 8pm" }
```

Solo la tercera continúa. **3 mensajes → 1 llamada a OpenAI → 1 respuesta.**

### Paso 3 · El agente crea la reserva

El agente reúne los datos que le faltan y llama a la herramienta `crear_reserva`,
que valida aforo y horario en Postgres:

```
19:42:30  Bot →  ¡Hola! Con gusto. ¿A nombre de quién la registro?
19:42:48  Cliente →  Ana Quispe
19:42:52  Bot →  Listo, Ana. Mesa para 4 el domingo 2 de marzo a las 8:00 p.m.
                 Te esperamos en Tayanti. Cualquier cambio, escríbeme por aquí.
```

`crear_reserva` devuelve la reserva en estado `pendiente`.

### Paso 4 · El staff se entera al instante

`05-aviso-staff` corre cada minuto y empuja el aviso a Telegram:

```
🔔 Nueva reserva
Ana Quispe · +51 987 654 321
Domingo 02/03 · 20:00 · 4 personas
Estado: pendiente
```

### Paso 5 · Aparece en el panel, sin recargar

La suscripción *Realtime* de Supabase pinta la fila en cuanto se inserta:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Reservas hoy        Comensales hoy      Pendientes      Esta semana     │
│       12                   38                 3               27         │
└─────────────────────────────────────────────────────────────────────────┘

  Cliente          Fecha         Hora    Pers.  Estado       Acciones
  ─────────────────────────────────────────────────────────────────────────
  Ana Quispe       Dom 02/03     20:00     4    ● Pendiente   [✓] [✔] [✕]
  Luis Ramos       Dom 02/03     20:30     2    ● Confirmada  [✔] [✕]
  Marta Silva      Dom 02/03     21:00     6    ● Confirmada  [✔] [✕]
```

### Paso 6 · El staff confirma y el cliente se entera solo

El encargado pulsa **Confirmar**. El panel hace `UPDATE` solo sobre `status`
(lo único que la RLS le permite tocar), y `06-aviso-cliente` cierra el círculo:

```
20:05  Bot →  Ana, tu reserva del domingo 2 de marzo a las 8:00 p.m.
              quedó CONFIRMADA. ¡Te esperamos!
```

Nadie escribió ese mensaje a mano.

### Paso 7 · Si el cliente pide un humano, el bot se calla

```
21:10  Cliente →  quiero hablar con alguien del restaurante
```

El agente invoca `pedir_humano` → se activa el flag `handoff` del cliente →
`09-aviso-handoff` alerta al staff por Telegram. A partir de ahí **el bot deja de
responder** en ese chat: los mensajes se siguen registrando, pero la IA no habla
encima de la persona. Si el staff no vuelve a escribir en 60 minutos,
`08-reactivar-bot` devuelve el control al agente.

### Paso 8 · Cierre automático

Pasada la hora de la reserva, `10-cerrar-reservas` marca como `completada` lo que
quedó vivo, y `04-recordatorios` ya habrá enviado el recordatorio previo.
El mes entero queda en la vista **Registro**, filtrable y exportable a CSV:

```
Marzo 2026        Reservas 118 · Comensales 371 · Completadas 94
                  Confirmadas 11 · Pendientes 4 · Canceladas 9
```

> Los pasos 5, 6 y 8 —panel, cambios de estado y Registro— se pueden probar
> haciendo clic en el [demo en vivo](#demo-en-vivo). Los pasos 1 a 4 y el 7
> ocurren en n8n y WhatsApp, así que ahí solo hay transcripción.

---

## 5. Stack

- **Frontend:** HTML + CSS + JavaScript modular (ES Modules, **sin build**), Chart.js.
- **Datos:** Supabase (Postgres) — lee las vistas `v_reservas` y `v_reservas_por_dia`.
- **Auth:** Supabase Auth + RLS. Solo el staff autenticado lee y escribe.
- **Automatización:** n8n + WhatsApp Cloud API + OpenAI + Telegram.

### Estructura

```
tayantiPanel/
├── index.html           # Solo markup
├── vercel.json          # Deploy estático + cabeceras de seguridad
├── robots.txt           # noindex: es un panel interno
├── Dockerfile           # Alternativa de despliegue (nginx, para Coolify)
├── css/
│   └── styles.css       # Estilos y tokens de diseño
└── js/
    ├── config.js        # URL/llave pública, constantes, catálogo de estados
    ├── supabase.js      # Cliente único de Supabase
    ├── demo.js          # Modo demo: datos ficticios, sin tocar Supabase
    ├── ui.js            # $(), escapeHtml, toast, modal, animarNumero
    ├── data.js          # Consultas a las vistas y update de estado
    ├── render.js        # KPIs, gráficos y tabla
    ├── registro.js      # Vista de historial mensual y export CSV
    ├── auth.js          # Login / logout / sesión
    ├── actions.js       # Confirmar / completar / cancelar
    ├── realtime.js      # Refresco periódico + Realtime
    └── app.js           # Punto de entrada (orquesta todo)
```

---

## 6. Reglas de negocio

- **Reservas hoy / Comensales hoy** cuentan solo reservas *activas*
  (`pendiente`, `confirmada`, `completada`). Las `cancelada` y `no_show` no ocupan
  mesa, por eso no suman. Ver `js/config.js → ESTADOS_ACTIVOS`.
- Los estados y sus colores se definen en un único catálogo (`ESTADOS`), para que
  tabla, gráficos y leyendas nunca se desincronicen.

---

## 7. Despliegue en Vercel

El panel es 100 % estático: **no hay build, ni instalación de dependencias, ni variables de entorno**.

### Desde la interfaz de Vercel

1. **Add New → Project** e importa el repositorio de GitHub
   (`HebertCG/Automatizacion_Tayanti`, cuya raíz es este panel).
2. Configura:
   - **Framework Preset:** `Other`
   - **Root Directory:** `./` (la raíz del repositorio ya es el panel)
   - **Build Command:** vacío
   - **Output Directory:** `.`
   - **Install Command:** vacío
3. **Deploy.** Cada push a `main` redespliega solo.

`vercel.json` ya deja fijados el `outputDirectory`, las URLs limpias y las cabeceras,
así que en la práctica basta con importar y darle a Deploy.

### Desde la terminal

```bash
npm i -g vercel
vercel        # despliegue de previsualización
vercel --prod # producción
```

### Qué configura `vercel.json`

- **CSP estricta** con las únicas fuentes que el panel usa realmente:
  Supabase (REST + WebSocket), `esm.sh`, `cdnjs` y Google Fonts.
- `HSTS`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`
  y `Permissions-Policy` (cámara, micrófono y ubicación denegados).
- `X-Robots-Tag: noindex` junto con `robots.txt` — es un panel interno, no debe indexarse.
- **Caché:** `must-revalidate` en HTML/CSS/JS (no hay hashing de archivos, así que
  cada despliegue debe verse al instante) y 1 día para `assets/`.

> Si cambias de proyecto de Supabase, actualiza la URL en `js/config.js`
> **y** en la directiva `connect-src` de `vercel.json`, o el panel no podrá conectarse.

### Alternativa: Coolify / Docker

El `Dockerfile` (nginx) sigue siendo válido: Coolify lo detecta y sirve los
mismos archivos estáticos. Vercel y Docker conviven sin estorbarse.

---

## 8. Desarrollo local

Como usa ES Modules, hay que servirlo por HTTP (abrir el archivo con `file://` no funciona):

```bash
npx serve .
# o
python -m http.server 8000
```

Luego:

- `http://localhost:8000` → panel real, requiere una cuenta de staff en Supabase.
- `http://localhost:8000/?demo=1` → modo demo con datos ficticios, sin credenciales
  reales ni conexión a la base.

---

## 9. Seguridad

- En el cliente solo vive la **publishable key** de Supabase, que es pública por
  diseño: el acceso real lo controla **RLS**, que exige sesión de staff.
- El `service_role` y los tokens de WhatsApp / OpenAI / Telegram viven únicamente en
  **n8n**, nunca en el navegador.
- RLS limita el `UPDATE` del panel al campo `status`: el staff cambia estados,
  no reescribe reservas.
- El nombre del cliente se escapa (`escapeHtml`) antes de pintarse — anti-XSS.
- El webhook de WhatsApp valida la firma HMAC de Meta antes de procesar nada.
- Las credenciales del demo publicadas en este README **no son una cuenta real**:
  `js/demo.js` las compara en el navegador y sirve datos inventados. No dan acceso
  a Supabase, y por eso el demo puede ser público sin exponer a ningún comensal.
