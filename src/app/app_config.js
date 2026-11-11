// Todas as "constantes mágicas" do navegador ficam aqui.
// Em C seria um config.h cheio de #define.

// Se você definir EVL_DISCARD_SECONDS, ele troca o tempo padrão de descarte
// (bom para testar sem esperar 3 minutos).
const discardSeconds = Number(process.env.EVL_DISCARD_SECONDS);

module.exports = {
  // Altura (em pixels) da interface fixa no topo: abas (38) + barra de endereço (42).
  UI_HEIGHT: 80,

  // Espaço extra (px) que a interface ocupa por cima da página enquanto o
  // submenu do contador de memória está aberto.
  MENU_HEIGHT: 150,

  // Painel de pedido de permissão (microfone, câmera...) abaixo da barra de endereço.
  PROMPT_HEIGHT: 110,

  // Idem para a lista de sugestões do histórico (até 6 linhas) da barra de endereço.
  SUGGEST_HEIGHT: 240,

  // Aba de fundo parada por este tempo tem a página destruída (libera a RAM).
  DISCARD_AFTER_MS: discardSeconds > 0 ? discardSeconds * 1000 : 3 * 60 * 1000,
  // Só existe se EVL_DISCARD_SECONDS foi definido (teste): vence o valor de Configurações > Velocidade.
  DISCARD_AFTER_MS_OVERRIDE: discardSeconds > 0 ? discardSeconds * 1000 : undefined,

  // Se o app passar deste orçamento de memória, descartamos abas de fundo
  // mais cedo (a mais antiga primeiro).
  MEMORY_BUDGET_MB: 800,
  PRESSURE_DISCARD_AFTER_MS: 20 * 1000,

  // A política de memória só tem timer enquanto existe aba de fundo viva.
  // Ela acorda no máximo a cada BUDGET_CHECK_MS e nunca em menos de MIN_WAIT_MS.
  BUDGET_CHECK_MS: 30 * 1000,
  MIN_WAIT_MS: 5 * 1000,

  // Buscador de fábrica (usado até você escolher outro). Daí em diante o motor é
  // escolhido, adicionado e editado em Configurações > Pesquisa.
  SEARCH_NAME: 'DuckDuckGo',
  SEARCH_URL: 'https://duckduckgo.com/?q=',

  // Coisas do Chromium que um navegador leve não precisa. Aplicadas em main.js
  // antes do app abrir. Para voltar ao padrão, esvazie as listas.
  CHROMIUM_OFF_SWITCHES: [
    'disable-background-networking', // serviços de rede de fundo (atualizações, telemetria...)
    'disable-component-update', // atualização de componentes do Chromium em segundo plano
    'disable-breakpad', // coleta de relatórios de falha
    'no-pings', // pings de auditoria de links (<a ping>)
    'disable-domain-reliability', // relatórios de falhas de conexão enviados ao Google
    'disable-client-side-phishing-detection', // envio de páginas para análise
    'disable-sync', // sincronização de conta
    'disable-default-apps',
    'no-default-browser-check',
  ],
  // Flags de velocidade/RAM. process-per-site: abas do mesmo site dividem um processo
  // (menos RAM e abre mais rápido). Se algum site ficar instável, apague esta linha.
  CHROMIUM_FAST_SWITCHES: ['process-per-site', 'enable-gpu-rasterization'],
  CHROMIUM_ON_FEATURES: ['HttpsUpgrades', 'BackForwardCache'], // http:// vira https:// quando o site oferece; Voltar/Avançar mostram a página na hora (guardada por pouco tempo na memória)
  CHROMIUM_OFF_FEATURES: [
    'MediaRouter', // descoberta de Chromecast na rede
    'OptimizationHints', // serviço de dicas de otimização
    'Translate', // tradução automática (consulta servidores)
    'AutofillServerCommunication', // preenchimento consultando servidores
    'NetworkTimeServiceQuerying', // consulta de hora na rede
    'PrivacySandboxAdsAPIs', // APIs de anúncios do Chromium (Topics, FLEDGE)
    'InterestFeedContentSuggestions',
    // relatórios enviados a terceiros em segundo plano e APIs de anúncio/rastreio (nomes desconhecidos são ignorados)
    'Reporting', 'NetworkErrorLogging', 'BrowsingTopics', 'InterestGroupStorage', 'Fledge', 'PrivateStateTokens',
    'SharedStorageAPI', 'ConversionMeasurement', 'FencedFrames',
  ],
};
