// Mensagens dos favoritos: a estrela da barra de endereço (Ctrl+D) e a categoria Favoritos.

// ctx: { ipcMain, fromUi, getBookmarks, getActivePage, openUrl, refresh }
//   getActivePage(): { url, title } da aba web ativa, ou null; refresh(): reenvia o estado à interface.
function registerBookmarksIpc({ ipcMain, fromUi, getBookmarks, getActivePage, openUrl, refresh }) {
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
  return { toggleActive };
}

module.exports = { registerBookmarksIpc };
