// Quando a página muda sozinha para outro site (sem clique seu), o Evl pergunta antes.
// Regra pura, sem Electron: testável com `npm test`.
//
// Um clique ou tecla seu logo antes da navegação conta como "pedido seu"; sem isso e para um
// site diferente da página atual, a navegação vira um pedido de confirmação.

const { siteOf, hostOf } = require('../network/privacy_engine');

const GESTURE_WINDOW_MS = 2000; // clique/tecla até 2 s antes da navegação ainda vale como pedido seu

function shouldAskRedirect({ gestureAt = 0, now = Date.now(), fromUrl = '', toUrl = '' }) {
  if (!/^https?:\/\//.test(toUrl)) return false; // só web; about:, blob: e similares passam
  if (!/^https?:\/\//.test(fromUrl)) return false; // primeira página da aba (ou em branco): sem o que comparar
  if (now - gestureAt <= GESTURE_WINDOW_MS) return false; // você clicou/digitou agora
  const from = siteOf(hostOf(fromUrl));
  const to = siteOf(hostOf(toUrl));
  return from !== to; // mesmo site (ex.: login em outra página do mesmo domínio) passa
}

module.exports = { shouldAskRedirect, GESTURE_WINDOW_MS };
