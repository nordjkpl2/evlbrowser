// Gerencia as abas. Existem 3 tipos:
//
//   web       -> uma WebContentsView (página de internet de verdade)
//   blank     -> "Nova aba": desenhada pela própria interface, SEM processo extra
//   settings  -> Configurações: desenhada pela própria interface, SEM processo extra
//
// Estados de uma aba web (é aqui que a RAM é economizada):
//
//   ativa      -> view na janela, página viva
//   sleeping   -> view fora da janela (escondida), página ainda viva na memória
//   discarded  -> página destruída; guardamos só url/título/ícone
//
// Clicar numa aba "discarded" recria a página e carrega a URL de novo.

const path = require('path');
const { WebContentsView } = require('electron');

const AUDIO_GRACE_MS = 5 * 60 * 1000; // depois do último som, a aba ainda fica protegida por 5 min
const { toUrl } = require('./url_address_parser');
const { hostColor } = require('./favicon_color');
const { MENU_HEIGHT, SUGGEST_HEIGHT, PROMPT_HEIGHT } = require('../app/app_config');

const DEFAULT_TAB_LAYOUT = { mode: 'top', tabH: 32, tabW: 200, sideW: 220, line: false, lineColor: '' };
const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

const SETTINGS_URL = 'evl://settings';

// Passos de zoom (1 = 100%), iguais aos do Chrome: 25% ... 500%.
const ZOOM_FACTORS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

class TabManager {
  // win: a BaseWindow. ui: a WebContentsView da interface.
  // onChange(): chamado sempre que algo muda (sem argumentos; use snapshot()).
  // onShortcut(input): chamado para teclas digitadas dentro das páginas.
  // history (opcional): { add(url, title), setTitle(url, title) } para o histórico.
  constructor(win, ui, onChange, onShortcut, history) {
    this.win = win;
    this.ui = ui;
    this.onChange = onChange;
    this.onShortcut = onShortcut;
    this.tabs = new Map(); // id -> tab (o Map guarda a ordem de criação)
    this.activeId = null;
    this.nextId = 1;
    this.menuOpen = false; // submenu do contador de memória (zoom + Configurações)
    this.suggestOpen = false; // sugestões do histórico na barra de endereço
    this.promptOpen = false; // pedido de permissão de um site (microfone, câmera...)
    this.history = history;
    this.webrtcPolicy = 'default_public_interface_only'; // o WebRTC não revela o IP da rede local
    this.tabLayout = { ...DEFAULT_TAB_LAYOUT }; // abas em cima ou na lateral, altura e largura
    this.webglOff = false;
    this.settingsZoom = 1; // zoom da aba Configurações (a página é da própria interface; a UI aplica o zoom)
    this.letterbox = false;
    this.popupBlocked = null; // (url) => true corta janelas de anúncio
    this.closed = []; // abas web fechadas (para Ctrl+Shift+T), a mais recente no fim
    this.eagerJs = () => false; // Velocidade > "Guardar o JavaScript já compilado" (vem do main.js)
  }

  // Abas em cima ("top") ou na lateral esquerda ("side"); tamanhos em px.
  setTabLayout(l = {}) {
    const d = DEFAULT_TAB_LAYOUT;
    this.tabLayout = {
      mode: l.mode === 'side' ? 'side' : 'top',
      tabH: clampInt(l.tabH, 24, 48, d.tabH),
      tabW: clampInt(l.tabW, 100, 300, d.tabW),
      sideW: clampInt(l.sideW, 180, 320, d.sideW),
      line: l.line === true, // linha colorida sobre o ícone das abas
      lineColor: /^#[0-9a-f]{6}$/i.test(l.lineColor || '') ? l.lineColor.toLowerCase() : '', // '' = cor do ícone/site
    };
    for (const tab of this.tabs.values()) this._paintTab(tab);
    this.layout();
    this._changed();
    return this.tabLayout;
  }

  // Função async (urlDoÍcone, urlDaPágina) -> '#rrggbb' (vem do main.js; usa a rede e o nativeImage).
  setFaviconColor(fn) {
    this.faviconColor = typeof fn === 'function' ? fn : null;
  }

