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

test('cache em disco: 0 = automático, limite máximo e pede reinício', () => {
  const { speedOptions, needsRestart, checkSpeedValue } = require('../src/app/speed_options');
  assert.strictEqual(speedOptions(null).diskCacheMB, 0);
  assert.strictEqual(speedOptions({ diskCacheMB: 99999 }).diskCacheMB, 8000);
  assert.strictEqual(speedOptions({ diskCacheMB: -5 }).diskCacheMB, 0);
  assert.strictEqual(checkSpeedValue('diskCacheMB', 512), 512);
  assert.ok(needsRestart(speedOptions({ diskCacheMB: 512 }), speedOptions(null)));
});

test('renderização: flags do Chromium só para o que foi ligado', () => {
  const { speedOptions, speedSwitches, needsRestart } = require('../src/app/speed_options');
  assert.deepStrictEqual(speedSwitches(speedOptions(null)), []);
  const on = speedOptions({ imagesOff: true, rendererLimit: 4, jsMemoryMB: 10 });
  assert.deepStrictEqual(speedSwitches(on), [
    ['blink-settings', 'imagesEnabled=false'],
    ['renderer-process-limit', '4'],
    ['js-flags', '--max-old-space-size=64'],
  ]);
  assert.strictEqual(speedOptions({ rendererLimit: 99 }).rendererLimit, 16);
  assert.ok(needsRestart(on, speedOptions(null)));
});

test('novas opções de velocidade: desligadas por padrão e viram flags', () => {
  const { speedOptions, speedSwitches, speedFeatures, parallelFeature } = require('../src/app/speed_options');
  assert.deepStrictEqual(speedFeatures(speedOptions({ parallelDownloads: false })), []);
  const on = speedOptions({ parallelDownloads: true, zeroCopy: true, noSmoothScroll: true, rasterThreads: 9 });
  assert.deepStrictEqual(speedFeatures(on), [parallelFeature(4)]);
  assert.deepStrictEqual(speedSwitches(on), [['enable-zero-copy'], ['disable-smooth-scrolling'], ['num-raster-threads', '4']]);
});

test('renderização: novas flags', () => {
  const { speedOptions: so, speedSwitches: sw, speedFeatures: sf } = require('../src/app/speed_options');
  const o = so({ ignoreGpuBlocklist: true, forceSrgb: true, skiaGraphite: true, parallelDownloads: true });
  assert.deepStrictEqual(sw(o), [['ignore-gpu-blocklist'], ['force-color-profile', 'srgb']]);
  assert.deepStrictEqual(sf(o), [require('../src/app/speed_options').parallelFeature(4), 'SkiaGraphite']);
  assert.deepStrictEqual(sf(so({ parallelDownloads: false })), []);
});

test('downloads em paralelo: ligado por padrão, conexões limitadas e viram parâmetros', () => {
  const { speedOptions: so, speedFeatures: sf, checkSpeedValue } = require('../src/app/speed_options');
  assert.deepStrictEqual(sf(so(null)), ['ParallelDownloading<EvlDownloads.On:request_count/4/min_slice_size/524288/remaining_time/0']);
  assert.match(sf(so({ downloadConnections: 99 }))[0], /request_count\/8\//);
  assert.strictEqual(checkSpeedValue('downloadConnections', 1), 2);
});
