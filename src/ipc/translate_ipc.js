// Tradução da página: canais translate:* usados pelo botão da barra (ui/ui_translate_popup.js).

const { LANG_CODES, RESTORE_SCRIPT, translatePage } = require('../tabs/page_translate');

// ctx: { ipcMain, fromUi, net, getWebContents }  (getWebContents -> webContents da aba ativa, ou null)
function registerTranslateIpc({ ipcMain, fromUi, net, getWebContents }) {
  ipcMain.handle('translate:run', async (event, from, to) => {
    if (!fromUi(event)) return null;
    if (!(from === 'auto' || LANG_CODES.has(from)) || !LANG_CODES.has(to)) return { ok: false, error: 'lang' };
    const wc = getWebContents();
    if (!wc || wc.isDestroyed()) return { ok: false, error: 'no-page' };
    try {
      return await translatePage(wc, { from, to }, (url, opts) => net.fetch(url, opts));
    } catch {
      return { ok: false, error: 'network' };
    }
  });
  ipcMain.handle('translate:restore', async (event) => {
    if (!fromUi(event)) return null;
    const wc = getWebContents();
    if (!wc || wc.isDestroyed()) return false;
    await wc.executeJavaScript(RESTORE_SCRIPT).catch(() => {});
    return true;
  });
}

module.exports = { registerTranslateIpc };
