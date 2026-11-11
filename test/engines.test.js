// Testa os motores de busca (rode: npm test).
const test = require('node:test');
const assert = require('assert');
const { PRESETS, validateEngine, normalizeList, uniqueId } = require('../src/engines');

test('de fábrica: DuckDuckGo (padrão), Google e Bing, todos válidos', () => {
  assert.deepStrictEqual(PRESETS.map((p) => p.name), ['DuckDuckGo', 'Google', 'Bing']);
  for (const p of PRESETS) assert.ok(validateEngine(p).ok, p.name);
});

test('validação do nome e do endereço', () => {
  assert.deepStrictEqual(validateEngine({ name: '  Brave ', url: ' https://search.brave.com/search?q=%s ' }), { ok: true, name: 'Brave', url: 'https://search.brave.com/search?q=%s' });
  for (const bad of [
    { name: '', url: 'https://a.com/?q=%s' },
    { name: 'x'.repeat(41), url: 'https://a.com/?q=%s' },
    { name: 'a', url: 'https://a.com/?q=' }, // sem %s
    { name: 'a', url: 'javascript:alert(%s)' },
    { name: 'a', url: 'ftp://a.com/%s' },
    { name: 'a', url: 'não é endereço %s' },
    { name: 'a', url: 'https://a.com/?q=%s' + 'x'.repeat(500) },
    null,
  ]) assert.strictEqual(validateEngine(bad).ok, false, JSON.stringify(bad)?.slice(0, 40));
});

test('lista salva: filtra lixo, tira ids repetidos e volta aos de fábrica se vazia', () => {
  const ok = { id: 'a', name: 'A', url: 'https://a.com/?q=%s' };
  assert.deepStrictEqual(normalizeList([ok, { ...ok, name: 'repetido' }, { id: 'b', name: '', url: 'x' }, 'lixo', { name: 'sem id', url: ok.url }]), [ok]);
  for (const raw of [undefined, null, [], 'x', [{}]]) assert.deepStrictEqual(normalizeList(raw), PRESETS);
  assert.notStrictEqual(normalizeList(undefined)[0], PRESETS[0], 'devolve cópias');
});

test('ids únicos a partir do nome', () => {
  assert.strictEqual(uniqueId('Meu Site!', []), 'meu-site');
  assert.strictEqual(uniqueId('Pesquisa Ação', []), 'pesquisa-acao');
  assert.strictEqual(uniqueId('Google', PRESETS), 'google-2');
  assert.strictEqual(uniqueId('???', []), 'motor');
});
