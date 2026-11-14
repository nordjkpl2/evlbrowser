// Bloqueador de anúncios: decide se um pedido de rede deve ser cancelado.
// Não depende do Electron (dá para testar com `npm test`). Quem liga isto à rede é o
// src/network/network_hub.js (webRequest.onBeforeRequest), só enquanto o bloqueador está ligado.
//
// Regras, da mais barata para a mais cara:
//   1) domínio do pedido (ou um domínio pai) na lista;
//   2) pedido "ping" (sendBeacon) de terceiro;
//   3) só para TERCEIROS: subdomínio com cara de anúncio (ads.x.com) e trechos típicos (/adserver...);
//   4) regras de trecho por site (ex.: anúncios do YouTube, que moram no mesmo domínio).
// A página principal NUNCA é bloqueada; sites da lista de permitidos nunca são afetados.
// O resultado por domínio fica em cache: a maioria dos pedidos é repetida e custa uma consulta num Map.

const { BLOCK_DOMAINS, BLOCK_PATHS, BLOCK_LABELS, BLOCK_THIRD_PARTY_PATHS } = require('./adblock_lists');
const { siteOf, hostOf, splitUrl } = require('./privacy_engine');

const CACHE_MAX = 4000;

function createAdblock({ domains = BLOCK_DOMAINS, paths = BLOCK_PATHS } = {}) {
  const set = new Set(domains);
  let allow = new Set(); // sites onde o bloqueador fica desligado
  let blocked = 0;
  const hostCache = new Map(); // host -> domínio da lista que bateu (ou '')
  let lastPageUrl = null; // último pageUrl analisado e o host dele (cache de uma entrada)
  let lastPageHost = '';

  // "a.b.doubleclick.net" -> "doubleclick.net" (o domínio da lista que bate), ou ''.
  function listed(host) {
    const hit = hostCache.get(host);
    if (hit !== undefined) return hit;
    let found = '';
    for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
      if (set.has(h)) {
        found = h;
        break;
      }
    }
    if (hostCache.size >= CACHE_MAX) hostCache.clear();
    hostCache.set(host, found);
    return found;
  }

  const allowed = (pageHost) => {
    if (!pageHost || allow.size === 0) return false;
    for (let h = pageHost; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (allow.has(h)) return true;
    return allow.has(pageHost);
  };

  return {
    // Sites onde não bloquear (ex.: ["exemplo.com"]; vale para subdomínios também).
    setAllow(list) {
      allow = new Set((list ?? []).map((x) => String(x).toLowerCase()));
    },
    allowedHost: (host) => allowed(String(host).toLowerCase()),

    // url: endereço pedido; type: tipo do recurso do Electron; pageUrl: página que pediu (referrer).
    shouldBlock(url, type, pageUrl = '') {
      if (type === 'mainFrame') return false;
      const u = splitUrl(url); // rápido: sem new URL a cada pedido
      if (!u) return false;
      const host = u.host;
      // Quase todos os pedidos de uma página trazem o mesmo pageUrl: guardamos só o último host.
      if (pageUrl !== lastPageUrl) {
        lastPageUrl = pageUrl;
        lastPageHost = hostOf(pageUrl);
      }
      const pageHost = lastPageHost;
      if (allowed(pageHost)) return false;

      // 1) lista de domínios (menos quando você está no próprio domínio da lista)
      const entry = listed(host);
      if (entry && entry !== (pageHost && listed(pageHost))) return true;

      const thirdParty = !!pageHost && siteOf(host) !== siteOf(pageHost);
      if (thirdParty) {
        // 2) beacons de terceiros
        if (type === 'ping') return true;
        // 3) cara de anúncio
        if (BLOCK_LABELS.has(host.slice(0, host.indexOf('.')))) return true;
        for (const part of BLOCK_THIRD_PARTY_PATHS) if (u.where.includes(part)) return true;
      }

      // 4) anúncios no mesmo domínio do site
      for (const [domain, part] of paths) {
        if ((host === domain || host.endsWith(`.${domain}`)) && u.where.includes(part)) return true;
      }
      return false;
    },
    // Chamado a cada pedido: conta o que foi bloqueado.
    check(url, type, pageUrl) {
      const block = this.shouldBlock(url, type, pageUrl);
      if (block) blocked++;
      return block;
    },
    get blocked() {
      return blocked;
    },
    reset() {
      blocked = 0;
    },
  };
}

module.exports = { createAdblock };
