// Testa o histórico (rode: npm test).
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHistory } = require('../src/data/history_store');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'evl-h-')), 'history.json');

test('um item por site; subdomínio de verdade fica separado; www e m. contam como o principal', () => {
  const h = createHistory(tmp());
  h.add('https://www.youtube.com/watch?v=1&list=x', 'Vídeo 1');
  h.add('https://m.youtube.com/watch?v=2', 'Vídeo 2');
  h.add('https://dashboard.youtube.com/x', 'Painel');
  h.add('https://youtube.com/feed', '');
  assert.deepStrictEqual(h.list().map((i) => i.host), ['youtube.com', 'dashboard.youtube.com']);
  assert.strictEqual(h.list()[0].url, 'https://youtube.com/');
  assert.strictEqual(h.list()[0].title, 'Vídeo 2', 'sem título novo mantém o da última página');
  h.setTitle('https://www.youtube.com/watch?v=3', 'Vídeo 3');
  assert.strictEqual(h.list()[0].title, 'Vídeo 3');
  h.flush();
});

test('só http(s) entra', () => {
  const h = createHistory(tmp());
  for (const u of ['about:blank', 'javascript:alert(1)', 'file:///c:/x', 'não é url', 'evl://settings']) h.add(u, 'x');
  assert.strictEqual(h.list().length, 0);
  h.add('http://localhost:3000/app', 'Dev');
  assert.strictEqual(h.list()[0].host, 'localhost:3000');
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

test('arquivo quebrado volta vazio; formato antigo (por página) é convertido', () => {
  const bad = tmp();
  fs.writeFileSync(bad, '{ não é json');
  assert.deepStrictEqual(createHistory(bad).list(), []);

  const old = tmp();
  fs.writeFileSync(old, JSON.stringify([
    { url: 'https://www.youtube.com/watch?v=9', title: 'Vídeo', time: 3 },
    { url: 'https://youtube.com/', title: 'YouTube', time: 2 },
    { url: 'https://github.com/nord', title: 'Nord', time: 1 },
  ]));
  assert.deepStrictEqual(createHistory(old).list().map((i) => i.host), ['youtube.com', 'github.com']);
});

test('sugestões: começa-com primeiro, depois contém; ignora frases e limita', () => {
  const h = createHistory(tmp());
  for (const [u, t] of [
    ['https://youtube.com/', 'YouTube'],
    ['https://github.com/', 'GitHub'],
    ['https://music.youtube.com/', 'Música'],
    ['https://example.org/', 'Tutorial de youtube'],
  ]) h.add(u, t);
  assert.deepStrictEqual(h.suggest('you').map((s) => s.host), ['youtube.com', 'example.org', 'music.youtube.com']);
  assert.deepStrictEqual(h.suggest('YouTube.com').map((s) => s.host), ['youtube.com', 'music.youtube.com']);
  assert.deepStrictEqual(h.suggest('https://www.git').map((s) => s.host), ['github.com']);
  assert.deepStrictEqual(h.suggest('como fazer'), []);
  assert.deepStrictEqual(h.suggest('a.com/x'), []);
  assert.strictEqual(h.suggest('o', 2).length, 2);
});

test('remove um site pelo nome', () => {
  const h = createHistory(tmp());
  h.add('https://a.com/x', 'A');
  h.add('https://b.com/y', 'B');
  assert.strictEqual(h.remove('a.com'), true);
  assert.strictEqual(h.remove('a.com'), false);
  assert.deepStrictEqual(h.list().map((i) => i.host), ['b.com']);
});
