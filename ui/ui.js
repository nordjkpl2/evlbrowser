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

function makeTab(t) {
  const el = document.createElement('div');
  el.className = `tab ${t.state}${t.loading ? ' loading' : ''}`;
  el.setAttribute('role', 'tab');
  el.setAttribute('aria-selected', String(t.state === 'active'));
  el.tabIndex = 0;
  el.title = t.title; // textContent/title: nunca innerHTML com texto de site

  if (t.favicon) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.referrerPolicy = 'no-referrer'; // não conta ao site de onde o ícone foi pedido
    img.decoding = 'async';
    img.src = t.favicon;
    img.alt = '';
    el.append(img);
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    el.append(dot);
  }

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = t.title;
  el.append(title);

  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Fechar aba (Ctrl+W)';
  close.setAttribute('aria-label', 'Fechar aba');
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    window.evl.closeTab(t.id);
  });
  el.append(close);

  el.addEventListener('click', () => window.evl.activateTab(t.id));
  el.addEventListener('keydown', (event) => {
    if (event.target === el && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      window.evl.activateTab(t.id);
    }
  });
  // clique com o botão do meio fecha a aba
  el.addEventListener('auxclick', (event) => {
    if (event.button === 1) window.evl.closeTab(t.id);
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
    backBtn.disabled = !web || !state.canGoBack;
    forwardBtn.disabled = !web || !state.canGoForward;

    pageBlank.hidden = state.activeKind !== 'blank';
    pageSettings.hidden = state.activeKind !== 'settings';
    if (state.activeKind === 'settings') startPolling();
    else stopPolling();
  }

  // Não sobrescreve o que a pessoa está digitando.
  if (document.activeElement !== addressEl) showAddress();
}

// ---------- tela de Configurações ----------
// Só consulta o main.js enquanto a tela está visível (a cada 2 s).

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  if (panel === 'history') loadHistory(); // pode ter novas visitas desde a última vez
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

  $('s-engine').textContent = report.search.name;
  $('s-engine-url').textContent = report.search.url;
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

  showTheme(report.theme);
  if (!accent) applyAccent(null); // sem escolha: o quadrado acompanha o tema claro/escuro
}

// ---------- menu lateral e busca das Configurações ----------

const navItems = [...document.querySelectorAll('.nav-item')];
const cards = [...document.querySelectorAll('.card')];
const searchEl = $('s-search');
const panelTitle = $('panel-title');
const noResults = $('no-results');
let panel = 'search'; // categoria aberta

function showPanel(name) {
  panel = name;
  searchEl.value = '';
  noResults.hidden = true;
  for (const item of navItems) {
    const on = item.dataset.panel === name;
    if (on) {
      item.setAttribute('aria-current', 'true');
      panelTitle.textContent = item.querySelector('span').textContent;
    } else {
      item.removeAttribute('aria-current');
    }
  }
  for (const card of cards) card.hidden = card.dataset.panel !== name;
  if (name === 'history') loadHistory();
  if (name === 'cookies') loadCookies();
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
  navItems.forEach((item) => item.removeAttribute('aria-current'));
  panelTitle.textContent = 'Resultados da busca';
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

navItems.forEach((item) => item.addEventListener('click', () => showPanel(item.dataset.panel)));
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
    time.textContent = new Date(item.time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    btn.append(title, url, time);
    btn.addEventListener('click', () => window.evl.historyOpen(item.url));
    li.append(btn);
    return li;
  });
}

$('h-clear').addEventListener('click', async () => {
  window.evl.historyClear();
  await loadHistory();
});

// ---------- cookies ----------
// A lista mostra só o site e os nomes (nunca os valores). Só consulta com a categoria aberta.

const cList = $('c-list');
const cEmpty = $('c-empty');
const cTotal = $('c-total');
const cStatus = $('c-status');
const cImport = $('c-import');
const cMenu = $('c-menu');

async function loadCookies() {
  const data = await window.evl.cookiesList();
  if (!data) return;
  cTotal.textContent = data.total ? `· ${data.total}` : '';
  cEmpty.hidden = data.total > 0;
  lazyList(cList, data.domains, (d) => {
    const li = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const domain = document.createElement('span');
    domain.textContent = d.domain;
    const count = document.createElement('span');
    count.className = 'hint';
    count.textContent = String(d.count);
    summary.append(domain, count);
    const names = document.createElement('div');
    names.className = 'c-names mono hint';
    // os nomes só são escritos quando você abre o site
    details.addEventListener('toggle', () => {
      if (details.open && !names.textContent) {
        names.textContent = d.names.join('  ·  ') + (d.count > d.names.length ? '  ·  …' : '');
      }
    });
    details.append(summary, names);
    li.append(details);
    return li;
  });
}

function setImportMenu(open) {
  cMenu.hidden = !open;
  cImport.setAttribute('aria-expanded', String(open));
}

cImport.addEventListener('click', () => setImportMenu(cMenu.hidden));
document.addEventListener('mousedown', (event) => {
  if (!cMenu.hidden && !cMenu.contains(event.target) && event.target !== cImport) setImportMenu(false);
});
cMenu.querySelectorAll('button').forEach((btn) =>
  btn.addEventListener('click', async () => {
    setImportMenu(false);
    const label = btn.dataset.from === 'firefox' ? 'Firefox' : 'Chromium';
    cStatus.hidden = false;
    cStatus.textContent = `Importando do ${label}…`;
    cImport.disabled = true;
    const r = await window.evl.cookiesImport(btn.dataset.from);
    cImport.disabled = false;
    if (!r) cStatus.textContent = 'Não foi possível importar agora.';
    else if (!r.ok) cStatus.textContent = r.message;
    else {
      const parts = [`${r.imported} importados`];
      if (r.skipped) parts.push(`${r.skipped} ignorados (vencidos ou recusados)`);
      if (r.encrypted) parts.push(`${r.encrypted} protegidos pelo navegador de origem (não dá para ler)`);
      cStatus.textContent = `${label}: ${parts.join(', ')}.`;
    }
    loadCookies();
  })
);

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

// ---------- eventos do main.js ----------

window.evl.onState(render);
window.evl.onMemory((mb) => {
  memEl.textContent = `${mb} MB`;
});
window.evl.onFocusAddress(() => addressEl.focus());
window.evl.onAccent(applyAccent);
window.evl.onPanel(showPanel); // Ctrl+H / menu: abre direto no Histórico

window.evl.ready(); // pede o primeiro estado
