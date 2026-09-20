// Il Mac carica qui la fotografia che già scarica ogni 15 minuti.
//
// Serve perché la sessione Energo può morire in qualsiasi momento (l'account
// viene espulso quando entra da un'altra parte): con questa via il telefono
// legge l'ultimo dato buono anche quando il token è morto, e senza che il
// server debba parlare con Energo.
//
//   POST /api/energo-data  {cabs:[...], ords:[...], fetchedAt?}   → salva
//   GET  /api/energo-data                                        → età dell'ultimo dato
//
// Stesso formato di ~/skynet-data/energo.json: si può inviare il file così com'è.

import { json, corsHeaders, checkKey, saveSnapshot, loadSnapshot } from './_energo.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders('GET, POST, OPTIONS') });

  const key = await checkKey(req);
  if (!key.ok) return key.res;

  if (req.method === 'GET') {
    const snap = await loadSnapshot();
    if (!snap) return json({ presente: false });
    return json({
      presente: true,
      fetchedAt: new Date(snap.fetchedAt).toISOString(),
      etaMinuti: Math.round((Date.now() - snap.fetchedAt) / 60000),
      meta: snap.meta || null,
    });
  }

  if (req.method !== 'POST') return json({ error: 'metodo non consentito' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'body non valido: ' + e.message }, 400);
  }

  const cabs = body.cabs;
  const ords = body.ords;
  if (!Array.isArray(cabs) || !Array.isArray(ords)) {
    return json({ error: 'servono cabs[] e ords[] (il formato di energo.json)' }, 400);
  }
  if (!cabs.length && !ords.length) return json({ error: 'fotografia vuota: non la salvo' }, 400);

  const fetchedAt = Number(body.fetchedAt) || Date.now();
  const incasso = ords.reduce((s, o) => s + (Number(o.pay) || 0), 0);

  const snap = {
    cabs,
    ords,
    fetchedAt,
    meta: {
      macchine: cabs.length,
      noleggi: ords.length,
      incassoTotale: Number(incasso.toFixed(2)),
      fonte: 'mac',
    },
  };

  if (!(await saveSnapshot(snap))) return json({ error: 'storage non disponibile' }, 500);
  return json({ ok: true, macchine: cabs.length, noleggi: ords.length });
};

export const config = {
  path: '/api/energo-data',
};
