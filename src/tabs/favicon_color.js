// Cor de um site para a linha sobre o ícone da aba: a cor dominante do favicon;
// se o ícone não puder ser lido, uma cor fixa calculada do nome do site.
// Funções puras (testáveis); createFaviconColor liga ao Electron (net + nativeImage).

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

// HSL -> #rrggbb (h 0-360, s e l 0-1)
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

// Mesmo site, mesma cor (hash simples do nome, sem "www.").
function hostColor(host) {
  const name = String(host || '').replace(/^www\./, '');
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return hsl(h % 360, 0.62, 0.58);
}

// .ico moderno guarda imagens PNG por dentro: devolve a maior; senão, os próprios bytes.
function iconBuffer(buf) {
  if (buf.length < 22 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return buf;
  let best = null;
  const count = buf.readUInt16LE(4);
  for (let i = 0; i < count && 6 + i * 16 + 16 <= buf.length; i++) {
    const e = 6 + i * 16;
    const size = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    const isPng = offset + 8 <= buf.length && buf.readUInt32BE(offset) === 0x89504e47;
    if (isPng && offset + size <= buf.length && (!best || size > best.size)) best = { size, offset };
  }
  return best ? buf.subarray(best.offset, best.offset + best.size) : buf;
}

// bitmap BGRA (como nativeImage.toBitmap) -> cor dominante #rrggbb, ou null se não houver cor útil.
// Ignora pixels transparentes, quase brancos e quase pretos; pixels coloridos pesam mais.
function colorFromBitmap(bgra, width, height) {
  const total = width * height;
  if (!bgra || bgra.length < total * 4 || total === 0) return null;
  const step = Math.max(1, Math.floor(total / 1024));
  let r = 0, g = 0, b = 0, w = 0;
  let gr = 0, gg = 0, gb = 0, gn = 0; // plano B: qualquer pixel visível (ícone em tons de cinza)
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (bgra[i + 3] < 128) continue;
    const pb = bgra[i], pg = bgra[i + 1], pr = bgra[i + 2];
    gr += pr; gg += pg; gb += pb; gn++;
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max > 235 && min > 215) continue; // quase branco
    if (max < 30) continue; // quase preto
    const weight = 0.1 + (max - min) / 255;
    r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
  }
  if (w > 0) return toHex(r / w, g / w, b / w);
  return gn > 0 ? toHex(gr / gn, gg / gn, gb / gn) : null;
}

// Devolve async (faviconUrl, pageUrl) -> '#rrggbb' (nunca falha). Guarda as últimas respostas em memória.
function createFaviconColor({ net, nativeImage }) {
  const cache = new Map();
  const hostOf = (u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  };
  return async function faviconColor(faviconUrl, pageUrl) {
    const fallback = hostColor(hostOf(pageUrl));
    if (!/^https?:\/\//i.test(faviconUrl || '')) return fallback;
    if (cache.has(faviconUrl)) return cache.get(faviconUrl) || fallback;
    let color = null;
    try {
      const res = await net.fetch(faviconUrl, { credentials: 'omit', signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= 512 * 1024) {
          const img = nativeImage.createFromBuffer(iconBuffer(buf));
          if (!img.isEmpty()) {
            const { width, height } = img.getSize();
            color = colorFromBitmap(img.toBitmap(), width, height);
          }
        }
      }
    } catch {
      // sem rede ou formato que não dá para ler: usa a cor do site
    }
    if (cache.size >= 200) cache.clear();
    cache.set(faviconUrl, color);
    return color || fallback;
  };
}

module.exports = { hostColor, iconBuffer, colorFromBitmap, createFaviconColor };
