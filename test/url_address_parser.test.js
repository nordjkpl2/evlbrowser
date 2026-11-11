// Rode com: npm test
const test = require('node:test');
const assert = require('node:assert');
const { toUrl } = require('../src/tabs/url_address_parser');

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

test('setSearchUrl: troca o motor (%s ou formato antigo) e volta ao padrão', () => {
  const { toUrl, setSearchUrl } = require('../src/tabs/url_address_parser');
  setSearchUrl('https://www.google.com/search?q=%s');
  assert.strictEqual(toUrl('gatos fofos'), 'https://www.google.com/search?q=gatos%20fofos');
  setSearchUrl('https://exemplo.com/%s/buscar?x=%s');
  assert.strictEqual(toUrl('a b'), 'https://exemplo.com/a%20b/buscar?x=a%20b');
  setSearchUrl('https://velho.com/?q='); // sem %s: o texto vai no fim
  assert.strictEqual(toUrl('oi'), 'https://velho.com/?q=oi');
  setSearchUrl(null);
  assert.strictEqual(toUrl('oi'), 'https://duckduckgo.com/?q=oi');
});
