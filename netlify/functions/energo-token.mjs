// Riceve e conserva il token di sessione Energo, per permettere alla Dashboard
// rent di aggiornarsi da qualunque dispositivo (iPhone incluso) senza browser loggato.
//
//   GET    /api/energo-token?k=...            → stato (non restituisce mai il token)
//   POST   /api/energo-token  {token, oid}    → salva
//   DELETE /api/energo-token?k=...            → cancella

import { json, corsHeaders, checkKey, saveToken, clearToken, loadToken, tokenExpiry } from './_energo.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders('GET, POST, DELETE, OPTIONS') });

  const key = await checkKey(req);
  if (!key.ok) return key.res;

  if (req.method === 'GET') {
    const rec = await loadToken();
    if (!rec) return json({ collegato: false });
    const exp = tokenExpiry(rec.token);
    return json({
      collegato: true,
      oid: rec.oid || null,
      salvatoIl: rec.savedAt ? new Date(rec.savedAt).toISOString() : null,
      scadeIl: exp ? new Date(exp).toISOString() : null,
      scaduto: exp ? exp < Date.now() : null,
      fonte: rec.source || 'blobs',
    });
  }

  if (req.method === 'DELETE') {
    await clearToken();
    return json({ ok: true, collegato: false });
  }

  if (req.method !== 'POST') return json({ error: 'metodo non consentito' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'body non valido: ' + e.message }, 400);
  }

  const token = (body.token || '').trim();
  if (!token) return json({ error: 'token mancante' }, 400);
  if (!/\.[A-Za-z0-9_-]+\./.test(token)) return json({ error: 'non sembra un JWT Energo' }, 400);

  try {
    const rec = await saveToken({ token, oid: body.oid });
    const exp = tokenExpiry(rec.token);
    return json({
      ok: true,
      collegato: true,
      oid: rec.oid || null,
      scadeIl: exp ? new Date(exp).toISOString() : null,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = {
  path: '/api/energo-token',
};
