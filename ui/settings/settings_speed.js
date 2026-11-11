'use strict';
// ---------- renderização: velocidade, memória, otimização de sites + avaliação ----------
// [chave, tipo, título, dica, unidade, precisa reiniciar, lista, pontos]. As linhas são montadas no
// carregamento (a busca das Configurações lê o texto) e de novo ao abrir a categoria (idioma).
// "lista": 's' = Velocidade e memória (#sp-list), 'o' = Otimizar sites e carregamento (#rd-list).
// "pontos": quanto a opção vale na nota (soma 100); ver gain().

const SPEED_ROWS = [
  ['preconnect', 'bool', 'Conectar antes de abrir', 'Enquanto você digita, o Evl já abre a conexão com o primeiro site sugerido. A página aparece mais rápido.', '', false, 's', 10],
  ['discardMinutes', 'num', 'Fechar abas paradas após', 'Abas de fundo sem uso (e sem som ou vídeo tocando) são descarregadas e liberam a memória. Clicar nelas volta a carregar.', 'min', false, 's', 15],
  ['memoryBudgetMB', 'num', 'Limite de memória', 'Acima deste valor o Evl descarrega as abas paradas mais antigas antes do tempo.', 'MB', false, 's', 15],
  ['lowMemory', 'bool', 'Modo de baixa memória', 'Usa menos memória em cada página (caches menores). Pode deixar sites muito pesados um pouco mais lentos.', '', true, 's', 10],
  ['rendererLimit', 'num', 'Limite de processos de páginas', 'Máximo de processos que o Evl abre para as páginas. Menos processos gastam menos memória, mas um site pesado pode atrasar os outros. 0 = automático.', '', true, 's', 10],
  ['jsMemoryMB', 'num', 'Teto de memória do JavaScript', 'Cada página não passa deste tanto de memória para scripts. Protege o PC de sites que vazam memória. 0 = automático.', 'MB', true, 's', 5],
  ['diskCacheMB', 'num', 'Cache em disco', 'Guarda mais arquivos dos sites no disco: páginas já visitadas abrem mais rápido e gastam menos internet. Não usa memória RAM. 0 = tamanho automático.', 'MB', true, 'o', 10],
  ['blockAutoplay', 'bool', 'Não tocar vídeos sozinhos', 'Vídeos só tocam depois de um clique seu: menos rede, menos CPU e menos memória em abas abertas.', '', true, 'o', 10],
  ['hardwareAccel', 'bool', 'Usar a placa de vídeo', 'Deixa rolagem e vídeo mais fluidos. Desligue só se notar travamentos ou quiser poupar a memória de vídeo.', '', true, 'o', 10],
  ['imagesOff', 'bool', 'Não carregar imagens', 'Modo texto: as páginas abrem bem mais rápido e gastam muito menos memória e internet, mas ficam sem fotos.', '', true, 'o', 5],
  // sem pontos na nota: ganho depende do computador (ficam desligadas por padrão)
  ['parallelDownloads', 'bool', 'Downloads em paralelo', 'Arquivos grandes baixam em várias conexões ao mesmo tempo.', '', true, 'o', 0],
  ['downloadConnections', 'num', 'Conexões por download', 'Quantas partes o arquivo baixa ao mesmo tempo quando o download em paralelo está ligado. Mais conexões aceleram servidores lentos; 4 é um bom meio-termo.', '', true, 'o', 0],
  ['zeroCopy', 'bool', 'Imagens direto na placa de vídeo', 'Rolagem e vídeo mais fluidos (zero-copy). Desligue se aparecerem falhas na imagem.', '', true, 'o', 0],
  ['noSmoothScroll', 'bool', 'Rolagem sem animação', 'A página responde na hora à roda do mouse e gasta menos CPU.', '', true, 'o', 0],
  ['rasterThreads', 'num', 'Threads de desenho', 'Quantas threads desenham a página. Mais threads aceleram páginas pesadas em processadores com vários núcleos. 0 = automático.', '', true, 'o', 0],
  ['eagerJsCache', 'bool', 'Guardar o JavaScript já compilado', 'O código dos sites fica pronto no cache desde a primeira visita: a segunda abre mais rápido. Usa um pouco mais de disco. Vale para abas abertas depois.', '', false, 's', 0],
  ['lazyImages', 'bool', 'Imagens só quando aparecem', 'Imagens fora da tela esperam você rolar até perto delas: menos internet e memória em páginas longas. Vale para páginas abertas depois.', '', false, 'o', 0],
  ['ignoreGpuBlocklist', 'bool', 'Forçar a placa de vídeo', 'Usa a aceleração mesmo em placas que o Chromium considera antigas. Desligue se a imagem falhar.', '', true, 'o', 0],
  ['forceSrgb', 'bool', 'Cores padrão (sRGB)', 'As páginas usam sempre o perfil sRGB: cores iguais em qualquer monitor.', '', true, 'o', 0],
  ['skiaGraphite', 'bool', 'Novo motor de desenho (experimental)', 'Liga o Skia Graphite do Chromium, que desenha as páginas com menos trabalho da placa de vídeo. Desligue se algo aparecer errado.', '', true, 'o', 0],
];

