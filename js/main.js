// UI + lógica del anfitrión. El anfitrión mantiene el estado real y envía a cada jugador solo su vista (rules.viewFor).
import { COLORS, COLOR_NAME, buildDeck, createGame, apply, viewFor, imgKey, describe } from './rules.js';
import { openHost, joinRoom, newCode, normCode, playerId } from './net.js';

const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);
const me = playerId();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const img = (key, alt, extra = '') => `<img src="assets/cards/${key}.webp" alt="${esc(alt)}" decoding="async" ${extra}>`;

const MAX_PLAYERS = 20;
const ui = { screen: 'home', name: lsGet('uno-name'), err: '', busy: false, lobby: null, view: null, play: null, pick: null };
let host = null;  // { code, net, opts, players:[{id,name,coin}], game }
let guest = null; // { send }

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('on'), 2800);
}

/* ---------------- red ---------------- */
function receive(m) {
  if (m.t === 'lobby') { ui.lobby = m; ui.view = null; ui.screen = 'lobby'; }
  else if (m.t === 'view') { ui.view = m.v; ui.screen = 'game'; }
  else if (m.t === 'err') toast(m.msg);
  render();
}
const pushLobby = () => {
  const m = { t: 'lobby', code: host.code, players: host.players, opts: host.opts, host: me };
  host.players.forEach((p) => p.id !== me && host.net.send(p.id, m));
  receive(m);
};
const pushViews = () => host.game.players.forEach((p) => {
  const m = { t: 'view', v: viewFor(host.game, p.id) };
  p.id === me ? receive(m) : host.net.send(p.id, m);
});
function hostAct(pid, a) {
  if (!host.game) return;
  const r = apply(host.game, pid, a);
  if (!r.ok) { pid === me ? toast(r.error) : host.net.send(pid, { t: 'err', msg: r.error }); return; }
  pushViews();
}
const act = (a) => (host ? hostAct(me, a) : guest.send({ t: 'act', a }));

async function createRoom(name, opts) {
  for (let tries = 0; tries < 3; tries++) {
    const code = newCode();
    try {
      const net = await openHost(code, {
        onJoin(pid, m) {
          if (host.game) {
            if (host.game.players.some((p) => p.id === pid)) pushViews();
            else host.net.send(pid, { t: 'err', msg: 'La partida ya empezó.' });
            return;
          }
          if (host.players.length >= MAX_PLAYERS) { host.net.send(pid, { t: 'err', msg: `Sala llena (${MAX_PLAYERS}).` }); return; }
          if (!host.players.some((p) => p.id === pid)) host.players.push({ id: pid, name: String(m.name || 'Jugador').slice(0, 16), coin: 'mercy' });
          pushLobby();
        },
        onData(pid, m) {
          if (m.t === 'coin' && !host.game) {
            const p = host.players.find((x) => x.id === pid);
            if (p && (m.side === 'mercy' || m.side === 'nomercy')) { p.coin = m.side; pushLobby(); }
          } else if (m.t === 'act') hostAct(pid, m.a);
        },
        onClose(pid) { if (!host.game) { host.players = host.players.filter((p) => p.id !== pid); pushLobby(); } },
      });
      host = { code, net, opts, players: [{ id: me, name, coin: 'mercy' }], game: null };
      history.replaceState(null, '', '#' + code);
      pushLobby();
      return;
    } catch (e) { if (e.type !== 'unavailable-id') throw e; }
  }
  throw new Error('No se pudo crear la sala.');
}

async function joinGame(name, code) {
  guest = await joinRoom(code, me, name, {
    onData: receive,
    onClose: () => { toast('Se perdió la conexión con el anfitrión.'); guest = null; ui.screen = 'home'; render(); },
  });
}

const errText = (e) => (e.type === 'peer-unavailable' ? 'No existe esa sala.' : e.message === 'timeout' ? 'No se pudo conectar (¿red restringida?).' : 'Error de conexión: ' + (e.type || e.message));

/* ---------------- vistas ---------------- */
const total = (o) => buildDeck(o).length;

