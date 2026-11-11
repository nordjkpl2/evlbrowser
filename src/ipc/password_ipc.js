// Mensagens da categoria "Senhas" das Configurações e do preenchimento nas páginas.

const fs = require('fs');

const MAX_CSV = 20 * 1024 * 1024;
const CLEAR_CLIPBOARD_MS = 30000;

// ctx: { ipcMain, fromUi, dialog, clipboard, getVault, getWindow }
function registerPasswordIpc({ ipcMain, fromUi, dialog, clipboard, getVault, getWindow }) {
  const wrap = (fn) => {
    try {
      return { ok: true, ...fn() };
    } catch (err) {
      return { ok: false, error: String(err.message ?? err).slice(0, 200) };
    }
  };
  const isId = (id) => typeof id === 'string' && id.length <= 40;

  ipcMain.handle('passwords:list', (event) =>
    fromUi(event) ? { available: getVault().available(), items: getVault().list() } : null
  );
  ipcMain.handle('passwords:add', (event, entry) => {
    if (!fromUi(event) || typeof entry !== 'object' || !entry) return null;
    return wrap(() => ({ result: getVault().add(entry) }));
  });
  ipcMain.handle('passwords:show', (event, id) => (fromUi(event) && isId(id) ? getVault().reveal(id) : null));
  // Copia sem a senha passar pela interface; limpa a área de transferência depois de 30 s (se ainda for ela).
  ipcMain.handle('passwords:copy', (event, id) => {
    if (!fromUi(event) || !isId(id)) return false;
    const password = getVault().reveal(id);
    if (password === null) return false;
    clipboard.writeText(password);
    setTimeout(() => {
      if (clipboard.readText() === password) clipboard.clear();
    }, CLEAR_CLIPBOARD_MS).unref?.();
    return true;
  });
  ipcMain.handle('passwords:remove', (event, id) => (fromUi(event) && isId(id) ? getVault().remove(id) : false));
  ipcMain.handle('passwords:clear', (event) => {
    if (fromUi(event)) getVault().clear();
    return true;
  });
  ipcMain.handle('passwords:import', async (event) => {
    if (!fromUi(event)) return null;
    try {
      // quem escolhe o arquivo é uma janela do sistema aberta aqui (a interface não passa caminhos)
      const pick = await dialog.showOpenDialog(getWindow(), {
        title: 'Importar senhas (.csv)',
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      const file = pick.filePaths[0];
      if (pick.canceled || !file) return { ok: true, canceled: true };
      if (fs.statSync(file).size > MAX_CSV) throw new Error('O arquivo é grande demais (máximo 20 MB).');
      return { ok: true, ...getVault().importCsv(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      return { ok: false, error: String(err.message ?? err).slice(0, 200) };
    }
  });

  // ----- vindo das PÁGINAS (preload_web_pages.js): só da página principal de uma aba, nunca da interface -----
  function pageHost(event) {
    if (fromUi(event) || event.senderFrame !== event.sender.mainFrame) return null;
    try {
      const u = new URL(event.senderFrame.url);
      return u.protocol === 'https:' || u.hostname === 'localhost' ? u.hostname : null;
    } catch {
      return null;
    }
  }
  ipcMain.handle('autofill:query', (event) => {
    const host = pageHost(event);
    return host ? getVault().forSite(host) : [];
  });
  ipcMain.handle('autofill:fill', (event, id) => {
    const host = pageHost(event);
    return host && isId(id) ? getVault().credential(id, host) : null;
  });
}

module.exports = { registerPasswordIpc };
