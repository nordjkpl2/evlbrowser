// Mensagens da aba "Extensões" das Configurações.

const fs = require('fs');
const { parseStoreId } = require('../extensions/extension_manager');

const MAX_CRX = 100 * 1024 * 1024;

// ctx: { ipcMain, fromUi, dialog, net, getExtensions, getWindow }
function registerExtensionsIpc({ ipcMain, fromUi, dialog, net, getExtensions, getWindow }) {
  const wrap = async (fn) => {
    try {
      return { ok: true, ...(await fn()) };
    } catch (err) {
      return { ok: false, error: String(err.message ?? err).slice(0, 200) };
    }
  };

  ipcMain.handle('extensions:list', (event) => (fromUi(event) ? getExtensions().list() : []));

  ipcMain.handle('extensions:pick', (event, kind) => {
    if (!fromUi(event)) return null;
    return wrap(async () => {
      const folder = kind === 'folder';
      const r = await dialog.showOpenDialog(getWindow(), {
        properties: folder ? ['openDirectory'] : ['openFile'],
        filters: folder ? [] : [{ name: 'Extensão (.zip, .crx)', extensions: ['zip', 'crx'] }],
      });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      const src = r.filePaths[0];
      const item = await getExtensions().install(folder ? { folder: src } : { buffer: fs.readFileSync(src) });
      return { item };
    });
  });

  ipcMain.handle('extensions:store', (event, text) => {
    if (!fromUi(event)) return null;
    return wrap(async () => {
      const id = parseStoreId(typeof text === 'string' ? text.trim() : '');
      if (!id) throw new Error('Cole o ID (32 letras) ou o link da Chrome Web Store');
      const url =
        'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx3' +
        `&prodversion=${process.versions.chrome}&x=${encodeURIComponent(`id=${id}&uc`)}`;
      const res = await net.fetch(url);
      if (!res.ok) throw new Error(`Download falhou (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_CRX) throw new Error('Arquivo grande demais');
      return { item: await getExtensions().install({ buffer }) };
    });
  });

  ipcMain.handle('extensions:enable', (event, id, enabled) =>
    fromUi(event) && typeof id === 'string' ? getExtensions().setEnabled(id, enabled === true) : false
  );
  ipcMain.handle('extensions:remove', (event, id) =>
    fromUi(event) && typeof id === 'string' ? getExtensions().remove(id) : false
  );
}

module.exports = { registerExtensionsIpc };
