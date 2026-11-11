// Ponto de entrada do Evl Browser (o "main()" do programa).
// Roda em Node, dentro do processo principal do Electron.

const {
  app,
  BaseWindow,
  WebContentsView,
  Menu,
  ipcMain,
  session,
  nativeTheme,
  clipboard,
  dialog,
} = require('electron');
const fs = require('fs');
const path = require('path');
const cfg = require('./src/config');
const { UI_HEIGHT } = cfg;
const { createStore } = require('./src/settings');
const { createHistory } = require('./src/history');
const { importCookies, importCookiesFromJson } = require('./src/cookies-import');
const { TabManager } = require('./src/tabs');
const { startMemoryPolicy, totalMemoryMB, processReport } = require('./src/memory');

// Chromium só com o que o navegador precisa (listas em src/config.js).
// Precisa vir ANTES do app ficar pronto.
for (const name of [...cfg.CHROMIUM_OFF_SWITCHES, ...cfg.CHROMIUM_FAST_SWITCHES]) app.commandLine.appendSwitch(name);
// Para medir a GPU: `set EVL_NO_GPU=1 && npm start` roda sem aceleração de hardware.
if (process.env.EVL_NO_GPU) app.disableHardwareAcceleration();
if (cfg.CHROMIUM_OFF_FEATURES.length > 0) {
  app.commandLine.appendSwitch('disable-features', cfg.CHROMIUM_OFF_FEATURES.join(','));
}

let win = null;
let ui = null; // a interface (abas, barra de endereço, Nova aba e Configurações)
let tabs = null;
let policy = null;
let store = null; // preferências salvas (tema...)
let sessionStore = null; // abas abertas, para reabrir ao iniciar (session.json)
let history = null; // páginas visitadas (history.json)
let sessionTimer = null;
let importing = false; // importação de cookies em andamento
let lastSession = '';

// Esquema de cores (prefers-color-scheme) da interface e dos sites,
// e a cor de fundo da janela para cada um (evita um clarão ao abrir/redimensionar).
const THEMES = new Set(['light', 'dark']);
const WINDOW_BG = { dark: '#0b0b0d', light: '#f9f9fb' };

// Permissões que um site pode usar por enquanto. Todo o resto é negado até
// termos uma tela de pedido de permissão (como o Firefox).
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

function send(channel, payload) {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send(channel, payload);
}

// ---------- estado -> interface ----------
// Páginas disparam muitos eventos seguidos (título, ícone, loading...).
// Juntamos tudo e mandamos UMA atualização, no máximo a cada 30 ms.

let statePending = false;
let lastSample = 0;

function onTabsChanged() {
  if (statePending) return;
  statePending = true;
  setTimeout(flushState, 30);
}

function flushState() {
  statePending = false;
  if (!tabs) return;
  send('state', tabs.snapshot());
  sampleMemory(false);
  policy?.refresh();
  scheduleSession();
}

// Sessão: guarda as abas abertas. Junta mudanças (no máximo 1 gravação a cada 2 s)
// e só escreve no disco se algo mudou de verdade.
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = null;
  if (!tabs) return;
  const snap = tabs.sessionSnapshot();
  const json = JSON.stringify(snap);
  if (json === lastSession) return;
  lastSession = json;
  sessionStore.set('session', snap);
}

function scheduleSession() {
  if (!sessionTimer) sessionTimer = setTimeout(saveSession, 2000);
}

// Abre as Configurações; com 'history', já na categoria Histórico.
function openSettings(panel) {
  tabs.openSettings();
  if (panel === 'history') send('panel', panel);
}

// O número de MB no canto NÃO tem timer: é atualizado quando algo acontece
// (no máximo a cada 3 s), quando a janela ganha foco e quando a política roda.
function sampleMemory(force) {
  const now = Date.now();
  if (!force && now - lastSample < 3000) return;
  lastSample = now;
  send('memory', totalMemoryMB());
}

