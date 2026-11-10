'use strict';
// Lógica da interface. Roda como uma página web comum; tudo que precisa do
// "mundo de fora" passa por window.evl (definido em preload.js).

const tabsEl = document.getElementById('tabs');
const newTabBtn = document.getElementById('new-tab');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const reloadBtn = document.getElementById('reload');
const addressEl = document.getElementById('address');
const memEl = document.getElementById('mem');

// ---------- desenhar o estado recebido do main.js ----------

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

function render(state) {
  tabsEl.querySelectorAll('.tab').forEach((n) => n.remove());
  for (const t of state.tabs) tabsEl.insertBefore(makeTab(t), newTabBtn);

  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;

  // Não sobrescreve o que a pessoa está digitando.
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (document.activeElement !== addressEl) addressEl.value = active ? active.url : '';
}

// ---------- ações ----------

newTabBtn.addEventListener('click', () => window.evl.newTab());
backBtn.addEventListener('click', () => window.evl.back());
forwardBtn.addEventListener('click', () => window.evl.forward());
reloadBtn.addEventListener('click', () => window.evl.reload());

addressEl.addEventListener('focus', () => addressEl.select());
addressEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    window.evl.navigate(addressEl.value);
    addressEl.blur();
  } else if (event.key === 'Escape') {
    addressEl.blur();
  }
});

// ---------- eventos do main.js ----------

window.evl.onState(render);
window.evl.onMemory((mb) => {
  memEl.textContent = `${mb} MB`;
});
window.evl.onFocusAddress(() => addressEl.focus());

window.evl.ready(); // pede o primeiro estado
