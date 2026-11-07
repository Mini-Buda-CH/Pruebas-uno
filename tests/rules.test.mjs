import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, createGame, apply, legalCards, viewFor } from '../js/rules.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i, coin: 'mercy' }));
const rng = () => 0.42;
const game = (n = 3, opts = {}) => createGame(P(n), { decks: 1, expansion: false, packs: 1, coins: true, ...opts }, rng);
const card = (c, v, id = Math.floor(Math.random() * 1e6) + 1000) => ({ id, c, v });
/** Arma un estado controlado: el turno es del jugador 1, carta superior verde 5. */
function setup(n, hands, top = card('g', '5', 9001), color = 'g') {
  const s = game(n);
  hands.forEach((h, i) => { s.players[i].hand = h; });
  s.discard = [top]; s.color = color; s.turn = 1; s.dir = 1; s.pending = 0; s.pendingMin = 0;
  return s;
}

test('conteo de mazos', () => {
  assert.equal(buildDeck({ decks: 1 }).length, 168);
  assert.equal(buildDeck({ decks: 2 }).length, 336);
  assert.equal(buildDeck({ decks: 1, expansion: true, packs: 1 }).length, 192);
  assert.equal(buildDeck({ decks: 1, expansion: true, packs: 3 }).length, 168 + 72);
  assert.equal(new Set(buildDeck({ decks: 2, expansion: true, packs: 2 }).map((c) => c.id)).size, 336 + 48);
});

test('reparto: 7 cartas, carta inicial es número, empieza el de la izquierda', () => {
  const s = game(4);
  s.players.forEach((p) => assert.equal(p.hand.length, 7));
  assert.match(s.discard[0].v, /^\d$/);
  assert.equal(s.turn, 1);
});

test('jugada válida e inválida', () => {
  const s = setup(3, [[card('r', '1')], [card('g', '2', 1), card('r', '3', 2)], [card('b', '4')]]);
  assert.equal(apply(s, 'p1', { type: 'play', cardId: 2 }).ok, false); // rojo 3 sobre verde 5
  assert.equal(apply(s, 'p1', { type: 'play', cardId: 1 }).ok, true);
  assert.equal(s.turn, 2);
});

test('apilar: +4 sobre +2 sí, +2 sobre +4 no, paga quien no puede', () => {
  const s = setup(3, [[card('y', 'd2', 4), card('r', '1', 5)], [card('g', 'd2', 1), card('r', '9', 6)],
    [card('g', 'd4', 2), card('b', '9', 3)]]);
  assert.ok(apply(s, 'p1', { type: 'play', cardId: 1 }).ok);
  assert.equal(s.pending, 2);
  assert.ok(apply(s, 'p2', { type: 'play', cardId: 2 }).ok); // +4 >= +2
  assert.equal(s.pending, 6);
  assert.equal(apply(s, 'p0', { type: 'play', cardId: 4 }).ok, false); // +2 < +4
  const before = s.players[0].hand.length;
  assert.ok(apply(s, 'p0', { type: 'draw' }).ok);
  assert.equal(s.players[0].hand.length, before + 6);
  assert.equal(s.pending, 0);
  assert.equal(s.turn, 1); // p0 pierde su turno
});

test('Sin piedad duplica la penalización', () => {
  const s = setup(3, [[card('r', '1')], [card('g', 'd4', 1), card('r', '1', 7)], [card('b', '4', 8)]]);
  s.players[1].coin = 'nomercy';
  assert.ok(apply(s, 'p1', { type: 'coin' }).ok);
  assert.ok(apply(s, 'p1', { type: 'play', cardId: 1 }).ok);
  assert.equal(s.pending, 8);
  assert.equal(s.pendingMin, 8);
});

test('Piedad: mano nueva de 7, solo una vez', () => {
  const s = setup(3, [[card('r', '1')], [card('r', '2', 1), card('r', '3', 2)], [card('b', '4')]]);
  assert.ok(apply(s, 'p1', { type: 'coin' }).ok);
  assert.equal(s.players[1].hand.length, 7);
  assert.equal(apply(s, 'p1', { type: 'coin' }).ok, false);
});

