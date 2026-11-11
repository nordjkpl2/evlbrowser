'use strict';
// ---------- privacidade ----------
// Lista de opções com interruptor. As linhas são montadas no carregamento (a busca das
// Configurações lê o texto delas) e de novo ao abrir a categoria (idioma).

const PRIVACY_ROWS = [
  ['stripParams', 'Remover rastreadores dos endereços', 'Tira utm_, fbclid, gclid e parecidos ao abrir uma página.'],
  ['blockThirdPartyCookies', 'Bloquear cookies de terceiros', 'Sites de terceiros (anúncios, widgets) não leem nem gravam cookies. Pode afetar logins dentro de páginas incorporadas.'],
  ['sendDnt', 'Pedir para não ser rastreado', 'Envia os avisos Do Not Track e Global Privacy Control.'],
  ['webrtcProtect', 'Proteger o IP no WebRTC', 'Impede que sites descubram o IP da sua rede local por chamadas de vídeo.'],
  ['secureDns', 'DNS seguro (HTTPS)', 'Esconde os sites que você visita do provedor de internet. Se falhar, volta ao DNS do sistema.'],
  ['trimReferrer', 'Esconder de onde você veio', 'Sites de fora veem só o domínio da página anterior, nunca o endereço completo (não vazam o que você lia em outra aba).'],
  ['limitFingerprint', 'Limitar a impressão digital', 'Esconde detalhes do seu computador que os sites pedem (versão exata, modelo) e bloqueia APIs de anúncios do Chromium.'],
  ['blockExtensionNet', 'Extensões não enviam dados para fora', 'Corta a internet das páginas de fundo das extensões, para elas não enviarem o que leem das suas abas. Pode quebrar extensões que precisam de internet.'],
  ['noWebgl', 'Desligar o WebGL', 'Impede que sites usem a placa de vídeo para desenhar e identificar o computador. Pode quebrar mapas e jogos 3D; vale para abas abertas depois.'],
  ['maskHardware', 'Esconder núcleos e memória', 'Os sites veem sempre 4 núcleos e 8 GB de memória, valores comuns, em vez dos reais do seu computador.'],
  ['letterbox', 'Arredondar o tamanho da janela', 'A página usa sempre múltiplos de 200×100 px, para o tamanho exato da janela não identificar você. Sobram faixas vazias nas bordas.'],
  ['blockBeacons', 'Bloquear beacons e relatórios', 'Corta os avisos que as páginas mandam em segundo plano para medir cliques e tempo de leitura. Nenhum site depende deles.'],
  ['canvasNoise', 'Ruído no canvas', 'Muda de forma invisível o que os sites leem dos desenhos da página, para a assinatura do seu computador não se repetir. Vale para páginas abertas depois.'],
  ['httpsOnly', 'Só HTTPS', 'Endereços http:// viram https://, sem voltar atrás. Sites que só existem em http:// deixam de abrir (a rede local continua funcionando).'],
  ['webrtcOff', 'WebRTC sem conexão direta', 'O seu IP real nunca aparece em chamadas, nem usando VPN. Chamadas de vídeo podem falhar.'],
  ['clearOnExit', 'Apagar cookies e cache ao fechar', 'Desliga você dos sites a cada vez que fecha o navegador.'],
];

const vList = $('v-list');
const vStatus = $('v-status');
let vOptions = null;

function renderPrivacy() {
  vList.replaceChildren(
    ...PRIVACY_ROWS.map(([key, title, hint]) => {
      const li = document.createElement('li');
      li.className = 'v-row';
      const text = document.createElement('span');
      text.className = 'v-text';
      const name = document.createElement('span');
      name.textContent = t(title);
      const sub = document.createElement('span');
      sub.className = 'v-hint hint';
      sub.textContent = t(hint);
      text.append(name, sub);
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'switch';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-label', t(title));
      sw.setAttribute('aria-checked', String(vOptions ? vOptions[key] : false));
      sw.addEventListener('click', async () => {
        const next = await window.evl.privacySet(key, sw.getAttribute('aria-checked') !== 'true');
        if (!next) return;
        vOptions = next;
        sw.setAttribute('aria-checked', String(next[key]));
      });
      li.append(text, sw);
      return li;
    })
  );
}

async function loadPrivacy() {
  vOptions = await window.evl.privacyGet();
  renderPrivacy();
}

let vArmed = null;
$('v-clear').addEventListener('click', async (event) => {
  const btn = event.currentTarget;
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = t('Confirmar: apagar cache e dados de sites');
    vArmed = setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = t('Limpar cache e dados de sites agora');
    }, 4000);
    return;
  }
  clearTimeout(vArmed);
  delete btn.dataset.armed;
  btn.textContent = t('Limpar cache e dados de sites agora');
  vStatus.hidden = false;
  vStatus.textContent = (await window.evl.privacyClear()) ? t('Cache e dados de sites apagados.') : '';
});

renderPrivacy();
