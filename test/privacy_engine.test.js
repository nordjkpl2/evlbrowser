const test = require('node:test');
const assert = require('node:assert');
const { cleanUrl, isThirdParty, siteOf, privacyOptions } = require('../src/network/privacy_engine');
const { createNetworkHub } = require('../src/network/network_hub');

test('cleanUrl tira rastreadores e deixa o resto; sem mudança devolve null', () => {
  assert.strictEqual(cleanUrl('https://a.com/p?id=1&utm_source=x&fbclid=abc&UTM_medium=y'), 'https://a.com/p?id=1');
  assert.strictEqual(cleanUrl('https://a.com/p?utm_source=x'), 'https://a.com/p');
  assert.strictEqual(cleanUrl('https://a.com/p?id=1'), null);
  assert.strictEqual(cleanUrl('https://a.com/p'), null);
  assert.strictEqual(cleanUrl('javascript:alert(1)?utm_x=1'), null);
});

test('siteOf e isThirdParty (com sufixos de dois níveis)', () => {
  assert.strictEqual(siteOf('a.b.exemplo.com.br'), 'exemplo.com.br');
  assert.strictEqual(siteOf('www.exemplo.com'), 'exemplo.com');
  assert.strictEqual(siteOf('localhost'), 'localhost');
  assert.strictEqual(isThirdParty('https://cdn.exemplo.com/x.js', 'https://www.exemplo.com/'), false);
  assert.strictEqual(isThirdParty('https://ads.outro.net/x.js', 'https://www.exemplo.com/'), true);
  assert.strictEqual(isThirdParty('https://ads.outro.net/x.js', ''), false);
});

test('privacyOptions ignora lixo e mantém os padrões', () => {
  const o = privacyOptions({ stripParams: false, sendDnt: 'sim', xyz: 1 });
  assert.strictEqual(o.stripParams, false);
  assert.strictEqual(o.sendDnt, true);
  assert.strictEqual(o.clearOnExit, false);
  assert.strictEqual(privacyOptions(null).blockThirdPartyCookies, true);
});

function fakeSession() {
  const handlers = {};
  const reg = (name) => (filter, fn) => (handlers[name] = fn ?? null, filter === null ? (handlers[name] = null) : 0);
  return {
    handlers,
    defaultSession: { webRequest: { onBeforeRequest: reg('req'), onBeforeSendHeaders: reg('send'), onHeadersReceived: reg('recv') } },
  };
}
const run = (fn, details) => new Promise((resolve) => fn(details, resolve));

test('hub: só registra o que está ligado e aplica as regras', async () => {
  const session = fakeSession();
  const adblock = { check: (url) => url.includes('doubleclick') };
  let ads = true;
  let p = { stripParams: true, blockThirdPartyCookies: true, sendDnt: true };
  const hub = createNetworkHub({ session, adblock, getAdblockOn: () => ads, getPrivacy: () => p });
  hub.refresh();

  // página principal: tira rastreadores (redireciona); anúncio de terceiro: cancela
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'mainFrame', method: 'GET', url: 'https://a.com/?utm_x=1' }), { redirectURL: 'https://a.com/' });
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'mainFrame', method: 'POST', url: 'https://a.com/?utm_x=1' }), {});
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'script', url: 'https://x.doubleclick.net/a.js', referrer: 'https://a.com/' }), { cancel: true });

  // cabeçalhos: DNT/GPC sempre; Cookie some só em pedido de terceiro
  const sent = await run(session.handlers.send, { resourceType: 'script', url: 'https://t.net/a.js', referrer: 'https://a.com/', requestHeaders: { Cookie: 'x=1', Accept: '*/*' } });
  assert.deepStrictEqual(sent.requestHeaders, { Accept: '*/*', DNT: '1', 'Sec-GPC': '1' });
  const own = await run(session.handlers.send, { resourceType: 'script', url: 'https://cdn.a.com/a.js', referrer: 'https://a.com/', requestHeaders: { cookie: 'x=1' } });
  assert.strictEqual(own.requestHeaders.cookie, 'x=1');

  // Set-Cookie de terceiro some
  const recv = await run(session.handlers.recv, { resourceType: 'image', url: 'https://t.net/p.gif', referrer: 'https://a.com/', responseHeaders: { 'Set-Cookie': ['a=1'], 'content-type': ['image/gif'] } });
  assert.deepStrictEqual(Object.keys(recv.responseHeaders), ['content-type']);

  // tudo desligado: nenhum ouvinte (custo zero)
  ads = false;
  p = { stripParams: false, blockThirdPartyCookies: false, sendDnt: false };
  hub.refresh();
  assert.strictEqual(session.handlers.req, null);
  assert.strictEqual(session.handlers.send, null);
  assert.strictEqual(session.handlers.recv, null);
});