function focusAddress() {
  ui.webContents.focus();
  send('focus-address');
}

// Atalhos de teclado. Funciona tanto com o foco na interface quanto numa aba.
// Devolve true se tratou a tecla (aí ela não chega na página).
function onShortcut(input) {
  if (input.type !== 'keyDown') return false;

  if (input.key === 'F12') {
    ui.webContents.openDevTools({ mode: 'detach' });
    return true;
  }

  if (!(input.control || input.meta)) return false;
  const key = input.key.toLowerCase();

  if (input.shift && key === 'i') {
    tabs.openDevTools();
    return true;
  }
  if (input.shift && key === 't') {
    tabs.reopenClosed();
    return true;
  }
  if (key === 'h') {
    openSettings('history');
    return true;
  }
  switch (key) {
    case 't':
      tabs.create();
      focusAddress();
      return true;
    case 'w':
      tabs.close(tabs.activeId);
      return true;
    case 'l':
      focusAddress();
      return true;
    case 'r':
      tabs.reload();
      return true;
    case ',':
      tabs.openSettings();
      return true;
    // Zoom: "+" (com ou sem Shift, "=" na maioria dos teclados) e "-"; "0" volta a 100%.
    case '+':
    case '=':
    case 'add':
      tabs.zoomIn();
      return true;
    case '-':
    case '_':
    case 'subtract':
      tabs.zoomOut();
      return true;
    case '0':
      tabs.zoomReset();
      return true;
    default:
      return false;
  }
}

function createWindow() {
  win = new BaseWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    backgroundColor: WINDOW_BG[nativeTheme.themeSource] ?? WINDOW_BG.dark,
    title: 'Evl Browser',
  });

  ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false, // a interface não precisa de corretor ortográfico
    },
  });
  // Fundo transparente: com o submenu aberto, a interface cobre parte da página
  // e só o menu (e a barra do topo) devem aparecer. Os fundos ficam no CSS.
  ui.setBackgroundColor('#00000000');
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // A interface nunca pode navegar para outro lugar nem abrir janelas.
  ui.webContents.on('will-navigate', (event) => event.preventDefault());
  ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Botão direito num campo de texto (barra de endereço, busca das Configurações).
  ui.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const f = params.editFlags;
    const items = [
      { role: 'undo', label: 'Desfazer', enabled: f.canUndo },
      { role: 'redo', label: 'Refazer', enabled: f.canRedo },
      { type: 'separator' },
      { role: 'cut', label: 'Cortar', enabled: f.canCut },
      { role: 'copy', label: 'Copiar', enabled: f.canCopy },
      { role: 'paste', label: 'Colar', enabled: f.canPaste },
    ];
    if (params.y < UI_HEIGHT) {
      // só na barra de endereço (a barra do topo tem UI_HEIGHT px)
      items.push({
        label: 'Colar e abrir',
        enabled: f.canPaste,
        click: () => {
          const text = clipboard.readText().trim();
          if (text) tabs.navigate(text);
        },
      });
    }
    items.push(
      { role: 'delete', label: 'Excluir', enabled: f.canDelete },
      { role: 'selectAll', label: 'Selecionar tudo', enabled: f.canSelectAll }
    );
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  ui.webContents.on('before-input-event', (event, input) => {
    if (onShortcut(input)) event.preventDefault();
  });

  tabs = new TabManager(win, ui, onTabsChanged, onShortcut, history);
  policy = startMemoryPolicy(tabs, (mb) => send('memory', mb));

  win.on('resize', () => tabs.layout());
  win.on('focus', () => sampleMemory(false));

  // Reabre as abas da sessão anterior (só a ativa carrega); sem sessão, uma aba em branco.
  const saved = sessionStore.get('session');
  if (!tabs.restore(saved?.items, saved?.active)) tabs.create();

  win.on('close', () => {
    saveSession(); // antes de as abas serem destruídas
    history.flush();
  });
  win.on('closed', () => {
    policy?.stop();
    tabs?.destroyAll();
    win = ui = tabs = policy = null;
  });
}