function homeView() {
  const hash = normCode(location.hash.slice(1));
  return `<main class="wrap">
    <div class="eyebrow">Multijugador en línea · gratis</div>
    <h1>UNO<br>No Mercy</h1>
    <p style="max-width:620px">Crea una sala y comparte el código, o únete a la de tus amigos. Cartas de tu mazo real, paquete de expansión y monedas incluidos.</p>
    <div class="grid2">
      <section class="card"><h3>Nueva partida</h3>
        <div class="field"><label for="n1">Tu nombre</label><input id="n1" type="text" maxlength="16" value="${esc(ui.name)}" autocomplete="nickname"></div>
        <div class="field"><label for="decks">Mazos</label><select id="decks">${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<option value="${n}">${n} mazo${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <label class="check"><input id="exp" type="checkbox"> Paquete de expansión</label>
        <div class="field"><label for="packs">Paquetes de expansión</label><select id="packs" disabled>${[1, 2, 3, 4].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></div>
        <label class="check"><input id="coins" type="checkbox" disabled> Monedas Piedad / Sin piedad</label>
        <p class="eyebrow" id="total">Total: ${total({ decks: 1 })} cartas</p>
        <button class="btn" data-a="create" ${ui.busy ? 'disabled' : ''}>Crear partida</button>
      </section>
      <section class="card"><h3>Unirme con código</h3>
        <div class="field"><label for="n2">Tu nombre</label><input id="n2" type="text" maxlength="16" value="${esc(ui.name)}" autocomplete="nickname"></div>
        <div class="field"><label for="code">Código de sala</label><input id="code" class="code" type="text" maxlength="5" value="${hash}" placeholder="ABCDE" autocomplete="off" autocapitalize="characters"></div>
        <button class="btn outline" data-a="join" ${ui.busy ? 'disabled' : ''}>Unirme</button>
      </section>
    </div>
    <p class="err" role="alert">${esc(ui.err)}</p>
  </main>`;
}

function lobbyView() {
  const L = ui.lobby, isHost = L.host === me, o = L.opts, mine = L.players.find((p) => p.id === me);
  return `<main class="wrap">
    <div class="eyebrow">Sala</div>
    <div class="roomcode" aria-label="Código de sala">${esc(L.code)}</div>
    <div class="row" style="margin-bottom:16px">
      <button class="btn ghost sm" data-a="copy">Copiar enlace</button>
      <span class="badge">${o.decks} mazo${o.decks > 1 ? 's' : ''}</span>
      ${o.expansion ? `<span class="badge pink">Expansión ×${o.packs}</span>` : ''}${o.coins ? '<span class="badge blue">Monedas</span>' : ''}
      <span class="badge green">${total(o)} cartas</span>
    </div>
    <div class="grid2">
      <section class="card"><h3>Jugadores (${L.players.length}/${MAX_PLAYERS})</h3>
        <ul class="plist">${L.players.map((p) => `<li><span>${esc(p.name)}${p.id === me ? ' (tú)' : ''}${p.id === L.host ? ' · anfitrión' : ''}</span>${o.coins ? `<span class="badge ${p.coin === 'mercy' ? 'green' : 'pink'}">${p.coin === 'mercy' ? 'Piedad' : 'Sin piedad'}</span>` : ''}</li>`).join('')}</ul>
      </section>
      <section class="card">
        ${o.coins ? `<h3>Tu moneda</h3><p>Se usa una sola vez por partida, en tu turno.</p>
          <div class="row" style="margin-bottom:16px">
            <button class="btn ${mine.coin === 'mercy' ? '' : 'ghost'}" data-a="coin" data-v="mercy" aria-pressed="${mine.coin === 'mercy'}">Piedad</button>
            <button class="btn ${mine.coin === 'nomercy' ? '' : 'ghost'}" data-a="coin" data-v="nomercy" aria-pressed="${mine.coin === 'nomercy'}">Sin piedad</button>
          </div>
          <p class="eyebrow">Piedad: cambia tu mano por 7 nuevas · Sin piedad: duplica tu próxima carta para tomar</p>` : ''}
        ${isHost ? `<button class="btn" data-a="start" ${L.players.length < 2 ? 'disabled' : ''}>Iniciar partida</button>${L.players.length < 2 ? '<p class="eyebrow" style="margin-top:12px">Necesitas al menos 2 jugadores</p>' : ''}`
    : '<p>Esperando a que el anfitrión inicie la partida…</p>'}
      </section>
    </div>
    <button class="btn ghost sm" style="margin-top:24px" data-a="leave">Salir</button>
  </main>`;
}

const ORDER = { r: 0, b: 1, y: 2, g: 3, w: 4 };
const sortHand = (h) => [...h].sort((a, b) => ORDER[a.c] - ORDER[b.c] || (isNaN(a.v) || isNaN(b.v) ? String(a.v).localeCompare(String(b.v)) : a.v - b.v));

