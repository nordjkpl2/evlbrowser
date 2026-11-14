// Favoritos (a estrela da barra de endereço), salvos em bookmarks.json.
// Não depende do Electron: dá para testar com `npm test`.
// Um favorito é uma PÁGINA (endereço exato, sem o #trecho), diferente do histórico, que guarda sites.
// Carrega só na primeira vez que precisa e grava no máximo uma vez a cada `delay` ms.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_ITEMS = 2000;

// Endereço sem o "#trecho"; null se não for http/https.
function keyOf(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function createBookmarks(file, { delay = 1500 } = {}) {
  let items = null; // [{ id, url, title, time }], o mais novo primeiro
  let timer = null;

  function load() {
    if (items) return items;
    items = [];
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const seen = new Set(); // evita O(n²) ao carregar: checar duplicados numa lista cresce rápido
      for (const i of Array.isArray(data) ? data : []) {
        const url = i && typeof i.url === 'string' ? keyOf(i.url) : null;
        if (url && !seen.has(url)) {
          seen.add(url);
          items.push({ id: String(i.id || crypto.randomBytes(6).toString('hex')), url, title: String(i.title || url), time: Number(i.time) || 0 });
        }
      }
    } catch {
      // sem arquivo (ou quebrado): começa vazio
    }
    return items;
  }

  function save() {
    clearTimeout(timer);
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(items));
    } catch {
      // sem permissão: vale só até fechar o app
    }
  }
  function later() {
    if (timer) return;
    timer = setTimeout(save, delay);
    timer.unref?.();
  }

  return {
    list: () => load().slice(),
    has: (url) => {
      const key = keyOf(url);
      return !!key && load().some((i) => i.url === key);
    },
    // Favorita a página (ou atualiza o título). Devolve false se não for uma página http(s).
    add(url, title) {
      const key = keyOf(url);
      if (!key) return false;
      const list = load();
      const old = list.findIndex((i) => i.url === key);
      if (old !== -1) list.splice(old, 1);
      list.unshift({ id: crypto.randomBytes(6).toString('hex'), url: key, title: String(title || key).slice(0, 200), time: Date.now() });
      if (list.length > MAX_ITEMS) list.length = MAX_ITEMS;
      later();
      return true;
    },
    // Clicou na estrela: favorita ou desfavorita. Devolve true se ficou favoritada.
    toggle(url, title) {
      if (this.has(url)) {
        this.removeUrl(url);
        return false;
      }
      return this.add(url, title);
    },
    remove(id) {
      const list = load();
      const i = list.findIndex((x) => x.id === id);
      if (i === -1) return false;
      list.splice(i, 1);
      later();
      return true;
    },
    removeUrl(url) {
      const key = keyOf(url);
      const list = load();
      const i = list.findIndex((x) => x.url === key);
      if (i === -1) return false;
      list.splice(i, 1);
      later();
      return true;
    },
    // Sugestões para a barra de endereço: o texto aparece no título ou no endereço (aceita espaços).
    suggest(query, n = 3) {
      const q = String(query).trim().toLowerCase();
      if (!q) return [];
      const out = [];
      for (const i of load()) {
        if (i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)) {
          out.push({ url: i.url, host: new URL(i.url).host.replace(/^www\./, ''), title: i.title, star: true });
          if (out.length === n) break;
        }
      }
      return out;
    },
    flush() {
      if (timer) save();
    },
  };
}

module.exports = { createBookmarks, keyOf };
