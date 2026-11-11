const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { speedOptions, checkSpeedValue, readStartupSpeed, needsRestart, SPEED_DEFAULTS } = require('../src/app/speed_options');

test('speedOptions: padrões, limites e lixo', () => {
  assert.deepStrictEqual(speedOptions(null), SPEED_DEFAULTS);
  const o = speedOptions({ discardMinutes: 9999, memoryBudgetMB: 1, preconnect: 'x', lowMemory: true, zzz: 1 });
  assert.strictEqual(o.discardMinutes, 60);
  assert.strictEqual(o.memoryBudgetMB, 300);
  assert.strictEqual(o.preconnect, true);
  assert.strictEqual(o.lowMemory, true);
});

test('checkSpeedValue valida tipo e chave', () => {
  assert.strictEqual(checkSpeedValue('preconnect', false), false);
  assert.strictEqual(checkSpeedValue('preconnect', 'sim'), undefined);
  assert.strictEqual(checkSpeedValue('discardMinutes', 7.4), 7);
  assert.strictEqual(checkSpeedValue('discardMinutes', NaN), undefined);
  assert.strictEqual(checkSpeedValue('inexistente', true), undefined);
});

test('readStartupSpeed lê settings.json; needsRestart só para opções de reinício', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evls-'));
  assert.deepStrictEqual(readStartupSpeed(dir), SPEED_DEFAULTS);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ speed: { hardwareAccel: false } }));
  const startup = readStartupSpeed(dir);
  assert.strictEqual(startup.hardwareAccel, false);
  assert.strictEqual(needsRestart(startup, startup), false);
  assert.strictEqual(needsRestart({ ...startup, preconnect: false }, startup), false);
  assert.strictEqual(needsRestart({ ...startup, lowMemory: true }, startup), true);
  fs.rmSync(dir, { recursive: true, force: true });
});
