'use strict';
// Liga os eventos do main.js. Carrega por último: todos os outros arquivos já existem.

// ---------- eventos do main.js ----------

window.evl.onState(render);
window.evl.onMemory((mb) => {
  memEl.textContent = `${mb} MB`;
});
window.evl.onFocusAddress(() => addressEl.focus());
window.evl.onAccent(applyAccent);
window.evl.onLang(setLang);
window.evl.onFont(applyFont);
window.evl.onPanel((name) => ensureSettingsScripts().then(() => showPanel(name))); // Ctrl+H / menu: abre direto no Histórico

window.evl.ready(); // pede o primeiro estado
