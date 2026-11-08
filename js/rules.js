export const COLORS = ['r', 'b', 'y', 'g'];
export const COLOR_NAME = { r: 'Rojo', b: 'Azul', y: 'Amarillo', g: 'Verde' };
const PEN = { d2: 2, d4: 4, d6: 6, d10: 10, rev4: 4, rev8: 8 }; 
const MAX_CARDS = 25; 

export const imgKey = (c) => (c.c !== 'w' ? `${c.c}-${c.v}` : c.v === 'sudden' ? 'sudden' : `w-${c.v}`);
export const isNumber = (c) => c.c !== 'w' && /^\d+$/.test(c.v);
export const isPenalty = (c) => c.v in PEN;
const isActionOrWild = (c) => c.c === 'w' || !isNumber(c);

export function buildDeck({ decks = 1, expansion = false, packs = 1 } = {}) {
  const cards = [];
  let id = 0;
  const add = (c, v, n) => { for (let i = 0; i < n; i++) cards.push({ id: id++, c, v }); };
  for (let d = 0; d < decks; d++) {
    for (const c of COLORS) {
      for (let n = 0; n <= 9; n++) add(c, String(n), 2);
      add(c, 'skipall', 2); add(c, 'rev', 3); add(c, 'skip', 3); add(c, 'discard', 3); add(c, 'd2', 3); add(c, 'd4', 2);
    }
    add('w', 'rev4', 8); add('w', 'd6', 4); add('w', 'd10', 4); add('w', 'roulette', 8);
  }
  if (expansion) {
    for (let p = 0; p < packs; p++) {
      for (const c of COLORS) add(c, '10', 2);
      add('w', 'discardall', 8); add('w', 'rev8', 4); add('w', 'final', 2); add('w', 'sudden', 2);
    }
  }
  return cards;
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const log = (s, t) => { s.log.push(t); if (s.log.length > 60) s.log.shift(); };
const alive = (s) => s.players.filter((p) => !p.out);
const nameOf = (s, i) => s.players[i].name;

export function createGame(players, opts, rng = Math.random) {
  const s = {
    opts, rng, draw: shuffle(buildDeck(opts), rng), discard: [], aside: [], dir: 1, pending: 0, pendingMin: 0,
    phase: 'play', winner: null, mustPlay: null, catch: null, log: [], color: 'r',
    players: players.map((p) => ({ id: p.id, name: p.name, coin: opts.coins ? p.coin || 'mercy' : null, coinUsed: false,
      armed: false, hand: [], out: false, saidUno: false })),
  };
  for (let i = 0; i < 7; i++) for (const p of s.players) p.hand.push(s.draw.pop());
  const skipped = [];
  let top = s.draw.pop();
  while (top && !(isNumber(top) && top.v !== '10')) { skipped.push(top); top = s.draw.pop(); }
  s.draw.unshift(...skipped);
  s.discard.push(top); s.color = top.c;
  s.turn = s.players.length > 1 ? 1 : 0;
  log(s, `Empieza ${nameOf(s, s.turn)}.`);
  return s;
}

function reshuffle(s) {
  const top = s.discard.pop();
  s.draw = shuffle([...s.discard, ...s.aside], s.rng);
  s.discard = [top]; s.aside = [];
  if (s.draw.length) log(s, 'Se baraja la pila de descarte.');
}

function drawOne(s) {
  if (!s.draw.length) reshuffle(s);
  return s.draw.pop() || null;
}

function checkElimination(s) {
  for (const p of s.players) {
    if (!p.out && p.hand.length >= MAX_CARDS) {
      p.out = true; s.aside.push(...p.hand); p.hand = [];
      log(s, `${p.name} queda eliminado (Piedad).`);
    }
  }
  const left = alive(s);
  if (left.length === 1 && s.players.length > 1 && !s.winner) { s.winner = left[0].id; log(s, `${left[0].name} gana: es el último jugador.`); }
}

function give(s, i, n) {
  const p = s.players[i];
  for (let k = 0; k < n && !p.out; k++) {
    const c = drawOne(s); if (!c) break;
    p.hand.push(c);
    if (p.hand.length >= MAX_CARDS) break;
  }
  p.saidUno = false;
  checkElimination(s);
}

function nextIdx(s, from, dir = s.dir) {
  const n = s.players.length;
  let i = from;
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!s.players[i].out) return i; }
  return from;
}

const effPen = (s, i, c) => PEN[c.v] * (s.players[i].armed ? 2 : 1);

export function playable(s, c) {
  const top = s.discard[s.discard.length - 1];
  if (s.pending > 0) return isPenalty(c) && effPen(s, s.turn, c) >= s.pendingMin;
  if (c.c === 'w') return true;
  return c.c === s.color || (top.c !== 'w' && c.v === top.v);
}

export function legalCards(s, pid) {
  const i = s.players.findIndex((p) => p.id === pid);
  if (i !== s.turn || s.phase !== 'play' || s.winner) return [];
  const h = s.players[i].hand;
  return s.mustPlay != null ? h.filter((c) => c.id === s.mustPlay) : h.filter((c) => playable(s, c));
}

