// Política de memória + medidor de RAM.
//
// Regras (os números estão em config.js):
//  1. Aba de fundo parada há DISCARD_AFTER_MS -> página destruída.
//  2. Se o app passar de MEMORY_BUDGET_MB, a aba de fundo mais antiga
//     (parada há pelo menos PRESSURE_DISCARD_AFTER_MS) é descartada.
//  Abas tocando áudio e a aba ativa nunca são descartadas.

const { app } = require('electron');
const cfg = require('./config');

// Soma da memória de todos os processos do app (interface + abas + GPU...), em MB.
// É uma estimativa: no Windows usa a memória privada de cada processo.
function totalMemoryMB() {
  const kb = app
    .getAppMetrics()
    .reduce((sum, p) => sum + (p.memory.privateBytes ?? p.memory.workingSetSize ?? 0), 0);
  return Math.round(kb / 1024);
}

// Liga os dois relógios. Devolve uma função para desligar.
function startMemoryPolicy(tabs, onMemory) {
  const meter = setInterval(() => onMemory(totalMemoryMB()), cfg.METRICS_EVERY_MS);

  const policy = setInterval(() => {
    for (const tab of tabs.idleBackgroundTabs(cfg.DISCARD_AFTER_MS)) {
      tabs.discard(tab.id);
    }
    if (totalMemoryMB() > cfg.MEMORY_BUDGET_MB) {
      const [oldest] = tabs.idleBackgroundTabs(cfg.PRESSURE_DISCARD_AFTER_MS);
      if (oldest) tabs.discard(oldest.id);
    }
  }, cfg.CHECK_EVERY_MS);

  return () => {
    clearInterval(meter);
    clearInterval(policy);
  };
}

module.exports = { startMemoryPolicy, totalMemoryMB };
