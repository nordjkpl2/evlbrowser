// Rode com: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/app/settings_store');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evl-settings-'));
  return path.join(dir, 'sub', 'settings.json');
}

test('sem arquivo usa o padrão (tema escuro)', () => {
  assert.strictEqual(createStore(tempFile()).get('theme'), 'dark');
});

test('o valor escolhido é salvo e lido por outro store', () => {
  const file = tempFile();
  createStore(file).set('theme', 'light');
  assert.strictEqual(createStore(file).get('theme'), 'light');
});

test('arquivo quebrado volta para o padrão', () => {
  const file = tempFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ isso não é json');
  assert.strictEqual(createStore(file).get('theme'), 'dark');
});

test('gravar onde não dá (pasta inexistente de verdade) não derruba o app', () => {
  // Um ARQUIVO usado como se fosse pasta: criar a pasta falha com ENOTDIR.
  const blocker = tempFile();
  fs.mkdirSync(path.dirname(blocker), { recursive: true });
  fs.writeFileSync(blocker, 'sou um arquivo');
  const store = createStore(path.join(blocker, 'settings.json'));
  store.set('theme', 'light');
  assert.strictEqual(store.get('theme'), 'light');
});
