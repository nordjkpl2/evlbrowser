// "Localizar na página" (Ctrl+F): a barra da interface manda o texto; o resultado (n de m) volta pelo estado.

// ctx: { ipcMain, fromUi, getTabs }
function registerFindIpc({ ipcMain, fromUi, getTabs }) {
  ipcMain.on('find:open', (event) => {
    if (fromUi(event)) getTabs()?.setFind(true);
  });
  // forward: para baixo (padrão); next: já é uma busca em andamento (Enter / setas), senão busca do começo
  ipcMain.on('find:run', (event, text, forward, next) => {
    if (!fromUi(event) || typeof text !== 'string') return;
    getTabs()?.find(text.slice(0, 200), forward !== false, next === true);
  });
  ipcMain.on('find:close', (event) => {
    if (fromUi(event)) getTabs()?.setFind(false);
  });
}

module.exports = { registerFindIpc };
