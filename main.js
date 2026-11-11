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
  safeStorage,
  dialog,
  net,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const cfg = require('./src/app/app_config');
const { createStore } = require('./src/app/settings_store');
const { createHistory } = require('./src/data/history_store');
const { setSearchUrl } = require('./src/tabs/url_address_parser');
const { validateEngine, normalizeList, uniqueId } = require('./src/data/search_engines');
const { registerCookiesIpc } = require('./src/ipc/cookies_ipc');
const { registerExtensionsIpc } = require('./src/ipc/extension_ipc');
const { createExtensions } = require('./src/extensions/extension_manager');
const { createBookmarks } = require('./src/data/bookmarks_store');
const { registerBookmarksIpc } = require('./src/ipc/bookmarks_ipc');
const { createVault } = require('./src/data/passwords_vault');
const { registerPasswordIpc } = require('./src/ipc/password_ipc');
const { createNetworkHub } = require('./src/network/network_hub');
const { privacyOptions } = require('./src/network/privacy_engine');
const { registerPrivacyIpc } = require('./src/ipc/privacy_ipc');
const { createAdblock } = require('./src/network/adblock_engine');
const { registerAdblockIpc } = require('./src/ipc/adblock_ipc');
const { readStartupSpeed, speedSwitches, speedFeatures } = require('./src/app/speed_options');
const { registerSpeedIpc } = require('./src/ipc/speed_ipc');
const { registerPermissionIpc } = require('./src/ipc/permission_ipc');
const { registerSettingsIpc } = require('./src/ipc/settings_ipc');
const { registerDownloadsIpc } = require('./src/ipc/downloads_ipc');
const { TabManager } = require('./src/tabs/tabs_manager');
const { createFaviconColor } = require('./src/tabs/favicon_color');
const { startMemoryPolicy, totalMemoryMB, processReport } = require('./src/tabs/memory_policy');

// Chromium só com o que o navegador precisa (listas em src/app/app_config.js).
// Precisa vir ANTES do app ficar pronto.
for (const name of [...cfg.CHROMIUM_OFF_SWITCHES, ...cfg.CHROMIUM_FAST_SWITCHES]) app.commandLine.appendSwitch(name);
// Para medir a GPU: `set EVL_NO_GPU=1 && npm start` roda sem aceleração de hardware.
// Opções de Configurações > Velocidade que viram flags do Chromium (valem depois de reiniciar).
const startupSpeed = readStartupSpeed(app.getPath('userData'));
if (process.env.EVL_NO_GPU || !startupSpeed.hardwareAccel) app.disableHardwareAcceleration();
if (startupSpeed.blockAutoplay) app.commandLine.appendSwitch('autoplay-policy', 'document-user-activation-required');
if (startupSpeed.lowMemory) app.commandLine.appendSwitch('enable-low-end-device-mode');
if (startupSpeed.diskCacheMB > 0) app.commandLine.appendSwitch('disk-cache-size', String(startupSpeed.diskCacheMB * 1024 * 1024)); // cache maior = sites já visitados abrem mais rápido
for (const [name, value] of speedSwitches(startupSpeed)) app.commandLine.appendSwitch(name, value); // modo texto, limite de processos, teto do JS
// Identidade igual à do Chrome: sem os trechos "Electron/x" e "nome-do-app/x", que fazem sites como o
// WhatsApp Web dizerem que o navegador não é compatível. A versão do Chrome continua a real.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|evl[\w.-]*)\/[\d.]+/gi, '');
const DEFAULT_UA = app.userAgentFallback;
const onFeatures = [...cfg.CHROMIUM_ON_FEATURES, ...speedFeatures(startupSpeed)];
if (onFeatures.length > 0) app.commandLine.appendSwitch('enable-features', onFeatures.join(','));
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
let bookmarks = null; // favoritos (src/data/bookmarks_store.js)
let toggleBookmark = () => {}; // Ctrl+D e a estrela
let adblockApi = null; // motor do bloqueador (para cortar janelas de anúncio)
let speedApi = null; // opções de velocidade (src/ipc/speed_ipc.js)
let privacyApi = null; // opções de privacidade (src/ipc/privacy_ipc.js)
let vault = null; // cofre de senhas (src/data/passwords_vault.js)
let extensions = null; // extensões do Chromium (src/extensions/extension_manager.js)
let engines = []; // motores de busca [{ id, name, url }]
let engineId = ''; // o padrão
let lastSession = '';
let downloadsStore = null; // lista de downloads (downloads.json)
let downloadsApi = null;

