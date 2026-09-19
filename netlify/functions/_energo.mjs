// Helper condivisi per le function Energo (token store + normalizzazione dati).

const STORE_NAME = 'energo';
const TOKEN_KEY = 'session';

// Basi API provate in ordine. La memoria di progetto riporta due varianti
// (backend.energo.vip storica, pit.energo.top/api dal 16/9): le proviamo entrambe.
export const API_BASES = (Netlify.env.get('ENERGO_API_BASE') || 'https://pit.energo.top/api,https://backend.energo.vip/api')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(methods = 'GET, POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, x-pit-key',
  };
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(), ...extra },
  });
}

// La chiave protegge gli endpoint: senza PIT_KEY configurata non si passa (fail closed).
export function checkKey(req) {
  const expected = Netlify.env.get('PIT_KEY');
  if (!expected) return { ok: false, res: json({ error: 'PIT_KEY non configurata nelle env var Netlify' }, 500) };
  const url = new URL(req.url);
  const given = req.headers.get('x-pit-key') || url.searchParams.get('k') || '';
  if (given !== expected) return { ok: false, res: json({ error: 'chiave non valida' }, 401) };
  return { ok: true };
}

async function blobStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch {
    return null; // dipendenza non installata: si usa solo il fallback env var
  }
}

export function normalizeToken(raw) {
  const t = (raw || '').trim();
  if (!t) return '';
  return /^bearer\s/i.test(t) ? t.replace(/^bearer\s+/i, 'Bearer ') : 'Bearer ' + t;
}

// exp del JWT, per dire nella UI quando scade senza dover interrogare Energo.
export function tokenExpiry(token) {
  try {
    const payload = token.replace(/^Bearer\s+/i, '').split('.')[1];
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return data.exp ? data.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function saveToken({ token, oid }) {
  const store = await blobStore();
  if (!store) throw new Error('storage non disponibile: installa @netlify/blobs o usa la env var ENERGO_TOKEN');
  const rec = { token: normalizeToken(token), oid: String(oid || Netlify.env.get('ENERGO_OID') || ''), savedAt: Date.now() };
  await store.setJSON(TOKEN_KEY, rec);
  return rec;
}

export async function clearToken() {
  const store = await blobStore();
  if (store) await store.delete(TOKEN_KEY);
}

export async function loadToken() {
  const store = await blobStore();
  if (store) {
    const rec = await store.get(TOKEN_KEY, { type: 'json' });
    if (rec && rec.token) return rec;
  }
  // Fallback: token incollato a mano nelle env var Netlify.
  const envToken = Netlify.env.get('ENERGO_TOKEN');
  if (envToken) {
    return { token: normalizeToken(envToken), oid: String(Netlify.env.get('ENERGO_OID') || ''), savedAt: null, source: 'env' };
  }
  return null;
}

// ---------------------------------------------------------------- chiamate API

export async function energoGet(path, { token, oid }) {
  let lastErr = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(base + path, {
        headers: {
          Authorization: token,
          oid: oid || '',
          language: 'en',
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // HTML o errore del proxy: proviamo la base successiva
        lastErr = new Error(base + path + ' → risposta non JSON (' + res.status + ')');
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        const err = new Error('token Energo scaduto o non valido');
        err.code = 'TOKEN_SCADUTO';
        throw err;
      }
      if (!res.ok) {
        lastErr = new Error(base + path + ' → HTTP ' + res.status);
        continue;
      }
      return { data, base };
    } catch (e) {
      if (e.code === 'TOKEN_SCADUTO') throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('nessuna base API raggiungibile');
}

// Le liste Energo arrivano come {content:[...]} (Spring) oppure {data:{records|list}}.
function rowsOf(data) {
  if (Array.isArray(data)) return data;
  for (const k of ['content', 'records', 'list', 'rows']) {
    if (Array.isArray(data?.[k])) return data[k];
    if (Array.isArray(data?.data?.[k])) return data.data[k];
  }
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export async function fetchAll(path, auth, { size = 200, maxPages = 20 } = {}) {
  const out = [];
  let base = null;
  for (let page = 0; page < maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const { data, base: b } = await energoGet(`${path}${sep}page=${page}&size=${size}`, auth);
    base = b;
    const rows = rowsOf(data);
    out.push(...rows);
    if (rows.length < size) break;
  }
  return { rows: out, base };
}

// ---------------------------------------------------------------- normalizzazione

const num = (...vals) => {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
};

const pick = (...vals) => {
  for (const v of vals) if (v !== null && v !== undefined && v !== '' && v !== 'None') return v;
  return '';
};

// starttime/returnTime arrivano come epoch ms, epoch s o stringa data: sempre ms.
const ms = (v) => {
  if (v === null || v === undefined || v === '' || v === 'None' || v === 0) return 0;
  if (typeof v === 'number') return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  const n = Number(v);
  if (!Number.isNaN(n) && String(v).trim() !== '') return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  const d = Date.parse(String(v).replace(' ', 'T'));
  return Number.isNaN(d) ? 0 : d;
};

// PITT062606000001 → S06 · PITH482606000075 → S48
function tipoDaSeriale(id) {
  const m = String(id || '').match(/^PIT.(\d{2})/);
  return m ? 'S' + m[1] : '';
}

function tariffaDa(cab) {
  const p = cab.policyInfo?.appPolicy || cab.policyInfo || {};
  return {
    amt: num(p.price, p.amount, p.perPrice, cab.price),
    min: num(p.billingtime, p.billingTime, p.time),
    unit: num(p.billingunit, p.billingUnit, p.unit),
    cap: num(p.dayMaxPrice, p.maxPrice, p.cap),
    dep: num(p.deposit, p.depositAmount),
    free: num(p.freeTime, p.free),
    cur: pick(p.currencySymbol, cab.currencySymbol, '€'),
    src: p === cab.policyInfo?.appPolicy ? 'venue' : 'cabinet',
  };
}

export function normCabinet(cab) {
  const id = pick(cab.cabinetId, cab.cabinetid, cab.sn, cab.id);
  return {
    id,
    tipo: tipoDaSeriale(id),
    online: num(cab.isOnline, cab.online),
    sid: num(cab.sid),
    shop: pick(cab.shopName, ''),
    sub: pick(cab.subAddress, ''),
    addr: pick(cab.shopAddr, cab.address, ''),
    batt: num(cab.batteryNum),
    slots: num(cab.devicenum, cab.deviceNum, cab.slotNum),
    rent: num(cab.positionInfo?.rentNum, cab.rentNum),
    err: num(cab.slotErrNum),
    tariffa: tariffaDa(cab),
    bind: ms(cab.bindVenueTime),
  };
}

export function normOrder(o) {
  return {
    no: pick(o.orderNo, o.orderno, o.id),
    t: ms(pick(o.starttime, o.startTime, o.createTime)),
    rt: ms(pick(o.returnTime, o.returntime, o.endtime, o.endTime)),
    cab: pick(o.cabinetid, o.cabinetId),
    shop: pick(o.shopName, ''),
    pay: num(o.realAmount, o.totalPay, o.amount),
    pm: pick(o.payMethodName, o.payType, ''),
    dep: num(o.deposit, o.authAmount, o.prepAmount),
    st: num(o.status),
    sid: num(o.sid),
  };
}