function gameView() {
  const v = ui.view, you = v.players.find((p) => p.id === me), turnName = v.players.find((p) => p.id === v.turn).name;
  const myTurn = v.turn === me && !v.winner, hand = sortHand(you.hand || []), legal = new Set(v.legal);
  const canDraw = myTurn && v.phase === 'play' && v.mustPlay == null && (v.pending > 0 || v.legal.length === 0);
  const showCoin = you.coin && !you.coinUsed && ((myTurn && v.phase === 'play') || (you.out && you.coin === 'mercy'));
  const roulette = v.phase === 'roulette' && myTurn;
  return `<main class="table">
    <div class="opps">${v.players.filter((p) => p.id !== me).map((p) => `<div class="opp ${p.id === v.turn ? 'turn' : ''} ${p.out ? 'out' : ''}"><b>${esc(p.name)}</b>${p.out ? 'Eliminado' : p.count + (p.count === 1 ? ' carta' : ' cartas')}${p.coin && !p.coinUsed ? ' · 🪙' : ''}${p.armed ? ' · ×2' : ''}</div>`).join('')}</div>
    <div class="center">
      <div class="status">
        <span class="badge ${myTurn ? '' : 'blue'}">${v.winner ? 'Fin' : myTurn ? 'Tu turno' : 'Turno de ' + esc(turnName)}</span>
        <span class="badge" title="Color en juego"><i class="ring ${v.color}"></i> ${COLOR_NAME[v.color]}</span>
        <span class="badge" title="Sentido">${v.dir > 0 ? '⟳' : '⟲'}</span>
        ${v.pending ? `<span class="badge pink">Sanción +${v.pending}</span>` : ''}
      </div>
      <div class="piles">
        <div class="pile"><button data-a="draw" ${canDraw ? '' : 'disabled'} aria-label="${v.pending ? 'Tomar ' + v.pending : 'Robar'}">${img('back', 'Pila para tomar')}</button><span class="n">${v.drawCount}</span></div>
        <div class="pile top">${img(imgKey(v.top), describe(v.top))}</div>
      </div>
      <div class="actions">
        ${canDraw ? `<button class="btn" data-a="draw">${v.pending ? 'Tomar ' + v.pending : 'Robar'}</button>` : ''}
        ${hand.length <= 2 && !you.out ? '<button class="btn outline" data-a="uno">¡UNO!</button>' : ''}
        ${v.catch && v.catch !== me ? '<button class="btn outline" data-a="catch">¡Atrapar sin UNO!</button>' : ''}
        ${showCoin ? `<button class="btn ghost" data-a="usecoin">${img('coin-' + you.coin, '', 'class="coin"')} Usar ${you.coin === 'mercy' ? 'Piedad' : 'Sin piedad'}</button>` : ''}
      </div>
    </div>
    <div class="mine">
      <div class="log" aria-live="polite">${[...v.log].reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="hand" role="list">${you.out ? '<p>Estás eliminado.</p>' : hand.map((c) => `<button role="listitem" class="${legal.has(c.id) && myTurn ? 'legal' : ''}" data-a="card" data-id="${c.id}" ${legal.has(c.id) && myTurn ? '' : 'disabled'} aria-label="${esc(describe(c))}">${img(imgKey(c), describe(c))}</button>`).join('')}</div>
    </div>
    ${ui.pick ? pickView(v) : ''}${roulette ? colorModal('Ruleta de color: elige un color', 'roulette') : ''}
    ${v.winner ? `<div class="overlay"><div class="modal"><h2>${esc(v.players.find((p) => p.id === v.winner).name)} gana</h2>
      ${host ? '<button class="btn" data-a="lobby">Volver a la sala</button>' : '<p>Esperando al anfitrión…</p>'}</div></div>` : ''}
  </main>`;
}

const colorModal = (title, a) => `<div class="overlay"><div class="modal"><h3>${title}</h3><div class="picks">${COLORS.map((c) => `<button class="pick ${c}" data-a="${a}" data-v="${c}">${COLOR_NAME[c]}</button>`).join('')}</div>${a === 'pick' ? '<button class="btn ghost sm" style="margin-top:16px" data-a="cancel">Cancelar</button>' : ''}</div></div>`;
function pickView(v) {
  if (ui.pick === 'target') {
    return `<div class="overlay"><div class="modal"><h3>Intercambiar mano con…</h3><div class="picks">${v.players.filter((p) => p.id !== me && !p.out).map((p) => `<button class="pick player" data-a="pick" data-v="${esc(p.id)}">${esc(p.name)} (${p.count})</button>`).join('')}</div><button class="btn ghost sm" style="margin-top:16px" data-a="cancel">Cancelar</button></div></div>`;
  }
  return colorModal(ui.pick === 'discardColor' ? '¿Qué color descartar de tu mano?' : '¿Con qué color sigue el juego?', 'pick');
}

