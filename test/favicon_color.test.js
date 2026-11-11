// Cor da linha sobre o ícone da aba: cor do favicon, ou cor fixa do site.
const test = require('node:test');
const assert = require('node:assert');
const { hostColor, iconBuffer, colorFromBitmap } = require('../src/tabs/favicon_color');

function solid(w, h, [r, g, b, a = 255]) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) buf.set([b, g, r, a], i * 4); // BGRA
  return buf;
}

test('hostColor: mesma cor para o mesmo site (com ou sem www) e formato #rrggbb', () => {
  assert.match(hostColor('github.com'), /^#[0-9a-f]{6}$/);
  assert.strictEqual(hostColor('www.github.com'), hostColor('github.com'));
  assert.notStrictEqual(hostColor('github.com'), hostColor('youtube.com'));
});

test('colorFromBitmap: cor sólida, ignora fundo transparente e branco', () => {
  assert.strictEqual(colorFromBitmap(solid(4, 4, [255, 0, 0]), 4, 4), '#ff0000');
  const mix = Buffer.concat([solid(2, 4, [0, 0, 255]), solid(2, 4, [255, 255, 255]), solid(4, 4, [0, 0, 0, 0])]);
  assert.strictEqual(colorFromBitmap(mix, 4, 4 + 2), '#0000ff');
});

test('colorFromBitmap: ícone cinza usa a média; vazio ou transparente dá null', () => {
  assert.strictEqual(colorFromBitmap(solid(4, 4, [128, 128, 128]), 4, 4), '#808080');
  assert.strictEqual(colorFromBitmap(solid(4, 4, [9, 9, 9, 0]), 4, 4), null);
  assert.strictEqual(colorFromBitmap(Buffer.alloc(0), 0, 0), null);
});

test('iconBuffer: tira o PNG de dentro de um .ico; outros formatos passam direto', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('resto-do-png')]);
  const ico = Buffer.alloc(22 + png.length);
  ico.writeUInt16LE(1, 2); // tipo ícone
  ico.writeUInt16LE(1, 4); // 1 imagem
  ico.writeUInt32LE(png.length, 6 + 8);
  ico.writeUInt32LE(22, 6 + 12);
  png.copy(ico, 22);
  assert.deepStrictEqual(iconBuffer(ico), png);
  const other = Buffer.from('qualquer outra coisa que não é ico');
  assert.strictEqual(iconBuffer(other), other);
});
