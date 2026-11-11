'use strict';
// ---------- velocidade e memória ----------
// [chave, tipo, título, dica, unidade, precisa reiniciar]. As linhas são montadas no carregamento
// (a busca das Configurações lê o texto) e de novo ao abrir a categoria (idioma).

const SPEED_ROWS = [
  ['preconnect', 'bool', 'Conectar antes de abrir', 'Enquanto você digita, o Evl já abre a conexão com o primeiro site sugerido. A página aparece mais rápido.', '', false],
  ['discardMinutes', 'num', 'Fechar abas paradas após', 'Abas de fundo sem uso (e sem som ou vídeo tocando) são descarregadas e liberam a memória. Clicar nelas volta a carregar.', 'min', false],
  ['memoryBudgetMB', 'num', 'Limite de memória', 'Acima deste valor o Evl descarrega as abas paradas mais antigas antes do tempo.', 'MB', false],
  ['blockAutoplay', 'bool', 'Não tocar vídeos sozinhos', 'Vídeos só tocam depois de um clique seu: menos rede, menos CPU e menos memória em abas abertas.', '', true],
  ['hardwareAccel', 'bool', 'Usar a placa de vídeo', 'Deixa rolagem e vídeo mais fluidos. Desligue só se notar travamentos ou quiser poupar a memória de vídeo.', '', true],
  ['lowMemory', 'bool', 'Modo de baixa memória', 'Usa menos memória em cada página (caches menores). Pode deixar sites muito pesados um pouco mais lentos.', '', true],
];

const spList = $('sp-list');
let spState = null;

function renderSpeed() {
  spList.replaceChildren(
    ...SPEED_ROWS.map(([key, kind, title, hint, unit, restart]) => {
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
      const apply = (next) => {
        if (!next) return;
        spState = next;
        $('sp-restart').hidden = !next.restart;
      };
      if (kind === 'bool') {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'switch';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', t(title));
        sw.setAttribute('aria-checked', String(!!value));
        sw.addEventListener('click', async () => {
          const next = await window.evl.speedSet(key, sw.getAttribute('aria-checked') !== 'true');
          apply(next);
          if (next) sw.setAttribute('aria-checked', String(next.options[key]));
        });
        li.append(sw);
      } else {
        const wrap = document.createElement('span');
        wrap.className = 'sp-num';
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.value = String(value ?? '');
        input.setAttribute('aria-label', t(title));
        input.addEventListener('change', async () => {
          const next = await window.evl.speedSet(key, Number(input.value));
          apply(next);
          if (next) input.value = String(next.options[key]); // mostra o valor aceito (dentro dos limites)
        });
        const u = document.createElement('span');
        u.className = 'hint';
        u.textContent = unit;
        wrap.append(input, u);
        li.append(wrap);
      }
      return li;
    })
  );
  $('sp-restart').hidden = !spState?.restart;
}

async function loadSpeed() {
  spState = await window.evl.speedGet();
  renderSpeed();
}

$('sp-relaunch').addEventListener('click', () => window.evl.relaunch());
renderSpeed();
