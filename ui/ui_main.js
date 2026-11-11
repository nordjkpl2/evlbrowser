'use strict';
// Lógica da interface. Roda como uma página web comum; tudo que precisa do
// "mundo de fora" passa por window.evl (definido em preload.js).

const $ = (id) => document.getElementById(id);

const tabsEl = $('tabs');
const newTabBtn = $('new-tab');
const backBtn = $('back');
const forwardBtn = $('forward');
const reloadBtn = $('reload');
const addressEl = $('address');
const starBtn = $('star');
const memEl = $('mem');
const pageBlank = $('page-blank');
const pageSettings = $('page-settings');
const menuEl = $('menu');
const zoomOutBtn = $('zoom-out');
const zoomInBtn = $('zoom-in');
const zoomValBtn = $('zoom-val');
const menuSettingsBtn = $('menu-settings');
const menuHistoryBtn = $('menu-history');
const chromeEl = $('chrome');
const suggestEl = $('suggest');

let current = null; // último estado recebido
let lastKey = ''; // para pular redesenho quando nada mudou

// ---------- barra de abas ----------

// Ícone de alto-falante (ou riscado, se a aba está silenciada).
function soundIcon(muted) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const path = (d) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  };
  path('M2 6h2.5L8 3v10L4.5 10H2z');
  if (muted) path('M10.5 6l4 4M14.5 6l-4 4');
  else {
    path('M10.5 5.8a3 3 0 0 1 0 4.4');
    path('M12.2 4a5.5 5.5 0 0 1 0 8');
  }
  return svg;
}

function makeTab(tab) {
  const el = document.createElement('div');
  el.className = `tab ${tab.state}${tab.loading ? ' loading' : ''}`;
  el.setAttribute('role', 'tab');
  el.setAttribute('aria-selected', String(tab.state === 'active'));
  el.tabIndex = 0;
  const label = tab.kind === 'settings' ? t('Configurações') : tab.kind === 'blank' ? t('Nova aba') : tab.title;
  el.title = label; // textContent/title: nunca innerHTML com texto de site

  if (tab.favicon) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.referrerPolicy = 'no-referrer'; // não conta ao site de onde o ícone foi pedido
    img.decoding = 'async';
    img.src = tab.favicon;
    img.alt = '';
    el.append(img);
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    el.append(dot);
  }

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = label;
  el.append(title);

  if (tab.audible || tab.muted) {
    const snd = document.createElement('button');
    snd.className = 'sound';
    snd.type = 'button';
    const tip = tab.muted ? t('Reativar som da aba') : t('Silenciar aba');
    snd.title = tip;
    snd.setAttribute('aria-label', tip);
    snd.append(soundIcon(tab.muted));
    snd.addEventListener('click', (event) => {
      event.stopPropagation();
      window.evl.muteTab(tab.id);
    });
    el.append(snd);
  }

  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.textContent = '×';
  close.title = t('Fechar aba (Ctrl+W)');
  close.setAttribute('aria-label', t('Fechar aba'));
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    window.evl.closeTab(tab.id);
  });
  el.append(close);

  el.addEventListener('click', () => window.evl.activateTab(tab.id));
  el.addEventListener('keydown', (event) => {
    if (event.target === el && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      window.evl.activateTab(tab.id);
    }
  });
  // clique com o botão do meio fecha a aba
  el.addEventListener('auxclick', (event) => {
    if (event.button === 1) window.evl.closeTab(tab.id);
  });
  return el;
}

function showAddress() {
  const active = current?.tabs.find((t) => t.id === current.activeId);
  // Aba em branco mostra a barra vazia; as outras mostram o endereço.
  addressEl.value = active && active.kind !== 'blank' ? active.url : '';
}

// ---------- submenu do contador de memória (zoom + Configurações) ----------
// Quem decide se está aberto é o main.js (state.menuOpen): ele também aumenta a
// altura da interface para o menu caber por cima da página.

let menuWasOpen = false;

function showMenu(state) {
  menuEl.hidden = !state.menuOpen;
  memEl.setAttribute('aria-expanded', String(state.menuOpen));

  const hasZoom = typeof state.zoom === 'number'; // só páginas web têm zoom
  zoomValBtn.textContent = hasZoom ? `${state.zoom}%` : '—';
  zoomValBtn.disabled = !hasZoom;
  zoomOutBtn.disabled = !hasZoom;
  zoomInBtn.disabled = !hasZoom;

  // Ao abrir, o foco vai para o menu (teclado); ao fechar, volta para o botão.
  if (state.menuOpen && !menuWasOpen) (hasZoom ? zoomInBtn : menuSettingsBtn).focus();
  else if (!state.menuOpen && menuWasOpen && menuEl.contains(document.activeElement)) memEl.focus();
  menuWasOpen = state.menuOpen;
}

