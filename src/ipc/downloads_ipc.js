// Downloads: salva na pasta escolhida (ou pergunta), acompanha o progresso e guarda a lista.
// Canais downloads:* usados por Configurações > Downloads (ui/settings/settings_downloads.js).

const fs = require('fs');
const path = require('path');
const { safeName, uniquePath, createDownloads, retryDelay, MAX_RETRIES } = require('../data/downloads_store');

// ctx: { ipcMain, fromUi, session, app, shell, dialog, store (settings.json), listStore (downloads.json), getWindow, notify(nome) }
function registerDownloadsIpc({ ipcMain, fromUi, session, app, shell, dialog, store, listStore, getWindow, notify = () => {} }) {
  const done = createDownloads(listStore);
  const live = new Map(); // id -> { item (DownloadItem), entry }
  let seq = 0;

  const folder = () => {
    const dir = store.get('downloadDir');
    return typeof dir === 'string' && dir && fs.existsSync(dir) ? dir : app.getPath('downloads');
  };
  const askWhere = () => store.get('downloadAsk') === true;
  const state = () => ({
    dir: folder(),
    ask: askWhere(),
    // os mais novos primeiro; em andamento no topo
    items: [...[...live.values()].map((l) => l.entry), ...done.list().slice().reverse()],
  });

  function onDownload(_event, item) {
    const name = safeName(item.getFilename());
    if (askWhere()) item.setSaveDialogOptions({ defaultPath: path.join(folder(), name) });
    else item.setSavePath(uniquePath(folder(), name, fs.existsSync));
    const entry = { id: `d${Date.now().toString(36)}${++seq}`, name, path: '', host: '', total: item.getTotalBytes(), received: 0, state: 'progress', time: Date.now() };
    try {
      entry.host = new URL(item.getURL()).host; // só o site: o endereço completo pode ter chaves de acesso
    } catch {}
    live.set(entry.id, { item, entry });
    notify(name);
    let tries = 0;
    let retry = null;
    let last = { t: Date.now(), bytes: 0 };
    item.on('updated', (_e, st) => {
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      entry.paused = item.isPaused();
      // velocidade: a do Chromium se houver; senão a média desde a última atualização
      const now = Date.now();
      const native = typeof item.getCurrentBytesPerSecond === 'function' ? item.getCurrentBytesPerSecond() : -1;
      entry.speed = entry.paused ? 0 : native >= 0 ? native : Math.max(0, Math.round(((entry.received - last.bytes) * 1000) / Math.max(1, now - last.t)));
      last = { t: now, bytes: entry.received };
      // a conexão caiu: continua de onde parou (Range) em vez de falhar e recomeçar do zero
      if (st === 'interrupted' && !retry && tries < MAX_RETRIES && item.canResume()) {
        entry.speed = 0;
        retry = setTimeout(() => {
          retry = null;
          tries++;
          if (item.getState() === 'interrupted' && item.canResume()) item.resume();
        }, retryDelay(tries));
      } else if (st === 'progressing' && !entry.paused) tries = 0;
    });
    item.once('done', (_e, result) => {
      clearTimeout(retry);
      live.delete(entry.id);
      const file = item.getSavePath();
      if (result === 'cancelled' && !file) return; // cancelou na janela "Salvar como": não entra na lista
      done.add({ ...entry, paused: undefined, speed: undefined, path: file, name: file ? path.basename(file) : name, received: item.getReceivedBytes(), state: result === 'completed' ? 'done' : result === 'cancelled' ? 'cancelled' : 'failed' });
    });
  }

  const finished = (id) => (typeof id === 'string' ? done.get(id) : null);
  ipcMain.handle('downloads:list', (event) => (fromUi(event) ? state() : null));
  ipcMain.handle('downloads:open', async (event, id) => {
    const d = fromUi(event) && finished(id);
    return !!d && d.state === 'done' && fs.existsSync(d.path) && (await shell.openPath(d.path)) === '';
  });
  ipcMain.handle('downloads:show', (event, id) => {
    const d = fromUi(event) && finished(id);
    if (!d || !d.path || !fs.existsSync(d.path)) return false;
    shell.showItemInFolder(d.path);
    return true;
  });
  ipcMain.handle('downloads:cancel', (event, id) => {
    if (fromUi(event)) live.get(id)?.item.cancel();
    return fromUi(event) ? state() : null;
  });
  ipcMain.handle('downloads:pause', (event, id) => {
    const it = fromUi(event) && live.get(id)?.item;
    if (it) {
      if (it.isPaused()) it.resume();
      else it.pause();
      live.get(id).entry.paused = it.isPaused();
    }
    return fromUi(event) ? state() : null;
  });
  // Tira da lista (o arquivo continua no disco).
  ipcMain.handle('downloads:remove', (event, id) => {
    if (!fromUi(event)) return null;
    if (typeof id === 'string') done.remove(id);
    return state();
  });
  ipcMain.handle('downloads:clear', (event) => {
    if (!fromUi(event)) return null;
    done.clear();
    return state();
  });
  ipcMain.handle('downloads:folder', async (event) => {
    if (!fromUi(event)) return null;
    const r = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'], defaultPath: folder() });
    if (!r.canceled && r.filePaths[0]) store.set('downloadDir', r.filePaths[0]);
    return state();
  });
  ipcMain.handle('downloads:ask', (event, on) => {
    if (!fromUi(event) || typeof on !== 'boolean') return null;
    store.set('downloadAsk', on);
    return state();
  });

  return {
    // chamar quando o app estiver pronto (a sessão só existe depois)
    install: () => session.defaultSession.on('will-download', onDownload),
    active: () => live.size,
  };
}

module.exports = { registerDownloadsIpc };
