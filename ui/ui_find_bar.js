'use strict';
// ---------- localizar na página (Ctrl+F) ----------
// Barra logo abaixo da barra de ferramentas. O texto vai ao main.js, que procura na página da aba
// ativa e devolve "n de m" pelo estado (state.find). Enter e as setas andam entre as ocorrências.

const findBar = $('find');
const findInput = $('find-input');
const findCount = $('find-count');
const findBtn = $('find-btn');
let findShown = false;

function setFindShown(show) {
  findShown = show;
  findBar.hidden = !show;
  findBtn.setAttribute('aria-pressed', String(show));
}

// Chamado pelo ui_main.js a cada estado. find = null quando a barra está fechada.
function syncFind(find) {
  if (!find) {
    if (findShown) setFindShown(false);
    findCount.textContent = '';
    return;
  }
  if (!findShown) {
    setFindShown(true);
    findInput.value = find.text ?? ''; // reabrir mostra o último texto procurado
    findInput.focus();
    findInput.select();
  }
  findCount.textContent = find.total ? `${find.active}/${find.total}` : find.text ? '0/0' : '';
}

// Ctrl+F com a barra já aberta: só leva o foco para o campo.
window.evl.onFindFocus(() => {
  if (!findShown) setFindShown(true);
  findInput.focus();
  findInput.select();
});

findBtn.addEventListener('click', () => (findShown ? closeFind() : window.evl.findOpen()));
function closeFind() {
  setFindShown(false);
  findCount.textContent = '';
  window.evl.findClose(); // devolve o foco para a página
}

// Digitar procura já (a partir do começo); Enter vai para a próxima, Shift+Enter para a anterior.
findInput.addEventListener('input', () => window.evl.findRun(findInput.value, true, false));
findInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  window.evl.findRun(findInput.value, !event.shiftKey, true);
});
$('find-next').addEventListener('click', () => window.evl.findRun(findInput.value, true, true));
$('find-prev').addEventListener('click', () => window.evl.findRun(findInput.value, false, true));
$('find-close').addEventListener('click', closeFind);
