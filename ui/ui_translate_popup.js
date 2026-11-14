'use strict';
// ---------- tradução da página (botão de tradução da barra) ----------
// Painel "Traduzir esta página?" como o do Chrome/Firefox: idioma de origem, idioma de destino,
// Traduzir / Mostrar original. O main.js faz o trabalho (src/tabs/page_translate.js).

const TR_LANGS = [
  ['pt', 'Português'],
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['zh-CN', '中文'],
  ['ja', '日本語'],
  ['ru', 'Русский'],
];
const trBtn = $('tr-btn');
const trPop = $('tr-pop');
const trFrom = $('tr-from');
const trTo = $('tr-to');
const trStatus = $('tr-status');
const trRun = $('tr-run');
const trRestore = $('tr-restore');
let trOpen = false;
let trBusy = false;
let trActiveId = null;
let trDoneId = null; // aba cuja página já está traduzida

// Idioma de destino começa no idioma da interface (zh/ja/... têm código próprio).
let trTarget = null;
let trSource = 'auto';

function trFillSelects() {
  const keepFrom = trFrom.value || trSource;
  const keepTo = trTo.value || trTarget || (lang === 'zh' ? 'zh-CN' : lang);
  trFrom.replaceChildren(new Option(t('Detectar idioma'), 'auto'));
  trTo.replaceChildren();
  for (const [code, name] of TR_LANGS) {
    trFrom.append(new Option(name, code));
    trTo.append(new Option(name, code));
  }
  trFrom.value = keepFrom;
  trTo.value = keepTo;
}

function trShowStatus(text) {
  trStatus.textContent = text || '';
  trStatus.hidden = !text;
}

function trMarkDone(done) {
  trDoneId = done ? trActiveId : null;
  trRestore.hidden = !done;
  trBtn.setAttribute('aria-pressed', String(done));
}

// Chamado pelo ui_main.js a cada estado: o main decide se o painel está aberto e a altura da interface.
function syncTranslatePanel(open, activeId, activeKind) {
  trActiveId = activeId;
  trBtn.disabled = activeKind !== 'web';
  if (trDoneId !== null && trDoneId !== activeId) trMarkDone(false); // trocou de aba: a tradução fica nela
  if (open === trOpen) return;
  trOpen = open;
  trPop.hidden = !open;
  trBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    trFillSelects();
    trShowStatus('');
    trRun.focus();
  }
}

function setTrOpen(open) {
  window.evl.translatePanel(open); // a interface cresce por cima da página para o painel caber
  syncTranslatePanel(open, trActiveId, trBtn.disabled ? 'blank' : 'web');
}

const TR_ERRORS = {
  'no-page': 'Esta aba não é uma página web',
  network: 'Não foi possível traduzir. Verifique a conexão.',
  lang: 'Idioma inválido',
};

trBtn.addEventListener('click', () => setTrOpen(!trOpen));
$('tr-cancel').addEventListener('click', () => setTrOpen(false));

trRun.addEventListener('click', async () => {
  if (trBusy) return;
  trBusy = true;
  trRun.disabled = true;
  trShowStatus(t('Traduzindo…'));
  const from = trFrom.value;
  const to = trTo.value;
  trTarget = to;
  trSource = from;
  let r = null;
  try {
    r = await window.evl.translateRun(from, to);
  } catch {
    r = { ok: false, error: 'network' };
  }
  trBusy = false;
  trRun.disabled = false;
  if (!r) return;
  if (!r.ok) {
    trShowStatus(t(TR_ERRORS[r.error] ?? 'Não foi possível traduzir. Verifique a conexão.'));
    return;
  }
  if (r.total === 0 || r.done === 0) {
    trShowStatus(t('Não há texto para traduzir nesta página'));
    return;
  }
  trMarkDone(true);
  setTrOpen(false);
});

trRestore.addEventListener('click', async () => {
  await window.evl.translateRestore();
  trMarkDone(false);
  setTrOpen(false);
});

// Clicar fora (inclusive na área sobre a página) ou Esc fecha.
document.addEventListener('mousedown', (event) => {
  if (trOpen && !trPop.contains(event.target) && !trBtn.contains(event.target)) setTrOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && trOpen) setTrOpen(false);
});
