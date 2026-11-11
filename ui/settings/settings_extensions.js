'use strict';
// ---------- extensões ----------
// Lista, instala (pasta, .zip/.crx/.xpi, Chrome Web Store ou addons.mozilla.org), abre popup/opções numa aba, liga/desliga e remove.

const xList = $('x-list');
const xEmpty = $('x-empty');
const xTotal = $('x-total');
const xStatus = $('x-status');
const xAdd = $('x-add');
const xMenu = $('x-menu');

function xSay(text, bad) {
  xStatus.hidden = !text;
  xStatus.textContent = text;
  xStatus.classList.toggle('bad', bad === true);
}

function xRow(x) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'x-name';
  name.textContent = x.version ? `${x.name} ${x.version}` : x.name;
  const state = document.createElement('span');
  state.className = 'hint';
  state.textContent = x.error ? tm(x.error) : x.enabled ? t('ligado') : t('desligado');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'text-btn';
  toggle.textContent = x.enabled ? t('Desligar') : t('Ligar');
  toggle.addEventListener('click', async () => {
    await window.evl.extensionsEnable(x.id, !x.enabled);
    loadExtensions();
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'text-btn';
  del.textContent = t('Remover');
  del.setAttribute('aria-label', t('Remover {n}', { n: x.name }));
  del.addEventListener('click', async () => {
    await window.evl.extensionsRemove(x.id);
    loadExtensions();
  });
  li.append(name, state);
  // o Electron não tem o botão da extensão na barra: popup e opções abrem numa aba
  for (const [kind, label] of [['popup', t('Abrir')], ['options', t('Opções')]]) {
    if (!x[kind]) continue;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'text-btn';
    open.textContent = label;
    open.addEventListener('click', () => window.evl.extensionsOpen(x.id, kind));
    li.append(open);
  }
  if (x.cross || x.full) {
    // extensões que não funcionam isoladas: você devolve as permissões entre sites e a internet só para esta
    const full = textButton(x.full ? t('Voltar a isolar') : t('Acesso completo'), async () => {
      await window.evl.extensionsFull(x.id, !x.full);
      loadExtensions();
    });
    li.append(full);
  }
  li.append(toggle, del);
  if (x.full) {
    const open = document.createElement('span');
    open.className = 'x-warn hint';
    open.textContent = t('Acesso completo: esta extensão vê abas, histórico, cookies e usa a internet.');
    li.append(open);
  }
  if (x.removed?.length) {
    const cut = document.createElement('span');
    cut.className = 'x-warn hint';
    cut.textContent = t('Bloqueado pelo Evl (acesso entre sites): {lista}.', { lista: x.removed.join(', ') });
    li.append(cut);
  }
  // aviso do que a extensão consegue ver
  const a = x.access;
  if (a && (a.allSites || a.perms.length)) {
    const warn = document.createElement('span');
    warn.className = 'x-warn hint';
    const parts = [];
    if (a.allSites) parts.push(t('Lê e altera todos os sites que você abre.'));
    if (a.perms.length) parts.push(t('Permissões sensíveis: {lista}.', { lista: a.perms.join(', ') }));
    warn.textContent = parts.join(' ');
    li.append(warn);
  }
  return li;
}

async function loadExtensions() {
  const list = await window.evl.extensionsList();
  xTotal.textContent = list.length ? `· ${list.length}` : '';
  xEmpty.hidden = list.length > 0;
  xList.replaceChildren(...list.map(xRow));
}

function xDone(r, okText) {
  if (!r) return;
  if (r.canceled) return xSay('');
  xSay(r.ok ? `${okText}: ${r.item.name}${r.item.error ? ` (${tm(r.item.error)})` : ''}` : tm(r.error), !r.ok);
  loadExtensions();
}

function xMenuOpen(open) {
  xMenu.hidden = !open;
  xAdd.setAttribute('aria-expanded', String(open));
}
xAdd.addEventListener('click', () => xMenuOpen(xMenu.hidden));
xMenu.addEventListener('click', async (event) => {
  const kind = event.target.dataset?.kind;
  if (!kind) return;
  xMenuOpen(false);
  xSay(t('Instalando…'));
  xDone(await window.evl.extensionsPick(kind), t('Instalada'));
});
document.addEventListener('mousedown', (event) => {
  if (!xMenu.hidden && !xMenu.contains(event.target) && event.target !== xAdd) xMenuOpen(false);
});
$('x-store').addEventListener('submit', async (event) => {
  event.preventDefault();
  xSay(t('Baixando…'));
  const r = await window.evl.extensionsStore($('x-id').value);
  xDone(r, t('Instalada'));
  if (r?.ok) $('x-id').value = '';
});
