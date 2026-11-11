// Liga o bloqueador de anúncios e a privacidade à rede do Chromium (session.webRequest).
// O webRequest só aceita UM ouvinte por tipo de evento, então ele é registrado aqui, juntando tudo.
// Velocidade: ouvinte desligado = o Chromium nem chama o nosso código. Só registramos o que está ligado.

const { cleanUrl, isThirdParty } = require('./privacy_engine');

const isExtensionRequest = (d) => typeof d.initiator === 'string' && d.initiator.startsWith('chrome-extension://');

const FILTER = { urls: ['http://*/*', 'https://*/*'] };

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

// ctx: { session, adblock, getAdblockOn(): boolean, getPrivacy(): opções }
function createNetworkHub({ session, adblock, getAdblockOn, getPrivacy }) {
  return {
    refresh() {
      const requests = session.defaultSession.webRequest;
      const adsOn = getAdblockOn();
      const p = getPrivacy();

      if (adsOn || p.stripParams || p.blockExtensionNet) {
        requests.onBeforeRequest(FILTER, (d, callback) => {
          // extensão (página de fundo / service worker) tentando falar com a internet
          if (p.blockExtensionNet && isExtensionRequest(d)) return callback({ cancel: true });
          if (d.resourceType === 'mainFrame') {
            const clean = p.stripParams && d.method === 'GET' ? cleanUrl(d.url) : null;
            return callback(clean ? { redirectURL: clean } : {});
          }
          callback(adsOn && adblock.check(d.url, d.resourceType, d.referrer) ? { cancel: true } : {});
        });
      } else requests.onBeforeRequest(null);

      if (p.sendDnt || p.blockThirdPartyCookies || p.trimReferrer) {
        requests.onBeforeSendHeaders(FILTER, (d, callback) => {
          const headers = d.requestHeaders;
          if (p.sendDnt) {
            headers.DNT = '1';
            headers['Sec-GPC'] = '1';
          }
          if (p.blockThirdPartyCookies && d.resourceType !== 'mainFrame' && isThirdParty(d.url, d.referrer)) {
            dropHeader(headers, 'cookie');
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

      if (p.blockThirdPartyCookies) {
        requests.onHeadersReceived(FILTER, (d, callback) => {
          if (d.resourceType === 'mainFrame' || !isThirdParty(d.url, d.referrer)) return callback({});
          const headers = d.responseHeaders ?? {};
          dropHeader(headers, 'set-cookie');
          callback({ responseHeaders: headers });
        });
      } else requests.onHeadersReceived(null);
    },
  };
}

module.exports = { createNetworkHub };
