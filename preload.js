// A interface (ui/index.html) não tem acesso ao Node. Este arquivo expõe
// apenas as funções abaixo, como uma pequena "API" em window.evl.
// Cada função só manda uma mensagem para o main.js, que decide o que fazer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evl', {
  ready: () => ipcRenderer.send('ui:ready'),
  newTab: () => ipcRenderer.send('tab:new'),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  activateTab: (id) => ipcRenderer.send('tab:activate', id),
  navigate: (text) => ipcRenderer.send('nav:go', String(text)),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  openSettings: () => ipcRenderer.send('settings:open'),
  setTheme: (theme) => ipcRenderer.send('theme:set', String(theme)),

  // Pergunta ao main.js o relatório da tela de Configurações (devolve uma Promise).
  settingsReport: () => ipcRenderer.invoke('settings:report'),

  // Eventos que vêm do main.js
  onState: (cb) => ipcRenderer.on('state', (_event, state) => cb(state)),
  onMemory: (cb) => ipcRenderer.on('memory', (_event, mb) => cb(mb)),
  onFocusAddress: (cb) => ipcRenderer.on('focus-address', () => cb()),
});
