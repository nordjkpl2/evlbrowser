const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBookmarks } = require('../src/bookmarks_store');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'evl-b-')), 'bookmarks.json');

test('favoritar, desfavoritar (toggle) e ignorar o #trecho', () => {
  const b = createBookmarks(tmp());
  assert.strictEqual(b.toggle('https://exemplo.com/a#x', 'Página A'), true);
  assert.strictEqual(b.has('https://exemplo.com/a#outro'), true);
  assert.strictEqual(b.has('https://exemplo.com/b'), false);
  assert.strictEqual(b.toggle('https://exemplo.com/a', 'Página A'), false);
  assert.strictEqual(b.list().length, 0);
});

test('só http(s) e sem repetir (o mais novo sobe)', () => {
  const b = createBookmarks(tmp());
  assert.strictEqual(b.add('javascript:alert(1)', 'x'), false);
  assert.strictEqual(b.add('evl://settings', 'x'), false);
  b.add('https://a.com/', 'A');
  b.add('https://b.com/', 'B');
  b.add('https://a.com/', 'A de novo');
  assert.deepStrictEqual(b.list().map((i) => i.title), ['A de novo', 'B']);
});

test('sugestões pelo título (com espaço) ou endereço, marcadas com estrela', () => {
  const b = createBookmarks(tmp());
  b.add('https://www.exemplo.com/receitas', 'Receitas de bolo');
  b.add('https://outro.org/', 'Outro');
  const s = b.suggest('de bolo');
  assert.deepStrictEqual(s, [{ url: 'https://www.exemplo.com/receitas', host: 'exemplo.com', title: 'Receitas de bolo', star: true }]);
  assert.strictEqual(b.suggest('outro').length, 1);
  assert.strictEqual(b.suggest('').length, 0);
});

test('grava e recarrega; remove por id', () => {
  const file = tmp();
  const b = createBookmarks(file, { delay: 1 });
  b.add('https://a.com/', 'A');
  b.flush();
  const again = createBookmarks(file);
  assert.strictEqual(again.list().length, 1);
  assert.ok(again.remove(again.list()[0].id));
  assert.strictEqual(again.list().length, 0);
});
