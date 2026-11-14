// Política de memória + medição de RAM.
//
// Regras (os números estão em app_config.js):
//  1. Aba de fundo parada há DISCARD_AFTER_MS -> página destruída.
//  2. Se o app passar de MEMORY_BUDGET_MB, a aba de fundo mais antiga
//     (parada há pelo menos PRESSURE_DISCARD_AFTER_MS) é descartada antes.
//  Abas tocando áudio e a aba ativa nunca são descartadas.
//
// IDLE NÃO CARREGA NADA: não existe timer fixo. A política só agenda um
// timer enquanto houver aba de fundo viva; sem candidata, nada roda.

const { app } = require('electron');
const cfg = require('../app/app_config');

// Memória de um processo em KB (no Windows, a memória privada dele).
const processKB = (p) => p.memory.privateBytes ?? p.memory.workingSetSize ?? 0;

// Soma dos processos (interface + abas + GPU...), em MB. Estimativa.
const sumMB = (metrics) => Math.round(metrics.reduce((sum, p) => sum + processKB(p), 0) / 1024);

const totalMemoryMB = () => sumMB(app.getAppMetrics());

const TYPE_LABEL = {
  Browser: 'Processo principal',
  Tab: 'Página',
  GPU: 'GPU',
  Utility: 'Serviço (rede, áudio...)',
};

// Memória por processo, com o nome da aba dona quando dá para descobrir.
function processReport(tabs, uiContents) {
  const owners = new Map();
  owners.set(uiContents.getOSProcessId(), 'Interface do Evl');
  for (const tab of tabs.tabs.values()) {
    if (tab.view) owners.set(tab.view.webContents.getOSProcessId(), tab.title || tab.url);
  }

  const metrics = app.getAppMetrics();
  const processes = metrics
    .map((p) => ({
      pid: p.pid,
      type: TYPE_LABEL[p.type] ?? p.type,
      label: owners.get(p.pid) ?? TYPE_LABEL[p.type] ?? p.type,
      mb: Math.round(processKB(p) / 1024),
    }))
    .sort((a, b) => b.mb - a.mb);

  return { totalMB: sumMB(metrics), processes };
}

// Devolve { refresh, stop }. Chame refresh() sempre que o estado das abas mudar.
// getLimits(): { discardMs, budgetMB } — lido a cada vez, então mudar em Configurações vale na hora.
const DEFAULT_LIMITS = () => ({ discardMs: cfg.DISCARD_AFTER_MS, budgetMB: cfg.MEMORY_BUDGET_MB });
function startMemoryPolicy(tabs, onMemory, getLimits = DEFAULT_LIMITS) {
  let timer = null;

  function clear() {
    clearTimeout(timer);
    timer = null;
  }

  // Agenda UM acordar: quando a aba de fundo mais antiga vencer, mas nunca
  // antes de MIN_WAIT_MS nem depois de BUDGET_CHECK_MS. Sem candidata: sem timer.
  // pressure = true: estouro de orçamento ainda não resolvido; confere de novo logo (MIN_WAIT_MS),
  // em vez de esperar BUDGET_CHECK_MS, para a RAM voltar ao limite em passos curtos.
  function schedule(pressure = false) {
    clear();
    const candidates = tabs.backgroundViewTabs();
    if (candidates.length === 0) return;

    if (pressure) {
      timer = setTimeout(run, cfg.MIN_WAIT_MS);
      return;
    }
    const oldest = Math.min(...candidates.map((t) => t.lastActive));
    const due = oldest + getLimits().discardMs - Date.now();
    const wait = Math.min(Math.max(due, cfg.MIN_WAIT_MS), cfg.BUDGET_CHECK_MS);
    timer = setTimeout(run, wait);
  }

  function run() {
    timer = null;
    const { discardMs, budgetMB } = getLimits();
    for (const tab of tabs.idleBackgroundTabs(discardMs)) tabs.discard(tab.id);

    // Sem aba de fundo viva, o orçamento não tem o que descartar: não gasta uma medição de RAM
    // (getAppMetrics percorre todos os processos) à toa.
    if (tabs.backgroundViewTabs().length === 0) {
      schedule(false);
      return;
    }
    const mb = totalMemoryMB();
    onMemory(mb);
    let pressure = false;
    if (mb > budgetMB) {
      const [oldest] = tabs.idleBackgroundTabs(cfg.PRESSURE_DISCARD_AFTER_MS);
      if (oldest) {
        tabs.discard(oldest.id);
        // ainda sobram abas ociosas: a próxima conferência vem logo, para não ficar acima do limite
        pressure = tabs.idleBackgroundTabs(cfg.PRESSURE_DISCARD_AFTER_MS).length > 0;
      }
    }
    schedule(pressure);
  }

  function refresh() {
    if (tabs.backgroundViewTabs().length === 0) clear();
    else if (!timer) schedule();
  }

  return { refresh, stop: clear };
}

module.exports = { startMemoryPolicy, totalMemoryMB, processReport };
