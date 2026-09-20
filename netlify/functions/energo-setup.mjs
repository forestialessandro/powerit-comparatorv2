// Inizializzazione senza passare dal pannello Netlify: la prima apertura di
// /energo.html genera una chiave privata nel browser e la rivendica qui.
// Una volta rivendicata non è più sostituibile da questo endpoint.
//
//   GET  /api/energo-setup            → { inizializzato, fonte }
//   POST /api/energo-setup {key}      → rivendica (409 se già fatto)

import { json, corsHeaders, getApiKey, claimApiKey } from './_energo.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders() });

  if (req.method === 'GET') {
    const cur = await getApiKey();
    return json({
      inizializzato: Boolean(cur.key),
      fonte: cur.fonte,
      dal: cur.claimedAt ? new Date(cur.claimedAt).toISOString() : null,
    });
  }

  if (req.method !== 'POST') return json({ error: 'metodo non consentito' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'body non valido: ' + e.message }, 400);
  }

  const key = (body.key || '').trim();
  if (key.length < 24) return json({ error: 'chiave troppo corta (min 24 caratteri)' }, 400);

  const res = await claimApiKey(key);
  if (!res.ok) return json({ error: res.motivo, fonte: res.fonte }, res.motivo === 'già inizializzato' ? 409 : 500);
  return json({ ok: true, inizializzato: true });
};

export const config = {
  path: '/api/energo-setup',
};
