'use strict';
// ---------- painel de downloads (botão ↓ da barra) ----------
// Abre por baixo da barra, como o do Firefox: mostra os que estão baixando agora e os últimos.
// A lista completa continua em Configurações > Downloads (Ctrl+J).

const dlBtn = $('dl-btn');
const dlPop = $('dl-pop');
const dlListEl = $('dl-list');
let dlOpen = false;
let dlTimer = null;
let dlKey = '';

function dlSize(bytes) {
  if (!(bytes > 0)) return '';
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dlButtonEl(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function dlRow(d) {
  const li = document.createElement('li');
  li.className = `dl-item dl-${d.state}`;
  const name = document.createElement('span');
  name.className = 'dl-name';
  name.textContent = d.name;
  name.title = d.path || d.name;
  const info = document.createElement('span');
  info.className = 'dl-info';
  const refresh = (p) => p.then(() => loadDlList());
  li.append(name);

  if (d.state === 'progress') {
    const bar = document.createElement('progress');
    if (d.total > 0) {
      bar.max = d.total;
      bar.value = d.received;
    }
    const rate = !d.paused && d.speed > 0 ? `${dlSize(d.speed)}/s` : '';
    info.textContent = [`${dlSize(d.received)}${d.total > 0 ? ` / ${dlSize(d.total)}` : ''}`, d.paused ? t('Pausado') : rate].filter(Boolean).join(' · ');
    li.append(bar, info);
    li.append(
      dlButtonEl(d.paused ? t('Continuar') : t('Pausar'), () => refresh(window.evl.downloadsPause(d.id))),
      dlButtonEl(t('Cancelar'), () => refresh(window.evl.downloadsCancel(d.id))),
    );
    return li;
  }

  info.textContent = [d.host, d.state === 'done' ? dlSize(d.received) : d.state === 'cancelled' ? t('cancelado') : t('falhou')].filter(Boolean).join(' · ');
  li.append(info);
  if (d.state === 'done') {
    li.append(dlButtonEl(t('Abrir'), () => window.evl.downloadsOpen(d.id)), dlButtonEl(t('Mostrar na pasta'), () => window.evl.downloadsShow(d.id)));
  }
  li.append(dlButtonEl(t('Tirar da lista'), () => refresh(window.evl.downloadsRemove(d.id))));
  return li;
}

function drawDownloads(s) {
  if (!s) return;
  const items = s.items.slice(0, 8); // o painel é pequeno; o resto fica na página de Downloads
  const key = JSON.stringify(items) + lang;
  if (key === dlKey) return; // atualiza a cada 700 ms: só redesenha se mudou
  dlKey = key;
  $('dl-title').textContent = t('Downloads');
  $('dl-all').textContent = t('Mostrar todos os downloads');
  $('dl-empty').textContent = t('Nenhum download ainda.');
  $('dl-empty').hidden = items.length > 0;
  dlListEl.replaceChildren(...items.map(dlRow));
}

async function loadDlList() {
  drawDownloads(await window.evl.downloadsList());
}

// Chamado pelo ui_main.js a cada estado: o main é quem decide se o painel está aberto (e a altura da interface).
function syncDownloadsPanel(open) {
  if (open === dlOpen) return;
  dlOpen = open;
  dlPop.hidden = !open;
  dlBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    dlKey = '';
    loadDlList();
    dlTimer = setInterval(() => { if (!document.hidden) loadDlList(); }, 700);
  } else {
    clearInterval(dlTimer);
    dlTimer = null;
  }
}

function setDlOpen(open) {
  window.evl.downloadsPanel(open); // a interface cresce por cima da página para o painel caber
  syncDownloadsPanel(open);
}

dlBtn.addEventListener('click', () => setDlOpen(!dlOpen));
$('dl-all').addEventListener('click', () => {
  setDlOpen(false);
  window.evl.openSettings('downloads');
});

// Clicar fora (inclusive na área sobre a página) ou Esc fecha.
document.addEventListener('mousedown', (event) => {
  if (dlOpen && !dlPop.contains(event.target) && !dlBtn.contains(event.target)) setDlOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dlOpen) setDlOpen(false);
});

// Download novo: se o painel estiver aberto, a lista já se atualiza sozinha pelo intervalo.
window.evl.onDownload(() => {
  if (dlOpen) loadDlList();
});
