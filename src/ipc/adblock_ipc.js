// Mensagens da categoria "Anúncios" das Configurações (interruptor, contador, sites permitidos).

const { normalizeSite } = require('../data/passwords_vault');

const MAX_ALLOW = 200;

// ctx: { ipcMain, fromUi, adblock, store, getNetwork }
function registerAdblockIpc({ ipcMain, fromUi, adblock, store, getNetwork, getMask = () => false }) {
  const enabled = () => store.get('adblock') !== false; // ligado por padrão
  const allowList = () => (Array.isArray(store.get('adblockAllow')) ? store.get('adblockAllow') : []);
  const popupsOn = () => store.get('adblockPopups') !== false; // fechar popups/anúncios inesperados: ligado por padrão
  const state = () => ({ enabled: enabled(), popups: popupsOn(), blocked: adblock.blocked, allow: allowList() });
  adblock.setAllow(allowList());

  // Pergunta síncrona do preload das páginas (preload_web_pages.js): o reforço de dentro da página
  // (esconder anúncios, YouTube) segue o interruptor e a lista de sites permitidos.
  ipcMain.on('adblock:enabled', (event) => {
    let host = '';
    try {
      host = new URL(event.senderFrame.url).hostname;
    } catch {}
    const free = fromUi(event) || adblock.allowedHost(host);
    // uma única consulta por página: anúncios, popups e "esconder hardware" (privacidade)
    event.returnValue = { ads: !free && enabled(), popups: !free && popupsOn(), mask: !fromUi(event) && getMask() };
  });
  ipcMain.handle('adblock:get', (event) => (fromUi(event) ? state() : null));
  ipcMain.handle('adblock:set', (event, on) => {
    if (!fromUi(event) || typeof on !== 'boolean') return null;
    store.set('adblock', on);
    getNetwork().refresh();
    return state();
  });
  ipcMain.handle('adblock:popups', (event, on) => {
    if (!fromUi(event) || typeof on !== 'boolean') return null;
    store.set('adblockPopups', on);
    return state();
  });
  // Permitir/voltar a bloquear num site: add = true inclui, false remove.
  ipcMain.handle('adblock:allow', (event, site, add) => {
    const host = fromUi(event) && typeof site === 'string' ? normalizeSite(site) : null;
    if (!host) return null;
    const rest = allowList().filter((h) => h !== host);
    const next = add === true ? [...rest, host].slice(-MAX_ALLOW) : rest;
    store.set('adblockAllow', next);
    adblock.setAllow(next);
    return state();
  });
  return { popupsOn };
}

module.exports = { registerAdblockIpc };
