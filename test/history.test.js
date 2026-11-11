// Testa o histórico (rode: npm test).
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHistory } = require('../src/history');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'evl-h-')), 'history.json');

test('só http(s) entra, sem repetir a URL, mais recente primeiro', () => {
  const h = createHistory(tmp());
  h.add('https://a.com/', 'A');
  h.add('about:blank', 'x');
  h.add('javascript:alert(1)', 'x');
  h.add('https://b.com/', '');
  h.add('https://a.com/', '');
  assert.deepStrictEqual(h.list().map((i) => i.url), ['https://a.com/', 'https://b.com/']);
  assert.strictEqual(h.list()[0].title, 'A', 'revisita mantém o título conhecido');
  assert.strictEqual(h.list()[1].title, 'https://b.com/', 'sem título usa a URL');
  h.setTitle('https://b.com/', 'B');
  assert.strictEqual(h.list()[1].title, 'B');
  h.flush();
});

test('limite de entradas, gravar, recarregar e limpar', () => {
  const file = tmp();
  const h = createHistory(file, { max: 3, delay: 10 });
  for (let i = 0; i < 5; i++) h.add(`https://s${i}.com/`, `S${i}`);
  assert.strictEqual(h.list().length, 3);
  h.flush();
  assert.deepStrictEqual(createHistory(file).list().map((i) => i.title), ['S4', 'S3', 'S2']);
  h.clear();
  assert.strictEqual(createHistory(file).list().length, 0);
});

test('arquivo quebrado volta vazio', () => {
  const file = tmp();
  fs.writeFileSync(file, '{ não é json');
  assert.deepStrictEqual(createHistory(file).list(), []);
});