// A estrela da barra: cheia e na cor principal quando a página já é favorita.
function showStar(web, on) {
  starBtn.disabled = !web;
  starBtn.classList.toggle('on', on);
  starBtn.setAttribute('aria-pressed', String(on));
  starBtn.textContent = on ? '\u2605' : '\u2606';
  const label = t(on ? 'Remover dos favoritos (Ctrl+D)' : 'Adicionar aos favoritos (Ctrl+D)');
  starBtn.title = label;
  starBtn.setAttribute('aria-label', label.replace(' (Ctrl+D)', ''));
}

function render(state) {
  current = state;

  // Só refaz a tela se o estado mudou de verdade.
  const key = JSON.stringify(state);
  if (key !== lastKey) {
    lastKey = key;

    showMenu(state);
    // linha de carregamento sob a barra, só enquanto a aba ativa carrega
    chromeEl.classList.toggle('loading', !!state.tabs.find((t) => t.id === state.activeId)?.loading);

    tabsEl.querySelectorAll('.tab').forEach((n) => n.remove());
    for (const t of state.tabs) tabsEl.insertBefore(makeTab(t), newTabBtn);

    const web = state.activeKind === 'web';
    showStar(web, state.bookmarked === true);
    backBtn.disabled = !web || !state.canGoBack;
    forwardBtn.disabled = !web || !state.canGoForward;

    pageBlank.hidden = state.activeKind !== 'blank';
    pageSettings.hidden = state.activeKind !== 'settings';
    // As Configurações só carregam o código delas na primeira vez que são abertas.
    if (state.activeKind === 'settings') {
      ensureSettingsScripts().then(() => current?.activeKind === 'settings' && startPolling());
    } else stopPolling();
  }

  // Não sobrescreve o que a pessoa está digitando.
  if (document.activeElement !== addressEl) showAddress();
}

// ---------- código das Configurações: carrega só quando abrir ----------
// Cada categoria tem o seu arquivo; nada disto é lido enquanto você só navega.

const SETTINGS_SCRIPTS = [
  'settings/settings_search_engines.js', // primeiro: define textButton, usado pelos outros
  'settings/settings_cookies.js',
  'settings/settings_extensions.js',
  'settings/settings_adblock.js',
  'settings/settings_passwords.js',
  'settings/settings_bookmarks.js',
  'settings/settings_privacy.js',
  'settings/settings_speed.js',
];
let settingsScripts = null;

function ensureSettingsScripts() {
  if (!settingsScripts) {
    settingsScripts = SETTINGS_SCRIPTS.reduce(
      (chain, src) =>
        chain.then(
          () =>
            new Promise((resolve, reject) => {
              const el = document.createElement('script');
              el.src = src;
              el.onload = resolve;
              el.onerror = () => reject(new Error(`não carregou ${src}`));
              document.head.append(el);
            })
        ),
      Promise.resolve()
    );
    settingsScripts.catch(() => (settingsScripts = null)); // tenta de novo na próxima vez
  }
  return settingsScripts;
}

// ---------- tela de Configurações ----------
// Só consulta o main.js enquanto a tela está visível (a cada 2 s).

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  if (panel === 'history') loadHistory(); // pode ter novas visitas desde a última vez
  loadEngines();
  refreshSettings();
  pollTimer = setInterval(refreshSettings, 2000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

async function refreshSettings() {
  const report = await window.evl.settingsReport();
  if (!report) return;

  $('s-chromium').textContent = report.chromium;

  $('s-total').textContent = String(report.totalMB);
  const rows = report.processes.map((p) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = p.label;
    name.title = p.label;
    const type = document.createElement('td');
    type.textContent = p.type;
    const mb = document.createElement('td');
    mb.className = 'num';
    mb.textContent = String(p.mb);
    tr.append(name, type, mb);
    return tr;
  });
  $('s-procs').replaceChildren(...rows);

  if (panel === 'adblock') loadAdblock(); // o contador sobe enquanto você navega
  showTheme(report.theme);
  if (!accent) applyAccent(null); // sem escolha: o quadrado acompanha o tema claro/escuro
}