function endTurn(s) {
  s.players[s.turn].armed = false;
  s.mustPlay = null;
  s.turn = nextIdx(s, s.turn);
}

const err = (error) => ({ ok: false, error });

export function apply(s, pid, a) {
  if (s.winner) return err('La partida terminó.');
  const i = s.players.findIndex((p) => p.id === pid);
  if (i < 0) return err('Jugador desconocido.');
  const me = s.players[i];
  switch (a.type) {
    case 'uno':
      if (me.hand.length > 2 || me.out) return err('Aún no.');
      me.saidUno = true; log(s, `${me.name}: ¡UNO!`);
      if (s.catch && s.catch.pid === pid) s.catch = null;
      return { ok: true };
    case 'catch': {
      if (!s.catch || s.catch.pid === pid) return err('Nadie a quien atrapar.');
      const ti = s.players.findIndex((p) => p.id === s.catch.pid);
      if (s.players[ti].saidUno || s.players[ti].hand.length !== 1) { s.catch = null; return err('Ya dijo UNO.'); }
      log(s, `${me.name} atrapó a ${s.players[ti].name}: toma 2.`);
      s.catch = null; give(s, ti, 2); return { ok: true };
    }
    case 'coin': return useCoin(s, i, me);
    case 'roulette': return roulette(s, i, a);
    case 'draw': return doDraw(s, i, me);
    case 'play': return doPlay(s, i, me, a);
    default: return err('Acción desconocida.');
  }
}

function useCoin(s, i, me) {
  if (!me.coin || me.coinUsed) return err('No tienes moneda.');
  if (me.out && me.coin !== 'mercy') return err('Estás eliminado.');
  if (!me.out && (i !== s.turn || s.phase !== 'play')) return err('Solo en tu turno.');
  me.coinUsed = true;
  if (me.coin === 'mercy') {
    s.discard.unshift(...me.hand); me.hand = []; 
    const wasOut = me.out; me.out = false;
    for (let k = 0; k < 7; k++) { const c = drawOne(s); if (c) me.hand.push(c); }
    me.saidUno = false; s.mustPlay = null; 
    log(s, `${me.name} usa su moneda Piedad: nueva mano de 7.${wasOut ? ' ¡Vuelve al juego!' : ''}`);
  } else { me.armed = true; log(s, `${me.name} usa Sin piedad: su próxima carta para tomar vale el doble.`); }
  return { ok: true };
}

function doDraw(s, i, me) {
  if (i !== s.turn || s.phase !== 'play') return err('No es tu turno.');
  if (s.mustPlay != null) return err('Debes jugar la carta que tomaste.');
  if (s.catch && s.catch.pid !== me.id) s.catch = null;
  if (s.pending > 0) {
    log(s, `${me.name} toma ${s.pending} cartas y pierde su turno.`);
    const n = s.pending; s.pending = 0; s.pendingMin = 0; give(s, i, n);
    if (!s.winner) endTurn(s);
    return { ok: true };
  }
  if (me.hand.some((c) => playable(s, c))) return err('Tienes una carta jugable.');
  let n = 0, got = null;
  while (!me.out) {
    const c = drawOne(s); if (!c) break;
    me.hand.push(c); n++;
    if (playable(s, c)) { got = c; break; }
    if (me.hand.length >= MAX_CARDS) break;
  }
  me.saidUno = false; checkElimination(s);
  log(s, `${me.name} toma ${n} carta${n === 1 ? '' : 's'}.`);
  if (s.winner) return { ok: true };
  if (got && !me.out) s.mustPlay = got.id; else endTurn(s);
  return { ok: true };
}