// Tudo que a tela de Configurações mostra.
function settingsReport() {
  return {
    ...processReport(tabs, ui.webContents),
    search: { name: cfg.SEARCH_NAME, url: cfg.SEARCH_URL },
    chromium: process.versions.chrome,
    theme: nativeTheme.themeSource,
    accent: store.get('accent') ?? null,
  };
}

// ---------- mensagens vindas da interface (IPC) ----------
// Só aceitamos mensagens enviadas pela nossa interface, e validamos os dados.

const fromUi = (event) => ui && event.sender === ui.webContents;
const isId = (id) => Number.isInteger(id);

ipcMain.on('ui:ready', (event) => {
  if (!fromUi(event)) return;
  send('accent', store.get('accent') ?? null);
  send('state', tabs.snapshot());
  sampleMemory(true);
});
ipcMain.on('tab:new', (event) => {
  if (!fromUi(event)) return;
  tabs.create();
  focusAddress();
});
ipcMain.on('tab:close', (event, id) => {
  if (fromUi(event) && isId(id)) tabs.close(id);
});
ipcMain.on('tab:activate', (event, id) => {
  if (fromUi(event) && isId(id)) tabs.activate(id);
});
ipcMain.on('nav:go', (event, text) => {
  if (fromUi(event) && typeof text === 'string') tabs.navigate(text);
});
ipcMain.on('nav:back', (event) => fromUi(event) && tabs.back());
ipcMain.on('nav:forward', (event) => fromUi(event) && tabs.forward());
ipcMain.on('nav:reload', (event) => fromUi(event) && tabs.reload());
ipcMain.on('settings:open', (event, panel) => fromUi(event) && openSettings(panel));
ipcMain.handle('history:list', (event) => (fromUi(event) ? history.list() : []));
ipcMain.on('history:open', (event, url) => {
  if (fromUi(event) && typeof url === 'string') tabs.create(url);
});
ipcMain.on('history:clear', (event) => fromUi(event) && history.clear());
ipcMain.handle('history:suggest', (event, q) =>
  fromUi(event) && typeof q === 'string' ? history.suggest(q.slice(0, 200)) : []
);
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
      const pick = await dialog.showOpenDialog(win, {
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
ipcMain.on('suggest:set', (event, open) => fromUi(event) && tabs.setSuggest(open === true));
ipcMain.on('menu:set', (event, open) => fromUi(event) && tabs.setMenu(open === true));
ipcMain.on('zoom:set', (event, action) => {
  if (!fromUi(event)) return;
  if (action === 'in') tabs.zoomIn();
  else if (action === 'out') tabs.zoomOut();
  else if (action === 'reset') tabs.zoomReset();
});
ipcMain.on('theme:set', (event, theme) => {
  if (!fromUi(event) || !THEMES.has(theme)) return;
  nativeTheme.themeSource = theme; // a interface e os sites passam a ver este esquema
  win?.setBackgroundColor(WINDOW_BG[theme]);
  store.set('theme', theme);
});
// Cor principal do navegador (#rrggbb), ou null para o padrão do tema.
ipcMain.on('accent:set', (event, color) => {
  if (!fromUi(event)) return;
  if (color !== null && !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) return;
  store.set('accent', color);
});
ipcMain.handle('settings:report', (event) => (fromUi(event) ? settingsReport() : null));

// ---------- ciclo de vida do app ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sem menu padrão (nossos atalhos ficam no código)

  store = createStore(path.join(app.getPath('userData'), 'settings.json'));
  sessionStore = createStore(path.join(app.getPath('userData'), 'session.json'), {});
  history = createHistory(path.join(app.getPath('userData'), 'history.json'));
  const savedTheme = store.get('theme');
  nativeTheme.themeSource = THEMES.has(savedTheme) ? savedTheme : 'dark';

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