// ---------- menu lateral e busca das Configurações ----------

const navItems = [...document.querySelectorAll('.nav-item')];
const cards = [...document.querySelectorAll('.card')];

// Cartões retráteis: clicar no título abre/fecha o conteúdo (o estado fica salvo neste computador).
// A chave é "categoria:título em português", lida uma vez no início (antes de traduzir).
let closedCards = [];
try {
  closedCards = JSON.parse(localStorage.getItem('evl.closedCards') || '[]');
} catch {}
for (const card of cards) {
  const title = card.querySelector('h3');
  if (!title) continue;
  const key = `${card.dataset.panel}:${title.textContent.trim()}`;
  card.classList.add('collapsible');
  title.tabIndex = 0;
  title.setAttribute('role', 'button');
  const setOpen = (open) => {
    card.classList.toggle('collapsed', !open);
    title.setAttribute('aria-expanded', String(open));
  };
  setOpen(!closedCards.includes(key));
  const toggle = () => {
    const open = card.classList.contains('collapsed');
    setOpen(open);
    closedCards = open ? closedCards.filter((k) => k !== key) : [...closedCards, key];
    try {
      localStorage.setItem('evl.closedCards', JSON.stringify(closedCards));
    } catch {}
  };
  title.addEventListener('click', toggle);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
}
const searchEl = $('s-search');
const panelTitle = $('panel-title');
const noResults = $('no-results');
let panel = 'search'; // categoria aberta

function showPanel(name) {
  panel = name;
  document.body.classList.remove('searching');
  searchEl.value = '';
  noResults.hidden = true;
  for (const item of navItems) {
    const on = item.dataset.panel === name;
    if (on) {
      item.setAttribute('aria-current', 'true');
      const grp = item.closest('.nav-group');
      if (grp && grp.querySelector('.nav-group-body').hidden) setGroup(grp, true);
      panelTitle.textContent = item.querySelector('span').textContent;
    } else {
      item.removeAttribute('aria-current');
    }
  }
  for (const card of cards) card.hidden = card.dataset.panel !== name;
  if (name === 'history') loadHistory();
  if (name === 'cookies') loadCookies();
  if (name === 'extensions') loadExtensions();
  if (name === 'adblock') loadAdblock();
  if (name === 'passwords') loadPasswords();
  if (name === 'bookmarks') loadBookmarks();
  if (name === 'privacy') loadPrivacy();
  if (name === 'speed') loadSpeed();
}

