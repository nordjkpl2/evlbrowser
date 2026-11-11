// Liga o bloqueador de anúncios e a privacidade à rede do Chromium (session.webRequest).
// O webRequest só aceita UM ouvinte por tipo de evento, então ele é registrado aqui, juntando tudo.
// Velocidade: ouvinte desligado = o Chromium nem chama o nosso código. Só registramos o que está ligado.

const { cleanUrl, isThirdParty, httpsUrl } = require('./privacy_engine');

const isExtensionRequest = (d) => typeof d.initiator === 'string' && d.initiator.startsWith('chrome-extension://');

// Detalhes do computador que o Chromium só envia quando o site pede (Accept-CH): cortamos.
const HIGH_ENTROPY_HINTS = ['sec-ch-ua-full-version-list', 'sec-ch-ua-full-version', 'sec-ch-ua-platform-version', 'sec-ch-ua-arch', 'sec-ch-ua-bitness', 'sec-ch-ua-model', 'sec-ch-ua-wow64'];
// Desliga APIs de anúncio/rastreio do próprio Chromium em todas as páginas e quadros.
const POLICY = 'browsing-topics=(), interest-cohort=(), join-ad-interest-group=(), run-ad-auction=(), attribution-reporting=()';

// ws/wss entram no filtro: sem eles uma extensão (ou rastreador) falava com a internet por WebSocket sem passar aqui.
const FILTER = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };

// Apaga um cabeçalho sem se importar com maiúsculas ("Set-Cookie", "set-cookie").
function dropHeader(headers, name) {
  for (const k of Object.keys(headers)) if (k.toLowerCase() === name) delete headers[k];
}

function referrerOrigin(ref) {
  try {
    const u = new URL(ref);
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/` : null;
  } catch {
    return null;
  }
}

// ctx: { session, adblock, getAdblockOn(): boolean, getPrivacy(): opções, isFullExtension(initiator): extensão com "acesso completo" }
function createNetworkHub({ session, adblock, getAdblockOn, getPrivacy, isFullExtension = () => false }) {
  return {
    refresh() {
      const requests = session.defaultSession.webRequest;
      const adsOn = getAdblockOn();
      const p = getPrivacy();

      if (adsOn || p.stripParams || p.blockExtensionNet || p.blockBeacons || p.httpsOnly) {
        requests.onBeforeRequest(FILTER, (d, callback) => {
          // extensão (página de fundo / service worker) tentando falar com a internet
          if (p.blockExtensionNet && isExtensionRequest(d) && !isFullExtension(d.initiator)) return callback({ cancel: true });
          const secure = p.httpsOnly ? httpsUrl(d.url) : null;
          if (secure) return callback({ redirectURL: secure });
          if (d.resourceType === 'mainFrame') {
            const clean = p.stripParams && d.method === 'GET' ? cleanUrl(d.url) : null;
            return callback(clean ? { redirectURL: clean } : {});
          }
          // relatórios de CSP vão para terceiros e só servem a quem rastreia: cortamos com o bloqueador ligado
          if ((adsOn || p.blockBeacons) && d.resourceType === 'cspReport') return callback({ cancel: true });
          if (p.blockBeacons && d.resourceType === 'ping') return callback({ cancel: true }); // sendBeacon e <a ping>
          callback(adsOn && adblock.check(d.url, d.resourceType, d.referrer) ? { cancel: true } : {});
        });
      } else requests.onBeforeRequest(null);

      if (p.sendDnt || p.blockThirdPartyCookies || p.trimReferrer || p.limitFingerprint || p.englishOnly) {
        requests.onBeforeSendHeaders(FILTER, (d, callback) => {
          const headers = d.requestHeaders;
          if (p.sendDnt) {
            headers.DNT = '1';
            headers['Sec-GPC'] = '1';
          }
          if (p.blockThirdPartyCookies && d.resourceType !== 'mainFrame' && isThirdParty(d.url, d.referrer)) {
            dropHeader(headers, 'cookie');
          }
          if (p.limitFingerprint) for (const h of HIGH_ENTROPY_HINTS) dropHeader(headers, h);
          if (p.englishOnly) {
            dropHeader(headers, 'accept-language');
            headers['Accept-Language'] = 'en-US,en;q=0.9';
          }
          if (p.trimReferrer && d.referrer && isThirdParty(d.url, d.referrer)) {
            const origin = referrerOrigin(d.referrer);
            if (origin) {
              dropHeader(headers, 'referer');
              headers.Referer = origin;
            }
          }
          callback({ requestHeaders: headers });
        });
      } else requests.onBeforeSendHeaders(null);

      if (p.blockThirdPartyCookies || p.limitFingerprint) {
        requests.onHeadersReceived(FILTER, (d, callback) => {
          let headers = null;
          // páginas e quadros: liga a política que desliga as APIs de anúncios do Chromium
          if (p.limitFingerprint && (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame')) {
            headers = d.responseHeaders ?? {};
            const key = Object.keys(headers).find((k) => k.toLowerCase() === 'permissions-policy');
            if (key) headers[key] = [...[].concat(headers[key]), POLICY];
            else headers['Permissions-Policy'] = [POLICY];
          }
          if (p.blockThirdPartyCookies && d.resourceType !== 'mainFrame' && isThirdParty(d.url, d.referrer)) {
            headers ??= d.responseHeaders ?? {};
            dropHeader(headers, 'set-cookie');
          }
          callback(headers ? { responseHeaders: headers } : {});
        });
      } else requests.onHeadersReceived(null);
    },
  };
}

module.exports = { createNetworkHub };
