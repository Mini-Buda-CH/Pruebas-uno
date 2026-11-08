const PREFIX = 'unomercy-nm-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const normCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

export function playerId() {
  try {
    let t = sessionStorage.getItem('uno-id');
    if (!t) { t = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('uno-id', t); }
    return t;
  } catch { return Math.random().toString(36).slice(2, 10); }
}

export function openHost(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code);
    const conns = new Map(); 
    peer.on('error', (e) => reject(e));
    peer.on('open', () => resolve({
      send: (pid, msg) => { const c = conns.get(pid); if (c && c.open) c.send(msg); },
      close: () => peer.destroy(),
    }));
    peer.on('connection', (conn) => {
      let pid = null;
      conn.on('data', (msg) => {
        if (!pid) {
          if (msg.t !== 'join' || !msg.id) return;
          pid = msg.id; conns.set(pid, conn); h.onJoin(pid, msg);
        } else h.onData(pid, msg);
      });
      conn.on('close', () => { if (pid && conns.get(pid) === conn) { conns.delete(pid); h.onClose(pid); } });
    });
  });
}

export function joinRoom(code, id, name, h) {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 10000);
    peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        clearTimeout(timer);
        conn.send({ t: 'join', id, name });
        resolve({ send: (m) => conn.open && conn.send(m) });
      });
      conn.on('data', h.onData);
      conn.on('close', h.onClose);
    });
  });
}
