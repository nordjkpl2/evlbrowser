// Leitor mínimo de .zip / .crx (só o que extensões usam: método 0 "guardado" e 8 "deflate").
// Sem dependências: usa o zlib do Node.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_FILES = 5000;
const MAX_TOTAL = 200 * 1024 * 1024; // 200 MB descompactado

// Um .crx é um .zip com um cabeçalho na frente (versões 2 e 3).
function zipStart(buf) {
  if (buf.toString('latin1', 0, 4) !== 'Cr24') return 0;
  const version = buf.readUInt32LE(4);
  if (version === 3) return 12 + buf.readUInt32LE(8);
  if (version === 2) return 16 + buf.readUInt32LE(8) + buf.readUInt32LE(12);
  throw new Error('Versão de .crx não suportada');
}

function readEntries(buf) {
  const base = zipStart(buf);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(base, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo zip inválido');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_FILES) throw new Error('Zip com arquivos demais');
  let p = base + buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip corrompido');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = base + buf.readUInt32LE(p + 42);
    const csize = buf.readUInt32LE(p + 20);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, size, csize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractZip(buf, outDir) {
  const root = path.resolve(outDir);
  let total = 0;
  for (const e of readEntries(buf)) {
    if (e.name.endsWith('/')) continue;
    const target = path.resolve(root, e.name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Caminho inseguro no zip');
    total += e.size;
    if (total > MAX_TOTAL) throw new Error('Extensão grande demais');
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const raw = buf.subarray(start, start + e.csize);
    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('Compressão do zip não suportada');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

module.exports = { extractZip, readEntries };
