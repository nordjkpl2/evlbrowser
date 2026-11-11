// Canais da categoria "Velocidade": speed:get, speed:set e app:relaunch.

const { speedOptions, checkSpeedValue, needsRestart } = require('../app/speed_options');

// ctx: { ipcMain, fromUi, store, app, startup } — startup = opções que o Chromium está usando agora.
function registerSpeedIpc({ ipcMain, fromUi, store, app, startup }) {
  const options = () => speedOptions(store.get('speed'));
  const view = () => ({ options: options(), restart: needsRestart(options(), startup) });

  ipcMain.handle('speed:get', (event) => (fromUi(event) ? view() : null));
  ipcMain.handle('speed:set', (event, key, value) => {
    if (!fromUi(event)) return null;
    const ok = checkSpeedValue(key, value);
    if (ok === undefined) return null;
    store.set('speed', { ...options(), [key]: ok });
    return view();
  });
  ipcMain.on('app:relaunch', (event) => {
    if (!fromUi(event)) return;
    app.relaunch();
    app.exit(0);
  });
  return { options };
}

module.exports = { registerSpeedIpc };
