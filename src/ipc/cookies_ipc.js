// Mensagens da categoria Cookies das Configurações.

const fs = require('fs');
const { importCookies, importCookiesFromJson } = require('../data/cookies_import');

// ctx: { ipcMain, fromUi, app, session, dialog, getWindow }
function registerCookiesIpc({ ipcMain, fromUi, app, session, dialog, getWindow }) {
  let importing = false; // importação em andamento
  // Cookies: a lista nunca leva o valor (só domínio e nome); a importação roda aqui no main.
  ipcMain.handle('cookies:list', async (event) => {
    if (!fromUi(event)) return null;
    const all = await session.defaultSession.cookies.get({});
    const byDomain = new Map();
    for (const c of all) {
      const domain = c.domain.replace(/^\./, '');
      let entry = byDomain.get(domain);
      if (!entry) byDomain.set(domain, (entry = { domain, count: 0, names: [] }));
      entry.count++;
      if (entry.names.length < 30) entry.names.push(c.name);
    }
    const domains = [...byDomain.values()]
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      .slice(0, 300);
    return { total: all.length, domains };
  });
  ipcMain.handle('cookies:import', async (event, from) => {
    if (!fromUi(event) || importing || !['firefox', 'chromium', 'json'].includes(from)) return null;
    importing = true;
    try {
      const setCookie = (c) => session.defaultSession.cookies.set(c);
      if (from === 'json') {
        // quem escolhe o arquivo é uma janela do sistema aberta aqui (a interface não passa caminhos)
        const pick = await dialog.showOpenDialog(getWindow(), {
          title: 'Importar cookies (.json)',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        const file = pick.filePaths[0];
        if (pick.canceled || !file) return { ok: true, canceled: true };
        if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('O arquivo é grande demais (máximo 20 MB).');
        return { ok: true, ...(await importCookiesFromJson(fs.readFileSync(file, 'utf8'), setCookie)) };
      }
      const env = { appData: app.getPath('appData'), localAppData: process.env.LOCALAPPDATA ?? '' };
      return { ok: true, ...(await importCookies(from, env, setCookie)) };
    } catch (error) {
      return { ok: false, message: String(error?.message ?? error) };
    } finally {
      importing = false;
    }
  });
// Apagar cookies: de um site (exatamente o domínio da lista) ou todos (domain = null).
  ipcMain.handle('cookies:remove', async (event, domain) => {
    if (!fromUi(event) || (domain !== null && (typeof domain !== 'string' || domain.length > 253))) return null;
    const ses = session.defaultSession;
    if (domain === null) {
      const removed = (await ses.cookies.get({})).length;
      await ses.clearStorageData({ storages: ['cookies'] });
      return { removed };
    }
    const mine = (await ses.cookies.get({})).filter((c) => c.domain.replace(/^\./, '') === domain);
    await Promise.all(
      mine.map((c) => ses.cookies.remove(`${c.secure ? 'https' : 'http'}://${domain}${c.path}`, c.name))
    );
    return { removed: mine.length };
  });
}

module.exports = { registerCookiesIpc };