function doPlay(s, i, me, a) {
  if (i !== s.turn || s.phase !== 'play') return err('No es tu turno.');
  const card = me.hand.find((c) => c.id === a.cardId);
  if (!card) return err('No tienes esa carta.');
  if (s.mustPlay != null && card.id !== s.mustPlay) return err('Debes jugar la carta que tomaste.');
  if (!playable(s, card)) return err('Esa carta no se puede jugar.');
  const wild = card.c === 'w';
  if (wild && !COLORS.includes(a.color)) return err('Elige un color.');
  if (card.v === 'discardall' && !COLORS.includes(a.discardColor)) return err('Elige el color a descartar.');
  let target = -1;
  if (card.v === '7') {
    target = s.players.findIndex((p) => p.id === a.target);
    if (target < 0 || target === i || s.players[target].out) return err('Elige con quién intercambiar.');
  }
  if (s.catch && s.catch.pid !== me.id) s.catch = null;

  me.hand.splice(me.hand.indexOf(card), 1);
  s.discard.push(card); s.mustPlay = null;
  s.color = wild ? a.color : card.c;
  log(s, `${me.name} juega ${describe(card)}${wild ? ` (${COLOR_NAME[a.color]})` : ''}.`);

  let stay = false; 
  const two = alive(s).length === 2;
  const addPen = () => { const v = effPen(s, i, card); s.pending += v; s.pendingMin = v; };
  switch (card.v) {
    case '0': {
      const act = s.players.map((p, k) => k).filter((k) => !s.players[k].out);
      const hands = act.map((k) => s.players[k].hand);
      act.forEach((k, n) => { s.players[nextIdx(s, k)].hand = hands[n]; });
      log(s, 'Todos pasan su mano.'); break;
    }
    case '7':
      [me.hand, s.players[target].hand] = [s.players[target].hand, me.hand];
      log(s, `${me.name} intercambia su mano con ${s.players[target].name}.`); break;
    case 'skip': s.turn = nextIdx(s, s.turn); break;
    case 'skipall': case '10': stay = true; break;
    case 'rev': s.dir *= -1; if (two) stay = true; break;
    case 'discard': {
      const mine = me.hand.filter((c) => c.c === card.c);
      me.hand = me.hand.filter((c) => c.c !== card.c);
      s.discard.splice(s.discard.length - 1, 0, ...mine); 
      if (mine.length) log(s, `${me.name} descarta ${mine.length} carta(s) ${COLOR_NAME[card.c]}.`);
      break;
    }
    case 'd2': case 'd4': case 'd6': case 'd10': addPen(); break;
    case 'rev4': case 'rev8': s.dir *= -1; addPen(); if (two) stay = true; break;
    case 'roulette': s.turn = nextIdx(s, i); s.phase = 'roulette'; break;
    case 'discardall': {
      const mine = me.hand.filter((c) => c.c === a.discardColor);
      me.hand = me.hand.filter((c) => c.c !== a.discardColor);
      s.discard.splice(s.discard.length - 1, 0, ...mine);
      log(s, `${me.name} descarta ${mine.length} carta(s) ${COLOR_NAME[a.discardColor]}.`); break;
    }
    case 'final': {
      const n = me.hand.filter(isActionOrWild).length;
      log(s, `Ataque final: ${me.name} revela ${n} carta(s) de acción/comodín.`);
      const victim = nextIdx(s, i);
      if (n >= 7) {
        log(s, `${s.players[victim].name} toma 25 y los demás toman 5.`);
        s.players.forEach((p, k) => { if (k !== i && k !== victim && !p.out) give(s, k, 5); });
        give(s, victim, 25);
      } else give(s, victim, n);
      s.turn = victim; 
      break;
    }
    case 'sudden':
      s.players.forEach((p, k) => { if (!p.out && p.hand.length < 24) give(s, k, 24 - p.hand.length); });
      log(s, 'Muerte súbita: todos tienen 24 cartas.'); break;
    default: break;
  }
  checkElimination(s);
  me.armed = false;
  if (!me.out && me.hand.length === 0) { s.winner = me.id; log(s, `¡${me.name} gana la partida!`); return { ok: true }; }
  if (s.winner) return { ok: true };
  if (s.phase === 'roulette') return { ok: true };
  if (me.hand.length === 1 && !me.saidUno) s.catch = { pid: me.id };
  if (stay) s.turn = me.out ? nextIdx(s, i) : i; else s.turn = nextIdx(s, s.turn);
  return { ok: true };
}

function roulette(s, i, a) {
  if (s.phase !== 'roulette' || i !== s.turn) return err('No es tu ruleta.');
  if (!COLORS.includes(a.color)) return err('Elige un color.');
  const p = s.players[i]; let n = 0;
  for (;;) {
    const c = drawOne(s); if (!c) break;
    p.hand.push(c); n++;
    if (c.c === a.color) break;
    if (p.hand.length >= MAX_CARDS) break;
  }
  p.saidUno = false;
  s.color = a.color;
  log(s, `${p.name} elige ${COLOR_NAME[a.color]}, toma ${n} carta(s) y pierde su turno.`);
  checkElimination(s);
  s.phase = 'play';
  if (!s.winner) s.turn = nextIdx(s, i);
  return { ok: true };
}

export function describe(c) {
  const N = { skipall: 'Salta a todos', rev: 'Reversa', skip: 'Salta', discard: 'Tira un color', d2: '+2', d4: '+4', rev4: 'Reversa +4',
    d6: '+6', d10: '+10', roulette: 'Ruleta de color', discardall: 'Descartar todo', rev8: 'Reversa +8', final: 'Ataque final',
    sudden: 'Muerte súbita', 10: '10 (Vuelve a jugar)' };
  const base = N[c.v] || c.v;
  return c.c === 'w' ? base : `${base} ${COLOR_NAME[c.c]}`;
}

export function viewFor(s, pid) {
  return {
    me: pid, turn: s.players[s.turn].id, phase: s.phase, dir: s.dir, color: s.color, pending: s.pending, winner: s.winner,
    top: s.discard[s.discard.length - 1], drawCount: s.draw.length, mustPlay: s.mustPlay, catch: s.catch ? s.catch.pid : null,
    log: s.log.slice(-25), legal: legalCards(s, pid).map((c) => c.id),
    players: s.players.map((p) => ({ id: p.id, name: p.name, count: p.hand.length, out: p.out, coin: p.coin,
      coinUsed: p.coinUsed, armed: p.armed, hand: p.id === pid ? p.hand : undefined })),
  };
}
