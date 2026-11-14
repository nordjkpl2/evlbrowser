// Mensagens dos favoritos: a estrela da barra de endereço (Ctrl+D) e a categoria Favoritos.

// Importação de um .json (Configurações > Favoritos). A janela de arquivo abre aqui; a interface não envia caminhos.

const fs = require("fs");

// ctx: { ipcMain, fromUi, dialog, getWindow, getBookmarks, getActivePage, openUrl, refresh }
//   getActivePage(): { url, title } da aba web ativa, ou null; refresh(): reenvia o estado à interface.
function registerBookmarksIpc({ ipcMain, fromUi, dialog, getWindow, getBookmarks, getActivePage, openUrl, refresh }) {
  function toggleActive() {
    const page = getActivePage();
    if (!page) return false;
    getBookmarks().toggle(page.url, page.title);
    refresh(); // a estrela muda de cor
    return true;
  }

  ipcMain.on('bookmarks:toggle', (event) => fromUi(event) && toggleActive());
  ipcMain.handle('bookmarks:list', (event) => (fromUi(event) ? getBookmarks().list() : []));
  ipcMain.on('bookmarks:open', (event, url) => {
    if (fromUi(event) && typeof url === 'string') openUrl(url);
  });
  ipcMain.handle('bookmarks:remove', (event, id) => {
    if (!fromUi(event) || typeof id !== 'string' || id.length > 40) return false;
    const ok = getBookmarks().remove(id);
    refresh();
    return ok;
  });
  let importing = false;
  ipcMain.handle("bookmarks:import", async (event) => {
    if (!fromUi(event) || importing) return null;
    importing = true;
    try {
      const pick = await dialog.showOpenDialog(getWindow(), {
        title: "Importar favoritos (.json)",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      const file = pick.filePaths[0];
      if (pick.canceled || !file) return { ok: true, canceled: true };
      if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error("O arquivo é grande demais (máximo 20 MB).");
      const r = getBookmarks().importJson(fs.readFileSync(file, "utf8"));
      refresh();
      return { ok: true, ...r };
    } catch (error) {
      return { ok: false, message: String(error?.message ?? error).slice(0, 200) };
    } finally {
      importing = false;
    }
  });
  // Adicionar à mão: aceita "exemplo.com" (vira https://exemplo.com) ou um endereço completo.
  ipcMain.handle('bookmarks:add', (event, url, title) => {
    if (!fromUi(event) || typeof url !== 'string' || (title !== undefined && typeof title !== 'string')) return { ok: false };
    let raw = url.trim().slice(0, 2000);
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    let host;
    try {
      host = new URL(raw).hostname;
    } catch {
      return { ok: false };
    }
    if (!host.includes('.') && host !== 'localhost') return { ok: false };
    const ok = getBookmarks().add(raw, (title || '').trim().slice(0, 200) || host.replace(/^www\./, ''));
    refresh();
    return { ok };
  });
  return { toggleActive };
}

module.exports = { registerBookmarksIpc };
