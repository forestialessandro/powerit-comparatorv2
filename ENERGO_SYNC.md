# Aggiorna da Energo — da iPhone

Il pulsante «Aggiorna da Energo» della Dashboard rent chiedeva un browser loggato su
`pit.energo.top` sulla stessa macchina: da iPhone non poteva funzionare. Qui il token di
sessione viene passato **una volta** al server, e da quel momento l'aggiornamento lo fa il
server — quindi funziona da qualunque dispositivo.

```
iPhone ──▶ /api/energo-sync ──▶ pit.energo.top/api  (token salvato lato server)
```

## Endpoint

| Rotta | Cosa fa |
|---|---|
| `POST /api/energo-token` | salva il token di sessione (`{token, oid}`) |
| `GET /api/energo-token` | stato: collegato, oid, scadenza |
| `DELETE /api/energo-token` | scollega |
| `GET /api/energo-sync` | dati freschi: `{cabs, ords, fetchedAt, meta}` (stessa forma di `sk_energo.json`) |
| `GET /api/energo-sync?raw=1` | un cabinet e un ordine grezzi, per verificare i nomi dei campi |

Tutte richiedono la chiave: header `x-pit-key` o `?k=…`.

## Configurazione (una volta)

Env var su Netlify (Site settings → Environment variables):

| Variabile | Obbligatoria | Note |
|---|---|---|
| `PIT_KEY` | sì | chiave privata inventata da te; senza, gli endpoint rispondono 500 |
| `ENERGO_OID` | no | oid di default (8938) se il bookmarklet non lo trova |
| `ENERGO_API_BASE` | no | default `https://pit.energo.top/api,https://backend.energo.vip/api`, provate in ordine |
| `ENERGO_TOKEN` | no | token incollato a mano: fallback se Netlify Blobs non è attivo |

## Uso

1. `/energo.html` — incolla la chiave, salva.
2. Trascina «⚡ Collega Energo» nella barra dei preferiti di Chrome; su una scheda
   `pit.energo.top` loggata, cliccalo. Il token arriva al server.
   Da iPhone: Comandi Rapidi → *Esegui JavaScript sulla pagina web* con lo stesso codice.
3. Da qui in poi il pulsante della dashboard chiama `/api/energo-sync` e basta.

Quando il token scade, la sync risponde `401 token_scaduto`: si rifà solo il passo 2.

## Aggancio nella Dashboard rent

```html
<script src="https://<sito>.netlify.app/energo-client.js"></script>
<button onclick="PIT.aggiornaDaEnergo(this)">🔄 Aggiorna da Energo</button>
```

`PIT.sync()` restituisce i dati grezzi se la dashboard preferisce gestirli da sé.
