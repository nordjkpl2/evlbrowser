// Mensagens da categoria "Privacidade" das Configurações e a aplicação das opções.

const { PRIVACY_DEFAULTS, privacyOptions, webrtcPolicy, dnsMode, validProxy } = require('../network/privacy_engine');

const DOH_SERVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.quad9.net/dns-query', 'https://dns.google/dns-query'];

// ctx: { ipcMain, fromUi, store, session, app, getNetwork, getTabs, getSessions }
// getSessions(): sessões que seguem estas opções (a padrão e a de cada perfil).
function registerPrivacyIpc({ ipcMain, fromUi, store, session, app, getNetwork, getTabs, getSessions = () => [session.defaultSession] }) {
  const options = () => privacyOptions(store.get('privacy'));
  const proxy = () => validProxy(store.get('proxy')) || '';
  const webrtc = () => webrtcPolicy(options(), proxy());

  // Aplica tudo o que está ligado (na abertura do app e a cada mudança).
  function apply() {
    const o = options();
    getNetwork().refresh();
    getTabs()?.setWebrtcPolicy(webrtc());
    getTabs()?.setFingerprint({ webglOff: o.noWebgl, letterbox: o.letterbox });
    // "automatic": usa DNS por HTTPS e, se falhar, volta para o DNS do sistema (não trava a navegação).
    // "secure" (DNS estrito): nunca volta; o provedor não vê nenhuma consulta.
    app.configureHostResolver({ secureDnsMode: dnsMode(o), secureDnsServers: DOH_SERVERS });
    // Proxy: com socks5 o nome do site também é resolvido do outro lado (o provedor só vê o endereço do proxy).
    const rules = proxy();
    for (const ses of getSessions()) ses.setProxy(rules ? { proxyRules: rules, proxyBypassRules: '<local>' } : { mode: 'system' })?.catch?.(() => {});
  }

  ipcMain.handle('privacy:get', (event) => (fromUi(event) ? options() : null));
  ipcMain.handle('privacy:set', (event, key, on) => {
    if (!fromUi(event) || !(key in PRIVACY_DEFAULTS) || typeof on !== 'boolean') return null;
    store.set('privacy', { ...options(), [key]: on });
    apply();
    return options();
  });
  // Proxy: sem argumento só lê; '' desliga. Devolve { ok, proxy }.
  ipcMain.handle('privacy:proxy', (event, text) => {
    if (!fromUi(event)) return null;
    if (text === undefined || text === null) return { ok: true, proxy: proxy() };
    const next = validProxy(text);
    if (next === null) return { ok: false, proxy: proxy() };
    store.set('proxy', next);
    apply();
    return { ok: true, proxy: next };
  });
  // Apaga o cache e os dados dos sites (cookies, armazenamento local).
  ipcMain.handle('privacy:clear', async (event) => {
    if (!fromUi(event)) return false;
    await Promise.all(getSessions().flatMap((ses) => [ses.clearCache(), ses.clearStorageData()]));
    return true;
  });

  return { apply, options, webrtc };
}

module.exports = { registerPrivacyIpc };
