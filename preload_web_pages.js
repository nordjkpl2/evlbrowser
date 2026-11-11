// Roda dentro de CADA página web (não confundir com preload.js, que é só da interface do Evl).
// Faz duas coisas, as duas só no mundo isolado, sem expor nada à página:
//   1) preenche logins com as senhas do cofre (src/data/passwords_vault.js), só depois de um clique SEU num campo;
//   2) reforça o bloqueador de anúncios no YouTube (corta os anúncios da resposta do player,
//      esconde o que sobra e pula anúncios que mesmo assim começarem).
// Preloads com sandbox só podem usar 'electron', por isso tudo fica neste arquivo.

const { ipcRenderer, webFrame, contextBridge } = require('electron');

// ---------- YouTube ----------

// Esta função roda no MUNDO DA PÁGINA (antes dos scripts do YouTube), por isso precisa ser
// autossuficiente: não pode usar nada de fora dela.
function youtubeMainWorldShield() {
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots'];
  const isPlayerResponse = (o) => !!(o.streamingData || o.videoDetails || o.playabilityStatus);

  // Tira os anúncios de uma resposta do player (e de respostas que a trazem dentro).
  function prune(o) {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) {
      for (const item of o) prune(item);
      return o;
    }
    if (isPlayerResponse(o)) for (const k of AD_KEYS) if (k in o) delete o[k];
    if (o.playerResponse && typeof o.playerResponse === 'object') prune(o.playerResponse);
    return o;
  }

  // 1) A resposta embutida na página (ytInitialPlayerResponse) passa pelo filtro ao ser definida.
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: () => initial,
      set: (v) => {
        initial = prune(v);
      },
    });
  } catch {}

  // 2) Respostas pedidas depois (troca de vídeo sem recarregar): JSON.parse e fetch().json().
  const nativeParse = JSON.parse;
  JSON.parse = function (...args) {
    const result = nativeParse.apply(this, args);
    try {
      prune(result);
    } catch {}
    return result;
  };
  if (typeof Response !== 'undefined') {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = function () {
      const url = this.url || '';
      return nativeJson.call(this).then((data) => {
        try {
          if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next') || url.includes('pbj=1')) prune(data);
        } catch {}
        return data;
      });
    };
  }
}

const YT_HIDE_CSS = `
#masthead-ad, #player-ads, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,
ytd-statement-banner-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,
ytd-display-ad-renderer, ytd-player-legacy-desktop-watch-ads-renderer, ytd-companion-slot-renderer,
ytd-action-companion-ad-renderer, ytd-brand-video-singleton-renderer, ytd-merch-shelf-renderer,
.ytp-ad-overlay-container, .ytp-ad-text-overlay, .ytp-ad-image-overlay, .video-ads,
ytd-rich-item-renderer:has(ytd-ad-slot-renderer), ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
ytd-enforcement-message-view-model, tp-yt-iron-overlay-backdrop.opened:has(~ ytd-enforcement-message-view-model)
{ display: none !important; }
`;

// Se um anúncio de vídeo começar mesmo assim: cala, vai ao fim dele e clica em "Pular".
function startYoutubeAdSkipper() {
  let before = null; // estado do som antes do anúncio, para devolver depois
  setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const player = document.querySelector('.html5-video-player');
    const video = player && player.querySelector('video');

    // aviso "bloqueadores de anúncios não são permitidos": tira e deixa o vídeo seguir
    const nag = document.querySelector('ytd-enforcement-message-view-model');
    if (nag) {
      nag.remove();
      document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
      if (video && video.paused) video.play().catch(() => {});
    }

    if (player && video && player.classList.contains('ad-showing')) {
      if (!before) before = { muted: video.muted };
      video.muted = true;
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration) {
        video.currentTime = video.duration;
      }
      for (const sel of ['.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.ytp-ad-overlay-close-button']) {
        document.querySelector(sel)?.click();
      }
    } else if (before && video) {
      video.muted = before.muted;
      before = null;
    }
  }, 400);
}

// Esconde caixas de anúncio vazias (só seletores seguros, para não quebrar sites).
const GENERIC_HIDE_CSS = `
ins.adsbygoogle, amp-ad, amp-embed[type="taboola"], [id^="div-gpt-ad"], [id^="google_ads_iframe"],
iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"], iframe[src*="adservice.google"],
.OUTBRAIN, [id^="taboola-"], .taboola-widget, [data-ad-slot], [data-google-query-id]:not(body):not(html),
iframe[src*="adserver"], iframe[src*="/ads/"], iframe[id^="google_ads"], .advertisement:not(body),
[aria-label="Advertisement"], [aria-label="Publicidade"], [data-ad-placeholder], .ad-banner, .adsbox, #ad-banner
{ display: none !important; }
`;

// Avisos de venda, cadastro e "espere, não saia": só vendors conhecidos de popup (seletores seguros).
const POPUP_HIDE_CSS = `
[id^="om-"][class*="optin"], .optinmonster-overlay, .om-holder, #privy-container, .privy-popup-container,
.klaviyo-popup, [aria-label="POPUP Form"], .needsclick.kl-private-reset-css-Xuajs1, #sumo-overlay, .sumome-overlay,
.pum-overlay, .spu-bg, .spu-box, .mc-modal-bg, .mc-modal, .wisepops-overlay, [id^="wisepops-"], #ju_iframe_wrapper,
[id^="ju_"][class*="popup"], #exit-intent, .exit-intent-popup, .email-popup, .newsletter-popup, .popup-newsletter,
.ometria-overlay, [class*="popup-ad"], [id*="popup-ad"], .popupOverlay[class*="promo"]
{ display: none !important; }
html.pum-open, body.pum-open { overflow: auto !important; }
`;

