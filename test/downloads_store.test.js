const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { safeName, uniquePath, createDownloads, MAX_ITEMS } = require('../src/data/downloads_store');

test('downloads: nome seguro e caminho que não sobrescreve', () => {
  assert.strictEqual(safeName('..\\..\\a/b:c?.txt'), '_.._a_b_c_.txt');
  assert.strictEqual(safeName('  .. '), 'download');
  assert.strictEqual(safeName('CON.txt'), 'download_CON.txt');
  assert.strictEqual(safeName('foto.png'), 'foto.png');
  const taken = new Set([path.join('d', 'foto.png'), path.join('d', 'foto (1).png')]);
  assert.strictEqual(uniquePath('d', 'foto.png', (f) => taken.has(f)), path.join('d', 'foto (2).png'));
  assert.strictEqual(uniquePath('d', 'novo.zip', () => false), path.join('d', 'novo.zip'));
});

test('downloads: lista salva com limite', () => {
  const data = {};
  const d = createDownloads({ get: (k) => data[k], setLater: (k, v) => (data[k] = v) });
  for (let i = 0; i < MAX_ITEMS + 5; i++) d.add({ id: `d${i}` });
  assert.strictEqual(d.list().length, MAX_ITEMS);
  assert.strictEqual(d.get('d0'), null);
  d.remove(`d${MAX_ITEMS}`);
  assert.strictEqual(d.get(`d${MAX_ITEMS}`), null);
  d.clear();
  assert.deepStrictEqual(d.list(), []);
});

test('retomada automática: espera cresce e tem teto', () => {
  const { retryDelay, MAX_RETRIES } = require('../src/data/downloads_store');
  assert.deepStrictEqual([0, 1, 2, 3].map(retryDelay), [1000, 2000, 4000, 8000]);
  assert.strictEqual(retryDelay(20), 30000);
  assert.ok(MAX_RETRIES > 0);
});
