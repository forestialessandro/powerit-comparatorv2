// È quello che sta dietro al pulsante "Aggiorna da Energo" della Dashboard rent.
// Legge il token salvato, interroga Energo lato server (niente CORS, niente browser
// loggato) e restituisce i dati nella stessa forma di sk_energo.json:
//
//   { cabs:[...], ords:[...], fetchedAt: <ms>, meta:{...} }
//
//   GET /api/energo-sync?k=...            → dati normalizzati
//   GET /api/energo-sync?k=...&raw=1      → risposta grezza Energo (per verificare i campi)

import { json, corsHeaders, checkKey, loadToken, fetchAll, normCabinet, normOrder, tokenExpiry } from './_energo.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders() });

  const key = await checkKey(req);
  if (!key.ok) return key.res;

  const url = new URL(req.url);
  const raw = url.searchParams.get('raw') === '1';
  const ordSize = Math.min(Number(url.searchParams.get('ordini') || 500), 1000);

  const rec = await loadToken();
  if (!rec) {
    return json({ error: 'nessun token Energo collegato', rimedio: 'apri /energo.html e ricollega la sessione' }, 428);
  }

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

    return json({
      cabs,
      ords,
      fetchedAt: Date.now(),
      meta: {
        base: cabinets.base,
        macchine: cabs.length,
        noleggi: ords.length,
        incassoTotale: Number(ords.reduce((s, o) => s + o.pay, 0).toFixed(2)),
        tokenScadeIl: exp ? new Date(exp).toISOString() : null,
      },
    });
  } catch (e) {
    if (e.code === 'TOKEN_SCADUTO') {
      return json(
        { error: 'token_scaduto', messaggio: 'La sessione Energo è scaduta.', rimedio: 'apri /energo.html dal Mac loggato su pit.energo.top e ricollega' },
        401
      );
    }
    return json({ error: 'sync fallita: ' + e.message }, 502);
  }
};

export const config = {
  path: '/api/energo-sync',
};
