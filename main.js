// Ponto de entrada do Evl Browser (o "main()" do programa).
// Roda em Node, dentro do processo principal do Electron.

const { app, BaseWindow, WebContentsView, Menu, ipcMain, session } = require('electron');
const path = require('path');
const cfg = require('./src/config');
const { TabManager } = require('./src/tabs');
const { startMemoryPolicy, totalMemoryMB, processReport } = require('./src/memory');

// Chromium só com o que o navegador precisa (listas em src/config.js).
// Precisa vir ANTES do app ficar pronto.
for (const name of cfg.CHROMIUM_OFF_SWITCHES) app.commandLine.appendSwitch(name);
if (cfg.CHROMIUM_OFF_FEATURES.length > 0) {
  app.commandLine.appendSwitch('disable-features', cfg.CHROMIUM_OFF_FEATURES.join(','));
}

let win = null;
let ui = null; // a interface (abas, barra de endereço, Nova aba e Configurações)
let tabs = null;
let policy = null;

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
    backgroundColor: '#0b0b0d',
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
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // A interface nunca pode navegar para outro lugar nem abrir janelas.
  ui.webContents.on('will-navigate', (event) => event.preventDefault());
  ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ui.webContents.on('before-input-event', (event, input) => {
    if (onShortcut(input)) event.preventDefault();
  });

  tabs = new TabManager(win, ui, onTabsChanged, onShortcut);
  policy = startMemoryPolicy(tabs, (mb) => send('memory', mb));

  win.on('resize', () => tabs.layout());
  win.on('focus', () => sampleMemory(false));

  tabs.create(); // primeira aba (em branco, sem processo extra)

  win.on('closed', () => {
    policy?.stop();
    tabs?.destroyAll();
    win = ui = tabs = policy = null;
  });
}

// Tudo que a tela de Configurações mostra.
function settingsReport() {
  const minutes = Math.round((cfg.DISCARD_AFTER_MS / 60000) * 10) / 10;
  return {
    ...processReport(tabs, ui.webContents),
    tabs: tabs.stats(),
    policy: { discardMinutes: minutes, budgetMB: cfg.MEMORY_BUDGET_MB },
    search: { name: cfg.SEARCH_NAME, url: cfg.SEARCH_URL },
  };
}

// ---------- mensagens vindas da interface (IPC) ----------
// Só aceitamos mensagens enviadas pela nossa interface, e validamos os dados.

const fromUi = (event) => ui && event.sender === ui.webContents;
const isId = (id) => Number.isInteger(id);

ipcMain.on('ui:ready', (event) => {
  if (!fromUi(event)) return;
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
ipcMain.on('settings:open', (event) => fromUi(event) && tabs.openSettings());
ipcMain.handle('settings:report', (event) => (fromUi(event) ? settingsReport() : null));

// ---------- ciclo de vida do app ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sem menu padrão (nossos atalhos ficam no código)

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
