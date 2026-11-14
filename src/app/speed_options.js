// Opções de velocidade e memória editáveis em Configurações > Velocidade.
// Não depende do Electron. As marcadas em RESTART só valem depois de reiniciar o Evl,
// porque são flags do Chromium lidas na abertura.

const fs = require('fs');
const path = require('path');

const SPEED_DEFAULTS = {
  preconnect: true, // abre a conexão com o 1º site sugerido enquanto você digita
  discardMinutes: 3, // aba de fundo parada por este tempo é destruída (libera a RAM)
  memoryBudgetMB: 800, // acima disto, as abas de fundo mais antigas saem antes
  blockAutoplay: true, // vídeos só tocam depois de um clique/toque seu (economiza rede e CPU)
  hardwareAccel: true, // usa a placa de vídeo (desligar economiza RAM de vídeo, mas pode deixar lento)
  lowMemory: true, // modo de baixa memória do Chromium (caches menores)
  diskCacheMB: 0, // tamanho máximo do cache em disco (0 = automático do Chromium)
  imagesOff: false, // modo texto: não baixa imagens (páginas bem mais leves)
  rendererLimit: 0, // máximo de processos de páginas (0 = automático); menos processos = menos RAM
  jsMemoryMB: 0, // teto de memória do JavaScript por página (0 = automático)
  parallelDownloads: true, // downloads grandes em várias conexões (bem mais rápido em servidores que limitam por conexão)
  downloadConnections: 4, // quantas conexões por download quando o paralelo está ligado
  zeroCopy: true, // a placa de vídeo recebe as imagens sem cópia (rolagem mais fluida; pode falhar em drivers antigos)
  noSmoothScroll: true, // rolagem sem animação (resposta imediata, menos CPU)
  rasterThreads: 0, // threads que desenham a página (0 = automático)
  eagerJsCache: true, // guarda o JavaScript já compilado desde a 1ª visita (abas abertas depois)
  lazyImages: true, // imagens fora da tela só baixam quando você rola até elas (páginas abertas depois)
  ignoreGpuBlocklist: true, // usa a placa de vídeo mesmo se o Chromium a considera antiga
  forceSrgb: true, // cores iguais em qualquer monitor (perfil sRGB)
  skiaGraphite: true, // novo motor de desenho do Chromium (experimental)
  gpuRaster: true, // desenha os blocos da página na placa de vídeo (desligar tira memória de vídeo, mas usa mais CPU)
  canvasOnCpu: true, // canvas 2D (mapas, gráficos, jogos simples) desenhado na CPU: menos memória de vídeo, pouca perda na maioria dos sites
  videoDecodeCpu: false, // decodifica vídeo na CPU em vez da placa: economiza memória de vídeo, mas gasta bem mais CPU em vídeo HD
  gpuMemoryMB: 0, // teto da memória de vídeo que o Chromium usa para as páginas (0 = automático); baixo demais deixa a rolagem com falhas
};
const RESTART = ['blockAutoplay', 'hardwareAccel', 'lowMemory', 'diskCacheMB', 'imagesOff', 'rendererLimit', 'jsMemoryMB', 'parallelDownloads', 'downloadConnections', 'zeroCopy', 'noSmoothScroll', 'rasterThreads', 'ignoreGpuBlocklist', 'forceSrgb', 'skiaGraphite', 'gpuRaster', 'canvasOnCpu', 'videoDecodeCpu', 'gpuMemoryMB'];
const RANGES = { discardMinutes: [1, 60], memoryBudgetMB: [300, 8000], diskCacheMB: [0, 8000], rendererLimit: [0, 16], jsMemoryMB: [0, 4096], gpuMemoryMB: [0, 4096], rasterThreads: [0, 4], downloadConnections: [2, 8] };

function speedOptions(raw) {
  const out = { ...SPEED_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k in out) {
    if (typeof out[k] === 'boolean' && typeof raw[k] === 'boolean') out[k] = raw[k];
    else if (RANGES[k] && Number.isFinite(raw[k])) out[k] = Math.min(RANGES[k][1], Math.max(RANGES[k][0], Math.round(raw[k])));
  }
  return out;
}

// Valida uma mudança vinda da interface; devolve o valor aceito ou undefined.
function checkSpeedValue(key, value) {
  if (!(key in SPEED_DEFAULTS)) return undefined;
  if (typeof SPEED_DEFAULTS[key] === 'boolean') return typeof value === 'boolean' ? value : undefined;
  return Number.isFinite(value) ? speedOptions({ [key]: value })[key] : undefined;
}

// Lê settings.json (síncrono, uma vez) ANTES do app ficar pronto, para aplicar as flags do Chromium.
function readStartupSpeed(userDataDir) {
  try {
    return speedOptions(JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')).speed);
  } catch {
    return speedOptions(null);
  }
}

// Alguma opção que pede reinício está diferente do que o Chromium está usando agora?
const needsRestart = (current, startup) => RESTART.some((k) => current[k] !== startup[k]);

// Flags do Chromium para as opções acima (main.js só repassa; aqui dá para testar sem Electron).
function speedSwitches(o) {
  const out = [];
  if (o.imagesOff) out.push(['blink-settings', 'imagesEnabled=false']);
  if (o.rendererLimit > 0) out.push(['renderer-process-limit', String(o.rendererLimit)]);
  if (o.jsMemoryMB > 0) out.push(['js-flags', `--max-old-space-size=${Math.max(64, o.jsMemoryMB)}`]);
  if (o.zeroCopy) out.push(['enable-zero-copy']);
  if (o.noSmoothScroll) out.push(['disable-smooth-scrolling']);
  if (o.rasterThreads > 0) out.push(['num-raster-threads', String(o.rasterThreads)]);
  if (o.ignoreGpuBlocklist) out.push(['ignore-gpu-blocklist']);
  if (o.forceSrgb) out.push(['force-color-profile', 'srgb']);
  if (o.gpuRaster) out.push(['enable-gpu-rasterization']);
  if (o.canvasOnCpu) out.push(['disable-accelerated-2d-canvas']);
  if (o.videoDecodeCpu) out.push(['disable-accelerated-video-decode']);
  if (o.gpuMemoryMB > 0) out.push(['force-gpu-mem-available-mb', String(o.gpuMemoryMB)]);
  return out;
}

// Downloads em paralelo com parâmetros (sintaxe Feature<Estudo.Grupo:chave/valor do Chromium):
// request_count = conexões; min_slice_size = pedaço mínimo (512 KB, o padrão é 1,3 MB);
// remaining_time = 0: divide mesmo quando falta pouco (o padrão só divide se faltarem 2 s ou mais).
const parallelFeature = (n) => `ParallelDownloading<EvlDownloads.On:request_count/${n}/min_slice_size/524288/remaining_time/0`;

// Recursos (enable-features) ligados pelas opções.
const speedFeatures = (o) => [o.parallelDownloads && parallelFeature(o.downloadConnections), o.skiaGraphite && 'SkiaGraphite'].filter(Boolean);

module.exports = { parallelFeature, speedFeatures, speedSwitches, SPEED_DEFAULTS, RESTART, speedOptions, checkSpeedValue, readStartupSpeed, needsRestart };
