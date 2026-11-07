// Dibuja todas las cartas (caras y dorso) como SVG, las rasteriza en Chromium y las exporta a assets/cards/*.webp.
// Uso: NODE_PATH=$(npm root -g) node tools/build_cards.cjs   (requiere playwright y la fuente Inter instalada)
// Las formas siguen las fotos de referencia de Cartas/ (que no se usan como imagen).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'assets', 'cards');
// Símbolos vectorizados de las fotos (tools/trace_symbols.py); si faltan, se usan los dibujados a mano más abajo.
const SYMFILE = path.join(__dirname, 'symbols.json');
const TR = fs.existsSync(SYMFILE) ? JSON.parse(fs.readFileSync(SYMFILE, 'utf8')) : {};
// Arte completo de Ataque final y Muerte súbita, trazado por capas de color (tools/trace_art.py)
const ARTFILE = path.join(__dirname, 'art.json');
const ART = fs.existsSync(ARTFILE) ? JSON.parse(fs.readFileSync(ARTFILE, 'utf8')) : {};
const artGroup = (v) => ART[v].map((L) => `<path d="${L.d}" fill="${L.fill}" fill-rule="evenodd" stroke="${L.fill}" stroke-width="1.2" stroke-linejoin="round"/>`).join('');
const artLayers = (v) => `<clipPath id="face"><rect x="16" y="16" width="328" height="528" rx="18"/></clipPath><g clip-path="url(#face)"><g transform="translate(180 280)">${ART[v].map((L) => `<path d="${L.d}" fill="${L.fill}" fill-rule="evenodd" stroke="${L.fill}" stroke-width="1.2" stroke-linejoin="round"/>`).join('')}</g></g>`;
const whitePaths = (d) => (d ? `<path d="${d}" transform="translate(-3 5)" fill="${INK}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/><path d="${d}" fill="#fff" fill-rule="evenodd" stroke="${INK}" stroke-width="8" stroke-linejoin="round" paint-order="stroke"/>` : '');
const traced = (t, part) => (t.arrow && part === 'center' ? `<path d="${t.arrow}" fill="${INK}"/>` : '') + whitePaths(t[part]);
const W = 360, H = 560;
const INK = '#0b0b0f';
const COL = { r: ['#ec4256', '#b0182b'], b: ['#3a8fdc', '#1c5391'], y: ['#f8c93a', '#cc920c'], g: ['#3dbb57', '#1f7a33'], k: ['#2d2d36', '#0b0b0f'] };
const MINI = { y: '#f6c12b', b: '#2f7fc9', r: '#e23548', g: '#33a94c' };
const FONT = 'font-family="Inter, Arial, sans-serif" font-weight="900"';

