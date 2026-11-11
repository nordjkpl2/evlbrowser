const test = require('node:test');
const assert = require('node:assert');
const { createAdblock } = require('../src/adblock_engine');

test('bloqueia domínio da lista e subdomínios; deixa o resto passar', () => {
  const ab = createAdblock();
  assert.strictEqual(ab.shouldBlock('https://securepubads.g.doubleclick.net/x.js', 'script', 'https://site.com/'), true);
  assert.strictEqual(ab.shouldBlock('https://cdn.site.com/app.js', 'script', 'https://site.com/'), false);
  assert.strictEqual(ab.shouldBlock('https://notdoubleclick.net/x', 'script', 'https://site.com/'), false);
});

test('nunca bloqueia a página principal nem o próprio domínio da lista', () => {
  const ab = createAdblock();
  assert.strictEqual(ab.shouldBlock('https://doubleclick.net/', 'mainFrame', ''), false);
  assert.strictEqual(ab.shouldBlock('https://doubleclick.net/a.css', 'stylesheet', 'https://doubleclick.net/'), false);
});

test('regras de trecho (anúncios no mesmo domínio) e contador', () => {
  const ab = createAdblock();
  assert.strictEqual(ab.check('https://www.youtube.com/api/stats/ads?x=1', 'xhr', 'https://www.youtube.com/'), true);
  assert.strictEqual(ab.check('https://www.youtube.com/youtubei/v1/player', 'xhr', 'https://www.youtube.com/'), false);
  assert.strictEqual(ab.blocked, 1);
  ab.reset();
  assert.strictEqual(ab.blocked, 0);
});

test('endereço inválido não quebra', () => {
  assert.strictEqual(createAdblock().shouldBlock('não é url', 'script', ''), false);
});
