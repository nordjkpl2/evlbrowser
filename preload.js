// A interface (ui/index.html) não tem acesso ao Node. Este arquivo expõe
// apenas as funções abaixo, como uma pequena "API" em window.evl.
// Cada função só manda uma mensagem para o main.js, que decide o que fazer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evl', {
  ready: () => ipcRenderer.send('ui:ready'),
  newTab: () => ipcRenderer.send('tab:new'),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  activateTab: (id) => ipcRenderer.send('tab:activate', id),
  muteTab: (id) => ipcRenderer.send('tab:mute', id),
  setTabLayout: (layout) => ipcRenderer.send('tabs:layout', layout),
  onTabLayout: (cb) => ipcRenderer.on('tabLayout', (_event, l) => cb(l)),
  navigate: (text) => ipcRenderer.send('nav:go', String(text)),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  openSettings: (panel) => ipcRenderer.send('settings:open', panel === 'history' ? panel : undefined),
  historyList: () => ipcRenderer.invoke('history:list'),
  historyOpen: (url) => ipcRenderer.send('history:open', String(url)),
  historyRemove: (host) => ipcRenderer.send('history:remove', String(host)),
  setLang: (lang) => ipcRenderer.send('lang:set', String(lang)),
  historyClear: () => ipcRenderer.send('history:clear'),
  enginesList: () => ipcRenderer.invoke('engines:list'),
  enginesSelect: (id) => ipcRenderer.invoke('engines:select', String(id)),
  enginesRemove: (id) => ipcRenderer.invoke('engines:remove', String(id)),
  enginesSave: (e) =>
    ipcRenderer.invoke('engines:save', {
      id: typeof e?.id === 'string' ? e.id : null,
      name: String(e?.name ?? ''),
      url: String(e?.url ?? ''),
    }),
  cookiesList: () => ipcRenderer.invoke('cookies:list'),
  cookiesRemove: (domain) => ipcRenderer.invoke('cookies:remove', domain === null ? null : String(domain)),
  cookiesImport: (from) => ipcRenderer.invoke('cookies:import', String(from)),
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle'),
  bookmarksList: () => ipcRenderer.invoke('bookmarks:list'),
  bookmarksOpen: (url) => ipcRenderer.send('bookmarks:open', String(url)),
  bookmarksRemove: (id) => ipcRenderer.invoke('bookmarks:remove', String(id)),
  passwordsList: () => ipcRenderer.invoke('passwords:list'),
  passwordsAdd: (e) =>
    ipcRenderer.invoke('passwords:add', {
      site: String(e?.site ?? ''),
      username: String(e?.username ?? ''),
      password: String(e?.password ?? ''),
    }),
  passwordsShow: (id) => ipcRenderer.invoke('passwords:show', String(id)),
  passwordsCopy: (id) => ipcRenderer.invoke('passwords:copy', String(id)),
  passwordsRemove: (id) => ipcRenderer.invoke('passwords:remove', String(id)),
  passwordsClear: () => ipcRenderer.invoke('passwords:clear'),
  passwordsImport: () => ipcRenderer.invoke('passwords:import'),
  adblockGet: () => ipcRenderer.invoke('adblock:get'),
  adblockPopups: (on) => ipcRenderer.invoke('adblock:popups', on === true),
  adblockSet: (on) => ipcRenderer.invoke('adblock:set', on === true),
  extensionsList: () => ipcRenderer.invoke('extensions:list'),
  extensionsPick: (kind) => ipcRenderer.invoke('extensions:pick', kind === 'folder' ? 'folder' : 'file'),
  extensionsStore: (text) => ipcRenderer.invoke('extensions:store', String(text)),
  extensionsEnable: (id, on) => ipcRenderer.invoke('extensions:enable', String(id), on === true),
  extensionsRemove: (id) => ipcRenderer.invoke('extensions:remove', String(id)),
  suggest: (text) => ipcRenderer.invoke('history:suggest', String(text)),
  setSuggest: (open) => ipcRenderer.send('suggest:set', open === true),
  speedGet: () => ipcRenderer.invoke('speed:get'),
  speedSet: (key, value) => ipcRenderer.invoke('speed:set', String(key), value),
  relaunch: () => ipcRenderer.send('app:relaunch'),
  setFont: (scale, family) => ipcRenderer.send('font:set', Number(scale), String(family)),
  privacyGet: () => ipcRenderer.invoke('privacy:get'),
  privacySet: (key, on) => ipcRenderer.invoke('privacy:set', String(key), on === true),
  privacyClear: () => ipcRenderer.invoke('privacy:clear'),
  adblockAllow: (site, add) => ipcRenderer.invoke('adblock:allow', String(site), add === true),
  setAccent: (color) => ipcRenderer.send('accent:set', color === null ? null : String(color)),
  setMenu: (open) => ipcRenderer.send('menu:set', open === true),
  zoom: (action) => ipcRenderer.send('zoom:set', String(action)), // 'in' | 'out' | 'reset'
  setTheme: (theme) => ipcRenderer.send('theme:set', String(theme)),

  // Pergunta ao main.js o relatório da tela de Configurações (devolve uma Promise).
  settingsReport: () => ipcRenderer.invoke('settings:report'),

  // Eventos que vêm do main.js
  onState: (cb) => ipcRenderer.on('state', (_event, state) => cb(state)),
  onMemory: (cb) => ipcRenderer.on('memory', (_event, mb) => cb(mb)),
  onPanel: (cb) => ipcRenderer.on('panel', (_event, name) => cb(name)),
  onLang: (cb) => ipcRenderer.on('lang', (_event, lang) => cb(lang)),
  onFont: (cb) => ipcRenderer.on('font', (_event, f) => cb(f)),
  onAccent: (cb) => ipcRenderer.on('accent', (_event, color) => cb(color)),
  onFocusAddress: (cb) => ipcRenderer.on('focus-address', () => cb()),
});