// Pontos que a opção rende com o valor atual (0 até o valor total). Números: quanto menor o teto, mais ponto.
function gain(key, v, max) {
  switch (key) {
    case 'discardMinutes': return v <= 3 ? max : v <= 10 ? Math.round(max / 2) : 0;
    case 'memoryBudgetMB': return v <= 800 ? max : v <= 1500 ? Math.round(max / 2) : 0;
    case 'diskCacheMB': return v >= 256 ? max : 0;
    case 'rendererLimit': return v > 0 && v <= 8 ? max : 0;
    case 'jsMemoryMB': return v > 0 ? max : 0;
    default: return v ? max : 0;
  }
}

const spLists = { s: $('sp-list'), o: $('rd-list') };
let spState = null;

function makeRow([key, kind, title, hint, unit, restart], onChange) {
  const li = document.createElement('li');
  li.className = 'v-row';
  const text = document.createElement('span');
  text.className = 'v-text';
  const name = document.createElement('span');
  name.textContent = restart ? `${t(title)} ↻` : t(title);
  const sub = document.createElement('span');
  sub.className = 'v-hint hint';
  sub.textContent = t(hint);
  text.append(name, sub);
  li.append(text);
  const value = spState?.options[key];
  const save = async (v, show) => {
    const next = await window.evl.speedSet(key, v);
    if (!next) return;
    spState = next;
    show(next.options[key]); // mostra o valor aceito (dentro dos limites)
    onChange();
  };
  if (kind === 'bool') {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', t(title));
    sw.setAttribute('aria-checked', String(!!value));
    sw.addEventListener('click', () => save(sw.getAttribute('aria-checked') !== 'true', (v) => sw.setAttribute('aria-checked', String(v))));
    li.append(sw);
  } else {
    const wrap = document.createElement('span');
    wrap.className = 'sp-num';
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.value = String(value ?? '');
    input.setAttribute('aria-label', t(title));
    input.addEventListener('change', () => save(Number(input.value), (v) => (input.value = String(v))));
    const u = document.createElement('span');
    u.className = 'hint';
    u.textContent = unit;
    wrap.append(input, u);
    li.append(wrap);
  }
  return li;
}

// Nota de 0 a 100 + as 3 melhores sugestões para subir.
function renderScore() {
  const o = spState?.options;
  if (!o) return;
  let total = 0;
  const missing = [];
  for (const [key, , title, , , , , max] of SPEED_ROWS) {
    const g = gain(key, o[key], max);
    total += g;
    if (g < max) missing.push([max - g, title]);
  }
  $('rd-num').textContent = String(total);
  $('rd-bar').value = total;
  $('rd-grade').textContent = t(total >= 90 ? 'Máximo' : total >= 70 ? 'Otimizado' : total >= 40 ? 'Equilibrado' : 'Básico');
  missing.sort((a, b) => b[0] - a[0]);
  const tips = missing.slice(0, 3).map(([pts, title]) => {
    const li = document.createElement('li');
    li.textContent = `+${pts}  ${t(title)}`;
    return li;
  });
  $('rd-tips-box').hidden = tips.length === 0;
  $('rd-tips').replaceChildren(...tips);
}

function renderSpeed() {
  for (const k of ['s', 'o']) {
    spLists[k].replaceChildren(
      ...SPEED_ROWS.filter((r) => r[6] === k).map((r) =>
        makeRow(r, () => {
          $('sp-restart').hidden = !spState?.restart;
          renderScore();
        })
      )
    );
  }
  $('sp-restart').hidden = !spState?.restart;
  renderScore();
}

async function loadSpeed() {
  spState = await window.evl.speedGet();
  renderSpeed();
}

$('sp-relaunch').addEventListener('click', () => window.evl.relaunch());
renderSpeed();
