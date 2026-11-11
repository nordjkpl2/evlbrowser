const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { extractZip } = require('../src/extensions/extension_zip_reader');
const { parseStoreId, createExtensions } = require('../src/extensions/extension_manager');

// Monta um .zip pequeno (deflate) para o teste.
function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evl-ext-'));

test('parseStoreId aceita ID e links', () => {
  const id = 'a'.repeat(32);
  assert.strictEqual(parseStoreId(id), id);
  assert.strictEqual(parseStoreId(`https://chromewebstore.google.com/detail/nome/${id}?hl=pt`), id);
  assert.strictEqual(parseStoreId('abc'), null);
});

test('extractZip extrai e bloqueia caminhos fora da pasta', () => {
  const out = tmp();
  extractZip(makeZip({ 'a/b.txt': 'oi' }), out);
  assert.strictEqual(fs.readFileSync(path.join(out, 'a', 'b.txt'), 'utf8'), 'oi');
  assert.throws(() => extractZip(makeZip({ '../fora.txt': 'x' }), out), /inseguro/);
});

test('instala zip com pasta, liga/desliga e remove', async () => {
  const loadedPaths = [];
  const ext = {
    loadExtension: async (p) => (loadedPaths.push(p), { id: `E${loadedPaths.length}` }),
    removeExtension: () => {},
  };
  const mem = {};
  const store = { get: (k) => mem[k], set: (k, v) => (mem[k] = v) };
  const dir = tmp();
  const api = createExtensions({ ext, dir, store });
  const zip = makeZip({ 'pasta/manifest.json': '{"name":"Teste","version":"1.2"}', 'pasta/bg.js': '//' });
  const item = await api.install({ buffer: zip });
  assert.strictEqual(item.name, 'Teste');
  assert.ok(item.loaded);
  assert.ok(fs.existsSync(path.join(dir, item.id, 'manifest.json')));
  await api.setEnabled(item.id, false);
  assert.strictEqual(api.list()[0].loaded, false);
  assert.ok(await api.remove(item.id));
  assert.strictEqual(api.list().length, 0);
  assert.ok(!fs.existsSync(path.join(dir, item.id)));
  await assert.rejects(api.install({ buffer: makeZip({ 'x.txt': 'a' }) }), /manifest/);
});

test('nome da loja (__MSG_...__) vira o texto de _locales, e loadAll corrige nomes antigos', async () => {
  const dir = tmp();
  const mem = {};
  const store = { get: (k) => mem[k], set: (k, v) => (mem[k] = v) };
  const ext = { loadExtension: async () => ({ id: 'E1' }), removeExtension: () => {} };
  const api = createExtensions({ ext, dir, store });
  const zip = makeZip({
    'manifest.json': '{"name":"__MSG_extName__","version":"2026.1","default_locale":"en"}',
    '_locales/en/messages.json': '{"extName":{"message":"uBlock Origin Lite"}}',
  });
  const item = await api.install({ buffer: zip });
  assert.strictEqual(item.name, 'uBlock Origin Lite');
  // simula a instalação antiga (nome = nome da pasta)
  mem.list[0].name = 'xmwbm8tw4pik';
  await api.loadAll();
  assert.strictEqual(api.list()[0].name, 'uBlock Origin Lite');
});

test('readManifest resume o acesso: todos os sites e permissões sensíveis', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { readManifest } = require('../src/extensions/extension_manager');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evlx-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'X', version: '1', permissions: ['cookies', 'storage'], host_permissions: ['<all_urls>'] }));
  assert.deepStrictEqual(readManifest(dir).access, { allSites: true, perms: ['cookies'] });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'Y', version: '1', content_scripts: [{ matches: ['https://exemplo.com/*'] }] }));
  assert.deepStrictEqual(readManifest(dir).access, { allSites: false, perms: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});
