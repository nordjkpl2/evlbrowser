// Mensagens da categoria "Anúncios" das Configurações.

// ctx: { ipcMain, fromUi, adblock, store, session }
function registerAdblockIpc({ ipcMain, fromUi, adblock, store, session }) {
  const enabled = () => store.get('adblock') !== false; // ligado por padrão

  // Liga/desliga a ESCUTA da rede: desligado, o Chromium nem chama o nosso código.
  function apply() {
    const requests = session.defaultSession.webRequest;
    if (!enabled()) return requests.onBeforeRequest(null);
    requests.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      callback({ cancel: adblock.check(details.url, details.resourceType, details.referrer) });
    });
  }

  ipcMain.handle('adblock:get', (event) => (fromUi(event) ? { enabled: enabled(), blocked: adblock.blocked } : null));
  ipcMain.handle('adblock:set', (event, on) => {
    if (!fromUi(event) || typeof on !== 'boolean') return null;
    store.set('adblock', on);
    apply();
    return { enabled: enabled(), blocked: adblock.blocked };
  });
  return { apply };
}

module.exports = { registerAdblockIpc };
