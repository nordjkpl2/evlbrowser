// Histórico de SITES visitados, salvo em um JSON simples (history.json).
// Não depende do Electron, então dá para testar só com `npm test`.
//
// Guarda um item por site (não por página): youtube.com/watch?v=... e
// youtube.com/feed viram uma entrada só, "youtube.com". Subdomínios de verdade
// (dashboard.youtube.com, studio.youtube.com...) continuam sendo entradas próprias;
// "www." e as versões de celular ("m.", "mobile.", "amp.") contam como o site principal.
// A URL exata de cada aba fica na SESSÃO (para reabrir as abas), não aqui.
//
// Leve em RAM e disco: no máximo `max` entradas, carregado só na primeira visita e
// gravado no máximo uma vez a cada `delay` ms (nunca há timer parado).

const fs = require('fs');
const path = require('path');

// Endereço -> { key: nome do site, url: página inicial do site } (ou null se não for http/https).
function site(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.host.toLowerCase().replace(/^(m|mobile|amp)\./, '');
  return { key: host.replace(/^www\./, ''), url: `${u.protocol}//${host}/` };
}

function createHistory(file, { max = 500, delay = 3000 } = {}) {
  let items = null; // [{ url, host, title, time }], o mais recente primeiro
  let timer = null;

  function load() {
    if (items) return items;
    items = [];
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Também aceita o formato antigo (uma entrada por página): vira um por site.
      for (const i of Array.isArray(data) ? data : []) {
        const s = i && typeof i.url === 'string' && typeof i.time === 'number' ? site(i.url) : null;
        if (s && !items.some((x) => x.host === s.key)) {
          items.push({ url: s.url, host: s.key, title: String(i.title || s.key), time: i.time });
        }
      }
    } catch {
      // arquivo não existe ou está quebrado: começa vazio
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
      // sem permissão de escrita: o histórico vale só até fechar o app
    }
  }

  function later() {
    if (timer) return;
    timer = setTimeout(save, delay);
    timer.unref?.();
  }

  return {
    // Visita: o site sobe para o topo (sem repetir). `title` é o da última página vista.
    add(url, title) {
      const s = site(url);
      if (!s) return;
      const list = load();
      const old = list.findIndex((i) => i.host === s.key);
      const prev = old === -1 ? null : list.splice(old, 1)[0];
      list.unshift({ url: s.url, host: s.key, title: title || prev?.title || s.key, time: Date.now() });
      if (list.length > max) list.length = max;
      later();
    },
    // O título chega depois da navegação: atualiza o do site, se ele estiver na lista.
    setTitle(url, title) {
      const s = site(url);
      if (!s || !title || !items) return;
      const item = items.find((i) => i.host === s.key);
      if (item && item.title !== title) {
        item.title = title;
        later();
      }
    },
    // Sugestões para o que está sendo digitado: sites que COMEÇAM com o texto primeiro,
    // depois os que contêm o texto no nome ou no título. Só para texto sem espaço/barra.
    suggest(query, n = 6) {
      const q = String(query).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (!q || /[\s/]/.test(q)) return [];
      const starts = [];
      const other = [];
      for (const i of load()) {
        if (i.host.startsWith(q)) starts.push(i);
        else if (i.host.includes(q) || i.title.toLowerCase().includes(q)) other.push(i);
      }
      return [...starts, ...other].slice(0, n).map(({ url, host, title }) => ({ url, host, title }));
    },
    list: () => load().slice(),
    clear() {
      items = [];
      save();
    },
    flush() {
      if (timer) save();
    },
  };
}

module.exports = { createHistory };
