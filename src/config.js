// Todas as "constantes mágicas" do navegador ficam aqui.
// Em C seria um config.h cheio de #define.

// Se você definir EVL_DISCARD_SECONDS, ele troca o tempo padrão de descarte
// (bom para testar sem esperar 10 minutos).
const discardSeconds = Number(process.env.EVL_DISCARD_SECONDS);

module.exports = {
  // Altura (em pixels) da interface fixa no topo: abas (38) + barra de endereço (42).
  UI_HEIGHT: 80,

  // Aba de fundo parada por este tempo tem a página destruída (libera a RAM).
  DISCARD_AFTER_MS: discardSeconds > 0 ? discardSeconds * 1000 : 10 * 60 * 1000,

  // Se o app passar deste orçamento de memória, descartamos abas de fundo
  // mais cedo (a mais antiga primeiro).
  MEMORY_BUDGET_MB: 1500,
  PRESSURE_DISCARD_AFTER_MS: 60 * 1000,

  // A política de memória só tem timer enquanto existe aba de fundo viva.
  // Ela acorda no máximo a cada BUDGET_CHECK_MS e nunca em menos de MIN_WAIT_MS.
  BUDGET_CHECK_MS: 30 * 1000,
  MIN_WAIT_MS: 5 * 1000,

  // Buscador usado quando o texto digitado não parece um endereço.
  // (Aparece em Configurações; para trocar, edite os dois campos.)
  SEARCH_NAME: 'DuckDuckGo',
  SEARCH_URL: 'https://duckduckgo.com/?q=',

  // Coisas do Chromium que um navegador leve não precisa. Aplicadas em main.js
  // antes do app abrir. Para voltar ao padrão, esvazie as listas.
  CHROMIUM_OFF_SWITCHES: [
    'disable-background-networking', // serviços de rede de fundo (atualizações, telemetria...)
    'disable-component-update', // atualização de componentes do Chromium em segundo plano
    'disable-breakpad', // coleta de relatórios de falha
    'no-pings', // pings de auditoria de links (<a ping>)
  ],
  CHROMIUM_OFF_FEATURES: [
    'MediaRouter', // descoberta de Chromecast na rede
    'OptimizationHints', // serviço de dicas de otimização
  ],
};
