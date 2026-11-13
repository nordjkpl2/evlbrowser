// Diário das extensões: erros e mensagens do console das páginas de extensão (inclusive o fundo, que não tem aba).
// Sai no terminal (npm start) e num arquivo ao lado de extensions.json, para ver o que travou sem abrir o DevTools.

const fs = require('fs');

const LEVELS = ['verbose', 'info', 'warning', 'error'];

function attachExtensionLog(app, logFile) {
  const write = (line) => {
    const text = `[${new Date().toISOString()}] ${line}`;
    console.log(`[extensões] ${line}`);
    try {
      fs.appendFileSync(logFile, text + '\n');
    } catch {}
  };
  const isExt = (wc) => {
    const url = wc.getURL?.() ?? '';
    return url.startsWith('chrome-extension://') || wc.getType?.() === 'backgroundPage';
  };

  app.on('web-contents-created', (_event, wc) => {
    const tag = () => `${wc.getType?.() ?? '?'} ${wc.getURL?.() || '(sem url)'}`;
    const check = () => isExt(wc);
    wc.on('did-start-navigation', () => check() && write(`navegando: ${tag()}`));
    wc.on('did-finish-load', () => check() && write(`carregou: ${tag()}`));
    wc.on('did-fail-load', (_e, code, desc, url) => check() && write(`FALHA ao carregar ${url} (${code} ${desc})`));
    wc.on('render-process-gone', (_e, details) => check() && write(`processo da página caiu: ${tag()} (${details.reason})`));
    wc.on('console-message', (...args) => {
      if (!check()) return;
      // Electron novo passa um objeto; o antigo passa (event, level, message, line, sourceId)
      const e = args[0];
      const obj = e && typeof e === 'object' && 'message' in e;
      const level = obj ? e.level : args[1];
      const message = obj ? e.message : args[2];
      const line = obj ? e.lineNumber : args[3];
      const source = obj ? e.sourceId : args[4];
      const lvl = LEVELS[Number(level)] ?? String(level);
      if (lvl === 'error' || lvl === 'warning' || /erro|error/i.test(String(message))) {
        write(`console ${lvl}: ${message} (${source}:${line}) [${tag()}]`);
      }
    });
  });
  return { write };
}

module.exports = { attachExtensionLog };
