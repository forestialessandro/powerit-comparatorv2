/* Client per il pulsante "Aggiorna da Energo" della Dashboard rent.
 *
 * Nella dashboard (POWERIT_DASHBOARD_NOLEGGI.html) basta:
 *   <script src="https://<sito>.netlify.app/energo-client.js"></script>
 * e poi, sul pulsante:
 *   onclick="PIT.aggiornaDaEnergo()"
 *
 * Il server fa la chiamata a Energo: niente CORS, niente sessione nel browser,
 * funziona identico da Mac, iPhone e PWA in home screen.
 */
(function (global) {
  var BASE = (global.PIT_BASE || 'https://powerit-comparatorv2.netlify.app').replace(/\/$/, '');
  var LS_KEY = 'pit_key';

  function chiave() {
    var k = '';
    try { k = localStorage.getItem(LS_KEY) || ''; } catch (e) {}
    if (!k) {
      k = (prompt('Chiave POWER-IT (una volta sola su questo dispositivo):') || '').trim();
      if (k) { try { localStorage.setItem(LS_KEY, k); } catch (e) {} }
    }
    return k;
  }

  function url(path, extra) {
    return BASE + path + '?k=' + encodeURIComponent(chiave()) + (extra ? '&' + extra : '');
  }

  /* Scarica i dati freschi. Ritorna {cabs, ords, fetchedAt, meta}. */
  function sync(opts) {
    opts = opts || {};
    return fetch(url('/api/energo-sync', opts.ordini ? 'ordini=' + opts.ordini : ''))
      .then(function (r) {
        return r.json().then(function (d) {
          if (r.ok) return d;
          if (d.error === 'token_scaduto') {
            throw new Error('Sessione Energo scaduta. Apri ' + BASE + '/energo.html dal Mac loggato e ricollega.');
          }
          if (r.status === 428) {
            throw new Error('Energo non collegato. Apri ' + BASE + '/energo.html e collega la sessione.');
          }
          throw new Error(d.error || ('HTTP ' + r.status));
        });
      });
  }

  /* Stato del collegamento (senza scaricare i dati). */
  function stato() {
    return fetch(url('/api/energo-token')).then(function (r) { return r.json(); });
  }

  /* Handler pronto per il pulsante: aggiorna DATA/window.__DATA e ridisegna. */
  function aggiornaDaEnergo(btn) {
    btn = btn || (typeof event !== 'undefined' && event && event.currentTarget) || null;
    var testo = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Aggiorno…'; }

    return sync()
      .then(function (d) {
        // Aggancio ai nomi usati dalla dashboard, senza rompere quelli che non esistono.
        if (global.DATA) { global.DATA.cabs = d.cabs; global.DATA.ords = d.ords; global.DATA.fetchedAt = d.fetchedAt; }
        global.__DATA = d;
        if (typeof global.render === 'function') global.render();
        else if (typeof global.rebuild === 'function') global.rebuild();
        if (btn) btn.textContent = '✓ ' + d.meta.macchine + ' macchine · ' + d.meta.noleggi + ' noleggi';
        return d;
      })
      .catch(function (e) {
        if (btn) btn.textContent = '✗ errore';
        alert(e.message);
        throw e;
      })
      .finally(function () {
        if (btn) setTimeout(function () { btn.disabled = false; btn.textContent = testo; }, 3000);
      });
  }

  global.PIT = Object.assign(global.PIT || {}, { base: BASE, sync: sync, stato: stato, aggiornaDaEnergo: aggiornaDaEnergo });
})(window);