// Ignora maiúsculas e acentos: "memoria" acha "Memória".
const norm = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// A busca procura em todos os cartões, de qualquer categoria.
function searchSettings() {
  const q = norm(searchEl.value.trim());
  if (!q) {
    showPanel(panel);
    return;
  }
  document.body.classList.add('searching'); // resultados aparecem abertos, mesmo de cartões fechados
  navItems.forEach((item) => item.removeAttribute('aria-current'));
  panelTitle.textContent = t('Resultados da busca');
  let found = 0;
  for (const card of cards) {
    // Procura no texto que o cartão mostra (títulos, descrições, valores) e nos rótulos
    // de acessibilidade (para cartões sem texto, como a Cor principal). Nada é cadastrado à mão.
    const labels = [...card.querySelectorAll('[aria-label],[title]')]
      .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.title}`)
      .join(' ');
    card.hidden = !norm(`${card.textContent} ${labels}`).includes(q);
    if (!card.hidden) found++;
  }
  noResults.hidden = found > 0;
}

// Grupos do menu lateral: abrem e fecham (o estado fica salvo neste computador).
const navGroups = [...document.querySelectorAll('.nav-group')];
let closedGroups = [];
try {
  closedGroups = JSON.parse(localStorage.getItem('evl.closedGroups') || '[]');
} catch {}
function setGroup(group, open) {
  group.querySelector('.nav-group-head').setAttribute('aria-expanded', String(open));
  group.querySelector('.nav-group-body').hidden = !open;
}
navGroups.forEach((group) => {
  setGroup(group, !closedGroups.includes(group.dataset.group));
  group.querySelector('.nav-group-head').addEventListener('click', () => {
    const open = group.querySelector('.nav-group-body').hidden;
    setGroup(group, open);
    closedGroups = navGroups.filter((g) => g.querySelector('.nav-group-body').hidden).map((g) => g.dataset.group);
    try {
      localStorage.setItem('evl.closedGroups', JSON.stringify(closedGroups));
    } catch {}
  });
});

navItems.forEach((item) =>
  item.addEventListener('click', () => {
    const group = item.closest('.nav-group');
    if (group) setGroup(group, true); // categoria aberta nunca fica escondida
    showPanel(item.dataset.panel);
  })
);
searchEl.addEventListener('input', searchSettings);
searchEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') showPanel(panel);
});
showPanel('search');

// ---------- listas longas: só desenha o que aparece ----------
// Desenha um primeiro bloco de linhas e, quando você rola até o fim da lista, o próximo.
// Uma lista de 500 sites custa o mesmo que uma de 30 até você rolar.

const lazyObservers = new WeakMap();

function lazyList(listEl, items, makeRow, step = 30) {
  lazyObservers.get(listEl)?.disconnect();
  listEl.replaceChildren();
  let shown = 0;
  const sentinel = document.createElement('li'); // marca o fim do que já foi desenhado
  sentinel.setAttribute('aria-hidden', 'true');
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) more();
    },
    { rootMargin: '300px' }
  );
  lazyObservers.set(listEl, observer);

  function more() {
    observer.unobserve(sentinel);
    sentinel.remove();
    const rows = items.slice(shown, shown + step).map(makeRow);
    shown += rows.length;
    listEl.append(...rows);
    if (shown < items.length) {
      listEl.append(sentinel);
      observer.observe(sentinel); // observar de novo avisa na hora se ainda está à vista
    }
  }
  more();
}

// ---------- histórico ----------
// Só busca a lista quando a categoria Histórico está aberta. Texto de sites sempre
// vai por textContent (nunca innerHTML).

const hList = $('h-list');
const hEmpty = $('h-empty');

async function loadHistory() {
  const items = await window.evl.historyList();
  hEmpty.hidden = items.length > 0;
  lazyList(hList, items, (item) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'h-item';
    btn.title = item.url;
    const title = document.createElement('span');
    title.className = 'h-title';
    title.textContent = item.host || item.url;
    const url = document.createElement('span');
    url.className = 'h-url hint';
    url.textContent = item.title; // título da última página vista neste site
    const time = document.createElement('span');
    time.className = 'h-time hint';
    time.textContent = new Date(item.time).toLocaleString(LOCALES[lang], { dateStyle: 'short', timeStyle: 'short' });
    btn.append(title, url, time);
    btn.addEventListener('click', () => window.evl.historyOpen(item.url));
    btn.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openCtx(event.clientX, event.clientY, item.host, li);
    });
    li.append(btn);
    return li;
  });
}

// Botão direito num site do histórico: "Remover do histórico".
const ctxEl = $('ctx');
let ctxTarget = null;

function openCtx(x, y, host, li) {
  ctxTarget = { host, li };
  ctxEl.style.left = `${Math.min(x, innerWidth - 200)}px`;
  ctxEl.style.top = `${Math.min(y, innerHeight - 50)}px`;
  ctxEl.hidden = false;
}
function closeCtx() {
  ctxEl.hidden = true;
  ctxTarget = null;
}
$('ctx-del').addEventListener('click', () => {
  if (!ctxTarget) return;
  window.evl.historyRemove(ctxTarget.host);
  ctxTarget.li.remove();
  hEmpty.hidden = hList.children.length > 0;
  closeCtx();
});
document.addEventListener('mousedown', (event) => {
  if (!ctxEl.hidden && !ctxEl.contains(event.target)) closeCtx();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCtx();
});

$('h-clear').addEventListener('click', async () => {
  window.evl.historyClear();
  await loadHistory();
});

// ---------- aparência: Claro / Escuro ----------
// Define o esquema de cores que os SITES enxergam. A interface do Evl não muda.

const themeOptions = [...document.querySelectorAll('.theme-option')];

function showTheme(theme) {
  for (const opt of themeOptions) {
    opt.setAttribute('aria-checked', String(opt.dataset.theme === theme));
  }
}

themeOptions.forEach((opt) =>
  opt.addEventListener('click', () => {
    showTheme(opt.dataset.theme);
    window.evl.setTheme(opt.dataset.theme);
  })
);

// ---------- aparência: tamanho e fonte do texto da interface ----------
// --ui-scale multiplica os tamanhos do style.css; --font-ui troca a fonte. Os sites não mudam.

const FONTS = {
  system: '"Segoe UI", system-ui, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  mono: '"Cascadia Mono", Consolas, monospace',
};
const fontSizeEl = $('f-size');
const fontFamilyEl = $('f-family');
const fontNumEl = $('f-size-num');
const fontNameEl = $('f-family-name');
const PRESET_SCALES = ['0.9', '1', '1.15', '1.3'];
const cleanFontName = (s) => String(s ?? '').replace(/[^\p{L}\p{N} .\-]/gu, '').trim().slice(0, 60);

function applyFont(f) {
  const scale = Math.min(2, Math.max(0.7, Number(f?.scale) || 1));
  const raw = String(f?.family ?? 'system');
  const name = raw.startsWith('custom:') ? cleanFontName(raw.slice(7)) : '';
  const family = FONTS[raw] ? raw : name ? 'custom' : 'system';
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  document.documentElement.style.setProperty('--font-ui', name ? `"${name}", ${FONTS.system}` : FONTS[family] ?? FONTS.system);
  const preset = PRESET_SCALES.includes(String(scale));
  fontSizeEl.value = preset ? String(scale) : 'custom';
  fontNumEl.value = String(Math.round(scale * 100));
  $('f-size-custom').hidden = preset;
  fontFamilyEl.value = family;
  fontNameEl.value = name;
  $('f-family-custom').hidden = family !== 'custom';
}
function saveFont() {
  const scale = fontSizeEl.value === 'custom' ? Math.min(200, Math.max(70, Number(fontNumEl.value) || 100)) / 100 : Number(fontSizeEl.value);
  let family = fontFamilyEl.value;
  if (family === 'custom') {
    const name = cleanFontName(fontNameEl.value);
    family = name ? `custom:${name}` : 'system';
  }
  applyFont({ scale, family });
  window.evl.setFont(scale, family);
}
fontSizeEl.addEventListener('change', () => {
  if (fontSizeEl.value === 'custom') {
    $('f-size-custom').hidden = false;
    fontNumEl.focus();
  } else saveFont();
});
fontNumEl.addEventListener('change', saveFont);
fontFamilyEl.addEventListener('change', () => {
  if (fontFamilyEl.value === 'custom') {
    $('f-family-custom').hidden = false;
    fontNameEl.focus();
  } else saveFont();
});
fontNameEl.addEventListener('change', saveFont);

// ---------- aparência: abas (posição, altura e largura) ----------

const tabModeEl = $('t-mode');
const tabHEl = $('t-h');
const tabWEl = $('t-w');
const sideWEl = $('t-side-w');

function applyTabLayout(l) {
  const mode = l?.mode === 'side' ? 'side' : 'top';
  const root = document.documentElement.style;
  root.setProperty('--tab-h', `${l?.tabH ?? 32}px`);
  root.setProperty('--tab-w', `${l?.tabW ?? 200}px`);
  root.setProperty('--side-w', `${l?.sideW ?? 220}px`);
  document.body.classList.toggle('side-tabs', mode === 'side');
  tabModeEl.value = mode;
  tabHEl.value = String(l?.tabH ?? 32);
  tabWEl.value = String(l?.tabW ?? 200);
  sideWEl.value = String(l?.sideW ?? 220);
  $('t-w-label').hidden = mode === 'side';
  $('t-side-label').hidden = mode !== 'side';
}
function saveTabLayout() {
  window.evl.setTabLayout({ mode: tabModeEl.value, tabH: Number(tabHEl.value), tabW: Number(tabWEl.value), sideW: Number(sideWEl.value) });
}
[tabModeEl, tabHEl, tabWEl, sideWEl].forEach((el) => el.addEventListener('change', saveTabLayout));

// ---------- aparência: cor principal ----------
// Troca só as variáveis --accent e --glow da interface (as páginas dos sites não mudam).

const accentEl = $('accent');
let accent = null; // #rrggbb escolhido, ou null = padrão do tema

function applyAccent(color) {
  accent = color;
  const root = document.documentElement.style;
  if (color) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    root.setProperty('--accent', color);
    root.setProperty('--glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--glow');
  }
  // o quadrado mostra a cor em uso (a do tema, quando não há escolha)
  const shown = color ?? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(shown)) accentEl.value = shown.toLowerCase();
}

accentEl.addEventListener('input', () => applyAccent(accentEl.value)); // ao vivo
accentEl.addEventListener('change', () => window.evl.setAccent(accentEl.value)); // salva ao confirmar
// botão direito no bloco de cor volta ao padrão do tema
accentEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  applyAccent(null);
  window.evl.setAccent(null);
});

// ---------- sugestões do histórico na barra de endereço ----------
// Só pergunta ao main.js enquanto você digita; a busca roda na lista do histórico (no máximo
// 500 sites, já em memória). Completa também o nome do site dentro da barra (parte selecionada).

let sugs = [];
let sel = -1; // linha escolhida com as setas (-1 = nenhuma)

function closeSuggest() {
  if (suggestEl.hidden && sugs.length === 0) return;
  sugs = [];
  sel = -1;
  suggestEl.hidden = true;
  window.evl.setSuggest(false);
}

function renderSuggest() {
  if (sugs.length === 0) return closeSuggest();
  const box = addressEl.getBoundingClientRect();
  suggestEl.style.left = `${box.left}px`;
  suggestEl.style.top = `${box.bottom + 4}px`;
  suggestEl.style.width = `${box.width}px`;
  suggestEl.replaceChildren(
    ...sugs.map((s, i) => {
      const row = document.createElement('div');
      row.className = 'sg-item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === sel));
      const host = document.createElement('span');
      host.className = 'sg-host';
      host.textContent = s.host;
      if (s.star) row.classList.add('star');
      const title = document.createElement('span');
      title.className = 'sg-title hint';
      title.textContent = s.title === s.host ? '' : s.title;
      row.append(host, title);
      row.addEventListener('mousedown', (event) => event.preventDefault()); // não tira o foco da barra
      row.addEventListener('click', () => {
        window.evl.navigate(s.url);
        addressEl.blur();
      });
      return row;
    })
  );
  suggestEl.hidden = false;
  window.evl.setSuggest(true); // o main.js só ajusta a altura se mudou
}

async function updateSuggest(event) {
  const typed = addressEl.value;
  const list = typed.trim() ? await window.evl.suggest(typed) : [];
  if (addressEl.value !== typed) return; // você digitou mais enquanto esperávamos
  sugs = list;
  sel = -1;
  renderSuggest();

  const first = sugs[0];
  const deleting = /^delete/.test(event?.inputType ?? '');
  if (!deleting && first && first.host.startsWith(typed.toLowerCase()) && addressEl.selectionStart === typed.length) {
    addressEl.value = typed + first.host.slice(typed.length);
    addressEl.setSelectionRange(typed.length, addressEl.value.length);
  }
}

addressEl.addEventListener('input', updateSuggest);
addressEl.addEventListener('blur', closeSuggest);

// ---------- ações ----------

newTabBtn.addEventListener('click', () => window.evl.newTab());
backBtn.addEventListener('click', () => window.evl.back());
forwardBtn.addEventListener('click', () => window.evl.forward());
reloadBtn.addEventListener('click', () => window.evl.reload());
starBtn.addEventListener('click', () => window.evl.toggleBookmark());
memEl.addEventListener('click', () => window.evl.setMenu(!current?.menuOpen));
zoomOutBtn.addEventListener('click', () => window.evl.zoom('out'));
zoomInBtn.addEventListener('click', () => window.evl.zoom('in'));
zoomValBtn.addEventListener('click', () => window.evl.zoom('reset'));
menuSettingsBtn.addEventListener('click', () => window.evl.openSettings()); // abrir fecha o menu
menuHistoryBtn.addEventListener('click', () => window.evl.openSettings('history'));

// Clicar fora do menu (inclusive na área transparente sobre a página) ou Esc fecha.
document.addEventListener('mousedown', (event) => {
  if (current?.menuOpen && !menuEl.contains(event.target) && !memEl.contains(event.target)) {
    window.evl.setMenu(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && current?.menuOpen) window.evl.setMenu(false);
});

addressEl.addEventListener('focus', () => addressEl.select());
addressEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    window.evl.navigate(sel >= 0 ? sugs[sel].url : addressEl.value);
    addressEl.blur();
  } else if (event.key === 'Escape') {
    addressEl.blur();
    showAddress();
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && sugs.length > 0) {
    event.preventDefault();
    sel = event.key === 'ArrowDown' ? Math.min(sel + 1, sugs.length - 1) : Math.max(sel - 1, -1);
    renderSuggest();
  }
});
