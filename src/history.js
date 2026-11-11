// Histórico de páginas visitadas, salvo em um JSON simples (history.json).
// Não depende do Electron, então dá para testar só com `npm test`.
//
// Leve em RAM e disco: no máximo `max` entradas, carregado só na primeira
// visita e gravado no máximo uma vez a cada `delay` ms (nunca há timer parado).

const fs = require('fs');
const path = require('path');

function createHistory(file, { max = 500, delay = 3000 } = {}) {
  let items = null; // [{ url, title, time }], a mais recente primeiro
  let timer = null;

  function load() {
    if (items) return items;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      items = Array.isArray(data)
        ? data.filter((i) => i && typeof i.url === 'string' && typeof i.time === 'number')
        : [];
    } catch {
      items = []; // arquivo não existe ou está quebrado
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
    // Visita nova: sobe para o topo (sem repetir a mesma URL). Só http(s).
    add(url, title) {
      if (!/^https?:\/\//i.test(url)) return;
      const list = load();
      const old = list.findIndex((i) => i.url === url);
      const prev = old === -1 ? null : list.splice(old, 1)[0];
      list.unshift({ url, title: title || prev?.title || url, time: Date.now() });
      if (list.length > max) list.length = max;
      later();
    },
    // O título chega depois da navegação: atualiza a entrada, se ela existir.
    setTitle(url, title) {
      if (!title || !items) return;
      const item = items.find((i) => i.url === url);
      if (item && item.title !== title) {
        item.title = title;
        later();
      }
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
