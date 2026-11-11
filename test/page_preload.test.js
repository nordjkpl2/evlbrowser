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
  const calls = { css: [], world: null, invoked: [], sent: [], handlers: {} };
  const electron = {
    ipcRenderer: { sendSync: () => adblockOn, send: (ch, v) => calls.sent.push([ch, v]), invoke: async (ch) => (calls.invoked.push(ch), []) },
    webFrame: { insertCSS: (css) => calls.css.push(css) },
    contextBridge: { executeInMainWorld: (o) => (calls.world = o) },
  };
  const listeners = [];
  const ctx = vm.createContext({
    require: (name) => (name === 'electron' ? electron : require(name)),
    location: { hostname, protocol: 'https:', origin: `https://${hostname}` },
    document: { addEventListener: (t, f) => (listeners.push(t), (calls.handlers[t] = f)), querySelector: () => null, visibilityState: 'visible' },
    setInterval: () => 0,
    console,
  });
  vm.runInContext(source, ctx, { filename: 'preload_web_pages.js' });
  return { calls, listeners };
}

test('YouTube com o bloqueador ligado: filtro no mundo da página, CSS e escuta de cliques', () => {
  const { calls, listeners } = loadPreload('www.youtube.com', true);
  assert.ok(calls.world && typeof calls.world.func === 'function');
  assert.ok(calls.css.some((c) => c.includes('ytd-ad-slot-renderer')));
  assert.ok(listeners.includes('pointerdown'));
});

test('bloqueador desligado ou outro site: nada do YouTube é instalado', () => {
  assert.strictEqual(loadPreload('www.youtube.com', false).calls.world, null);
  assert.strictEqual(loadPreload('exemplo.com', true).calls.world, null);
});

test('qualquer site: esconde caixas de anúncio só com o bloqueador ligado', () => {
  const on = loadPreload('exemplo.com', true).calls;
  assert.strictEqual(on.css.length, 1);
  assert.ok(on.css[0].includes('adsbygoogle'));
  assert.strictEqual(loadPreload('exemplo.com', false).calls.css.length, 0);
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

test('popups: com "fechar popups" ligado esconde avisos e só deixa abrir janela após clique', () => {
  const on = loadPreload('exemplo.com', { ads: false, popups: true });
  assert.strictEqual(on.calls.css.length, 1);
  assert.ok(on.calls.css[0].includes('.pum-overlay'));
  assert.strictEqual(typeof on.calls.world.func, 'function');

  const opened = [];
  let clicked = 0;
  class Anchor { click() { clicked++; } }
  const page = { navigator: { userActivation: { isActive: false } }, HTMLAnchorElement: Anchor };
  page.window = page;
  page.open = (...a) => (opened.push(a), { fake: true });
  vm.createContext(page);
  vm.runInContext(`(${on.calls.world.func.toString()})()`, page);

  assert.strictEqual(page.window.open('https://anuncio.com'), null, 'sem clique: bloqueado');
  assert.strictEqual(opened.length, 0);
  const a = new Anchor();
  a.target = '_blank';
  a.click();
  assert.strictEqual(clicked, 0, 'clique de script em link _blank sem gesto: bloqueado');
  a.target = '_self';
  a.click();
  assert.strictEqual(clicked, 1, 'mesma aba continua');

  page.navigator.userActivation.isActive = true; // você clicou
  assert.deepStrictEqual(page.window.open('https://login.com'), { fake: true });
  assert.strictEqual(opened.length, 1);
  a.target = '_blank';
  a.click();
  assert.strictEqual(clicked, 2);
});

test('esconder hardware: núcleos e memória sempre iguais, só com a opção ligada', () => {
  const off = loadPreload('exemplo.com', { ads: false, popups: false });
  assert.strictEqual(off.calls.world, null);
  const on = loadPreload('exemplo.com', { ads: false, popups: false, mask: true });
  const page = { Navigator: function () {} };
  vm.createContext(page);
  vm.runInContext(`(${on.calls.world.func.toString()})()`, page);
  const nav = Object.create(page.Navigator.prototype);
  assert.strictEqual(nav.hardwareConcurrency, 4);
  assert.strictEqual(nav.deviceMemory, 8);
});

test('popups desligado (só anúncios ligados): nada de popup é instalado', () => {
  const r = loadPreload('exemplo.com', { ads: true, popups: false });
  assert.strictEqual(r.calls.world, null);
  assert.ok(!r.calls.css.some((c) => c.includes('.pum-overlay')));
  assert.strictEqual(loadPreload('exemplo.com', { ads: false, popups: false }).calls.css.length, 0);
});

test('mouse sobre link de outro site: avisa o main uma vez por site (só https, só cliques reais)', () => {
  const { calls } = loadPreload('exemplo.com', false);
  const over = (href, origin, trusted = true, protocol = 'https:') =>
    calls.handlers.pointerover({ isTrusted: trusted, target: { closest: () => ({ href, origin, protocol }) } });
  over('https://outro.com/a', 'https://outro.com');
  over('https://outro.com/b', 'https://outro.com'); // repetido
  over('https://exemplo.com/x', 'https://exemplo.com'); // mesmo site
  over('http://inseguro.com', 'http://inseguro.com', true, 'http:');
  over('https://script.com', 'https://script.com', false); // evento falso
  assert.deepStrictEqual(calls.sent, [['link:hover', 'https://outro.com']]);
});