  // Cor da linha sobre o ícone: na hora a do nome do site; depois a do próprio ícone.
  _paintTab(tab) {
    if (!this.tabLayout.line || tab.kind !== 'web') {
      tab.color = '';
      return;
    }
    if (this.tabLayout.lineColor) {
      tab.color = this.tabLayout.lineColor; // cor escolhida por você
      return;
    }
    let host = '';
    try {
      host = new URL(tab.url).hostname;
    } catch {}
    tab.color = hostColor(host);
    const icon = tab.favicon;
    if (!icon || !this.faviconColor) return;
    this.faviconColor(icon, tab.url)
      .then((color) => {
        if (this.tabLayout.line && tab.favicon === icon && color && color !== tab.color) {
          tab.color = color;
          this._changed();
        }
      })
      .catch(() => {});
  }

  setPopupFilter(fn) {
    this.popupBlocked = typeof fn === 'function' ? fn : null;
  }

  // Altura do topo (abas + barra de ferramentas) com as abas em cima.
  topHeight() {
    return this.tabLayout.tabH + 6 + 42;
  }

  // Até onde vai a barra de endereço (para o menu de contexto), em px.
  toolbarBottom() {
    return this.tabLayout.mode === 'side' ? 90 : this.topHeight();
  }

  // Silencia / reativa o som de uma aba.
  toggleMute(id) {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    tab.muted = !tab.muted;
    tab.view.webContents.setAudioMuted?.(tab.muted);
    this._changed();
  }

  // Impressão digital: WebGL desligado (vale para abas abertas depois) e página em múltiplos de 200x100 px.
  setFingerprint({ webglOff = false, letterbox = false } = {}) {
    this.webglOff = webglOff === true;
    const snap = letterbox === true;
    if (snap !== this.letterbox) {
      this.letterbox = snap;
      this.layout();
    }
  }

  // Com letterbox, o tamanho da página arredonda para baixo (200x100) e fica centrado na horizontal.
  _fit(b) {
    if (!this.letterbox) return b;
    const width = Math.max(200, Math.floor(b.width / 200) * 200);
    const height = Math.max(100, Math.floor(b.height / 100) * 100);
    return { x: b.x + Math.max(0, Math.floor((b.width - width) / 2)), y: b.y, width: Math.min(width, b.width), height: Math.min(height, b.height) };
  }

  // Política de IP do WebRTC para as páginas abertas e as próximas.
  setWebrtcPolicy(policy) {
    this.webrtcPolicy = policy;
    for (const tab of this.tabs.values()) tab.view?.webContents.setWebRTCIPHandlingPolicy?.(policy);
  }

  // ---------- criar / ativar / fechar ----------

  // Sem argumento abre uma aba em branco. Com argumento, passa pelo toUrl().
  create(rawUrl) {
    if (!rawUrl) return this._add({ kind: 'blank', title: 'Nova aba', url: '' });
    const url = toUrl(rawUrl);
    if (!url) return null;
    return this._add({ kind: 'web', title: url, url });
  }

