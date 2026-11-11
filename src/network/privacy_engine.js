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
  limitFingerprint: true, // esconde detalhes do computador (client hints) e desliga APIs de anúncios do Chromium
  blockExtensionNet: true, // páginas de fundo das extensões não enviam dados para a internet
  noWebgl: false, // desliga o WebGL nas abas novas (mapas e jogos 3D deixam de funcionar)
  maskHardware: false, // sites veem sempre 4 núcleos e 8 GB de memória
  letterbox: false, // página com tamanho em múltiplos de 200x100 px (a janela exata não identifica você)
  blockBeacons: true, // corta pings/beacons e relatórios (só servem para medir você; nenhum site depende deles)
  httpsOnly: false, // só abre https:// (sem voltar para http:// quando o site não oferece)
  webrtcOff: false, // WebRTC sem conexão direta (o IP real nunca aparece; chamadas de vídeo podem falhar)
  canvasNoise: false, // ruído invisível no canvas (a "assinatura" do desenho muda a cada página)
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
  'srsltid', 'ysclid', '_openstat', 'mibextid', 'irclickid', 's_kwcid', 'epik', 'gad_source', 'gad_campaignid', 'igsh',
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
// O resultado por host fica em cache: quase todos os pedidos de uma página repetem poucos hosts.
const siteCache = new Map();
const SITE_CACHE_MAX = 2000;
const IPV4 = /^[\d.]+$/;
function siteOf(host) {
  const hit = siteCache.get(host);
  if (hit !== undefined) return hit;
  const h = String(host).toLowerCase();
  let site = h;
  if (h.includes('.') && !IPV4.test(h) && !h.includes(':')) {
    const labels = h.split('.');
    const last2 = labels.slice(-2).join('.');
    site = TWO_LEVEL.has(last2) && labels.length >= 3 ? labels.slice(-3).join('.') : last2;
  }
  if (siteCache.size >= SITE_CACHE_MAX) siteCache.clear();
  siteCache.set(host, site);
  return site;
}

// Separa "https://usuario@a.b.com:8080/x?y#z" em host ("a.b.com") e "where" ("/x?y") sem criar um URL.
// É ~3x mais rápido que new URL e roda a cada pedido de rede. Devolve null se não parece http(s)/ws(s).
function splitUrl(url) {
  const i = url.indexOf('://');
  if (i < 1 || i > 5) return null;
  const n = url.length;
  const start = i + 3;
  let end = start;
  while (end < n) {
    const c = url.charCodeAt(end);
    if (c === 47 || c === 63 || c === 35) break; // / ? #
    end++;
  }
  let host = url.slice(start, end);
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  if (host.charCodeAt(0) !== 91) {
    const colon = host.indexOf(':'); // porta (IPv6 entre colchetes fica como está)
    if (colon >= 0) host = host.slice(0, colon);
  }
  let stop = url.indexOf('#', end);
  if (stop < 0) stop = n;
  return { host: host.toLowerCase(), where: url.slice(end, stop) };
}

// http://site -> https://site (HTTPS obrigatório). Rede local e localhost ficam como estão; null = nada a trocar.
const LOCAL_HOST = /^(localhost|[\d.]+|\[.*\]|[^.]+|.*\.(local|lan|internal|test))$/;
function httpsUrl(url) {
  if (!url.startsWith('http://')) return null;
  const host = splitUrl(url)?.host;
  return host && !LOCAL_HOST.test(host) ? `https://${url.slice(7)}` : null;
}

// Política do WebRTC conforme as opções (a mais forte vence).
const webrtcPolicy = (o) => (o.webrtcOff ? 'disable_non_proxied_udp' : o.webrtcProtect ? 'default_public_interface_only' : 'default');

const hostOf = (url) => splitUrl(url)?.host ?? '';

// Este pedido é de um site diferente da página que o fez?
function isThirdParty(requestUrl, pageUrl) {
  const page = hostOf(pageUrl);
  if (!page) return false;
  const req = hostOf(requestUrl);
  return !!req && siteOf(req) !== siteOf(page);
}

module.exports = { httpsUrl, webrtcPolicy, PRIVACY_DEFAULTS, privacyOptions, cleanUrl, isTrackingParam, siteOf, isThirdParty, hostOf, splitUrl };
