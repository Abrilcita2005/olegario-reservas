// Olegario Reservas — plano en vivo del coworking. Las reservas se guardan en el servidor de Olegario
// (PHP + MySQL), el mismo de la app: lo que se reserva acá aparece en la app y descuenta horas del plan.
import { API_URL } from './config.js';

// ------------------------------------------------------------ datos del espacio (sacados del modelo 3D)
const OPEN = 8, CLOSE = 20, NDAYS = 3;          // horario de reservas y días hacia adelante
const B = { x0: -0.65, y0: -0.47, x1: 30.65, y1: 14.27 };   // limites del plano en metros
const W = B.x1 - B.x0, H = B.y1 - B.y0;
const QR = [14.4, 1.25];
const SEAT_XY = [[6.15,0.72],[6.95,0.72],[7.75,0.72],[8.55,0.72],[9.35,0.72],[6.15,2.48],[6.95,2.48],[7.75,2.48],[8.55,2.48],[9.35,2.48],[7.1,4.42],[8.45,4.42],[9.8,4.42]];
const SEATS = SEAT_XY.map(([x, y], i) => ({
  id: 'puesto-' + (i + 1), kind: 'seat', name: 'Puesto ' + (i + 1), short: String(i + 1), x, y,
  sub: (y < 3 ? 'Mesa comunal' : 'Mesa chica') + ' · Cowork',
  desc: y < 3 ? 'Lugar en la mesa comunal de roble, con enchufes y luz lineal colgante.' : 'Mesa para dos con luz colgante, cerca del lounge.',
  feats: ['1 persona', 'Wi-Fi', 'Enchufe'], tags: ['concentrarme'], img: 'img/iso_cowork.webp'
}));
const ROOMS = [
  { id: 'eventos', name: 'Sala de Eventos', short: 'EVENTOS', x: 2.35, y: 4.75, sub: 'Hasta 18 personas',
    desc: 'Doble altura, pantalla y proyector para charlas, lanzamientos y talleres.',
    feats: ['Proyector y pantalla', 'Atril', 'Sonido', '18 sillas'], tags: ['eventos', 'reunirme'] },
  { id: 'cubiculo-1', name: 'Cubículo 1', short: 'CUB. 1', x: 0.99, y: 7.3, sub: 'Cabina individual insonorizada',
    desc: 'Para llamadas y videollamadas sin ruido. Paneles acústicos, monitor y luz propia.',
    feats: ['1 persona', 'Insonorizado', 'Monitor'], tags: ['concentrarme', 'llamadas'] },
  { id: 'cubiculo-2', name: 'Cubículo 2', short: 'CUB. 2', x: 2.72, y: 7.3, sub: 'Cabina individual insonorizada',
    desc: 'Para llamadas y videollamadas sin ruido. Paneles acústicos, monitor y luz propia.',
    feats: ['1 persona', 'Insonorizado', 'Monitor'], tags: ['concentrarme', 'llamadas'] },
  { id: 'streaming-1', name: 'Streaming 1 · Estudio', short: 'STREAM 1', x: 1.75, y: 10.0, sub: '1 a 2 personas',
    desc: 'Escritorio, fondo y aro de luz listos para grabar contenido.',
    feats: ['Aro de luz', 'Fondo neutro', 'Paneles acústicos'], tags: ['grabar'] },
  { id: 'streaming-2', name: 'Streaming 2 · Gaming', short: 'STREAM 2', x: 4.9, y: 10.0, sub: '1 a 2 personas',
    desc: 'Pared oscura con luces LED y doble monitor para transmitir en vivo.',
    feats: ['Doble monitor', 'Luces LED', 'Cámara en trípode'], tags: ['grabar'] },
  { id: 'streaming-3', name: 'Streaming 3 · Living', short: 'STREAM 3', x: 9.25, y: 10.0, sub: '2 a 3 personas',
    desc: 'Set tipo living para entrevistas y podcasts en video.',
    feats: ['2 sillones', '2 micrófonos', 'Luz cálida'], tags: ['grabar', 'reunirme'] },
  { id: 'reunion', name: 'Sala de Reunión', short: 'REUNIÓN', x: 23.45, y: 1.75, sub: 'Hasta 6 personas',
    desc: 'Mesa para seis y pantalla para presentar.',
    feats: ['Mesa de roble', 'Pantalla', 'Videollamada'], tags: ['reunirme', 'llamadas'] },
  { id: 'fotografia', name: 'Sala de Fotografía', short: 'FOTOGRAFÍA', x: 27.6, y: 2.8, sub: 'Estudio con ciclorama',
    desc: 'Ciclorama blanco y equipo de iluminación para fotos y video.',
    feats: ['Ciclorama blanco', '2 softbox', 'Cámara en trípode'], tags: ['grabar'] },
].map(r => ({ ...r, kind: 'room', img: 'img/iso_' + r.id + '.webp' }));
const ALL = [...SEATS, ...ROOMS];
const BY_ID = Object.fromEntries(ALL.map(r => [r.id, r]));
const AREAS = [['COWORK', 7.75, 8.3], ['RECEPCIÓN', 16.65, 9.7], ['PATIO', 16.3, 11.45], ['CAFÉ', 24.6, 9.2], ['↑ TERRAZA', 22.6, 4.15]];
const FILTERS = [['todo', 'Todo'], ['concentrarme', 'Concentrarme'], ['llamadas', 'Llamadas'], ['grabar', 'Grabar contenido'], ['reunirme', 'Reunirme'], ['eventos', 'Hacer un evento']];

