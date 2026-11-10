// Rode com: npm test
const test = require('node:test');
const assert = require('node:assert');
const { toUrl } = require('../src/url');

test('texto vazio é ignorado', () => {
  assert.strictEqual(toUrl(''), null);
  assert.strictEqual(toUrl('   '), null);
  assert.strictEqual(toUrl(undefined), null);
});

test('URL com http(s) é mantida', () => {
  assert.strictEqual(toUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.strictEqual(toUrl('http://example.com'), 'http://example.com/');
});

test('domínio sem esquema vira https', () => {
  assert.strictEqual(toUrl('example.com'), 'https://example.com/');
  assert.strictEqual(toUrl('example.com.br/caminho'), 'https://example.com.br/caminho');
});

test('localhost e IP viram http', () => {
  assert.strictEqual(toUrl('localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(toUrl('192.168.0.1:8080/x'), 'http://192.168.0.1:8080/x');
});

test('esquemas perigosos são bloqueados', () => {
  assert.strictEqual(toUrl('javascript:alert(1)'), null);
  assert.strictEqual(toUrl('data:text/html,<h1>oi</h1>'), null);
  assert.strictEqual(toUrl('file:///C:/segredo.txt'), null);
  assert.strictEqual(toUrl('ftp://example.com'), null);
});

test('qualquer outro texto vira busca', () => {
  assert.strictEqual(
    toUrl('gatos fofos'),
    'https://duckduckgo.com/?q=' + encodeURIComponent('gatos fofos')
  );
  assert.strictEqual(
    toUrl('meu site.com'),
    'https://duckduckgo.com/?q=' + encodeURIComponent('meu site.com')
  );
});