  // Página interna de uma extensão (popup ou opções) numa aba: o Electron não tem o botão na barra.
  openExtensionPage(url) {
    if (typeof url !== 'string' || !/^chrome-extension:\/\/[a-p]{32}\/[\w\-./?=&%#]*$/.test(url)) return null;
    return this._add({ kind: 'web', title: url, url });
  }

  openSettings() {
    for (const tab of this.tabs.values()) {
      if (tab.kind === 'settings') {
        this.activate(tab.id);
        return tab.id;
      }
    }
    return this._add({ kind: 'settings', title: 'Configurações', url: SETTINGS_URL });
  }

  activate(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    this.menuOpen = false; // trocar de aba fecha o submenu e as sugestões
    this.suggestOpen = false;
    const prev = this.tabs.get(this.activeId);
    if (prev && prev !== tab && prev.view) {
      this.win.contentView.removeChildView(prev.view); // vira "sleeping"
      prev.lastActive = Date.now();
    }

    this.activeId = id;
    tab.lastActive = Date.now();

    if (tab.kind === 'web') {
      this._ensureView(tab); // recria a página se estava "discarded"
      this.win.contentView.addChildView(tab.view);
      this.win.contentView.addChildView(this.ui); // a interface fica sempre por cima (menu e sugestões)
      this.layout();
      tab.view.webContents.focus();
    } else {
      this.layout();
      this.ui.webContents.focus();
    }
    this._changed();
  }

  close(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const index = [...this.tabs.keys()].indexOf(id);

    if (tab.kind === 'web') {
      this.closed.push({ url: tab.url, title: tab.title });
      if (this.closed.length > 10) this.closed.shift();
    }
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

  // ---------- sessão: reabrir abas ----------

  // Recria as abas da sessão anterior. Só a ativa carrega; as outras já nascem
  // "discarded" (sem processo, sem RAM) e carregam quando você clicar nelas.
  // Devolve false se não sobrou nenhuma aba válida.
  restore(items, active = 0) {
    const ids = [];
    for (const item of Array.isArray(items) ? items : []) {
      const url = toUrl(item?.url);
      if (!url) continue;
      const tab = {
        id: this.nextId++,
        kind: 'web',
        title: String(item.title || url).slice(0, 200),
        url,
        favicon: '',
        loading: false,
        view: null,
        lastActive: Date.now(),
      };
      this.tabs.set(tab.id, tab);
      ids.push(tab.id);
    }
    if (ids.length === 0) return false;
    this.activate(ids[Math.min(Math.max(Number(active) | 0, 0), ids.length - 1)]);
    return true;
  }

  // As abas web de agora (para salvar a sessão) e qual delas está ativa.
  sessionSnapshot() {
    // páginas de extensão não entram na sessão (o endereço muda e não passa pelo filtro da barra)
    const web = [...this.tabs.values()].filter((t) => t.kind === 'web' && !t.url.startsWith('chrome-extension://'));
    return {
      items: web.map((t) => ({ url: t.url, title: t.title })),
      active: Math.max(0, web.findIndex((t) => t.id === this.activeId)),
    };
  }

  // Ctrl+Shift+T: reabre a última aba web fechada.
  reopenClosed() {
    const last = this.closed.pop();
    if (last) this._add({ kind: 'web', title: last.title, url: last.url });
  }

  // ---------- navegação da aba ativa ----------

  navigate(input) {
    const text = String(input ?? '').trim();
    if (text.toLowerCase() === SETTINGS_URL) {
      this.openSettings();
      return;
    }
    const url = toUrl(text);
    const tab = this.tabs.get(this.activeId);
    if (!url || !tab) return;

    tab.url = url;
    if (tab.kind !== 'web') {
      // aba em branco / configurações virando uma página de internet
      tab.kind = 'web';
      tab.title = url;
      this.activate(tab.id);
    } else if (tab.view) {
      tab.view.webContents.loadURL(url);
    } else {
      this._ensureView(tab);
    }
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

  // Zoom da aba ativa (Ctrl + / Ctrl - / Ctrl 0). Mesmos passos do Chrome.
  // O Chromium guarda o zoom por site (origem), então vale para o site todo.
  zoomIn() {
    this._zoomStep(1);
  }
  zoomOut() {
    this._zoomStep(-1);
  }
  zoomReset() {
    if (this._onSettings()) this.settingsZoom = 1;
    else this.tabs.get(this.activeId)?.view?.webContents.setZoomLevel(0);
    this._changed();
  }

  _onSettings() {
    return this.tabs.get(this.activeId)?.kind === 'settings';
  }

  // Zoom da aba ativa em % (100 = normal), ou null se a aba não é uma página web viva.
  zoomPercent() {
    if (this._onSettings()) return Math.round(this.settingsZoom * 100);
    const wc = this.tabs.get(this.activeId)?.view?.webContents;
    return wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : null;
  }

  // Abre/fecha o submenu do contador de memória. Aberto, a interface cresce por
  // cima da página (ela já fica no topo da pilha de views) para caber o menu.
  setMenu(open) {
    if (this.menuOpen === open) return;
    this.menuOpen = open;
    if (open) this.suggestOpen = false;
    this.layout();
    this._changed();
  }

  // Idem para o painel de pedido de permissão.
  setPrompt(open) {
    if (this.promptOpen === open) return;
    this.promptOpen = open;
    this.layout();
  }

  // Idem para a lista de sugestões. A interface controla; aqui só ajustamos a altura.
  setSuggest(open) {
    if (this.suggestOpen === open) return;
    this.suggestOpen = open;
    if (open && this.menuOpen) {
      this.menuOpen = false;
      this._changed();
    }
    this.layout();
  }

  // ---------- política de memória (usada por memory_policy.js) ----------

  // Abas web de fundo com página viva (candidatas a descarte).
  backgroundViewTabs() {
    return [...this.tabs.values()].filter((t) => t.id !== this.activeId && t.view);
  }

  // Dessas, as paradas há pelo menos `minIdleMs`, da mais antiga para a mais nova.
  // Abas com som/vídeo tocando (ou que tocaram há pouco) nunca entram.
  idleBackgroundTabs(minIdleMs) {
    const now = Date.now();
    return this.backgroundViewTabs()
      .filter((t) => !this._playing(t, now) && now - t.lastActive >= minIdleMs)
      .sort((a, b) => a.lastActive - b.lastActive);
  }

  _playing(tab, now = Date.now()) {
    return !!(
      tab.view &&
      (tab.mediaPlaying || tab.view.webContents.isCurrentlyAudible() || now - (tab.lastAudible || 0) < AUDIO_GRACE_MS)
    );
  }

  discard(id) {
    const tab = this.tabs.get(id);
    if (!tab || id === this.activeId || !tab.view || this._playing(tab)) return;
    this._destroyView(tab);
    this._changed();
  }

  // ---------- layout e estado ----------

  // Aba web ativa: interface com 80 px no topo e a página embaixo.
  // Aba em branco / configurações: a interface ocupa a janela inteira.
  layout() {
    const { width, height } = this.win.getContentBounds();
    const tab = this.tabs.get(this.activeId);
    const web = tab?.kind === 'web';

    const extra = Math.max(this.menuOpen ? MENU_HEIGHT : this.suggestOpen ? SUGGEST_HEIGHT : 0, this.promptOpen ? PROMPT_HEIGHT : 0);
    if (this.tabLayout.mode === 'side') {
      // painel lateral de abas (barra + abas) à esquerda; a página ocupa o resto.
      // Com menu/sugestões abertos o painel alarga por cima da página.
      const side = Math.min(this.tabLayout.sideW, width);
      const wide = this.menuOpen ? 300 : this.suggestOpen ? 400 : this.promptOpen ? 300 : 0;
      this.ui.setBounds({ x: 0, y: 0, width: web ? Math.min(Math.max(side, wide), width) : width, height });
      if (web && tab.view) tab.view.setBounds(this._fit({ x: side, y: 0, width: Math.max(0, width - side), height }));
      return;
    }
    const top = this.topHeight();
    this.ui.setBounds({ x: 0, y: 0, width, height: Math.min(web ? top + extra : height, height) });
    if (web && tab.view) {
      tab.view.setBounds(this._fit({ x: 0, y: top, width, height: Math.max(0, height - top) }));
    }
  }

  // Uma "foto" simples do estado, enviada para a interface desenhar.
  snapshot() {
    const active = this.tabs.get(this.activeId);
    const nav = this._activeNav();
    return {
      activeId: this.activeId,
      activeKind: active?.kind ?? 'blank',
      menuOpen: this.menuOpen,
      zoom: this.zoomPercent(),
      canGoBack: !!nav?.canGoBack(),
      canGoForward: !!nav?.canGoForward(),
      tabs: [...this.tabs.values()].map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        color: this.tabLayout.line ? t.color || '' : '',
        loading: t.loading,
        audible: !!t.audible,
        muted: !!t.muted,
        state:
          t.id === this.activeId
            ? 'active'
            : t.kind !== 'web'
              ? 'page'
              : t.view
                ? 'sleeping'
                : 'discarded',
      })),
    };
  }

  destroyAll() {
    for (const tab of this.tabs.values()) this._destroyView(tab);
    this.tabs.clear();
  }

  // ---------- internos ----------

  _add(props) {
    const tab = {
      id: this.nextId++,
      favicon: '',
      loading: false,
      view: null,
      lastActive: Date.now(),
      ...props,
    };
    this.tabs.set(tab.id, tab);
    this.activate(tab.id);
    return tab.id;
  }

  _activeNav() {
    return this.tabs.get(this.activeId)?.view?.webContents.navigationHistory;
  }

  _changed() {
    this.onChange();
  }

  // Próximo passo da lista ZOOM_FACTORS a partir de um fator (1 = 100%).
  // Se o zoom atual não é um dos passos, o primeiro passo só "encaixa" na lista.
  _nextZoom(current, direction) {
    let index = ZOOM_FACTORS.findIndex((f) => f >= current - 0.001);
    if (index === -1) index = ZOOM_FACTORS.length - 1;
    const exact = Math.abs(ZOOM_FACTORS[index] - current) < 0.01;
    const next = direction > 0 ? (exact ? index + 1 : index) : index - 1;
    return ZOOM_FACTORS[Math.min(ZOOM_FACTORS.length - 1, Math.max(0, next))];
  }

  // Anda um passo na lista ZOOM_FACTORS a partir do zoom atual da página.
  _zoomStep(direction, tab = this.tabs.get(this.activeId)) {
    if (tab?.kind === 'settings') {
      this.settingsZoom = this._nextZoom(this.settingsZoom, direction);
      this._changed();
      return;
    }
    const wc = tab?.view?.webContents;
    if (!wc) return;
    const factor = this._nextZoom(Math.pow(1.2, wc.getZoomLevel()), direction); // nível do Chromium -> fator (1 = 100%)
    wc.setZoomLevel(Math.log(factor) / Math.log(1.2));
    this._changed();
  }

  _ensureView(tab) {
    if (tab.view) return;

    // A página da aba NÃO tem acesso ao Node nem ao Electron.
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webgl: !this.webglOff,
        // código já compilado guardado no cache desde a 1ª visita (padrão do Chromium: só depois de "esquentar")
        v8CacheOptions: this.eagerJs() ? 'bypassHeatCheck' : 'code',
        preload: path.join(__dirname, '..', '..', 'preload_web_pages.js'), // senhas e YouTube (só mundo isolado)
      },
    });
    const wc = view.webContents;
    wc.setWebRTCIPHandlingPolicy?.(this.webrtcPolicy);

    // Som/vídeo tocando em segundo plano: a aba fica protegida do descarte, mesmo que o som
    // falhe por instantes (buffering, troca de faixa, pausa curta).
    tab.mediaPlaying = false;
    tab.lastAudible = 0;
    wc.on('media-started-playing', () => (tab.mediaPlaying = true));
    wc.on('media-paused', () => (tab.mediaPlaying = false));
    tab.audible = false;
    tab.muted = false;
    wc.on('audio-state-changed', (e) => {
      if (e.audible) tab.lastAudible = Date.now();
      if (tab.audible !== e.audible) {
        tab.audible = e.audible; // o ícone de som na aba acompanha
        this._changed();
      }
    });

    // target=_blank / window.open -> nova aba (e nunca uma janela solta).
    wc.setWindowOpenHandler(({ url }) => {
      if (this.popupBlocked?.(url)) return { action: 'deny' }; // janela de anúncio
      this.create(url);
      return { action: 'deny' };
    });

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      this.history?.setTitle(tab.url, title);
      this._changed();
    });
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons[0] || '';
      this._paintTab(tab);
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
      if (this.tabLayout.line) this._paintTab(tab);
      this.history?.add(tab.url, '');
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
    // Ctrl + roda do mouse
    wc.on('zoom-changed', (_e, direction) => {
      this._zoomStep(direction === 'in' ? 1 : -1, tab);
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

module.exports = { TabManager };
