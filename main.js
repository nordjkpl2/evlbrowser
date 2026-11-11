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
  net,
} = require('electron');
const path = require('path');
const cfg = require('./src/app_config');
const { UI_HEIGHT } = cfg;
const { createStore } = require('./src/settings_store');
const { createHistory } = require('./src/history_store');
const { setSearchUrl } = require('./src/url_address_parser');
const { validateEngine, normalizeList, uniqueId } = require('./src/search_engines');
const { registerCookiesIpc } = require('./src/ipc/cookies_ipc');
const { registerExtensionsIpc } = require('./src/ipc/extension_ipc');
const { createExtensions } = require('./src/extension_manager');
const { createAdblock } = require('./src/adblock_engine');
const { registerAdblockIpc } = require('./src/ipc/adblock_ipc');
const { TabManager } = require('./src/tabs_manager');
const { startMemoryPolicy, totalMemoryMB, processReport } = require('./src/memory_policy');

// Chromium só com o que o navegador precisa (listas em src/app_config.js).
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
let extensions = null; // extensões do Chromium (src/extension_manager.js)
let lastPreconnect = ''; // último site que já abrimos a conexão
let engines = []; // motores de busca [{ id, name, url }]
let engineId = ''; // o padrão
let lastSession = '';

// Esquema de cores (prefers-color-scheme) da interface e dos sites,
// e a cor de fundo da janela para cada um (evita um clarão ao abrir/redimensionar).
const THEMES = new Set(['light', 'dark']);
const WINDOW_BG = { dark: '#0b0b0d', light: '#f9f9fb' };

// Permissões que um site pode usar por enquanto. Todo o resto é negado até
// termos uma tela de pedido de permissão (como o Firefox).
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

// Textos do menu nativo (botão direito em campos de texto) no idioma escolhido.
const NATIVE = {
  en: { Desfazer: 'Undo', Refazer: 'Redo', Cortar: 'Cut', Copiar: 'Copy', Colar: 'Paste', 'Colar e abrir': 'Paste and go', Excluir: 'Delete', 'Selecionar tudo': 'Select all' },
  es: { Desfazer: 'Deshacer', Refazer: 'Rehacer', Cortar: 'Cortar', Copiar: 'Copiar', Colar: 'Pegar', 'Colar e abrir': 'Pegar e ir', Excluir: 'Eliminar', 'Selecionar tudo': 'Seleccionar todo' },
};
const tr = (pt) => NATIVE[store?.get('lang')]?.[pt] ?? pt;

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
      { role: 'undo', label: tr('Desfazer'), enabled: f.canUndo },
      { role: 'redo', label: tr('Refazer'), enabled: f.canRedo },
      { type: 'separator' },
      { role: 'cut', label: tr('Cortar'), enabled: f.canCut },
      { role: 'copy', label: tr('Copiar'), enabled: f.canCopy },
      { role: 'paste', label: tr('Colar'), enabled: f.canPaste },
    ];
    if (params.y < UI_HEIGHT) {
      // só na barra de endereço (a barra do topo tem UI_HEIGHT px)
      items.push({
        label: tr('Colar e abrir'),
        enabled: f.canPaste,
        click: () => {
          const text = clipboard.readText().trim();
          if (text) tabs.navigate(text);
        },
      });
    }
    items.push(
      { role: 'delete', label: tr('Excluir'), enabled: f.canDelete },
      { role: 'selectAll', label: tr('Selecionar tudo'), enabled: f.canSelectAll }
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
  send('lang', store.get('lang') ?? 'pt');
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
ipcMain.on('history:remove', (event, host) => {
  if (fromUi(event) && typeof host === 'string' && host.length <= 253) history.remove(host);
});
ipcMain.on('lang:set', (event, lang) => {
  if (fromUi(event) && ['pt', 'en', 'es'].includes(lang)) store.set('lang', lang);
});
ipcMain.on('history:clear', (event) => fromUi(event) && history.clear());
ipcMain.handle('history:suggest', (event, q) => {
  if (!fromUi(event) || typeof q !== 'string') return [];
  const list = history.suggest(q.slice(0, 200));
  // Navegar mais rápido: enquanto você digita, já abre a conexão com o 1º site sugerido.
  const top = list[0]?.url;
  if (top && top !== lastPreconnect && top.startsWith('https://')) {
    lastPreconnect = top;
    session.defaultSession.preconnect({ url: top, numSockets: 1 });
  }
  return list;
});
// Motores de busca: lista salva em settings.json; o escolhido vale na hora para a barra de endereço.
function engineState() {
  return { engines, selected: engineId };
}

function saveEngines() {
  store.set('engines', engines);
  store.set('engine', engineId);
  setSearchUrl(engines.find((e) => e.id === engineId)?.url);
}

function loadEngines() {
  engines = normalizeList(store.get('engines'));
  const saved = store.get('engine');
  engineId = engines.some((e) => e.id === saved) ? saved : engines[0].id;
  setSearchUrl(engines.find((e) => e.id === engineId).url);
}

ipcMain.handle('engines:list', (event) => (fromUi(event) ? engineState() : null));
ipcMain.handle('engines:select', (event, id) => {
  if (!fromUi(event)) return null;
  if (engines.some((e) => e.id === id)) {
    engineId = id;
    saveEngines();
  }
  return engineState();
});
ipcMain.handle('engines:save', (event, input) => {
  if (!fromUi(event)) return null;
  const v = validateEngine(input);
  if (!v.ok) return { ok: false, error: v.error, ...engineState() };
  if (typeof input.id === 'string' && engines.some((e) => e.id === input.id)) {
    engines = engines.map((e) => (e.id === input.id ? { id: e.id, name: v.name, url: v.url } : e));
  } else {
    engines = [...engines, { id: uniqueId(v.name, engines), name: v.name, url: v.url }];
  }
  saveEngines();
  return { ok: true, ...engineState() };
});
ipcMain.handle('engines:remove', (event, id) => {
  if (!fromUi(event)) return null;
  if (engines.length > 1 && engines.some((e) => e.id === id)) {
    engines = engines.filter((e) => e.id !== id);
    if (engineId === id) engineId = engines[0].id;
    saveEngines();
  }
  return engineState();
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

registerCookiesIpc({ ipcMain, fromUi, app, session, dialog, getWindow: () => win });
registerExtensionsIpc({ ipcMain, fromUi, dialog, net, getExtensions: () => extensions, getWindow: () => win });

// ---------- ciclo de vida do app ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sem menu padrão (nossos atalhos ficam no código)

  store = createStore(path.join(app.getPath('userData'), 'settings.json'));
  sessionStore = createStore(path.join(app.getPath('userData'), 'session.json'), {});
  history = createHistory(path.join(app.getPath('userData'), 'history.json'));
  loadEngines();
  const savedTheme = store.get('theme');
  nativeTheme.themeSource = THEMES.has(savedTheme) ? savedTheme : 'dark';

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  const ses = session.defaultSession;
  extensions = createExtensions({
    ext: ses.extensions ?? ses,
    dir: path.join(app.getPath('userData'), 'extensions'),
    store: createStore(path.join(app.getPath('userData'), 'extensions.json'), {}),
  });
  registerAdblockIpc({ ipcMain, fromUi, adblock: createAdblock(), store, session }).apply();
  extensions.loadAll(); // carrega em segundo plano; a janela não espera

  createWindow();
});

app.on('window-all-closed', () => app.quit());
