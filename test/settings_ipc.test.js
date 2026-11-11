const test = require('node:test');
const assert = require('node:assert');
const { PREF_KEYS, validUserAgent, registerSettingsIpc } = require('../src/ipc/settings_ipc');

function setup() {
  const data = { userAgent: 'x', theme: 'light', engines: [{ id: 'a' }], sitePerms: { o: {} }, lang: 'en' };
  const store = { get: (k) => data[k], set: (k, v) => (data[k] = v), flush: () => (data.flushed = true) };
  const handlers = {};
  const calls = [];
  const ipcMain = { handle: (c, f) => (handlers[c] = f), on: (c, f) => (handlers[c] = f) };
  const session = { defaultSession: { setUserAgent: (ua) => calls.push(['ua', ua]) } };
  const app = { relaunch: () => calls.push(['relaunch']), exit: () => calls.push(['exit']) };
  const api = registerSettingsIpc({ ipcMain, fromUi: (e) => e === 'ui', app, session, getStore: () => store, getTabs: () => null, defaultUA: 'Default UA 1.0', beforeRestart: () => calls.push(['before']) });
  return { data, handlers, calls, api };
}

test('validUserAgent: só texto simples de 8 a 400 caracteres', () => {
  assert.ok(validUserAgent('Mozilla/5.0 (X11; Linux) Firefox/1'));
  assert.ok(!validUserAgent('curto'));
  assert.ok(!validUserAgent('com acento: não'));
  assert.ok(!validUserAgent('a'.repeat(401)));
});

test('ua:set salva, aplica e volta ao padrão com texto vazio', async () => {
  const { handlers, calls, data } = setup();
  assert.deepStrictEqual(await handlers['ua:set']('ui', 'Mozilla/5.0 Teste'), { ok: true });
  assert.strictEqual(data.userAgent, 'Mozilla/5.0 Teste');
  assert.deepStrictEqual(calls.at(-1), ['ua', 'Mozilla/5.0 Teste']);
  assert.deepStrictEqual(await handlers['ua:set']('ui', null), { ok: true });
  assert.strictEqual(data.userAgent, null);
  assert.deepStrictEqual(calls.at(-1), ['ua', 'Default UA 1.0']);
  assert.deepStrictEqual(await handlers['ua:set']('ui', 'ç'), { ok: false });
  assert.strictEqual(await handlers['ua:set']('outro', 'Mozilla/5.0 Teste'), null);
});

test('settings:reset limpa só as preferências e reinicia', () => {
  const { handlers, calls, data } = setup();
  handlers['settings:reset']('outro');
  assert.strictEqual(calls.length, 0);
  handlers['settings:reset']('ui');
  for (const k of PREF_KEYS) assert.strictEqual(data[k], null);
  assert.deepStrictEqual(data.engines, [{ id: 'a' }]);
  assert.deepStrictEqual(data.sitePerms, { o: {} });
  assert.strictEqual(data.lang, 'en');
  assert.ok(data.flushed);
  assert.deepStrictEqual(calls.map((c) => c[0]), ['before', 'relaunch', 'exit']);
});