/* ---------------- jugar carta ---------------- */
function startPlay(card) {
  const need = [];
  if (card.v === '7') need.push('target');
  if (card.v === 'discardall') need.push('discardColor');
  if (card.c === 'w') need.push('color');
  ui.play = { cardId: card.id, need };
  stepPlay();
}
function stepPlay() {
  const p = ui.play, k = p.need.find((n) => p[n] == null);
  if (k) { ui.pick = k; render(); return; }
  act({ type: 'play', cardId: p.cardId, color: p.color, discardColor: p.discardColor, target: p.target });
  ui.play = ui.pick = null; render();
}

/* ---------------- eventos ---------------- */
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, val = b.dataset.v;
  if (a === 'create') onCreate();
  else if (a === 'join') onJoin();
  else if (a === 'copy') { const url = location.origin + location.pathname + '#' + ui.lobby.code; try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { toast(url); } }
  else if (a === 'coin') { if (host) { host.players.find((p) => p.id === me).coin = val; pushLobby(); } else guest.send({ t: 'coin', side: val }); }
  else if (a === 'start') { host.game = createGame(host.players, host.opts); pushViews(); }
  else if (a === 'lobby') { host.game = null; pushLobby(); }
  else if (a === 'leave') { location.hash = ''; location.reload(); }
  else if (a === 'draw') act({ type: 'draw' });
  else if (a === 'uno') act({ type: 'uno' });
  else if (a === 'catch') act({ type: 'catch' });
  else if (a === 'usecoin') { if (confirm('¿Usar tu moneda ahora? Solo se puede una vez por partida.')) act({ type: 'coin' }); }
  else if (a === 'roulette') act({ type: 'roulette', color: val });
  else if (a === 'card') startPlay(ui.view.players.find((p) => p.id === me).hand.find((c) => c.id === +b.dataset.id));
  else if (a === 'pick') { ui.play[ui.pick] = val; ui.pick = null; stepPlay(); }
  else if (a === 'cancel') { ui.play = ui.pick = null; render(); }
});

const homeOpts = () => ({ decks: +$('decks').value, expansion: $('exp').checked, packs: +$('packs').value, coins: $('exp').checked && $('coins').checked });
app.addEventListener('change', (e) => {
  if (e.target.id === 'exp') { $('packs').disabled = $('coins').disabled = !e.target.checked; if (!e.target.checked) $('coins').checked = false; }
  if (['decks', 'exp', 'packs'].includes(e.target.id)) $('total').textContent = `Total: ${total(homeOpts())} cartas`;
});
app.addEventListener('input', (e) => { if (e.target.id === 'code') e.target.value = normCode(e.target.value); });

async function onCreate() {
  ui.name = $('n1').value.trim() || 'Anfitrión'; lsSet('uno-name', ui.name);
  const opts = homeOpts();
  ui.busy = true; ui.err = ''; render();
  try { await createRoom(ui.name, opts); } catch (e) { ui.err = errText(e); host = null; }
  ui.busy = false; if (ui.screen === 'home') render();
}
async function onJoin() {
  ui.name = $('n2').value.trim() || 'Jugador'; lsSet('uno-name', ui.name);
  const code = normCode($('code').value);
  if (code.length !== 5) { ui.err = 'El código tiene 5 caracteres.'; render(); return; }
  ui.busy = true; ui.err = ''; render();
  try { await joinGame(ui.name, code); } catch (e) { ui.err = errText(e); }
  ui.busy = false; if (ui.screen === 'home') render();
}

function render() {
  const scroll = app.querySelector('.hand')?.scrollLeft || 0;
  const focusId = document.activeElement?.id;
  const ids = ['n1', 'n2', 'code', 'decks', 'exp', 'packs', 'coins'];
  const keep = ui.screen === 'home' && $('decks') ? ids.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]) : [];
  app.innerHTML = ui.screen === 'lobby' ? lobbyView() : ui.screen === 'game' ? gameView() : homeView();
  keep.forEach(([id, v]) => { const el = $(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; });
  if (ui.screen === 'home') { $('packs').disabled = $('coins').disabled = !$('exp').checked; $('total').textContent = `Total: ${total(homeOpts())} cartas`; }
  const h = app.querySelector('.hand'); if (h) h.scrollLeft = scroll;
  if (focusId && $(focusId)) $(focusId).focus();
}
render();
