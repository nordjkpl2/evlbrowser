// Bloqueador de anúncios: decide se um pedido de rede deve ser cancelado.
// Não depende do Electron (dá para testar com `npm test`). Quem liga isto à rede é o main.js
// (webRequest.onBeforeRequest) e só enquanto o bloqueador está ligado, então desligado custa zero.
//
// Regras: (1) o domínio do pedido (ou um domínio pai dele) está na lista; (2) o endereço bate
// com uma regra de trecho. A página principal NUNCA é bloqueada, e um site não é bloqueado
// por pedidos ao próprio domínio (abrir doubleclick.net continua funcionando).

const { BLOCK_DOMAINS, BLOCK_PATHS } = require('./adblock_lists');

function createAdblock({ domains = BLOCK_DOMAINS, paths = BLOCK_PATHS } = {}) {
  const set = new Set(domains);
  let blocked = 0;

  // "a.b.doubleclick.net" -> "doubleclick.net" (o domínio da lista que bate), ou null.
  function listed(host) {
    for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
      if (set.has(h)) return h;
    }
    return null;
  }

  const hostOf = (url) => {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return '';
    }
  };

  return {
    // url: endereço pedido; type: tipo do recurso do Electron; pageUrl: página que pediu (referrer).
    shouldBlock(url, type, pageUrl = '') {
      if (type === 'mainFrame') return false;
      let u;
      try {
        u = new URL(url);
      } catch {
        return false;
      }
      const host = u.host.toLowerCase();
      const page = hostOf(pageUrl);

      const entry = listed(host);
      if (entry && entry !== (page && listed(page))) return true;

      for (const [domain, part] of paths) {
        if ((host === domain || host.endsWith(`.${domain}`)) && u.pathname.includes(part)) {
          return true;
        }
      }
      return false;
    },
    // Chamado pelo main.js a cada pedido: conta o que foi bloqueado.
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
