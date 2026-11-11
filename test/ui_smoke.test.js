// Carrega os scripts da interface na ordem do index.html com um DOM falso (Proxy)
// e confere que nada quebra ao iniciar e que a API usada existe no preload.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ui = path.join(__dirname, '..', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

function fake() {
  const target = function () {};
  const p = new Proxy(target, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : p),
    set: () => true,
    apply: () => p,
    has: () => true,
  });
  return p;
}

test('scripts da interface carregam na ordem e só usam window.evl que existe', () => {
  assert.deepStrictEqual(scripts, ['ui_i18n_languages.js', 'ui_main.js', 'ui_boot.js']);
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const api = new Set([...preload.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  const used = new Set();
  const evl = new Proxy({}, { get: (_t, k) => (used.add(String(k)), () => Promise.resolve(null)) });
  const base = fake();
  const doc = new Proxy(base, {
    get: (_t, k) =>
      k === 'createTreeWalker' ? () => ({ nextNode: () => null }) : k === 'querySelectorAll' ? () => [] : base[k],
  });
  const ctx = vm.createContext({
    window: { evl },
    document: doc,
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    requestAnimationFrame: () => 0,
    getComputedStyle: () => fake(),
    IntersectionObserver: class { observe() {} disconnect() {} },
    NodeFilter: { SHOW_TEXT: 4 },
    console,
  });
  const load = (s) => vm.runInContext(fs.readFileSync(path.join(ui, s), 'utf8'), ctx, { filename: s });
  scripts.forEach(load);
  // as Configurações carregam sob demanda (ui_main.js); aqui carrega todas, na mesma ordem
  const lazy = vm.runInContext('SETTINGS_SCRIPTS', ctx);
  assert.ok(lazy.length >= 7 && lazy[0] === 'settings_search_engines.js');
  lazy.forEach(load);
  // desenhar abas não pode quebrar (já houve um `t` da aba escondendo o t() de tradução)
  for (const kind of ['web', 'blank', 'settings']) {
    vm.runInContext(`makeTab({ id: 1, state: 'active', kind: '${kind}', title: 'x', url: 'u', favicon: null })`, ctx);
  }
  // traduções: 3 idiomas completos, mesmos {marcadores}, e toda t('...') usada existe
  const words = vm.runInContext('WORDS', ctx);
  const keys = new Set();
  for (const row of words) {
    assert.strictEqual(row.length, 3, `linha incompleta: ${row[0]}`);
    row.forEach((x) => assert.ok(x && x.length > 0));
    const marks = (x) => (x.match(/\{\w+\}/g) ?? []).sort().join();
    assert.strictEqual(marks(row[1]), marks(row[0]), `marcadores: ${row[0]}`);
    assert.strictEqual(marks(row[2]), marks(row[0]), `marcadores: ${row[0]}`);
    keys.add(row[0]);
  }
  for (const s of [...scripts, ...lazy].filter((x) => x !== 'ui_i18n_languages.js')) {
    for (const m of fs.readFileSync(path.join(ui, s), 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) {
      assert.ok(keys.has(m[1]), `sem tradução: ${m[1]}`);
    }
  }
  for (const name of used) assert.ok(api.has(name), `window.evl.${name} não existe no preload.js`);
});

test('todo canal de ipcRenderer do preload tem handler no main', () => {
  const root = path.join(__dirname, '..');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const code = [path.join(root, 'main.js'), ...fs.readdirSync(path.join(root, 'src', 'ipc')).map((f) => path.join(root, 'src', 'ipc', f))]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const sent = [...preload.matchAll(/ipcRenderer\.(?:send|invoke)\('([^']+)'/g)].map((m) => m[1]);
  for (const ch of sent) assert.ok(code.includes(`'${ch}'`), `sem handler para ${ch}`);
});