// Esquema de cores (prefers-color-scheme) da interface e dos sites,
// e a cor de fundo da janela para cada um (evita um clarão ao abrir/redimensionar).
const THEMES = new Set(['light', 'dark']);
const WINDOW_BG = { dark: '#0b0b0d', light: '#f9f9fb' };

// Textos do menu nativo (botão direito em campos de texto) no idioma escolhido.
const NATIVE = {
  en: { Desfazer: 'Undo', Refazer: 'Redo', Cortar: 'Cut', Copiar: 'Copy', Colar: 'Paste', 'Colar e abrir': 'Paste and go', Excluir: 'Delete', 'Selecionar tudo': 'Select all' },
  es: { Desfazer: 'Deshacer', Refazer: 'Rehacer', Cortar: 'Cortar', Copiar: 'Copiar', Colar: 'Pegar', 'Colar e abrir': 'Pegar e ir', Excluir: 'Eliminar', 'Selecionar tudo': 'Seleccionar todo' },
};
NATIVE.zh = { Desfazer: '撤销', Refazer: '重做', Cortar: '剪切', Copiar: '复制', Colar: '粘贴', 'Colar e abrir': '粘贴并前往', Excluir: '删除', 'Selecionar tudo': '全选' };
NATIVE.ja = { Desfazer: '元に戻す', Refazer: 'やり直し', Cortar: '切り取り', Copiar: 'コピー', Colar: '貼り付け', 'Colar e abrir': '貼り付けて移動', Excluir: '削除', 'Selecionar tudo': 'すべて選択' };
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

// Página web da aba ativa ({ url, title }), ou null (aba em branco/Configurações).
function activePage() {
  const tab = tabs?.tabs.get(tabs.activeId);
  return tab && tab.kind === 'web' && tab.url ? { url: tab.url, title: tab.title } : null;
}

function flushState() {
  statePending = false;
  if (!tabs) return;
  const page = activePage();
  // perms: permissões do site da aba ativa, para o painel ao lado da estrela
  send('state', { ...tabs.snapshot(), bookmarked: !!page && bookmarks.has(page.url), perms: page ? permissions.siteState(page.url) : null });
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
  sessionStore.setLater('session', snap); // em segundo plano; garantido ao fechar (flush)
}

function scheduleSession() {
  if (!sessionTimer) sessionTimer = setTimeout(saveSession, 2000);
}