test('hub: corta rede de extensões e reduz o Referer de terceiros', async () => {
  const session = fakeSession();
  const p = { stripParams: false, blockThirdPartyCookies: false, sendDnt: false, trimReferrer: true, blockExtensionNet: true };
  createNetworkHub({ session, adblock: { check: () => false }, getAdblockOn: () => false, getPrivacy: () => p }).refresh();
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'xhr', url: 'https://coleta.net/x', initiator: 'chrome-extension://abc' }), { cancel: true });
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'xhr', url: 'https://api.site.com/x', initiator: 'https://site.com' }), {});
  const sent = await run(session.handlers.send, { resourceType: 'image', url: 'https://t.net/p.gif', referrer: 'https://a.com/privado/pagina?q=1', requestHeaders: { Referer: 'https://a.com/privado/pagina?q=1' } });
  assert.deepStrictEqual(sent.requestHeaders, { Referer: 'https://a.com/' });
  const own = await run(session.handlers.send, { resourceType: 'image', url: 'https://cdn.a.com/p.gif', referrer: 'https://a.com/x?q=1', requestHeaders: { Referer: 'https://a.com/x?q=1' } });
  assert.strictEqual(own.requestHeaders.Referer, 'https://a.com/x?q=1');
});

test('hub: corta client hints detalhados e liga a política de anúncios do Chromium', async () => {
  const session = fakeSession();
  const p = { stripParams: false, blockThirdPartyCookies: false, sendDnt: false, trimReferrer: false, blockExtensionNet: false, limitFingerprint: true };
  createNetworkHub({ session, adblock: { check: () => false }, getAdblockOn: () => true, getPrivacy: () => p }).refresh();
  const sent = await run(session.handlers.send, { resourceType: 'mainFrame', url: 'https://a.com/', requestHeaders: { 'Sec-CH-UA-Model': '"x"', 'Sec-CH-UA': '"Chromium"' } });
  assert.deepStrictEqual(sent.requestHeaders, { 'Sec-CH-UA': '"Chromium"' });
  const r = await run(session.handlers.recv, { resourceType: 'mainFrame', url: 'https://a.com/', responseHeaders: { 'permissions-policy': ['camera=()'] } });
  assert.strictEqual(r.responseHeaders['permissions-policy'].length, 2);
  const img = await run(session.handlers.recv, { resourceType: 'image', url: 'https://a.com/x.png', responseHeaders: {} });
  assert.deepStrictEqual(img, {});
  assert.deepStrictEqual(await run(session.handlers.req, { resourceType: 'cspReport', url: 'https://r.net/csp' }), { cancel: true });
});

test('novas opções: só HTTPS, beacons, WebRTC e filtro com WebSocket', async () => {
  const { httpsUrl, webrtcPolicy, privacyOptions } = require('../src/network/privacy_engine');
  const { createNetworkHub } = require('../src/network/network_hub');
  assert.strictEqual(httpsUrl('http://site.com/a?b=1'), 'https://site.com/a?b=1');
  for (const u of ['https://site.com/', 'http://localhost:3000/', 'http://192.168.0.1/', 'http://impressora/', 'http://nas.local/']) assert.strictEqual(httpsUrl(u), null);
  assert.strictEqual(webrtcPolicy(privacyOptions({ webrtcOff: true })), 'disable_non_proxied_udp');
  assert.strictEqual(webrtcPolicy(privacyOptions(null)), 'default_public_interface_only');
  assert.strictEqual(webrtcPolicy(privacyOptions({ webrtcProtect: false })), 'default');
  const d = privacyOptions(null);
  assert.ok(d.blockBeacons && !d.httpsOnly && !d.webrtcOff && !d.canvasNoise); // padrão conservador
  let handler = null;
  let filter = null;
  const session = { defaultSession: { webRequest: { onBeforeRequest: (f, h) => ((filter = f), (handler = h ?? f)), onBeforeSendHeaders() {}, onHeadersReceived() {} } } };
  createNetworkHub({ session, adblock: { check: () => false }, getAdblockOn: () => false, getPrivacy: () => privacyOptions({ httpsOnly: true }) }).refresh();
  const ask = (req) => new Promise((done) => handler(req, done));
  assert.ok(filter.urls.includes('wss://*/*') && filter.urls.includes('ws://*/*'));
  assert.deepStrictEqual(await ask({ resourceType: 'mainFrame', method: 'GET', url: 'http://a.com/' }), { redirectURL: 'https://a.com/' });
  assert.deepStrictEqual(await ask({ resourceType: 'ping', url: 'https://a.com/p' }), { cancel: true });
  assert.deepStrictEqual(await ask({ resourceType: 'webSocket', url: 'wss://coleta.net/', initiator: 'chrome-extension://abc' }), { cancel: true });
  assert.deepStrictEqual(await ask({ resourceType: 'image', url: 'https://a.com/i.png' }), {});
});
