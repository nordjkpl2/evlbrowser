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
  // Um Map só: a ORDEM DE INSERÇÃO é a recência (o primeiro é o mais antigo, o último o mais novo).
  // Visitar, remover e despejar o mais antigo são O(1): não há splice nem reindexação.
  let byHost = null; // site -> { url, host, title, time }
  let timer = null;

  function load() {
    if (byHost) return byHost;
    byHost = new Map();
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      // O arquivo está do mais novo para o mais antigo; o primeiro de cada site (o mais novo) vence.
      // Também aceita o formato antigo (uma entrada por página): vira um por site.
      const rows = [];
      const seen = new Set(); // Set em vez de some(): O(n) ao carregar, não O(n²)
      for (const i of Array.isArray(data) ? data : []) {
        const s = i && typeof i.url === 'string' && typeof i.time === 'number' ? site(i.url) : null;
        if (s && !seen.has(s.key)) {
          seen.add(s.key);
          rows.push({ url: s.url, host: s.key, title: String(i.title || s.key), time: i.time });
        }
      }
      // Insere do mais antigo para o mais novo, para a ordem do Map ficar certa.
      for (let k = rows.length - 1; k >= 0; k--) byHost.set(rows[k].host, rows[k]);
    } catch {
      // arquivo não existe ou está quebrado: começa vazio
    }
    return byHost;
  }

  // Lista do mais novo para o mais antigo (cópia do array; os itens são os mesmos objetos).
  function newestFirst() {
    return [...load().values()].reverse();
  }

  function save() {
    clearTimeout(timer);
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(newestFirst()));
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
      const map = load();
      const prev = map.get(s.key);
      if (prev) map.delete(s.key); // sai da posição antiga; volta para o topo (fim do Map)
      map.set(s.key, { url: s.url, host: s.key, title: title || prev?.title || s.key, time: Date.now() });
      while (map.size > max) map.delete(map.keys().next().value); // despeja o mais antigo
      later();
    },
    // O título chega depois da navegação: atualiza o do site, se ele estiver na lista.
    setTitle(url, title) {
      const s = site(url);
      if (!s || !title || !byHost) return;
      const item = byHost.get(s.key);
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
      for (const i of newestFirst()) {
        if (i.host.startsWith(q)) starts.push(i);
        else if (i.host.includes(q) || i.title.toLowerCase().includes(q)) other.push(i);
      }
      return [...starts, ...other].slice(0, n).map(({ url, host, title }) => ({ url, host, title }));
    },
    // Remove um site (pelo nome, ex.: "youtube.com") da lista.
    remove(host) {
      const map = load();
      if (!map.has(host)) return false;
      map.delete(host);
      later();
      return true;
    },
    list: () => newestFirst(),
    clear() {
      byHost = new Map();
      save();
    },
    flush() {
      if (timer) save();
    },
  };
}

module.exports = { createHistory };