// Roda no mundo da página, antes dos scripts dela: janelas só abrem se você clicou/tocou/digitou
// há pouco (navigator.userActivation). Login por janela (OAuth) continua, pois nasce de um clique.
function popupGuard() {
  const active = () => {
    try {
      return !navigator.userActivation || navigator.userActivation.isActive;
    } catch {
      return true;
    }
  };
  const realOpen = window.open;
  window.open = function () {
    return active() ? realOpen.apply(this, arguments) : null;
  };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.target && this.target !== '_self' && !active()) return; // clique de script abrindo outra janela
    return realClick.call(this);
  };
}

// uma única consulta por página (só em http/https); YouTube ganha as regras extras
if (/^https?:$/.test(location.protocol)) {
  let ads = false;
  let popups = false;
  try {
    // { ads, popups }: ligados nas Configurações e o site não está na lista de permitidos
    const r = ipcRenderer.sendSync('adblock:enabled');
    ads = r === true || r?.ads === true;
    popups = r?.popups === true;
  } catch {}
  if (popups) {
    webFrame.insertCSS(POPUP_HIDE_CSS);
    try {
      contextBridge.executeInMainWorld({ func: popupGuard });
    } catch {}
  }
  if (ads) {
    webFrame.insertCSS(GENERIC_HIDE_CSS);
    if (/(^|\.)youtube\.com$/.test(location.hostname)) {
      try {
        contextBridge.executeInMainWorld({ func: youtubeMainWorldShield });
      } catch {}
      webFrame.insertCSS(YT_HIDE_CSS);
      startYoutubeAdSkipper();
    }
  }
}

// ---------- preenchimento de senhas ----------
// Só preenche depois de um CLIQUE de verdade (isTrusted) num campo de login, só em https
// (ou localhost), só com senhas do mesmo site da página, e a senha só chega aqui no clique.

const setNativeValue = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const seen = (el) => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const isPasswordField = (el) => el instanceof HTMLInputElement && el.type === 'password';
const isUserField = (el) =>
  el instanceof HTMLInputElement && ['text', 'email', 'tel', 'url', ''].includes(el.type) && !el.readOnly && !el.disabled;

// Acha o par (usuário, senha) do formulário a partir do campo clicado.
function findLoginFields(clicked) {
  const scope = clicked.form || document;
  const inputs = [...scope.querySelectorAll('input')].filter(seen);
  const password = isPasswordField(clicked) ? clicked : inputs.find(isPasswordField);
  if (!password) return null;
  let username = isUserField(clicked) ? clicked : null;
  if (!username) {
    const before = inputs.slice(0, inputs.indexOf(password)).filter(isUserField);
    username = before[before.length - 1] ?? null;
  }
  return { username, password };
}

async function fillFrom(id, fields) {
  const cred = await ipcRenderer.invoke('autofill:fill', id);
  if (!cred) return;
  if (fields.username && cred.username) setNativeValue(fields.username, cred.username);
  setNativeValue(fields.password, cred.password);
}

// Lista de logins (quando há mais de um) numa caixa que a página não consegue ler (shadow root fechado).
let picker = null;
function closePicker() {
  picker?.remove();
  picker = null;
}
function openPicker(field, logins, fields) {
  closePicker();
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent =
    ':host{all:initial}.box{position:fixed;z-index:2147483647;min-width:200px;padding:4px;border-radius:8px;' +
    'background:#1b1b1f;color:#eee;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);border:1px solid #333}' +
    'button{display:block;width:100%;padding:8px 10px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}' +
    'button:hover{background:#2a2a30}';
  const box = document.createElement('div');
  box.className = 'box';
  const rect = field.getBoundingClientRect();
  box.style.left = `${Math.max(4, rect.left)}px`;
  box.style.top = `${rect.bottom + 4}px`;
  for (const login of logins) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = login.username || '(sem usuário)';
    btn.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      closePicker();
      fillFrom(login.id, fields);
    });
    box.append(btn);
  }
  root.append(style, box);
  document.documentElement.append(host);
  picker = host;
}

document.addEventListener(
  'pointerdown',
  async (event) => {
    if (!event.isTrusted) return;
    const target = event.composedPath()[0];
    if (picker && target !== picker) closePicker();
    if (!(target instanceof HTMLInputElement) || !(isPasswordField(target) || isUserField(target))) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    const fields = findLoginFields(target);
    if (!fields) return;
    if (fields.password.value && (!fields.username || fields.username.value)) return; // já preenchido: não sobrescreve
    let logins = [];
    try {
      logins = await ipcRenderer.invoke('autofill:query');
    } catch {}
    if (logins.length === 1) fillFrom(logins[0].id, fields);
    else if (logins.length > 1) openPicker(target, logins, fields);
  },
  true
);
document.addEventListener('keydown', (event) => event.key === 'Escape' && closePicker(), true);