/* ---- primitivas: trazo negro grueso debajo, blanco encima ---- */
const outline = `stroke="${INK}" stroke-width="14" stroke-linejoin="round" paint-order="stroke" fill="#fff"`;
const both = (fn, w) => fn(w + 14, INK) + fn(w, '#fff');
const ring = (r, w) => both((sw, c) => `<circle r="${r}" fill="none" stroke="${c}" stroke-width="${sw}"/>`, w);
const line = (x1, y1, x2, y2, w) => both((sw, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`, w);
const slashed = (r, w = 22) => ring(r, w) + line(-r * .7, r * .7, r * .7, -r * .7, w);
const ARROW = 'M -62 15 L 8 15 L 8 42 L 70 0 L 8 -42 L 8 -15 L -62 -15 Z';
// Reversa original: una flecha doble en diagonal, las dos mitades casi pegadas
const rev = (s = 1) => `<g transform="scale(${s})"><path d="${ARROW}" transform="rotate(-45) translate(0,-17) translate(-8 0)" ${outline}/><path d="${ARROW}" transform="rotate(135) translate(0,-17) translate(-8 0)" ${outline}/></g>`;
// Salta a todos original: flecha circular abierta con punta a la derecha
const circ = (r = 58, w = 20) => both((sw, c) => `<path d="M ${r * .94} ${-r * .34} A ${r} ${r} 0 1 0 ${r * .62} ${r * .78}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`, w)
  + `<path d="M ${r * 1.34} ${-r * .08} L ${r * .62} ${r * .28} L ${r * 1.08} ${r * .62} Z" transform="rotate(8)" ${outline}/>`;
// Flecha doble de la carta Reversa (trazada de la foto); si no hay símbolos trazados, la dibujada a mano
const revArrow = (s) => (TR.rev ? `<g transform="scale(${s})">${whitePaths(TR.rev.center)}</g>` : rev(s));
const cardShape = (x, y, rot, w = 64, h = 92, fill = '#fff') =>
  `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" transform="translate(${x} ${y}) rotate(${rot})" stroke="${INK}" stroke-width="12" paint-order="stroke" fill="${fill}"/>`;
const pile = (x, y, w, fill = '#fff') => [3, 2, 1, 0].map((i) => `<rect x="${x - w / 2}" y="${y + i * 9 - 18}" width="${w}" height="${i === 0 ? 34 : 18}" rx="7" ${fill === '#fff' ? outline : `fill="${fill}" stroke="#fff" stroke-width="5"`}/>`).join('');
const arrowHead = (x, y, rot) => `<path d="M -22 -16 L 18 0 L -22 16 Z" transform="translate(${x} ${y}) rotate(${rot})" ${outline}/>`;
// abanico de 4 cartas con flecha curva hacia un mazo (Tira un color / Descartar todo)
const fanDiscard = (fills = ['#fff', '#fff', '#fff', '#fff'], pileFill = '#fff') => {
  const rots = [-26, -9, 9, 26];
  const cards = fills.map((f, i) => cardShape(-46 + i * 32, -50 - (i === 1 || i === 2 ? 6 : 0), rots[i], 58, 84, f)).join('');
  const arrow = both((sw, c) => `<path d="M 52 -22 Q 66 40 6 56" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`, 7);
  return cards + arrow + arrowHead(6, 56, 160) + pile(-48, 92, 86, pileFill);
};
const wheel = (r) => ['r', 'b', 'g', 'y'].map((c, i) => {
  const a0 = (i * 90 - 90) * Math.PI / 180, a1 = ((i + 1) * 90 - 90) * Math.PI / 180;
  return `<path d="M0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z" fill="${MINI[c]}" stroke="${INK}" stroke-width="6"/>`;
}).join('') + `<circle r="${r}" fill="none" stroke="${INK}" stroke-width="${r * .28}"/><circle r="${r}" fill="none" stroke="#fff" stroke-width="${r * .16}"/>`;
const sparkle = (x, y, s = 1) => `<path d="M 0 -14 Q 2 -2 14 0 Q 2 2 0 14 Q -2 2 -14 0 Q -2 -2 0 -14 Z" transform="translate(${x} ${y}) scale(${s})" fill="rgba(255,255,255,.55)"/>`;
const colored = (x, y, rot, c, w = 58, h = 84) => cardShape(x, y, rot, w, h, MINI[c]);
const backCard = (x, y, rot, w = 58, h = 84) => cardShape(x, y, rot, w, h, '#fff') + `<ellipse rx="${w * .3}" ry="${h * .3}" transform="translate(${x} ${y}) rotate(${rot + 30})" fill="none" stroke="${INK}" stroke-width="5"/>`;
const sad = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-38" y="-30" width="76" height="60" rx="18" fill="${MINI[c]}" stroke="${INK}" stroke-width="9"/><circle cx="-14" cy="-6" r="5" fill="${INK}"/><circle cx="14" cy="-6" r="5" fill="${INK}"/><path d="M -14 16 Q 0 4 14 16" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></g>`;
const txt = (t, size, dy = 0) => `<text x="0" y="${dy}" text-anchor="middle" dominant-baseline="central" font-size="${size}" ${FONT} ${outline}>${t}</text>`;
const under = (w, y) => `<rect x="${-w / 2}" y="${y}" width="${w}" height="16" rx="4" stroke="${INK}" stroke-width="9" paint-order="stroke" fill="#fff"/>`;
const deckMark = `<g transform="translate(44 508)"><rect x="-16" y="-14" width="22" height="30" rx="4" transform="rotate(-10)" fill="none" stroke="#fff" stroke-width="3"/><rect x="-6" y="-12" width="22" height="30" rx="4" transform="rotate(8)" fill="#1a1a21" stroke="#fff" stroke-width="3"/></g>`;
const eye = (s = 1) => `<g transform="scale(${s})"><path d="M -92 0 Q 0 -96 92 0 Q 0 96 -92 0 Z" ${outline}/><circle r="50" fill="#fff" stroke="${INK}" stroke-width="8"/>${['r', 'y', 'g', 'b'].map((c, i) => { const a = i * Math.PI / 2; return `<path d="M0 0 L ${42 * Math.cos(a)} ${42 * Math.sin(a)} A 42 42 0 0 1 ${42 * Math.cos(a + Math.PI / 2)} ${42 * Math.sin(a + Math.PI / 2)} Z" fill="${MINI[c]}"/>`; }).join('')}<circle r="16" fill="#fff" stroke="${INK}" stroke-width="6"/></g>`;
const fingers = () => [-60, -30, 0, 30, 60].map((a) => both((sw, c) => `<line x1="${Math.sin(a * Math.PI / 180) * 20}" y1="80" x2="${Math.sin(a * Math.PI / 180) * 98}" y2="${70 + Math.cos(a * Math.PI / 180) * 70}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`, 9)).join('');
const comet = () => `<defs><linearGradient id="fl" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset="1" stop-color="#ee5a12"/></linearGradient></defs>
  <path d="M 120 -150 C 150 -60 60 130 -90 160 L -150 190 L -110 120 L -170 100 L -90 40 L -140 -10 L -50 -30 L -70 -90 L 0 -70 L 20 -140 L 70 -90 Z" fill="url(#fl)" transform="rotate(20)"/>
  <path d="M -16 -78 H 16 V -16 H 78 V 16 H 16 V 78 H -16 V 16 H -78 V -16 H -16 Z" ${outline}/>`;

/* ---- símbolo central de cada valor (cabe en ~ ±100) ---- */
const SYM = {
  skip: () => ring(70, 24) + line(-45, 45, 45, -45, 22),
  skipall: () => circ(62, 22),
  rev: () => rev(1.15),
  d2: () => cardShape(18, -16, 0, 74, 104) + cardShape(-18, 18, 0, 74, 104),
  d4: () => [[-48, 40], [-16, 12], [16, -16], [48, -44]].map(([x, y]) => cardShape(x, y, 0, 58, 84)).join(''),
  discard: () => fanDiscard(),
  10: () => txt('10', 175),
  rev4: () => [['g', -50, 38], ['b', -22, -2], ['y', 38, -36], ['r', 44, 20]].map(([c, x, y]) => colored(x, y, 0, c, 60, 88)).join('') + revArrow(.9),
  rev8: () => [['g', -50, 52], ['y', -40, -30], ['b', -10, -60], ['r', -36, 18], ['g', 50, -48], ['r', 52, 30]].map(([c, x, y]) => colored(x, y, 0, c, 54, 80)).join('') + revArrow(.9),
  d6: () => [['y', -42, -22], ['b', 4, -62], ['r', 46, -10], ['r', -56, 42], ['b', -8, 44], ['g', 42, 50]].map(([c, x, y]) => colored(x, y, 0, c, 56, 82)).join(''),
  d10: () => [['y', -52, -64], ['b', -52, -22], ['r', -52, 20], ['g', -52, 62], ['y', 52, -80], ['g', 52, -38], ['b', 52, 4], ['r', 52, 46]].map(([c, x, y]) => colored(x, y, 0, c, 46, 68)).join('') + backCard(0, -20, 0, 46, 68) + backCard(0, 24, 0, 46, 68) + colored(0, 84, 0, 'g', 46, 68),
  roulette: () => sad(-36, -46, 'y', 1) + sad(40, -4, 'b', 1) + sad(-44, 8, 'r', 1) + sad(10, 54, 'g', 1.05),
  discardall: () => fanDiscard([MINI.g, MINI.b, MINI.r, MINI.y], '#2a2a32'),
};
const FULL = {
  final: () => `<g transform="scale(.8)">${comet()}</g>`,
  sudden: () => `<g transform="translate(0 -30)"><ellipse rx="130" ry="170" transform="rotate(-20)" fill="#4a2a8a" opacity=".9"/>${eye(1.05)}${fingers()}</g>`,
};
const symbol = (v) => (/^\d$/.test(v) ? txt(v, 210) + (v === '6' || v === '9' ? under(96, 98) : '') : SYM[v]());
const LABEL = { rev4: '+4', rev8: '+8', d6: '+6', d10: '+10', d2: '+2', d4: '+4' };
const EXPANSION = new Set(['10', 'discardall', 'rev8', 'final', 'sudden']);

// Esquinas de las cartas de acción: el mismo icono del centro, reducido (Toma 2/4 usan solo el "+2"/"+4" original)
// Números 0-10: texto propio con el estilo del 5 (blanco, contorno negro y sombra), todos a la misma altura y centrados.
// De la foto solo se usan los extras (subrayado del 6/9, flechas del 7, flecha circular del 0/10) ya alineados con el dígito.
const CAP = 0.727; // altura de las cifras de Inter respecto al tamaño de fuente
const isNum = (v) => TR._num && /^(\d|10)$/.test(v);
function numText(t, h, cx, cy, wide) {
  const size = h / CAP, sw = size * 0.07;
  const one = (extra) => `<text x="${cx}" y="${cy + h / 2}" text-anchor="middle" font-size="${size}" ${FONT} ${wide ? `textLength="${wide}" lengthAdjust="spacingAndGlyphs"` : ''} stroke-linejoin="round" ${extra}>${t}</text>`;
  return one(`transform="translate(${-size * 0.02} ${size * 0.03})" fill="${INK}" stroke="${INK}" stroke-width="${sw * 1.2}"`) + one(`fill="#fff" stroke="${INK}" stroke-width="${sw}" paint-order="stroke"`);
}
const numCenter = (v) => numText(v, TR._num.hc * (v === '10' ? 0.93 : 1), 0, 0, v === '10' ? 215 : 0) + whitePaths(TR[v].cicon);
function numCorner(v, inv) {
  const body = numText(v, TR._num.hk, v === '10' ? 66 : 59, 75, v === '10' ? 80 : 0) + whitePaths(TR[v].icon);
  return inv ? `<g transform="rotate(180 180 280)">${body}</g>` : body;
}
const SMALL = { skip: [58, 82, 0.4], skipall: [58, 82, 0.4], rev: [58, 82, 0.4], discard: [52, 84, 0.36, -12, 23] };  // [x, y, escala, centro del icono]
// Esquinas de comodines: etiqueta ("+4"...) alineada a la izquierda con el borde de las cifras, o icono centrado en el mismo punto
function wildCorner(v, inv) {
  let body;
  if (LABEL[v]) {
    const withArrow = v.startsWith('rev'), size = LABEL[v].length > 2 ? 46 : 56;
    body = `<text x="${withArrow ? 76 : 30}" y="${75 + size * CAP / 2}" font-size="${size}" ${FONT} fill="#fff">${LABEL[v]}</text>${withArrow ? `<g transform="translate(47 75) scale(.27)">${traced(TR.rev || { center: '' }, 'center') || rev(1)}</g>` : ''}`;
  } else {
    const icon = v === 'final' ? `<g transform="translate(0 -2) scale(.15)">${artGroup('final')}</g>`
      : v === 'sudden' ? `<g transform="translate(0 -4) scale(.2)">${artGroup('sudden')}</g>`
      : v === 'roulette' ? sad(0, -12, 'y', .62) + sad(-17, 8, 'r', .55) + sad(17, 8, 'g', .55)
      : `<g transform="scale(.4)">${fanDiscard([MINI.g, MINI.b, MINI.r, MINI.y], '#2a2a32')}</g>`;
    body = `<g transform="translate(59 75)">${icon}</g>`;
  }
  return inv ? `<g transform="rotate(180 180 280)">${body}</g>` : body;
}
function corner(c, v, inv) {
  if (isNum(v)) return numCorner(v, inv);
  if (c === 'w') return wildCorner(v, inv);
  if (SMALL[v] && TR[v]) {
    const [x, y, sc, cx = 0, cy = 0] = SMALL[v];
    const body = `<g transform="translate(${x - cx * sc} ${y - cy * sc}) scale(${sc})">${traced(TR[v], 'center')}</g>`;
    return inv ? `<g transform="rotate(180 180 280)">${body}</g>` : body;
  }
  if (TR[v]) return inv ? `<g transform="rotate(180 180 280)">${traced(TR[v], 'corner')}</g>` : traced(TR[v], 'corner');
  let body;
  if (/^\d$/.test(v)) {
    body = txt(v, 92) + (v === '0' ? `<g transform="translate(0 60) scale(.38)">${circ(52, 20)}</g>` : v === '7' ? `<g transform="translate(0 62) scale(.4)">${line(-60, 0, 60, 0, 16)}${arrowHead(66, 0, 0)}${arrowHead(-66, 0, 180)}</g>` : v === '6' || v === '9' ? under(50, 52) : '');
  } else if (v === '10') body = txt('10', 78) + `<g transform="translate(0 52) scale(.34)">${circ(52, 20)}</g>`;
  else if (LABEL[v] && !wild) body = txt(LABEL[v], 66);
  else body = `<g transform="scale(.4)">${symbol(v)}</g>`;
  return `<g transform="${inv ? 'translate(302 490) rotate(180)' : 'translate(58 70)'}">${body}</g>`;
}

function face(c, v) {
  const wild = c === 'w';
  const full = !!FULL[v];
  const [a, b] = COL[wild ? 'k' : c];
  const mid = ART[v] ? artLayers(v)
    : TR[v] ? `<ellipse cx="180" cy="280" rx="124" ry="218" transform="rotate(28 180 280)" fill="url(#g)" stroke="${INK}" stroke-width="12"/><g transform="translate(180 280)">${isNum(v) ? numCenter(v) : traced(TR[v], 'center')}</g>`
    : full ? `<g transform="translate(180 290)">${FULL[v]()}</g>`
    : `<ellipse cx="180" cy="280" rx="124" ry="218" transform="rotate(28 180 280)" fill="${wild ? '#fff' : 'url(#g)'}" stroke="${INK}" stroke-width="${wild ? 0 : 12}"/><g transform="translate(180 ${wild ? 268 : 280})">${symbol(v)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="50%" cy="45%" r="78%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
  <rect width="${W}" height="${H}" rx="30" fill="${INK}"/><rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="28" fill="none" stroke="#2a2a33" stroke-width="2"/>
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="18" fill="${wild ? '#16161c' : 'url(#g)'}"/>
  ${mid}${corner(c, v, false)}${corner(c, v, true)}${EXPANSION.has(v) && !ART[v] ? deckMark : ''}</svg>`;
}

// Dorso propio: ráfaga roja, UNO amarillo y banda negra "NO MERCY"
function back() {
  const rays = Array.from({ length: 22 }, (_, i) => { const a = i * 360 / 22; return `<polygon points="0,0 700,-${22 + (i % 3) * 14} 700,${22 + (i % 3) * 14}" transform="translate(180 280) rotate(${a})" fill="#7d0f22" opacity="${i % 2 ? .55 : .3}"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="b" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#e0263f"/><stop offset="1" stop-color="#9c1328"/></radialGradient><clipPath id="c"><rect x="18" y="18" width="324" height="524" rx="20"/></clipPath></defs>
  <rect width="${W}" height="${H}" rx="30" fill="${INK}"/>
  <rect x="18" y="18" width="324" height="524" rx="20" fill="url(#b)"/><g clip-path="url(#c)">${rays}</g>
  <g transform="translate(180 235) rotate(-5)"><text text-anchor="middle" font-size="124" ${FONT} stroke="#fff" stroke-width="26" stroke-linejoin="round" fill="#fff" letter-spacing="-4">UNO</text><text text-anchor="middle" font-size="124" ${FONT} stroke="${INK}" stroke-width="14" stroke-linejoin="round" paint-order="stroke" fill="#f4b81c" letter-spacing="-4">UNO</text></g>
  <g transform="translate(180 334) rotate(-3)"><rect x="-150" y="-8" width="300" height="86" fill="${INK}"/><text y="-22" x="-18" text-anchor="middle" font-size="22" ${FONT} fill="#fff" stroke="${INK}" stroke-width="8" paint-order="stroke">SHOW 'EM</text><text y="48" text-anchor="middle" font-size="58" ${FONT} fill="#fff" letter-spacing="1">NO MERCY</text></g></svg>`;
}

function coin(kind) {
  const m = kind === 'mercy';
  const rays = Array.from({ length: 28 }, (_, i) => `<polygon points="0,0 120,-6 120,6" transform="rotate(${i * 360 / 28})" fill="${m ? '#4a0d1e' : '#15151a'}"/>`).join('');
  const shield = 'M -56 -52 H 56 V 22 Q 56 74 0 90 Q -56 74 -56 22 Z';
  const eye = (x, flip) => m
    ? `<path d="M ${x - 22} -4 Q ${x} -34 ${x + 22} -4 Q ${x} -18 ${x - 22} -4 Z" fill="${INK}"/><line x1="${x}" y1="-46" x2="${x}" y2="-28" stroke="${INK}" stroke-width="5"/>`
    : `<path d="M ${x - 22 * flip} -26 Q ${x + 6 * flip} -30 ${x + 22 * flip} 0 Q ${x} -12 ${x - 22 * flip} -14 Z" fill="#c8283a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><line x1="${x - 8 * flip}" y1="-46" x2="${x - 8 * flip}" y2="-30" stroke="${INK}" stroke-width="5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="-120 -120 240 240">
  <defs><clipPath id="d"><circle r="92"/></clipPath><clipPath id="r"><rect x="0" y="-100" width="100" height="200"/></clipPath></defs>
  <circle r="118" fill="#e32d42"/><circle r="104" fill="none" stroke="#b81f33" stroke-width="3"/><circle r="98" fill="${INK}"/>
  <circle r="92" fill="${m ? '#a42041' : '#2f2f37'}"/><g clip-path="url(#d)">${rays}</g>
  <path d="${shield}" fill="${m ? '#f3f3f6' : '#f3f3f6'}"/><path d="${shield}" fill="${m ? '#b7b7c2' : '#e8b4a8'}" clip-path="url(#r)"/><path d="${shield}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
  ${eye(-26, 1)}${eye(26, -1)}
  ${m ? `<path d="M -50 8 Q 0 34 50 8 Q 36 62 0 62 Q -36 62 -50 8 Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <text x="0" y="40" text-anchor="middle" dominant-baseline="central" font-size="30" ${FONT} fill="#fff">7</text>`
    : `<path d="M -40 48 Q 0 -8 40 48 L 24 52 Q 0 20 -24 52 Z" fill="#c8283a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <text x="0" y="72" text-anchor="middle" dominant-baseline="central" font-size="38" ${FONT} fill="#fff" stroke="${INK}" stroke-width="9" paint-order="stroke" stroke-linejoin="round" font-style="italic">x2</text>`}
  <rect x="-36" y="-94" width="72" height="30" rx="13" fill="${MINI.y}" stroke="${INK}" stroke-width="6"/>
  <text x="0" y="-78" text-anchor="middle" dominant-baseline="central" font-size="22" ${FONT} fill="${INK}">UNO</text></svg>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = {};
  for (const c of 'rbyg') for (const v of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'skipall', 'rev', 'skip', 'discard', 'd2', 'd4']) jobs[`${c}-${v}`] = face(c, v);
  for (const v of ['rev4', 'roulette', 'd10', 'd6', 'discardall', 'rev8', 'final']) jobs[`w-${v}`] = face('w', v);
  jobs.sudden = face('w', 'sudden');
  jobs['coin-mercy'] = coin('mercy'); jobs['coin-nomercy'] = coin('nomercy');
  jobs.back = back();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  for (const [name, svg] of Object.entries(jobs)) {
    const d = await page.evaluate(async (s) => {
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); try { await img.decode(); } catch { return null; }
      const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.88);
    }, svg);
    if (!d) { console.error('SVG inválido:', name); process.exitCode = 1; continue; }
    fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(d.split(',')[1], 'base64'));
  }
  await browser.close();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp'));
  console.log(files.length, 'imágenes,', Math.round(files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1024), 'KB');
})();
