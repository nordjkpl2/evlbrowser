// Tradução da página (botão da barra, como o do Chrome/Firefox).
// Fluxo: 1) lê os textos visíveis da página; 2) manda em blocos para o serviço de tradução;
// 3) troca o texto de cada nó, sem mexer em HTML (só nodeValue). "Mostrar original" desfaz.
// Só a página atual é traduzida: ao navegar para outra página, a tradução some.

const LANG_CODES = new Set(['pt', 'en', 'es', 'fr', 'de', 'it', 'zh-CN', 'ja', 'ru']);
const MAX_NODES = 3000; // limite de textos por página
const CHUNK_CHARS = 4000; // tamanho de cada pedido ao serviço
const CHUNK_ITEMS = 100;
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

// Roda na página: junta os nós de texto que devem ser traduzidos e guarda-os em window.__evlTr.
const COLLECT_SCRIPT = String.raw`(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'MATH', 'TEMPLATE', 'SELECT']);
  const nodes = [];
  const root = document.body || document.documentElement;
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode()) && nodes.length < ${MAX_NODES}) {
    const s = n.nodeValue.trim();
    if (s.length < 2 || !/\p{L}/u.test(s)) continue;
    const p = n.parentElement;
    if (!p || SKIP.has(p.tagName) || p.isContentEditable || p.closest('[translate="no"], .notranslate')) continue;
    nodes.push(n);
  }
  window.__evlTr = { nodes, originals: nodes.map((x) => x.nodeValue) };
  return nodes.map((x) => x.nodeValue.trim());
})()`;

// Troca os textos. "list" tem um item por nó (null = não traduzido). Mantém os espaços em volta.
function applyScript(list) {
  return String.raw`(() => {
    const st = window.__evlTr;
    if (!st) return 0;
    const list = ${JSON.stringify(list)};
    let done = 0;
    list.forEach((t, i) => {
      const node = st.nodes[i];
      if (t === null || !node || !node.isConnected) return;
      const o = st.originals[i];
      node.nodeValue = o.match(/^\s*/)[0] + t + o.match(/\s*$/)[0];
      done++;
    });
    return done;
  })()`;
}

const RESTORE_SCRIPT = `(() => {
  const st = window.__evlTr;
  if (!st) return 0;
  st.nodes.forEach((node, i) => { if (node.isConnected) node.nodeValue = st.originals[i]; });
  delete window.__evlTr;
  return 1;
})()`;

// Divide os índices em blocos que cabem num pedido.
function chunkIndices(texts) {
  const out = [];
  let cur = [];
  let size = 0;
  texts.forEach((t, i) => {
    const len = t.length + 1;
    if (cur.length && (size + len > CHUNK_CHARS || cur.length >= CHUNK_ITEMS)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += len;
  });
  if (cur.length) out.push(cur);
  return out;
}

// Monta o pedido. Cada texto vira uma linha; quebras internas viram espaço para não estragar a contagem.
function buildRequest(texts, from, to) {
  const q = texts.map((s) => s.replace(/\s*\n\s*/g, ' ')).join('\n');
  return new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q }).toString();
}

// Lê a resposta e devolve uma tradução por texto, ou null se a contagem não bater (aí fica o original).
function parseResponse(body, count) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const joined = (Array.isArray(data?.[0]) ? data[0] : []).map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('');
  const parts = joined.split('\n');
  if (parts.length !== count) return null;
  return parts.map((p) => p.trim() || null);
}

// Traduz um bloco. fetchFn(url, options) -> Response (net.fetch no main.js).
async function translateChunk(texts, from, to, fetchFn) {
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: buildRequest(texts, from, to),
    credentials: 'omit', // sem cookies: o pedido não leva a conta do navegador
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseResponse(await res.text(), texts.length);
}

// Fluxo completo numa aba. wc: webContents da página. Devolve { ok, total, done } ou { ok:false, error }.
async function translatePage(wc, { from, to }, fetchFn) {
  const texts = await wc.executeJavaScript(COLLECT_SCRIPT);
  if (!texts.length) return { ok: true, total: 0, done: 0 };
  const list = new Array(texts.length).fill(null);
  for (const idx of chunkIndices(texts)) {
    if (wc.isDestroyed()) return { ok: false, error: 'no-page' };
    const part = idx.map((i) => texts[i]);
    const out = await translateChunk(part, from, to, fetchFn);
    if (out) out.forEach((t, k) => (list[idx[k]] = t));
  }
  const done = await wc.executeJavaScript(applyScript(list));
  return { ok: true, total: texts.length, done };
}

module.exports = { LANG_CODES, COLLECT_SCRIPT, RESTORE_SCRIPT, applyScript, chunkIndices, buildRequest, parseResponse, translateChunk, translatePage };
