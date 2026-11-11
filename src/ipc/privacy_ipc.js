// Mensagens da categoria "Privacidade" das Configurações e a aplicação das opções.

const { PRIVACY_DEFAULTS, privacyOptions } = require('../privacy_engine');

const DOH_SERVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'];

// ctx: { ipcMain, fromUi, store, session, app, getNetwork, getTabs }
function registerPrivacyIpc({ ipcMain, fromUi, store, session, app, getNetwork, getTabs }) {
  const options = () => privacyOptions(store.get('privacy'));

  // Aplica tudo o que está ligado (na abertura do app e a cada mudança).
  function apply() {
    const o = options();
    getNetwork().refresh();
    getTabs()?.setWebrtcPolicy(o.webrtcProtect ? 'default_public_interface_only' : 'default');
    // "automatic": usa DNS por HTTPS e, se falhar, volta para o DNS do sistema (não trava a navegação).
    app.configureHostResolver({ secureDnsMode: o.secureDns ? 'automatic' : 'off', secureDnsServers: DOH_SERVERS });
  }

  ipcMain.handle('privacy:get', (event) => (fromUi(event) ? options() : null));
  ipcMain.handle('privacy:set', (event, key, on) => {
    if (!fromUi(event) || !(key in PRIVACY_DEFAULTS) || typeof on !== 'boolean') return null;
    store.set('privacy', { ...options(), [key]: on });
    apply();
    return options();
  });
  // Apaga o cache e os dados dos sites (cookies, armazenamento local).
  ipcMain.handle('privacy:clear', async (event) => {
    if (!fromUi(event)) return false;
    await Promise.all([session.defaultSession.clearCache(), session.defaultSession.clearStorageData()]);
    return true;
  });

  return { apply, options };
}

module.exports = { registerPrivacyIpc };
