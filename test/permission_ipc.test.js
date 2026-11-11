const test = require('node:test');
const assert = require('node:assert');
const { PROMPTABLE, permKinds, createPermissions } = require('../src/ipc/permission_ipc');

function setup(saved) {
  const data = { sitePerms: saved };
  const store = { get: (k) => data[k], set: (k, v) => (data[k] = v) };
  const sent = [];
  const wc = { isDestroyed: () => false, getURL: () => 'https://site.test/', once() {} };
  const tabs = { tabs: new Map([[1, { view: { webContents: wc } }]]), activeId: 1, prompt: null, setPrompt(v) { this.prompt = v; } };
  const perms = createPermissions({ getStore: () => store, getTabs: () => tabs, send: (c, d) => sent.push([c, d]) });
  return { data, sent, wc, tabs, perms };
}
const details = { requestingUrl: 'https://site.test/page', mediaTypes: ['audio'] };

test('permKinds: media vira câmera/microfone', () => {
  assert.deepStrictEqual(permKinds('media', { mediaTypes: ['video', 'audio'] }), ['camera', 'microphone']);
  assert.deepStrictEqual(permKinds('media', {}), ['microphone']);
  assert.deepStrictEqual(permKinds('geolocation', {}), ['geolocation']);
  assert.ok(PROMPTABLE.has('media') && !PROMPTABLE.has('fullscreen'));
});

test('o que não é perguntado é decidido na hora', () => {
  const { perms, wc } = setup({});
  const answers = [];
  perms.ask(wc, 'fullscreen', (v) => answers.push(v), details);
  perms.ask(wc, 'usb', (v) => answers.push(v), details);
  perms.ask(wc, 'media', (v) => answers.push(v), { requestingUrl: 'file:///x' });
  assert.deepStrictEqual(answers, [true, false, false]);
});

test('pergunta, responde e lembra a decisão', () => {
  const { perms, wc, sent, tabs, data } = setup({});
  const got = [];
  perms.ask(wc, 'media', (v) => got.push(v), details);
  assert.deepStrictEqual(sent[0], ['perm:ask', { id: 1, host: 'site.test', kinds: ['microphone'] }]);
  assert.strictEqual(tabs.prompt, true);
  perms.answer(1, true, true);
  assert.deepStrictEqual(got, [true]);
  assert.strictEqual(tabs.prompt, false);
  assert.deepStrictEqual(data.sitePerms['https://site.test'], { microphone: true });
  // da próxima vez não pergunta
  perms.ask(wc, 'media', (v) => got.push(v), details);
  assert.deepStrictEqual(got, [true, true]);
  assert.strictEqual(perms.check('media', 'https://site.test', { mediaType: 'audio' }), true);
  assert.strictEqual(perms.check('media', 'https://site.test', { mediaType: 'video' }), false);
});

test('bloqueio lembrado e resposta com id errado é ignorada', () => {
  const { perms, wc } = setup({ 'https://site.test': { microphone: false } });
  const got = [];
  perms.ask(wc, 'media', (v) => got.push(v), details);
  assert.deepStrictEqual(got, [false]);
  const other = setup({});
  other.perms.ask(other.wc, 'geolocation', () => {}, details);
  other.perms.answer(99, true, true);
  assert.deepStrictEqual(other.perms.pending(), { id: 1, host: 'site.test', kinds: ['geolocation'] });
});

test('aba de fundo é negada sem perguntar', () => {
  const { perms, sent } = setup({});
  const bg = { isDestroyed: () => false, getURL: () => 'https://x.test/', once() {} };
  const got = [];
  perms.ask(bg, 'notifications', (v) => got.push(v), { requestingUrl: 'https://x.test/' });
  assert.deepStrictEqual(got, [false]);
  assert.strictEqual(sent.length, 0);
});