// ------------------------------------------------------------ fechas
const pad = n => String(n).padStart(2, '0');
const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date();
const DAYS = Array.from({ length: NDAYS }, (_, i) => { const d = new Date(now); d.setDate(now.getDate() + i); return d; });
const DATES = DAYS.map(keyOf);
const wd = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const longFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const dayShort = i => i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : cap(wd.format(DAYS[i]).replace('.', ''));
const dayLong = key => { const i = DATES.indexOf(key); return (i === 0 ? 'Hoy, ' : i === 1 ? 'Mañana, ' : '') + longFmt.format(DAYS[Math.max(0, i)]); };
const nowHour = () => new Date().getHours();
const isPast = (dateKey, h) => dateKey === DATES[0] && h < nowHour();
const hh = h => pad(h) + ':00';

// ------------------------------------------------------------ estado
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } },
};
// uid: 'yo' con sesión (las horas propias se marcan con 'yo'); guest: invitado (mira pero no reserva).
const S = { filter: 'todo', day: 0, hour: OPEN, zoom: 1, loaded: false, docs: new Map(), uid: null, sheet: null, guest: false, nombre: '' };
{ const h = nowHour(); if (h >= CLOSE) { S.day = 1; S.hour = OPEN; } else S.hour = Math.max(OPEN, h); }
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const slotsOf = (res, date) => (S.docs.get(date + '_' + res) || {}).slots || {};
function statusAt(res, date, h) {
  const s = slotsOf(res, date)[h];
  if (!s) return 'free';
  return s.u === S.uid ? 'mine' : 'busy';
}
function myBookings() {
  const groups = new Map();
  for (const d of S.docs.values()) {
    for (const [h, s] of Object.entries(d.slots)) {
      if (s.u !== S.uid) continue;
      const g = groups.get(s.b) || { b: s.b, res: d.res, date: d.date, hours: [] };
      g.hours.push(+h); groups.set(s.b, g);
    }
  }
  const today = DATES[0], nh = nowHour();
  return [...groups.values()].map(g => { g.hours.sort((a, b) => a - b); g.start = g.hours[0]; g.end = g.hours[g.hours.length - 1] + 1; return g; })
    .filter(g => g.date > today || (g.date === today && g.end > nh))
    .sort((a, b) => (a.date + pad(a.start)).localeCompare(b.date + pad(b.start)));
}
// las horas reservadas llegan como documentos sueltos; se agrupan por lugar y día
function setSlots(list) {
  const m = new Map();
  for (const s of list) {
    const k = s.date + '_' + s.res;
    if (!m.has(k)) m.set(k, { date: s.date, res: s.res, slots: {} });
    m.get(k).slots[s.h] = { u: s.u, b: s.b };
  }
  S.docs = m; S.loaded = true; render();
}

// ------------------------------------------------------------ backend: servidor de Olegario o modo prueba
const CON_SERVIDOR = /^https?:\/\//.test(API_URL);
const demoSlots = new Map();         // modo prueba (sin servidor)
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TOKEN = 'olegario_token';      // sesión de la cuenta de Olegario en este navegador

