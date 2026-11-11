// Adicionar favorito à mão (bookmarks:add): aceita "exemplo.com", rejeita lixo e vindos de fora da interface.
const test = require('node:test');
const assert = require('node:assert');
const { registerBookmarksIpc } = require('../src/ipc/bookmarks_ipc');

function setup() {
  const handlers = {};
  const added = [];
  registerBookmarksIpc({
    ipcMain: { on: () => {}, handle: (ch, fn) => (handlers[ch] = fn) },
    fromUi: (e) => e.ui === true,
    getBookmarks: () => ({ add: (url, title) => (added.push([url, title]), true) }),
    getActivePage: () => null,
    openUrl: () => {},
    refresh: () => {},
  });
  return { add: handlers['bookmarks:add'], added };
}

test('endereço sem https vira https e o título padrão é o site', () => {
  const { add, added } = setup();
  assert.deepStrictEqual(add({ ui: true }, 'www.exemplo.com/a', ''), { ok: true });
  assert.deepStrictEqual(added[0], ['https://www.exemplo.com/a', 'exemplo.com']);
  add({ ui: true }, 'http://x.org', '  Meu site ');
  assert.deepStrictEqual(added[1], ['http://x.org', 'Meu site']);
});

test('rejeita texto sem domínio, tipos errados e quem não é a interface', () => {
  const { add, added } = setup();
  assert.deepStrictEqual(add({ ui: true }, 'abc', ''), { ok: false });
  assert.deepStrictEqual(add({ ui: true }, 'javascript:alert(1)', ''), { ok: false });
  assert.deepStrictEqual(add({ ui: true }, 42, ''), { ok: false });
  assert.deepStrictEqual(add({ ui: false }, 'exemplo.com', ''), { ok: false });
  assert.strictEqual(added.length, 0);
});
