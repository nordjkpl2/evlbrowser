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

test('terceiros: subdomínio com cara de anúncio, trecho típico e beacons', () => {
  const ab = createAdblock();
  const page = 'https://www.noticias.com.br/materia';
  assert.strictEqual(ab.shouldBlock('https://ads.outrosite.com/x.js', 'script', page), true);
  assert.strictEqual(ab.shouldBlock('https://cdn.outrosite.com/adserver/show.js', 'script', page), true);
  assert.strictEqual(ab.shouldBlock('https://api.outrosite.com/collect', 'ping', page), true);
  // do próprio site não bloqueia (primeira parte)
  assert.strictEqual(ab.shouldBlock('https://ads.noticias.com.br/x.js', 'script', page), false);
  assert.strictEqual(ab.shouldBlock('https://cdn.noticias.com.br/adserver/a.js', 'script', page), false);
  assert.strictEqual(ab.shouldBlock('https://api.outrosite.com/collect', 'xhr', page), false);
});

test('sites permitidos ficam sem bloqueio (inclusive subdomínios)', () => {
  const ab = createAdblock();
  const ad = 'https://securepubads.g.doubleclick.net/x.js';
  assert.strictEqual(ab.shouldBlock(ad, 'script', 'https://app.meusite.com/'), true);
  ab.setAllow(['meusite.com']);
  assert.strictEqual(ab.shouldBlock(ad, 'script', 'https://app.meusite.com/'), false);
  assert.strictEqual(ab.allowedHost('app.meusite.com'), true);
  assert.strictEqual(ab.allowedHost('outro.com'), false);
  ab.setAllow([]);
  assert.strictEqual(ab.shouldBlock(ad, 'script', 'https://app.meusite.com/'), true);
});