// Pedido a la API. Con error, lanza { code, message } con el código y el mensaje en español del servidor.
async function api(method, path, body) {
  const token = store.get(TOKEN);
  let resp;
  try {
    resp = await fetch(API_URL.replace(/\/+$/, '') + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw { code: 'unavailable' }; }
  const data = await resp.json().catch(() => null);
  if (resp.ok) return data;
  if (resp.status === 401 && path !== '/cuentas/ingreso' && path !== '/cuentas/canjear-codigo') sinSesion();
  throw { code: (data && data.codigo) || 'error', message: data && data.error };
}

// fecha local (AAAA-MM-DD) + hora → instante ISO para el servidor
const isoAt = (dateKey, h) => { const [y, m, d] = dateKey.split('-').map(Number); return new Date(y, m - 1, d, h).toISOString(); };

// Ocupación de otras personas (sin saber quiénes) y mis reservas → horas sueltas por lugar y día.
async function load() {
  if (!S.uid) return;
  const desde = isoAt(DATES[0], 0), hasta = isoAt(keyOf(new Date(DAYS[NDAYS - 1].getTime() + 86400000)), 0);
  const [espacios, mias] = await Promise.all([
    api('GET', `/espacios?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
    api('GET', '/reservas'),
  ]);
  const list = [];
  const marcar = (res, inicio, fin, u, b) => {
    const a = new Date(inicio), z = new Date(fin);
    for (const date of DATES) {
      for (let h = OPEN; h < CLOSE; h++) {
        const [y, m, d] = date.split('-').map(Number);
        const h0 = new Date(y, m - 1, d, h), h1 = new Date(y, m - 1, d, h + 1);
        if (a < h1 && h0 < z) list.push({ date, res, h, u, b });
      }
    }
  };
  for (const e of espacios) for (const o of e.ocupaciones) marcar(e.id, o.inicio, o.fin, 'otro', 'otro');
  for (const r of mias) if (!r.cancelada) marcar(r.espacioId, r.inicio, r.fin, 'yo', r.id);
  setSlots(list);
}

async function book(res, date, start, dur) {
  for (let h = start; h < start + dur; h++) {
    const st = statusAt(res, date, h);
    if (st !== 'free') throw { code: 'taken', hour: h };
  }
  if (!CON_SERVIDOR) {
    const b = newId();
    for (let h = start; h < start + dur; h++) demoSlots.set(`${date}_${res}_${h}`, { date, res, h, u: S.uid, b });
    setSlots([...demoSlots.values()]); return;
  }
  // El servidor vuelve a controlar todo: lugar libre, horas del plan, anticipación.
  try { await api('POST', '/reservas', { espacioId: res, inicio: isoAt(date, start), fin: isoAt(date, start + dur) }); }
  finally { await load().catch(() => {}); }
}
async function cancel(g) {
  if (!CON_SERVIDOR) {
    for (const h of g.hours) demoSlots.delete(`${g.date}_${g.res}_${h}`);
    setSlots([...demoSlots.values()]); return;
  }
  try { await api('POST', `/reservas/${encodeURIComponent(g.b)}/cancelar`); }
  finally { await load().catch(() => {}); }
}
function errText(e) {
  const code = e && e.code;
  if (code === 'taken') return 'Las ' + hh(e.hour) + ' ya están ocupadas. Elegí otro horario.';
  if (code === 'unavailable') return 'Sin conexión. Revisá internet y probá de nuevo.';
  // Los demás mensajes los manda el servidor en español (horas del plan, lugar ocupado, cancelación…).
  return (e && e.message) || 'No se pudo guardar. Probá de nuevo.';
}

// ------------------------------------------------------------ controles superiores
function chips() {
  $('filters').innerHTML = FILTERS.map(([id, l]) => `<button class="chip" type="button" data-f="${id}" aria-pressed="${S.filter === id}">${l}</button>`).join('');
  // dia y hora: menus desplegables (en el celular abren el selector nativo)
  const lastDay = nowHour() >= CLOSE ? 1 : 0;      // si hoy ya cerró, se empieza desde mañana
  $('daySel').innerHTML = DAYS.map((d, i) => i < lastDay ? '' : `<option value="${i}" ${S.day === i ? 'selected' : ''}>${dayShort(i)} ${d.getDate()}</option>`).join('');
  const hs = [];
  for (let h = OPEN; h < CLOSE; h++) {
    if (isPast(DATES[S.day], h)) continue;
    const isNow = S.day === 0 && h === nowHour();
    hs.push(`<option value="${h}" ${S.hour === h ? 'selected' : ''}>${hh(h)}${isNow ? ' · ahora' : ''}</option>`);
  }
  $('hourSel').innerHTML = hs.join('');
}
$('filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; S.filter = b.dataset.f; chips(); render(); });
$('daySel').addEventListener('change', e => {
  S.day = +e.target.value;
  if (isPast(DATES[S.day], S.hour)) S.hour = Math.min(CLOSE - 1, Math.max(OPEN, nowHour()));
  chips(); render();
});
$('hourSel').addEventListener('change', e => { S.hour = +e.target.value; render(); });

// ------------------------------------------------------------ plano
const map = $('map');
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('viewBox', `${B.x0} ${-B.y1} ${W} ${H}`);
svg.innerHTML = `<image href="img/plano.webp" x="${B.x0}" y="${-B.y1}" width="${W}" height="${H}" preserveAspectRatio="none"/>
  <g id="areas">${AREAS.map(([t, x, y]) => `<text class="area" x="${x}" y="${-y}" font-size="0.34" text-anchor="middle">${t}</text>`).join('')}</g>
  <g id="you"><circle class="pulse" cx="${QR[0]}" cy="${-QR[1]}" r="0.5" fill="#FF0055" opacity=".5"/><circle cx="${QR[0]}" cy="${-QR[1]}" r="0.24" fill="#FF0055" stroke="#fff" stroke-width="0.07"/>
    <text class="lbl" x="${QR[0]}" y="${-QR[1] + 0.78}" font-size="0.36" stroke-width="0.12" text-anchor="middle">ESTÁS ACÁ</text></g>
  <g id="dyn"></g>`;
map.appendChild(svg);
const COLOR = { free: '#C6FF40', busy: '#BDB7B8', mine: '#5A52F5' };
const scale = () => map.clientHeight / H * S.zoom;
function sizeMap(keepCenter) {
  const ok = keepCenter && svg.clientWidth > 0;
  const cx = ok ? (map.scrollLeft + map.clientWidth / 2) / svg.clientWidth : 0;
  const cy = ok ? (map.scrollTop + map.clientHeight / 2) / svg.clientHeight : 0;
  const s = scale();
  svg.setAttribute('width', Math.round(W * s)); svg.setAttribute('height', Math.round(H * s));
  if (ok) { map.scrollLeft = cx * W * s - map.clientWidth / 2; map.scrollTop = cy * H * s - map.clientHeight / 2; }
  $('zin').disabled = S.zoom >= 2.4; $('zout').disabled = S.zoom <= 1;
}
function centerOn(x, y) {
  const s = scale();
  map.scrollTo({ left: (x - B.x0) * s - map.clientWidth / 2, top: (B.y1 - y) * s - map.clientHeight / 2, behavior: 'smooth' });
}
$('zin').onclick = () => { S.zoom = Math.min(2.4, S.zoom * 1.5); sizeMap(true); };
$('zout').onclick = () => { S.zoom = Math.max(1, S.zoom / 1.5); sizeMap(true); };
new ResizeObserver(() => sizeMap(true)).observe(map);

function drawMarks() {
  const date = DATES[S.day], h = S.hour, sel = S.sheet && S.sheet.res;
  const match = r => S.filter === 'todo' || r.tags.includes(S.filter);
  const out = [];
  for (const r of ALL) {
    const st = S.loaded ? statusAt(r.id, date, h) : 'free';
    const fill = S.loaded ? COLOR[st] : '#FFFFFF';
    const dim = match(r) ? '' : ' dim';
    const label = `${r.name}: ${st === 'free' ? 'libre' : st === 'mine' ? 'reservado por vos' : 'ocupado'} a las ${hh(h)}`;
    const ring = sel === r.id ? `<circle cx="${r.x}" cy="${-r.y}" r="${r.kind === 'seat' ? 0.44 : 0.66}" fill="none" stroke="#FF0055" stroke-width="0.09"/>` : '';
    if (r.kind === 'seat') {
      out.push(`<g class="seat${dim}" data-id="${r.id}" role="button" tabindex="0" aria-label="${esc(label)}">
        <circle cx="${r.x}" cy="${-r.y}" r="0.46" fill="transparent"/>${ring}
        <circle class="dot" cx="${r.x}" cy="${-r.y}" r="0.27" fill="${fill}" stroke="#272223" stroke-width="0.05"/>
        <text x="${r.x}" y="${-r.y + 0.1}" font-size="0.26" font-weight="700" text-anchor="middle" fill="${st === 'mine' ? '#fff' : '#272223'}" font-family="system-ui,sans-serif">${r.short}</text></g>`);
    } else {
      const halo = st === 'free' && S.loaded && !dim ? `<circle class="pulse" cx="${r.x}" cy="${-r.y}" r="0.42" fill="#C6FF40" opacity=".55"/>` : '';
      out.push(`<g class="pin${dim}" data-id="${r.id}" role="button" tabindex="0" aria-label="${esc(label)}">
        <circle cx="${r.x}" cy="${-r.y}" r="0.75" fill="transparent"/>${halo}${ring}
        <circle class="dot" cx="${r.x}" cy="${-r.y}" r="0.42" fill="${fill}" stroke="#272223" stroke-width="0.07"/>
        <circle cx="${r.x}" cy="${-r.y}" r="0.12" fill="${st === 'mine' ? '#fff' : '#272223'}"/>
        <text class="lbl" x="${r.x}" y="${-r.y + 0.84}" font-size="${r.short.length > 8 ? 0.3 : 0.34}" stroke-width="0.12" text-anchor="middle">${r.short}</text></g>`);
    }
  }
  $('dyn').innerHTML = out.join('');
}
function open(id) { if (BY_ID[id]) openSheet({ type: 'res', res: id, date: DATES[S.day], start: S.hour, dur: 1, confirm: false, err: '' }); }
$('dyn').addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) open(g.dataset.id); });
$('dyn').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const g = e.target.closest('[data-id]'); if (g) { e.preventDefault(); open(g.dataset.id); } });

function summary() {
  const date = DATES[S.day], h = S.hour;
  if (!S.loaded) { $('summary').textContent = 'Buscando lugares libres…'; return; }
  const fs = SEATS.filter(r => statusAt(r.id, date, h) === 'free').length;
  const fr = ROOMS.filter(r => statusAt(r.id, date, h) === 'free').length;
  $('summary').innerHTML = `<strong>${fs} de ${SEATS.length}</strong> puestos y <strong>${fr} de ${ROOMS.length}</strong> salas libres`;
}
function render() {
  drawMarks(); summary();
  const n = S.uid ? myBookings().length : 0;
  $('mineN').hidden = !n; $('mineN').textContent = n;
  if (S.sheet) renderSheet();
}

// ------------------------------------------------------------ ficha de reserva
const sheet = $('sheet'), scrim = $('scrim');
let lastFocus = null;
function openSheet(st) {
  S.sheet = st; lastFocus = document.activeElement;
  sheet.hidden = false; scrim.hidden = false; document.body.classList.add('locked');
  requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
  renderSheet(); drawMarks();
  setTimeout(() => $('sheetClose').focus(), 50);
}
function closeSheet() {
  if (!S.sheet) return;
  S.sheet = null; sheet.classList.remove('open'); scrim.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!S.sheet) { sheet.hidden = true; scrim.hidden = true; } }, 320);
  drawMarks(); if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('sheetClose').onclick = closeSheet; scrim.onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function renderSheet() {
  const st = S.sheet;
  // si se está escribiendo el nombre, no perder el foco cuando llega una actualización en vivo
  if (st.type === 'login') return;   // el formulario de ingreso no se redibuja con las actualizaciones
  const scrollY = $('sheetBody').scrollTop;
  if (st.type === 'mine') renderMine(); else renderRes(st);
  $('sheetBody').scrollTop = scrollY;
}

function renderRes(st) {
  const r = BY_ID[st.res], date = st.date;
  $('sheetTitle').textContent = r.kind === 'seat' ? 'Reservar puesto' : 'Reservar sala';
  const myHere = S.uid && statusAt(r.id, date, st.start) === 'mine'
    ? myBookings().find(g => g.res === r.id && g.date === date && g.hours.includes(st.start)) : null;
  const bars = [];
  let clash = null;
  for (let h = OPEN; h < CLOSE; h++) {
    const s = isPast(date, h) ? 'past' : statusAt(r.id, date, h);
    const inSel = myHere ? myHere.hours.includes(h) : (h >= st.start && h < st.start + st.dur);
    if (inSel && !myHere && s !== 'free' && clash === null) clash = h;
    const cls = [s === 'free' ? '' : s, inSel ? 'sel' : '', inSel && clash !== null && !myHere ? 'clash' : ''].join(' ');
    bars.push(`<button type="button" class="${cls}" data-h="${h}" ${s === 'busy' || s === 'past' ? 'disabled' : ''} aria-label="${hh(h)} ${s === 'busy' ? 'ocupado' : s === 'mine' ? 'tu reserva' : s === 'past' ? 'ya pasó' : 'libre'}"></button>`);
  }
  if (!myHere && st.start + st.dur > CLOSE && clash === null) clash = CLOSE;
  const axis = []; for (let h = OPEN; h < CLOSE; h++) axis.push(`<span>${h % 2 === 0 ? pad(h) : ''}</span>`);
  $('sheetBody').innerHTML = `
    <figure class="iso"><img src="${r.img}" alt="Maqueta 3D de ${esc(r.name)}"></figure>
    <h2>${esc(r.name)}</h2>
    <p class="sub">${esc(r.sub)}</p>
    <p class="desc">${esc(r.desc)}</p>
    <ul class="feats">${r.feats.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <div class="sec">
      <h3>Horario</h3>
      <p class="note">${cap(dayLong(date))}. Tocá una barra libre para empezar a esa hora.</p>
      <div class="bars" id="bars">${bars.join('')}</div>
      <div class="axis" aria-hidden="true">${axis.join('')}</div>
      <div class="keys"><span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--line)"></i>Libre</span><span><i style="background:repeating-linear-gradient(135deg,var(--busy) 0 3px,transparent 3px 6px)"></i>Ocupado</span><span><i style="background:var(--btn)"></i>Tu elección</span><span><i style="background:var(--violet)"></i>Tu reserva</span></div>
    </div>
    ${myHere ? '' : `<div class="sec"><h3>Duración</h3><p class="note">Las reservas son por bloques de una hora, de ${hh(OPEN)} a ${hh(CLOSE)}.</p>
      <div class="seg" id="seg">${[1, 2, 3, 4].map(d => `<button type="button" data-dur="${d}" aria-pressed="${st.dur === d}" ${st.start + d > CLOSE ? 'disabled' : ''}>${d} h</button>`).join('')}</div>
      ${CON_SERVIDOR && S.nombre ? `<p class="note">Se reserva a nombre de ${esc(S.nombre)} y descuenta horas de tu plan.</p>` : ''}</div>`}`;
  $('bars').onclick = e => {
    const b = e.target.closest('[data-h]'); if (!b || b.disabled) return;
    st.start = +b.dataset.h; st.err = ''; st.confirm = false;
    if (st.start + st.dur > CLOSE) st.dur = CLOSE - st.start;
    renderSheet();
  };
  if ($('seg')) $('seg').onclick = e => { const b = e.target.closest('[data-dur]'); if (!b || b.disabled) return; st.dur = +b.dataset.dur; st.err = ''; renderSheet(); };
  renderFoot(st, r, myHere, clash);
}

function renderFoot(st, r, myHere, clash) {
  const date = st.date;
  let left, btn;
  if (myHere) {
    left = `<strong>${hh(myHere.start)} – ${hh(myHere.end)}</strong><span>${st.err ? `<span class="err">${esc(st.err)}</span>` : 'Tu reserva · ' + dayShort(DATES.indexOf(date))}</span>`;
    btn = `<button type="button" class="danger ${st.confirm ? 'confirm' : ''}" id="act">${st.confirm ? 'Sí, cancelar' : 'Cancelar reserva'}</button>`;
  } else {
    let why = '';
    if (!S.uid) why = CON_SERVIDOR ? 'Ingresá con tu cuenta para reservar.' : 'Conectando…';
    else if (S.guest) why = 'Para reservar necesitás una cuenta de miembro.';
    else if (clash === CLOSE) why = 'Cerramos a las ' + hh(CLOSE) + '.';
    else if (clash !== null) why = isPast(date, clash) ? 'Las ' + hh(clash) + ' ya pasaron.' : statusAt(r.id, date, clash) === 'mine' ? 'Ya tenés reservadas las ' + hh(clash) + '.' : 'Ocupado a las ' + hh(clash) + '.';
    const ok = !why && S.loaded;
    left = `<strong>${hh(st.start)} – ${hh(Math.min(CLOSE, st.start + st.dur))}</strong><span>${st.err ? `<span class="err">${esc(st.err)}</span>` : why ? `<span class="err">${esc(why)}</span>` : dayShort(DATES.indexOf(date)) + ' · ' + st.dur + ' h'}</span>`;
    btn = !S.uid && CON_SERVIDOR
      ? `<button type="button" class="primary" id="act">Ingresar</button>`
      : `<button type="button" class="primary" id="act" ${ok && !st.busy ? '' : 'disabled'}>${st.busy ? 'Reservando…' : 'Reservar'}</button>`;
  }
  $('sheetFoot').innerHTML = `<div class="sum">${left}</div>${btn}`;
  $('act').onclick = async () => {
    if (!S.uid && CON_SERVIDOR) { openLogin(); return; }
    if (myHere) {
      if (!st.confirm) { st.confirm = true; renderSheet(); return; }
      try { await cancel(myHere); toast('Cancelaste ' + r.name + ', ' + hh(myHere.start) + '–' + hh(myHere.end)); st.confirm = false; st.err = ''; }
      catch (e) { st.err = errText(e); }
      if (S.sheet === st) renderSheet();
      return;
    }
    st.busy = true; renderSheet();
    try {
      await book(r.id, date, st.start, st.dur);
      toast('Listo: ' + r.name + ', ' + dayShort(DATES.indexOf(date)).toLowerCase() + ' ' + hh(st.start) + '–' + hh(st.start + st.dur));
      st.err = '';
    } catch (e) { console.warn(e); st.err = errText(e); }
    st.busy = false;
    if (S.sheet === st) renderSheet();
  };
}

function renderMine() {
  const st = S.sheet;
  $('sheetTitle').textContent = 'Mis reservas';
  const list = S.uid ? myBookings() : [];
  if (!list.length) {
    $('sheetBody').innerHTML = `<p class="empty"><b>Todavía no reservaste nada</b>Elegí un puesto en el cowork o tocá el punto de una sala en el plano. ${CON_SERVIDOR ? 'Tus reservas también se ven en la app de Olegario.' : 'Modo prueba: las reservas no se guardan.'}</p>`;
  } else {
    $('sheetBody').innerHTML = `<ul class="list">${list.map(g => {
      const r = BY_ID[g.res] || { name: g.res };
      return `<li class="item"><h4>${esc(r.name)}</h4><span></span>
        <p>${dayShort(DATES.indexOf(g.date))} · ${hh(g.start)} – ${hh(g.end)}</p><span></span>
        <div class="acts"><button type="button" class="ghost" data-go="${g.b}">Ver en el plano</button>
        <button type="button" class="danger ${st.confirm === g.b ? 'confirm' : ''}" data-cancel="${g.b}">${st.confirm === g.b ? 'Sí, cancelar' : 'Cancelar'}</button></div></li>`;
    }).join('')}</ul>${st.err ? `<p class="banner">${esc(st.err)}</p>` : ''}`;
  }
  $('sheetFoot').innerHTML = `<div class="sum"><strong>${list.length} ${list.length === 1 ? 'reserva' : 'reservas'}</strong><span>Desde hoy hasta el ${DAYS[DAYS.length - 1].getDate()}</span></div><button type="button" class="primary" id="act">Volver al plano</button>`;
  $('act').onclick = closeSheet;
  $('sheetBody').onclick = async e => {
    const go = e.target.closest('[data-go]'), cn = e.target.closest('[data-cancel]');
    if (go) {
      const g = list.find(x => x.b === go.dataset.go); if (!g) return;
      S.day = DATES.indexOf(g.date); S.hour = g.start; chips(); closeSheet(); render();
      const r = BY_ID[g.res];
      if (r) { centerOn(r.x, r.y); setTimeout(() => { const el = $('dyn').querySelector(`[data-id="${r.id}"] .dot`); if (el) el.classList.add('flash'); }, 400); }
    }
    if (cn) {
      if (st.confirm !== cn.dataset.cancel) { st.confirm = cn.dataset.cancel; renderSheet(); return; }
      const g = list.find(x => x.b === cn.dataset.cancel);
      try { await cancel(g); toast('Reserva cancelada'); st.err = ''; } catch (err) { st.err = errText(err); }
      st.confirm = null; if (S.sheet === st) renderSheet();
    }
  };
}
$('mineBtn').onclick = () => (!S.uid && CON_SERVIDOR ? openLogin() : openSheet({ type: 'mine', confirm: null, err: '' }));

// ------------------------------------------------------------ ingreso con la cuenta de Olegario
// Desde la app se entra directo (código de un solo uso en el enlace). Si se abre el plano suelto, se
// ingresa con el mismo correo y contraseña de la app.
function openLogin(err) {
  openSheet({ type: 'login' });
  $('sheetTitle').textContent = 'Ingresá con tu cuenta';
  $('sheetBody').innerHTML = `
    <p class="desc">Usá el mismo correo y contraseña de la app de Olegario. Tus reservas se guardan en tu cuenta y descuentan horas de tu plan.</p>
    <div class="sec field"><label for="correo">Correo</label><input id="correo" type="email" autocomplete="email" maxlength="254" placeholder="tu@correo.com"></div>
    <div class="sec field"><label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password" maxlength="72"></div>
    ${err ? `<p class="banner">${esc(err)}</p>` : ''}`;
  $('sheetFoot').innerHTML = `<div class="sum"><strong>Olegario</strong><span>Tu cuenta de miembro</span></div><button type="button" class="primary" id="act">Ingresar</button>`;
  $('act').onclick = async () => {
    $('act').disabled = true; $('act').textContent = 'Ingresando…';
    try {
      const r = await api('POST', '/cuentas/ingreso', { correo: $('correo').value.trim(), contrasena: $('clave').value });
      await entrar(r);
      closeSheet();
    } catch (e) { openLogin(errText(e)); }
  };
}

let toastT;
function toast(msg) { const t = $('toast'); t.innerHTML = '<i></i>' + esc(msg); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
function setLive(on, text) { $('live').classList.toggle('on', on); $('live').lastElementChild.textContent = text; }
function banner(text) { $('banner').hidden = !text; $('banner').textContent = text || ''; }

// ------------------------------------------------------------ arranque
chips();
sizeMap(false);
render();
requestAnimationFrame(() => { const s = scale(); map.scrollLeft = (12.3 - B.x0) * s - map.clientWidth / 2; });

// sesión abierta: guarda el token y carga quién es (los invitados miran pero no reservan)
async function entrar(r) {
  store.set(TOKEN, r.token);
  S.uid = 'yo';
  S.guest = r.cuenta.tipoAcceso === 'invitado';
  S.nombre = (r.cuenta.perfil && r.cuenta.perfil.nombre) || '';
  banner(S.guest ? 'Entraste como invitado: podés mirar el plano. Para reservar, creá tu cuenta en la app.' : '');
  await load();
  setLive(true, 'En vivo');
}
function sinSesion() {
  try { localStorage.removeItem(TOKEN); } catch { /* sin almacenamiento */ }
  S.uid = null; S.guest = false; S.nombre = '';
  setLive(false, 'Sin sesión');
  banner('Ingresá con tu cuenta de Olegario para ver tus reservas y reservar.');
}

async function connect() {
  if (!CON_SERVIDOR) {
    S.uid = 'prueba'; setLive(false, 'Modo prueba');
    banner('Modo prueba: todavía no está conectado al servidor de Olegario, así que las reservas no se guardan.');
    setSlots([]); return;
  }
  try {
    // ¿Viene desde la app con un código? Se canjea y se borra de la dirección (sirve una sola vez).
    const url = new URL(location.href);
    const codigo = url.searchParams.get('codigo');
    if (codigo) {
      url.searchParams.delete('codigo');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      await entrar(await api('POST', '/cuentas/canjear-codigo', { codigo }));
    } else if (store.get(TOKEN)) {
      const cuenta = await api('GET', '/cuentas/yo');
      await entrar({ token: store.get(TOKEN), cuenta });
    } else {
      sinSesion(); S.loaded = true; render();
    }
  } catch (e) {
    console.error(e);
    if (e && e.code === 'codigo_invalido') { sinSesion(); banner(e.message); }
    else if (S.uid) { setLive(false, 'Sin conexión'); banner('No se pudo conectar con las reservas. Revisá la conexión y recargá la página.'); }
    S.loaded = true; render();
  }
  // "En vivo": se actualiza cada 20 segundos (y al volver a la pestaña).
  const refrescar = () => { if (S.uid && !document.hidden) load().then(() => setLive(true, 'En vivo')).catch(() => setLive(false, 'Sin conexión')); };
  setInterval(refrescar, 20000);
  document.addEventListener('visibilitychange', refrescar);
}
connect();
