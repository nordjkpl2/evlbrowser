// Canais gerais das Configurações: user agent (aba Cookies) e "Restaurar padrões".

// Preferências que voltam ao padrão. Histórico, favoritos, senhas, cookies, extensões, a lista de motores
// de busca, permissões lembradas, sites liberados no bloqueador e idioma NÃO entram aqui.
const PREF_KEYS = ['theme', 'accent', 'fontScale', 'fontFamily', 'tabLayout', 'speed', 'privacy', 'adblock', 'adblockPopups', 'userAgent', 'engine'];

// Texto simples (ASCII visível), 8 a 400 caracteres; vazio = usar o padrão.
const validUserAgent = (text) => /^[\x20-\x7e]{8,400}$/.test(text);

// ctx: { ipcMain, fromUi, app, session, getStore, getTabs, defaultUA, beforeRestart }
function registerSettingsIpc({ ipcMain, fromUi, app, session, getStore, getTabs, defaultUA, beforeRestart = () => {} }) {
  function applyUserAgent() {
    const ua = getStore().get('userAgent') || defaultUA;
    session.defaultSession.setUserAgent(ua);
    for (const tab of getTabs()?.tabs.values() ?? []) tab.view?.webContents.setUserAgent(ua);
  }

  ipcMain.handle('ua:get', (event) => (fromUi(event) ? { value: getStore().get('userAgent') ?? '', default: defaultUA } : null));
  ipcMain.handle('ua:set', (event, ua) => {
    if (!fromUi(event)) return null;
    const text = typeof ua === 'string' ? ua.trim() : '';
    if (text && !validUserAgent(text)) return { ok: false };
    getStore().set('userAgent', text || null);
    applyUserAgent();
    return { ok: true };
  });

  // O Evl reinicia depois, para as opções de velocidade valerem.
  ipcMain.on('settings:reset', (event) => {
    if (!fromUi(event)) return;
    for (const key of PREF_KEYS) getStore().set(key, null);
    beforeRestart();
    getStore().flush();
    app.relaunch();
    app.exit(0);
  });

  return { applyUserAgent };
}

module.exports = { PREF_KEYS, validUserAgent, registerSettingsIpc };