// Abre as Configurações; com 'history', 'appearance' ou 'downloads', já nessa categoria.
const OPEN_PANELS = new Set(['history', 'appearance', 'downloads']);
function openSettings(panel) {
  tabs.openSettings();
  if (OPEN_PANELS.has(panel)) send('panel', panel);
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
  if (key === 'd') {
    toggleBookmark();
    return true;
  }
  if (key === 'h' || key === 'j') {
    openSettings(key === 'h' ? 'history' : 'downloads');
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
    if (params.y < tabs.toolbarBottom()) {
      // só na barra de endereço (a barra do topo)
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
  tabs.eagerJs = () => speedApi.options().eagerJsCache;
  tabs.setWebrtcPolicy(privacyApi.webrtc());
  // janela de anúncio: cortada se o bloqueador OU "fechar popups" estiver ligado
  tabs.setPopupFilter((url) => (store.get('adblock') !== false || store.get('adblockPopups') !== false) && !!adblockApi?.shouldBlock(url, 'script', ''));
  tabs.setFaviconColor(createFaviconColor({ net, nativeImage }));
  tabs.setTabLayout(store.get('tabLayout') ?? {});
  policy = startMemoryPolicy(tabs, (mb) => send('memory', mb), () => {
    const o = speedApi.options();
    return { discardMs: cfg.DISCARD_AFTER_MS_OVERRIDE ?? o.discardMinutes * 60 * 1000, budgetMB: o.memoryBudgetMB };
  });

  win.on('resize', () => tabs.layout());
  win.on('focus', () => sampleMemory(false));

  // Reabre as abas da sessão anterior (só a ativa carrega); sem sessão, uma aba em branco.
  const saved = sessionStore.get('session');
  if (!tabs.restore(saved?.items, saved?.active)) tabs.create();
  else warmUp(saved.items?.[saved.active ?? 0]?.url); // a aba que vai abrir já ganha a conexão pronta

  win.on('close', () => {
    saveSession(); // antes de as abas serem destruídas
    sessionStore.flush();
    history.flush();
    downloadsStore.flush();
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
  send('font', { scale: store.get('fontScale') ?? 1, family: store.get('fontFamily') ?? 'system' });
  send('tabLayout', tabs.tabLayout);
  if (permissions.pending()) send('perm:ask', permissions.pending());
  flushState();
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
ipcMain.on('tab:mute', (event, id) => {
  if (fromUi(event) && isId(id)) tabs.toggleMute(id);
});
ipcMain.on('tabs:layout', (event, layout) => {
  if (!fromUi(event) || !layout || typeof layout !== 'object') return;
  const saved = tabs.setTabLayout(layout);
  store.set('tabLayout', saved);
  send('tabLayout', saved);
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
  if (fromUi(event) && ['pt', 'en', 'es', 'zh', 'ja'].includes(lang)) store.set('lang', lang);
});
ipcMain.on('history:clear', (event) => fromUi(event) && history.clear());
// Abre a conexão (DNS + TLS) com um site antes de você precisar dele. Só https, uma vez por site,
// nada de domínio de anúncio, e só se "Conectar antes de abrir" estiver ligado em Velocidade.
const warmed = new Set();
// Sites que sempre puxam imagens/arquivos de outro endereço: a conexão com ele também já fica pronta.
const COMPANIONS = { 'youtube.com': ['https://i.ytimg.com'] };
function connect(origin) {
  if (warmed.has(origin) || !speedApi.options().preconnect || adblockApi?.shouldBlock(`${origin}/`, 'script', '')) return;
  if (warmed.size >= 50) warmed.clear();
  warmed.add(origin);
  session.defaultSession.preconnect({ url: origin, numSockets: 1 });
}
function warmUp(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== 'https:') return;
  connect(u.origin);
  for (const [site, extra] of Object.entries(COMPANIONS)) {
    if (u.hostname === site || u.hostname.endsWith(`.${site}`)) extra.forEach(connect);
  }
}
// Vem das páginas quando o mouse passa por cima de um link para outro site.
ipcMain.on('link:hover', (event, origin) => {
  if (!fromUi(event) && typeof origin === 'string' && origin.length < 256) warmUp(origin);
});
ipcMain.handle('history:suggest', (event, q) => {
  if (!fromUi(event) || typeof q !== 'string') return [];
  // favoritos (com estrela) vêm primeiro, depois os sites do histórico
  const stars = bookmarks.suggest(q.slice(0, 200), 3);
  const list = [...stars, ...history.suggest(q.slice(0, 200)).filter((h) => !stars.some((s) => s.url === h.url))].slice(0, 6);
  // Navegar mais rápido: enquanto você digita, já abre a conexão com o 1º site sugerido.
  const top = list[0]?.url;
  if (top) warmUp(top);
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
// Tamanho e fonte do texto da interface do Evl (não muda os sites).
const FONT_FAMILIES = new Set(['system', 'arial', 'verdana', 'georgia', 'times', 'mono']);
const validFamily = (f) => typeof f === 'string' && (FONT_FAMILIES.has(f) || /^custom:[\p{L}\p{N} .\-]{1,60}$/u.test(f));
ipcMain.on('font:set', (event, scale, family) => {
  if (!fromUi(event) || !Number.isFinite(scale) || scale < 0.7 || scale > 2 || !validFamily(family)) return;
  store.set('fontScale', scale);
  store.set('fontFamily', family);
});
ipcMain.on('accent:set', (event, color) => {
  if (!fromUi(event)) return;
  if (color !== null && !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) return;
  store.set('accent', color);
});
ipcMain.handle('settings:report', (event) => (fromUi(event) ? settingsReport() : null));

toggleBookmark = registerBookmarksIpc({
  ipcMain,
  fromUi,
  getBookmarks: () => bookmarks,
  getActivePage: activePage,
  openUrl: (url) => tabs.create(url),
  refresh: () => onTabsChanged(),
}).toggleActive;
registerPasswordIpc({ ipcMain, fromUi, dialog, clipboard, getVault: () => vault, getWindow: () => win });
registerCookiesIpc({ ipcMain, fromUi, app, session, dialog, getWindow: () => win });
registerExtensionsIpc({ ipcMain, fromUi, dialog, net, getExtensions: () => extensions, getWindow: () => win, getTabs: () => tabs });
const permissions = registerPermissionIpc({ ipcMain, fromUi, session, getStore: () => store, getTabs: () => tabs, send, getActiveUrl: () => activePage()?.url ?? '', refresh: onTabsChanged });
const settingsApi = registerSettingsIpc({
  ipcMain,
  fromUi,
  app,
  session,
  getStore: () => store,
  getTabs: () => tabs,
  defaultUA: DEFAULT_UA,
  beforeRestart: () => {
    saveSession(); // app.exit não passa pelo evento "close"
    sessionStore.flush();
    history.flush();
    downloadsStore.flush();
  },
});

// ---------- ciclo de vida do app ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // sem menu padrão (nossos atalhos ficam no código)

  store = createStore(path.join(app.getPath('userData'), 'settings.json'));
  sessionStore = createStore(path.join(app.getPath('userData'), 'session.json'), {});
  bookmarks = createBookmarks(path.join(app.getPath('userData'), 'bookmarks.json'));
  history = createHistory(path.join(app.getPath('userData'), 'history.json'));
  loadEngines();
  const savedTheme = store.get('theme');
  nativeTheme.themeSource = THEMES.has(savedTheme) ? savedTheme : 'dark';

  permissions.install();
  downloadsStore = createStore(path.join(app.getPath('userData'), 'downloads.json'), {});
  downloadsApi = registerDownloadsIpc({ ipcMain, fromUi, session, app, shell, dialog, store, listStore: downloadsStore, getWindow: () => win, notify: (name) => send('download', name) });
  downloadsApi.install();
  settingsApi.applyUserAgent();

  // Senhas: cifradas com a proteção do sistema (safeStorage); sem ela, o cofre fica desativado.
  vault = createVault(path.join(app.getPath('userData'), 'passwords.json'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
    decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
  });

  const ses = session.defaultSession;
  extensions = createExtensions({
    ext: ses.extensions ?? ses,
    dir: path.join(app.getPath('userData'), 'extensions'),
    store: createStore(path.join(app.getPath('userData'), 'extensions.json'), {}),
  });
  // Rede: bloqueador de anúncios + privacidade, num só lugar (src/network/network_hub.js).
  const adblock = createAdblock();
  adblockApi = adblock;
  const network = createNetworkHub({
    session,
    adblock,
    getAdblockOn: () => store.get('adblock') !== false,
    getPrivacy: () => privacyOptions(store.get('privacy')),
    isFullExtension: (initiator) => extensions.isFull(initiator),
  });
  registerAdblockIpc({ ipcMain, fromUi, adblock, store, getNetwork: () => network, getMask: () => privacyOptions(store.get('privacy')).maskHardware, getCanvas: () => privacyOptions(store.get('privacy')).canvasNoise, getPage: () => ({ lazy: speedApi.options().lazyImages, lang: privacyOptions(store.get('privacy')).englishOnly }) });
  privacyApi = registerPrivacyIpc({ ipcMain, fromUi, store, session, app, getNetwork: () => network, getTabs: () => tabs });
  privacyApi.apply();
  speedApi = registerSpeedIpc({ ipcMain, fromUi, store, app, startup: startupSpeed });
  extensions.loadAll(); // carrega em segundo plano; a janela não espera

  createWindow();
});

// "Limpar dados ao fechar": apaga cookies e cache antes de sair (uma vez só).
let clearedOnExit = false;
app.on('before-quit', (event) => {
  if (clearedOnExit || !privacyApi?.options().clearOnExit) return;
  event.preventDefault();
  clearedOnExit = true;
  const ses = session.defaultSession;
  Promise.all([ses.clearCache(), ses.clearStorageData()]).finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