test('Reversa con 2 jugadores da otro turno; con 3 invierte', () => {
  let s = setup(2, [[card('r', '1')], [card('g', 'rev', 1), card('g', '2', 2)]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.turn, 1);
  s = setup(3, [[card('r', '1')], [card('g', 'rev', 1), card('g', '2', 2)], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.dir, -1); assert.equal(s.turn, 0);
});

test('Reversa +4 con 2 jugadores: la sanción vuelve a quien la jugó', () => {
  const s = setup(2, [[card('r', '1')], [card('w', 'rev4', 1), card('g', '2', 2)]]);
  apply(s, 'p1', { type: 'play', cardId: 1, color: 'r' });
  assert.equal(s.turn, 1); assert.equal(s.pending, 4); assert.equal(s.color, 'r');
});

test('7 intercambia, 0 rota manos', () => {
  let s = setup(3, [[card('r', '1')], [card('g', '7', 1), card('g', '2', 2)], [card('b', '4'), card('b', '5')]]);
  apply(s, 'p1', { type: 'play', cardId: 1, target: 'p2' });
  assert.equal(s.players[1].hand.length, 2); assert.equal(s.players[2].hand.length, 1);
  s = setup(3, [[card('r', '1')], [card('g', '0', 1), card('g', '2', 2)], [card('b', '4'), card('b', '5'), card('b', '6')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.deepEqual(s.players.map((p) => p.hand.length), [3, 1, 1]);
});

test('Tira un color descarta toda esa color', () => {
  const s = setup(3, [[card('r', '1')], [card('g', 'discard', 1), card('g', '2', 2), card('g', '3', 3), card('r', '4', 4)],
    [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(s.discard[s.discard.length - 1].v, 'discard');
});

test('Ataque final: 7+ acciones = 25 y los demás 5', () => {
  const acts = Array.from({ length: 7 }, (_, i) => card('r', 'skip', 100 + i));
  const s = setup(3, [[card('r', '1')], [card('w', 'final', 1), ...acts], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1, color: 'r' });
  assert.equal(s.players[2].out, true); // 1 + 25 >= 25: eliminado
  assert.equal(s.players[0].hand.length, 6);
});

test('Muerte súbita lleva a todos a 24', () => {
  const s = setup(3, [[card('r', '1')], [card('w', 'sudden', 1), card('g', '2', 2)], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1, color: 'b' });
  assert.deepEqual(s.players.map((p) => p.hand.length), [24, 24, 24]);
});

test('eliminación a 25 y victoria por último en pie', () => {
  const s = setup(2, [[], [card('g', 'd10', 1), card('g', '2', 2)]]);
  s.players[0].hand = Array.from({ length: 20 }, (_, i) => card('r', '1', 200 + i));
  apply(s, 'p1', { type: 'play', cardId: 1 });
  apply(s, 'p0', { type: 'draw' }); // 20 + 10 = 30
  assert.equal(s.players[0].out, true);
  assert.equal(s.winner, 'p1');
});

test('ganar al quedarse sin cartas; atrapar a quien no dice UNO', () => {
  let s = setup(3, [[card('r', '1')], [card('g', '2', 1), card('g', '3', 2)], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.catch.pid, 'p1');
  assert.ok(apply(s, 'p2', { type: 'catch' }).ok);
  assert.equal(s.players[1].hand.length, 3);
  s = setup(3, [[card('r', '1')], [card('g', '2', 1)], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.winner, 'p1');
});

test('robar hasta poder jugar obliga a jugar esa carta', () => {
  const s = setup(3, [[card('r', '1')], [card('r', '2', 1)], [card('b', '4')]]);
  s.draw = [card('g', '8', 50), card('r', '9', 51)]; // se roba desde el final: 51 y luego 50
  assert.ok(apply(s, 'p1', { type: 'draw' }).ok);
  assert.equal(s.mustPlay, 50);
  assert.deepEqual(legalCards(s, 'p1').map((c) => c.id), [50]);
});

test('ruleta de color', () => {
  const s = setup(3, [[card('r', '1')], [card('w', 'roulette', 1), card('g', '2', 2)], [card('b', '4')]]);
  s.draw = [card('y', '1', 60), card('r', '2', 61), card('b', '3', 62), card('w', 'd6', 63)];
  apply(s, 'p1', { type: 'play', cardId: 1, color: 'g' });
  assert.equal(s.phase, 'roulette'); assert.equal(s.turn, 2);
  assert.ok(apply(s, 'p2', { type: 'roulette', color: 'b' }).ok); // roba d6 (comodín no cuenta), luego b
  assert.equal(s.players[2].hand.length, 3);
  assert.equal(s.turn, 0);
});

test('la vista de un jugador no filtra las manos ajenas', () => {
  const s = game(3);
  const v = viewFor(s, 'p0');
  assert.ok(v.players[0].hand);
  assert.equal(v.players[1].hand, undefined);
});

test('los 10 se pueden jugar uno tras otro (vuelve a jugar) y el 10 de otro color coincide por número', () => {
  const s = setup(3, [[card('r', '1')], [card('g', '10', 1), card('b', '10', 2), card('y', '10', 3), card('r', '4', 4)], [card('b', '4')]]);
  apply(s, 'p1', { type: 'play', cardId: 1 });
  assert.equal(s.turn, 1);
  assert.ok(apply(s, 'p1', { type: 'play', cardId: 2 }).ok); // 10 azul sobre 10 verde
  assert.ok(apply(s, 'p1', { type: 'play', cardId: 3 }).ok);
  assert.equal(s.turn, 1); assert.equal(s.players[1].hand.length, 1);
});

/** Partidas completas al azar con 2..20 jugadores: sin errores y sin perder ni duplicar cartas. */
function simulate(n, opts, seed) {
  let x = seed; const r = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const s = createGame(P(n), { coins: true, ...opts }, r);
  const total = buildDeck(opts).length;
  const count = () => s.draw.length + s.discard.length + s.aside.length + s.players.reduce((a, p) => a + p.hand.length, 0);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const C = ['r', 'b', 'y', 'g'];
  let steps = 0;
  while (!s.winner && steps++ < 4000) {
    const p = s.players[s.turn];
    let res;
    if (s.phase === 'roulette') res = apply(s, p.id, { type: 'roulette', color: pick(C) });
    else {
      if (p.coin && !p.coinUsed && r() < 0.05) apply(s, p.id, { type: 'coin' });
      const legal = legalCards(s, p.id);
      if (legal.length) {
        const c = pick(legal);
        const others = s.players.filter((q) => q.id !== p.id && !q.out);
        res = apply(s, p.id, { type: 'play', cardId: c.id, color: pick(C), discardColor: pick(C), target: pick(others).id });
      } else res = apply(s, p.id, { type: 'draw' });
    }
    assert.ok(res.ok, `n=${n} seed=${seed} paso ${steps}: ${res.error}`);
    assert.equal(count(), total, `cartas conservadas (n=${n}, paso ${steps})`);
    assert.ok(!s.players[s.turn].out || s.winner, 'el turno nunca es de un eliminado');
  }
  return !!s.winner;
}

test('simulación: 2 a 20 jugadores, mazos y expansión variados', () => {
  let finished = 0, games = 0;
  for (let n = 2; n <= 20; n++) {
    for (const opts of [{ decks: 1 }, { decks: 2, expansion: true, packs: 1 }, { decks: 1, expansion: true, packs: 4 }]) {
      games++; if (simulate(n, opts, n * 97 + opts.decks)) finished++;
    }
  }
  assert.ok(finished >= games * 0.8, `terminadas ${finished}/${games}`);
});

test('20 jugadores con 1 mazo: el reparto alcanza (140 cartas) y quedan cartas para robar', () => {
  const s = createGame(P(20), { decks: 1, coins: false }, rng);
  assert.equal(s.draw.length, 168 - 140 - 1);
  assert.equal(buildDeck({ decks: 10 }).length, 1680);
});
