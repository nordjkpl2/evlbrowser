// Regras de privacidade que não dependem do Electron (testáveis com `npm test`):
// limpar rastreadores do endereço, saber se um pedido é de terceiros e as opções padrão.
// Foco em velocidade: tudo aqui é conta simples sobre texto, sem consulta a disco ou rede.

const PRIVACY_DEFAULTS = {
  stripParams: true, // tira ?utm_..., fbclid, gclid... ao abrir uma página
  blockThirdPartyCookies: true, // sites de terceiros não leem nem gravam cookies
  sendDnt: true, // avisa "não me rastreie" (DNT e Sec-GPC)
  webrtcProtect: true, // o WebRTC não revela o IP da rede local
  secureDns: true, // DNS por HTTPS (volta ao DNS do sistema se falhar)
  clearOnExit: false, // apagar cookies e cache ao fechar
  trimReferrer: true, // sites de fora só veem o domínio de onde você veio, nunca o endereço completo
  blockExtensionNet: true, // páginas de fundo das extensões não enviam dados para a internet
};

function privacyOptions(raw) {
  const out = { ...PRIVACY_DEFAULTS };
  if (raw && typeof raw === 'object') for (const k in out) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}

// ---------- parâmetros de rastreamento ----------

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id',
  'igshid', 'mc_eid', 'mc_cid', '_ga', '_gl', '_hsenc', '_hsmi', 'mkt_tok', 'vero_id', 'wickedid', 'oly_enc_id',
  'oly_anon_id', 's_cid', 'ref_src', 'ref_url', 'cmpid', 'ck_subscriber_id', '__s', 'rb_clickid', 'spm_id_from',
]);
const TRACKING_PREFIXES = ['utm_', 'hsa_', 'pk_', 'mtm_', 'piwik_'];

const isTrackingParam = (name) => {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.has(n) || TRACKING_PREFIXES.some((p) => n.startsWith(p));
};

// Devolve o endereço limpo, ou null se não havia nada a tirar (o caso comum: custa quase nada).
function cleanUrl(rawUrl) {
  const q = rawUrl.indexOf('?');
  if (q === -1) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let changed = false;
  for (const name of [...u.searchParams.keys()]) {
    if (isTrackingParam(name)) {
      u.searchParams.delete(name);
      changed = true;
    }
  }
  return changed ? u.href : null;
}

// ---------- terceiros ----------

// Sufixos de dois níveis mais comuns (sem baixar a lista pública inteira, que pesa).
const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'com.au', 'net.au',
  'org.au', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'co.in', 'net.in', 'org.in', 'co.nz', 'co.za', 'com.mx',
  'com.ar', 'com.co', 'com.pe', 'com.tr', 'com.cn', 'com.hk', 'com.sg', 'com.tw', 'com.ua', 'com.pt',
]);

// "a.b.exemplo.com.br" -> "exemplo.com.br" (aproximação; IP e localhost ficam como são).
function siteOf(host) {
  const h = String(host).toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':')) return h;
  const labels = h.split('.');
  const last2 = labels.slice(-2).join('.');
  return TWO_LEVEL.has(last2) && labels.length >= 3 ? labels.slice(-3).join('.') : last2;
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

// O pedido vai para um site diferente do da página que o fez? (sem referrer = não dá para saber = não)
function isThirdParty(requestUrl, pageUrl) {
  const page = hostOf(pageUrl);
  if (!page) return false;
  const req = hostOf(requestUrl);
  return !!req && siteOf(req) !== siteOf(page);
}

module.exports = { PRIVACY_DEFAULTS, privacyOptions, cleanUrl, isTrackingParam, siteOf, isThirdParty, hostOf };
