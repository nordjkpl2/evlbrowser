// Ponto de entrada do Evl Browser (o "main()" do programa).
// Roda em Node, dentro do processo principal do Electron.

const { app, BaseWindow, WebContentsView, Menu, ipcMain, session } = require('electron');
const path = require('path');
const { TabManager } = require('./src/tabs');
const { startMemoryPolicy, totalMemoryMB } = require('./src/memory');
const { UI_HEIGHT } = require('./src/config');

let win = null;
let ui = null; // a interface fixa (abas + barra de endereço)
let tabs = null;
let stopPolicy = null;

// Permissões que um site pode usar por enquanto. Todo o resto é negado até
// termos uma tela de pedido de permissão (como o Firefox).
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

function layoutAll() {
  const { width } = win.getContentBounds();
  ui.setBounds({ x: 0, y: 0, width, height: UI_HEIGHT });
  tabs.layout();
}

function send(channel, payload) {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send(channel, payload);
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

  tabs = new TabManager(win, (snapshot) => send('state', snapshot), onShortcut);

  win.on('resize', layoutAll);
  layoutAll();

  tabs.create(); // primeira aba
  stopPolicy = startMemoryPolicy(tabs, (mb) => send('memory', mb));

  win.on('closed', () => {
    stopPolicy?.();
    tabs?.destroyAll();
    win = ui = tabs = null;
  });
}

// ---------- mensagens vindas da interface (IPC) ----------
// Só aceitamos mensagens enviadas pela nossa interface, e validamos os dados.

const fromUi = (event) => ui && event.sender === ui.webContents;
const isId = (id) => Number.isInteger(id);

ipcMain.on('ui:ready', (event) => {
  if (!fromUi(event)) return;
  send('state', tabs.snapshot());
  send('memory', totalMemoryMB());
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

// ---------- ciclo de vida do app ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sem menu padrão (nossos atalhos ficam no código)

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
