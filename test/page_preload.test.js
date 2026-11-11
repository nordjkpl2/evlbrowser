// preload_web_pages.js: o filtro do YouTube roda no mundo da página; aqui ele é executado
// numa "página" de mentira para conferir que tira os anúncios da resposta do player.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'preload_web_pages.js');
const source = fs.readFileSync(file, 'utf8');

function loadPreload(hostname, adblockOn) {
  const calls = { css: [], world: null, invoked: [] };
  const electron = {
    ipcRenderer: { sendSync: () => adblockOn, invoke: async (ch) => (calls.invoked.push(ch), []) },
    webFrame: { insertCSS: (css) => calls.css.push(css) },
    contextBridge: { executeInMainWorld: (o) => (calls.world = o) },
  };
  const listeners = [];
  const ctx = vm.createContext({
    require: (name) => (name === 'electron' ? electron : require(name)),
    location: { hostname, protocol: 'https:' },
    document: { addEventListener: (t, f) => listeners.push(t), querySelector: () => null, visibilityState: 'visible' },
    setInterval: () => 0,
    console,
  });
  vm.runInContext(source, ctx, { filename: 'preload_web_pages.js' });
  return { calls, listeners };
}

test('YouTube com o bloqueador ligado: filtro no mundo da página, CSS e escuta de cliques', () => {
  const { calls, listeners } = loadPreload('www.youtube.com', true);
  assert.ok(calls.world && typeof calls.world.func === 'function');
  assert.ok(calls.css[0].includes('ytd-ad-slot-renderer'));
  assert.ok(listeners.includes('pointerdown'));
});

test('bloqueador desligado ou outro site: nada do YouTube é instalado', () => {
  assert.strictEqual(loadPreload('www.youtube.com', false).calls.world, null);
  assert.strictEqual(loadPreload('exemplo.com', true).calls.world, null);
});

test('o filtro tira adPlacements/playerAds/adSlots só de respostas de player', async () => {
  const { calls } = loadPreload('www.youtube.com', true);
  class FakeResponse {
    constructor(url, data) {
      this.url = url;
      this.data = data;
    }
    json() {
      return Promise.resolve(this.data);
    }
  }
  const page = { Response: FakeResponse, JSON, Object };
  page.window = page;
  vm.createContext(page);
  vm.runInContext(`(${calls.world.func.toString()})()`, page);

  const player = () => ({ streamingData: {}, adPlacements: [1], playerAds: [2], adSlots: [3], videoDetails: { id: 'x' } });

  // 1) variável da página
  page.window.ytInitialPlayerResponse = player();
  assert.deepStrictEqual(Object.keys(page.window.ytInitialPlayerResponse).sort(), ['streamingData', 'videoDetails']);

  // 2) JSON.parse (resposta de rede)
  const parsed = page.JSON.parse(JSON.stringify({ playerResponse: player() }));
  assert.strictEqual(parsed.playerResponse.adPlacements, undefined);
  const other = page.JSON.parse('{"adPlacements":[1],"titulo":"x"}'); // não é resposta de player
  assert.deepStrictEqual(other.adPlacements, [1]);

  // 3) fetch().json() dos endereços do player
  const r = await new FakeResponse('https://www.youtube.com/youtubei/v1/player?key=1', player()).json();
  assert.strictEqual(r.playerAds, undefined);
  const keep = await new FakeResponse('https://exemplo.com/api', player()).json();
  assert.deepStrictEqual(keep.adPlacements, [1]);
});

test('todo canal usado pelas páginas tem handler no main', () => {
  const root = path.join(__dirname, '..');
  const code = [path.join(root, 'main.js'), ...fs.readdirSync(path.join(root, 'src', 'ipc')).map((f) => path.join(root, 'src', 'ipc', f))]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  for (const m of source.matchAll(/ipcRenderer\.(?:send|sendSync|invoke)\('([^']+)'/g)) {
    assert.ok(code.includes(`'${m[1]}'`), `sem handler para ${m[1]}`);
  }
});
