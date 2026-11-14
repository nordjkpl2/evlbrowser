// Favoritos (a estrela da barra de endereço), salvos em bookmarks.json.
// Não depende do Electron: dá para testar com `npm test`.
// Um favorito é uma PÁGINA (endereço exato, sem o #trecho), diferente do histórico, que guarda sites.
// Carrega só na primeira vez que precisa e grava no máximo uma vez a cada `delay` ms.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_ITEMS = 2000;
const MAX_IMPORT = 20000; // lidos de um .json, no máximo

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
  // Um Map só: a ORDEM DE INSERÇÃO é a recência (o primeiro é o mais antigo, o último o mais novo).
  // Favoritar, desfavoritar e despejar o mais antigo são O(1): não há splice, nem reindexação.
  let byUrl = null; // url -> { id, url, title, time }
  let byId = null; // id -> item (o mesmo objeto de byUrl)
  let timer = null;

  function load() {
    if (byUrl) return byUrl;
    byUrl = new Map();
    byId = new Map();
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      // O arquivo está do mais novo para o mais antigo; o primeiro duplicado (o mais novo) vence.
      const rows = [];
      const seen = new Set(); // evita O(n²) ao carregar
      for (const i of Array.isArray(data) ? data : []) {
        const url = i && typeof i.url === 'string' ? keyOf(i.url) : null;
        if (url && !seen.has(url)) {
          seen.add(url);
          rows.push({ id: String(i.id || crypto.randomBytes(6).toString('hex')), url, title: String(i.title || url), time: Number(i.time) || 0 });
        }
      }
      // Insere do mais antigo para o mais novo, para a ordem do Map ficar certa.
      for (let k = rows.length - 1; k >= 0; k--) {
        byUrl.set(rows[k].url, rows[k]);
        byId.set(rows[k].id, rows[k]);
      }
    } catch {
      // sem arquivo (ou quebrado): começa vazio
    }
    return byUrl;
  }

  // Lista do mais novo para o mais antigo (cópia do array; os itens são os mesmos objetos).
  function newestFirst() {
    return [...load().values()].reverse();
  }

  function drop(item) {
    byUrl.delete(item.url);
    byId.delete(item.id);
  }

  function save() {
    clearTimeout(timer);
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(newestFirst()));
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
    list: () => newestFirst(),
    has: (url) => {
      const key = keyOf(url);
      load();
      return !!key && byUrl.has(key);
    },
    // Favorita a página (ou atualiza o título). Devolve false se não for uma página http(s).
    add(url, title) {
      const key = keyOf(url);
      if (!key) return false;
      const map = load();
      const old = map.get(key);
      if (old) drop(old); // sai da posição antiga; volta para o topo (fim do Map)
      const item = { id: crypto.randomBytes(6).toString('hex'), url: key, title: String(title || key).slice(0, 200), time: Date.now() };
      map.set(key, item);
      byId.set(item.id, item);
      while (map.size > MAX_ITEMS) drop(map.values().next().value); // despeja o mais antigo
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
      load();
      const item = byId.get(id);
      if (!item) return false;
      drop(item);
      later();
      return true;
    },
    removeUrl(url) {
      const key = keyOf(url);
      load();
      const item = key ? byUrl.get(key) : undefined;
      if (!item) return false;
      drop(item);
      later();
      return true;
    },
    // Sugestões para a barra de endereço: o texto aparece no título ou no endereço (aceita espaços).
    suggest(query, n = 3) {
      const q = String(query).trim().toLowerCase();
      if (!q) return [];
      const out = [];
      for (const i of newestFirst()) {
        if (i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)) {
          out.push({ url: i.url, host: new URL(i.url).host.replace(/^www\./, ''), title: i.title, star: true });
          if (out.length === n) break;
        }
      }
      return out;
    },
    // Importa um .json: aceita a lista deste app ([{url,title}]) e a árvore do Chrome (roots > children).
    // Também aceita o backup do Firefox (bookmarks-*.json): o endereço vem em "uri" e as pastas em "children".
    // Pega qualquer objeto com "url" ou "uri" http(s) em qualquer nível. Páginas já favoritas são ignoradas.
    importJson(text) {
      const found = [];
      const seenUrl = new Set();
      const walk = (node, depth) => {
        if (depth > 50 || found.length > MAX_IMPORT) return;
        if (Array.isArray(node)) {
          for (const v of node) walk(v, depth + 1);
        } else if (node && typeof node === 'object') {
          const raw = typeof node.url === 'string' ? node.url : node.uri;
          if (typeof raw === 'string') {
            const key = keyOf(raw);
            if (key && !seenUrl.has(key)) {
              seenUrl.add(key);
              found.push({ url: key, title: String(node.title || node.name || '').trim().slice(0, 200) || key });
            }
          }
          for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, depth + 1);
        }
      };
      walk(JSON.parse(text), 0);
      const has = load();
      let added = 0;
      let skipped = 0;
      // Do fim para o início: o primeiro item do arquivo fica no topo, como nos favoritos feitos à mão.
      for (let k = found.length - 1; k >= 0; k--) {
        if (has.has(found[k].url)) {
          skipped++;
          continue;
        }
        this.add(found[k].url, found[k].title);
        added++;
      }
      return { lidas: found.length, adicionados: added, ignorados: skipped };
    },
    flush() {
      if (timer) save();
    },
  };
}

module.exports = { createBookmarks, keyOf };
