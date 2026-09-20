// È quello che sta dietro al pulsante "Aggiorna da Energo" della Dashboard rent.
// Interroga Energo lato server (niente CORS, niente browser loggato) e restituisce
// i dati nella stessa forma di sk_energo.json:
//
//   { cabs:[...], ords:[...], fetchedAt: <ms>, meta:{...} }
//
// Energo chiude la sessione appena l'account entra da un'altra parte: quando il
// token è morto NON si risponde con un errore, si restituisce l'ultima fotografia
// riuscita con stale:true e la sua data. Il telefono mostra sempre qualcosa.
//
//   GET /api/energo-sync?k=...            → dati (freschi, o ultimi buoni)
//   GET /api/energo-sync?k=...&raw=1      → risposta grezza Energo (per verificare i campi)
//   GET /api/energo-sync?k=...&live=1     → solo dati freschi: errore se il token è morto

import {
  json, corsHeaders, checkKey, loadToken, fetchAll,
  normCabinet, normOrder, tokenExpiry, saveSnapshot, loadSnapshot,
} from './_energo.mjs';

// L'ultima fotografia buona, marcata come tale.
async function fallback(motivo) {
  const snap = await loadSnapshot();
  if (!snap) {
    return json(
      { error: motivo, rimedio: 'ricollega la sessione Energo da /energo.html', stale: true, cabs: [], ords: [] },
      motivo === 'token_scaduto' ? 401 : 428
    );
  }
  return json({
    ...snap,
    stale: true,
    staleMotivo: motivo,
    meta: { ...snap.meta, eta: Date.now() - snap.fetchedAt },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders() });

  const key = await checkKey(req);
  if (!key.ok) return key.res;

  const url = new URL(req.url);
  const raw = url.searchParams.get('raw') === '1';
  const live = url.searchParams.get('live') === '1';
  const ordSize = Math.min(Number(url.searchParams.get('ordini') || 500), 1000);

  const rec = await loadToken();
  if (!rec) return live ? json({ error: 'nessun token collegato' }, 428) : fallback('nessun_token');

  const auth = { token: rec.token, oid: rec.oid };

  try {
    const [cabinets, orders] = await Promise.all([
      fetchAll('/cabinet', auth, { size: 200 }),
      fetchAll('/order?sort=createTime,desc', auth, { size: ordSize, maxPages: 5 }),
    ]);

    if (raw) {
      return json({
        base: cabinets.base,
        cabinetEsempio: cabinets.rows[0] || null,
        ordineEsempio: orders.rows[0] || null,
        conteggi: { cabinet: cabinets.rows.length, ordini: orders.rows.length },
      });
    }

    const cabs = cabinets.rows.map(normCabinet).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const ords = orders.rows.map(normOrder).sort((a, b) => b.t - a.t);
    const exp = tokenExpiry(rec.token);

    const snap = {
      cabs,
      ords,
      fetchedAt: Date.now(),
      meta: {
        base: cabinets.base,
        macchine: cabs.length,
        noleggi: ords.length,
        incassoTotale: Number(ords.reduce((s, o) => s + o.pay, 0).toFixed(2)),
        tokenScadeIl: exp ? new Date(exp).toISOString() : null,
        fonte: 'energo',
      },
    };
    await saveSnapshot(snap);
    return json({ ...snap, stale: false });
  } catch (e) {
    const motivo = e.code === 'TOKEN_SCADUTO' ? 'token_scaduto' : 'energo_irraggiungibile';
    if (live) return json({ error: motivo, messaggio: e.message }, motivo === 'token_scaduto' ? 401 : 502);
    return fallback(motivo);
  }
};

export const config = {
  path: '/api/energo-sync',
};
