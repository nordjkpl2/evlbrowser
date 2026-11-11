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
  lowMemory: false, // modo de baixa memória do Chromium (caches menores)
  diskCacheMB: 0, // tamanho máximo do cache em disco (0 = automático do Chromium)
};
const RESTART = ['blockAutoplay', 'hardwareAccel', 'lowMemory', 'diskCacheMB'];
const RANGES = { discardMinutes: [1, 60], memoryBudgetMB: [300, 8000], diskCacheMB: [0, 8000] };

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

module.exports = { SPEED_DEFAULTS, RESTART, speedOptions, checkSpeedValue, readStartupSpeed, needsRestart };
