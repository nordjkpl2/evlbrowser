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

  // De quanto em quanto tempo a política de memória roda / o medidor atualiza.
  CHECK_EVERY_MS: 10 * 1000,
  METRICS_EVERY_MS: 5 * 1000,

  // Buscador usado quando o texto digitado não parece um endereço.
  SEARCH_URL: 'https://duckduckgo.com/?q=',
};
