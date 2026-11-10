// Gerencia as abas. Cada aba é uma WebContentsView (uma "página filha"
// desenhada dentro da janela). É aqui que a RAM é economizada:
//
//   ativa      -> view na janela, página viva
//   sleeping   -> view fora da janela (escondida), página ainda viva na memória
//   discarded  -> página destruída; guardamos só url/título/ícone
//
// Clicar numa aba "discarded" recria a página e carrega a URL de novo.

const { WebContentsView } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { toUrl } = require('./url');
const { UI_HEIGHT } = require('./config');

const NEWTAB_URL = pathToFileURL(path.join(__dirname, '..', 'ui', 'newtab.html')).href;

class TabManager {
  // win: a BaseWindow. onChange(snapshot): chamado sempre que algo muda.
  // onShortcut(input): chamado para teclas digitadas dentro das páginas.
  constructor(win, onChange, onShortcut) {
    this.win = win;
    this.onChange = onChange;
    this.onShortcut = onShortcut;
    this.tabs = new Map(); // id -> tab (o Map guarda a ordem de criação)
    this.activeId = null;
    this.nextId = 1;
  }

  // ---------- criar / ativar / fechar ----------

  // Sem argumento abre a página "Nova aba". Com argumento, passa pelo toUrl().
  create(rawUrl) {
    const url = rawUrl ? toUrl(rawUrl) : NEWTAB_URL;
    if (!url) return null;
    const tab = {
      id: this.nextId++,
      url,
      title: rawUrl ? url : 'Nova aba',
      favicon: '',
      loading: false,
      view: null,
      lastActive: Date.now(),
    };
    this.tabs.set(tab.id, tab);
    this.activate(tab.id);
    return tab.id;
  }

  activate(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const prev = this.tabs.get(this.activeId);
    if (prev && prev !== tab && prev.view) {
      this.win.contentView.removeChildView(prev.view); // vira "sleeping"
      prev.lastActive = Date.now();
    }

    this.activeId = id;
    tab.lastActive = Date.now();
    this._ensureView(tab); // recria a página se estava "discarded"
    this.win.contentView.addChildView(tab.view);
    this.layout();
    tab.view.webContents.focus();
    this._changed();
  }

  close(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const index = [...this.tabs.keys()].indexOf(id);

    this._destroyView(tab);
    this.tabs.delete(id);

    if (this.tabs.size === 0) {
      this.activeId = null;
      this.create(); // sempre sobra uma aba
      return;
    }
    if (this.activeId === id) {
      const rest = [...this.tabs.keys()];
      this.activate(rest[Math.min(index, rest.length - 1)]);
    } else {
      this._changed();
    }
  }

  // ---------- navegação da aba ativa ----------

  navigate(input) {
    const url = toUrl(input);
    const tab = this.tabs.get(this.activeId);
    if (!url || !tab) return;
    tab.url = url;
    if (tab.view) tab.view.webContents.loadURL(url);
    else this._ensureView(tab);
  }

  back() {
    this._activeNav()?.goBack();
  }
  forward() {
    this._activeNav()?.goForward();
  }
  reload() {
    this.tabs.get(this.activeId)?.view?.webContents.reload();
  }
  openDevTools() {
    this.tabs.get(this.activeId)?.view?.webContents.openDevTools({ mode: 'detach' });
  }

  // ---------- política de memória (usada por memory.js) ----------

  // Abas de fundo, com página viva, paradas há pelo menos `minIdleMs`,
  // da mais antiga para a mais nova. Abas tocando áudio nunca entram.
  idleBackgroundTabs(minIdleMs) {
    const now = Date.now();
    return [...this.tabs.values()]
      .filter(
        (t) =>
          t.id !== this.activeId &&
          t.view &&
          !t.view.webContents.isCurrentlyAudible() &&
          now - t.lastActive >= minIdleMs
      )
      .sort((a, b) => a.lastActive - b.lastActive);
  }

  discard(id) {
    const tab = this.tabs.get(id);
    if (!tab || id === this.activeId || !tab.view) return;
    this._destroyView(tab);
    this._changed();
  }

  // ---------- layout e estado ----------

  layout() {
    const { width, height } = this.win.getContentBounds();
    const tab = this.tabs.get(this.activeId);
    if (tab?.view) {
      tab.view.setBounds({
        x: 0,
        y: UI_HEIGHT,
        width,
        height: Math.max(0, height - UI_HEIGHT),
      });
    }
  }

  // Uma "foto" simples do estado, enviada para a interface desenhar.
  snapshot() {
    const nav = this._activeNav();
    return {
      activeId: this.activeId,
      canGoBack: !!nav?.canGoBack(),
      canGoForward: !!nav?.canGoForward(),
      tabs: [...this.tabs.values()].map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url === NEWTAB_URL ? '' : t.url,
        favicon: t.favicon,
        loading: t.loading,
        state: t.id === this.activeId ? 'active' : t.view ? 'sleeping' : 'discarded',
      })),
    };
  }

  destroyAll() {
    for (const tab of this.tabs.values()) this._destroyView(tab);
    this.tabs.clear();
  }

  // ---------- internos ----------

  _activeNav() {
    return this.tabs.get(this.activeId)?.view?.webContents.navigationHistory;
  }

  _changed() {
    this.onChange(this.snapshot());
  }

  _ensureView(tab) {
    if (tab.view) return;

    // A página da aba NÃO tem acesso ao Node nem ao Electron.
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const wc = view.webContents;

    // target=_blank / window.open -> nova aba (e nunca uma janela solta).
    wc.setWindowOpenHandler(({ url }) => {
      this.create(url);
      return { action: 'deny' };
    });

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      this._changed();
    });
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons[0] || '';
      this._changed();
    });
    wc.on('did-start-loading', () => {
      tab.loading = true;
      this._changed();
    });
    wc.on('did-stop-loading', () => {
      tab.loading = false;
      this._changed();
    });
    // Versões novas do Electron mandam a URL em event.url; as antigas, como argumento.
    wc.on('did-navigate', (e, url) => {
      tab.url = e.url ?? url;
      this._changed();
    });
    wc.on('did-navigate-in-page', (e, url, isMainFrame) => {
      if ((e.isMainFrame ?? isMainFrame) === false) return;
      tab.url = e.url ?? url;
      this._changed();
    });
    wc.on('before-input-event', (event, input) => {
      if (this.onShortcut(input)) event.preventDefault();
    });

    tab.view = view;
    wc.loadURL(tab.url);
  }

  _destroyView(tab) {
    if (!tab.view) return;
    try {
      this.win.contentView.removeChildView(tab.view);
    } catch {
      // já estava fora da janela
    }
    tab.view.webContents.close();
    tab.view = null;
    tab.loading = false;
  }
}

module.exports = { TabManager, NEWTAB_URL };
