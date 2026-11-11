// Motores de busca: lista, validação e escolha do padrão. Não depende do Electron,
// então dá para testar só com `npm test`. O main.js guarda a lista em settings.json.
//
// O endereço de busca usa %s onde vai o texto pesquisado, como no Firefox e no Chrome:
//   https://www.google.com/search?q=%s

// Motores de fábrica (o primeiro é o padrão). Dá para editar e apagar todos.
const PRESETS = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
];

// { name, url } digitado -> { ok: true, name, url } ou { ok: false, error }.
function validateEngine(input) {
  const name = String(input?.name ?? '').trim();
  const url = String(input?.url ?? '').trim();
  if (!name) return { ok: false, error: 'Dê um nome ao motor.' };
  if (name.length > 40) return { ok: false, error: 'O nome pode ter no máximo 40 letras.' };
  let valid = url.length <= 500 && url.includes('%s');
  if (valid) {
    try {
      valid = /^https?:$/.test(new URL(url.split('%s').join('teste')).protocol);
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    return { ok: false, error: 'O endereço precisa começar com http:// ou https:// e ter %s onde vai o texto pesquisado.' };
  }
  return { ok: true, name, url };
}

// O que está salvo (ou nada) -> lista válida, sem ids repetidos. Lista vazia/quebrada volta aos de fábrica.
function normalizeList(raw) {
  const out = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    const v = validateEngine(e);
    if (v.ok && typeof e.id === 'string' && e.id && !out.some((x) => x.id === e.id)) {
      out.push({ id: e.id, name: v.name, url: v.url });
    }
  }
  return out.length > 0 ? out : PRESETS.map((p) => ({ ...p }));
}

// Id curto a partir do nome ("Meu Site!" -> "meu-site"), sem repetir os da lista.
function uniqueId(name, list) {
  const base =
    name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
    'motor';
  let id = base;
  for (let n = 2; list.some((e) => e.id === id); n++) id = `${base}-${n}`;
  return id;
}

module.exports = { PRESETS, validateEngine, normalizeList, uniqueId };
