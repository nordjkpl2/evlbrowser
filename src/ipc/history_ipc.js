// Importação de histórico de outro navegador (arquivo .json) nas Configurações > Histórico.

const fs = require('fs');
const { importarHistorico } = require('../data/history_import');

// ctx: { ipcMain, fromUi, dialog, getWindow, getHistory }
function registerHistoryIpc({ ipcMain, fromUi, dialog, getWindow, getHistory }) {
  let importing = false;
  ipcMain.handle('history:import', async (event) => {
    if (!fromUi(event) || importing) return null;
    importing = true;
    try {
      // o caminho é escolhido numa janela do sistema aberta aqui; a interface não envia caminhos
      const pick = await dialog.showOpenDialog(getWindow(), {
        title: 'Importar histórico (.json)',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      const file = pick.filePaths[0];
      if (pick.canceled || !file) return { ok: true, canceled: true };
      if (fs.statSync(file).size > 200 * 1024 * 1024) throw new Error('O arquivo é grande demais (máximo 200 MB).');
      return { ok: true, ...importarHistorico(fs.readFileSync(file, 'utf8'), getHistory()) };
    } catch (error) {
      return { ok: false, message: String(error?.message ?? error) };
    } finally {
      importing = false;
    }
  });
}

module.exports = { registerHistoryIpc };
