'use strict';
// Liga os eventos do main.js. Carrega por último: todos os outros arquivos já existem.

// ---------- eventos do main.js ----------

window.evl.onState(render);
let lastMb = '-- MB';
window.evl.onMemory((mb) => {
  lastMb = `${mb} MB`;
  memEl.textContent = lastMb;
});
// Download começou: o nome aparece por 3 s no lugar do contador (a lista fica em Configurações > Downloads, Ctrl+J).
window.evl.onDownload((name) => {
  memEl.textContent = `↓ ${String(name).slice(0, 16)}`;
  setTimeout(() => (memEl.textContent = lastMb), 3000);
});
window.evl.onFocusAddress(() => addressEl.focus());
// Ctrl+I / Ctrl+Shift+Y: os mesmos painéis dos botões do grupo "Página" (desligados se a página não tem o que mostrar).
window.evl.onPermToggle(() => !permBtn.disabled && setPermOpen(!permOpen));
window.evl.onTranslateToggle(() => !trBtn.disabled && setTrOpen(!trOpen));
window.evl.onAccent(applyAccent);
window.evl.onLang(setLang);
window.evl.onFont(applyFont);
window.evl.onTabLayout(applyTabLayout);
window.evl.onPanel((name) => ensureSettingsScripts().then(() => showPanel(name))); // Ctrl+H / menu: abre direto no Histórico

window.evl.ready(); // pede o primeiro estado
