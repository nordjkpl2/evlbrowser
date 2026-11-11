'use strict';
// Aparência e pedidos de permissão: estilo visual (Atual/Antigo 1800/1900), tema (Claro/Escuro/AMOLED), cor no tema, cantos, texto, abas,
// imagem de fundo, user agent, restaurar padrões, cor principal. Carrega depois do ui_main.js
// (usa o $ e o t() dele) e antes do ui_boot.js; as funções são chamadas só depois que tudo carregou.

// ---------- aparência: Claro / Escuro ----------
// Define o esquema de cores que os SITES enxergam. A interface do Evl não muda.

const themeOptions = [...document.querySelectorAll('.theme-option')];

// AMOLED = tema escuro (para os sites) com fundo preto total na interface; fica salvo neste computador.
const htmlEl = document.documentElement;
function showTheme(theme) {
  const shown = theme === 'dark' && htmlEl.classList.contains('amoled') ? 'amoled' : theme;
  for (const opt of themeOptions) {
    opt.setAttribute('aria-checked', String(opt.dataset.theme === shown));
  }
}
try {
  htmlEl.classList.toggle('amoled', localStorage.getItem('evl.amoled') === '1');
} catch {}

themeOptions.forEach((opt) =>
  opt.addEventListener('click', () => {
    const amoled = opt.dataset.theme === 'amoled';
    const theme = amoled ? 'dark' : opt.dataset.theme;
    htmlEl.classList.toggle('amoled', amoled);
    try {
      localStorage.setItem('evl.amoled', amoled ? '1' : '0');
    } catch {}
    showTheme(theme);
    window.evl.setTheme(theme);
  })
);

// Cor no tema: o fundo e os cartões levam um toque da cor principal (vale para Claro, Escuro e AMOLED)
const tintSwitch = $('tint-switch');
function setTint(on) {
  htmlEl.classList.toggle('tint', on);
  tintSwitch.setAttribute('aria-checked', String(on));
}
try {
  setTint(localStorage.getItem('evl.tint') === '1');
} catch {}
tintSwitch.addEventListener('click', () => {
  const on = tintSwitch.getAttribute('aria-checked') !== 'true';
  setTint(on);
  try {
    localStorage.setItem('evl.tint', on ? '1' : '0');
  } catch {}
});

// Estilo visual: Atual (''), Lua (Pale Moon) ou Antigo 1800/1900 (classes no <html> definidas em settings.css).
// Nos antigos os cantos são fixos (o estilo manda); a escolha de Cantos volta ao sair deles.
const lookOptions = [...document.querySelectorAll('[data-look]')];
const RETRO_R = { lua: '4', 1800: '3', 1900: '0' };
const radiusEl = $('radius');
let look = '';
let radius = '8';

function applyRadius() {
  htmlEl.style.setProperty('--r', `${look ? RETRO_R[look] : radius}px`);
  radiusEl.value = radius;
  radiusEl.disabled = look !== '';
}
function setLook(v) {
  look = Object.hasOwn(RETRO_R, v) ? v : '';
  htmlEl.classList.remove('retro', 'look-lua', 'look-1800', 'look-1900');
  if (look) htmlEl.classList.add(`look-${look}`);
  if (look && look !== 'lua') htmlEl.classList.add('retro');
  for (const o of lookOptions) o.setAttribute('aria-checked', String(o.dataset.look === look));
  applyRadius();
}
try {
  setLook(localStorage.getItem('evl.look'));
} catch {
  setLook('');
}
lookOptions.forEach((o) =>
  o.addEventListener('click', () => {
    setLook(o.dataset.look);
    try {
      localStorage.setItem('evl.look', look);
    } catch {}
  })
);

// Cantos: raio base (--r) usado por todo o CSS
function setRadius(v) {
  radius = ['0', '4', '8', '14', '22'].includes(v) ? v : '8';
  applyRadius();
}
try {
  setRadius(localStorage.getItem('evl.radius'));
} catch {}
radiusEl.addEventListener('change', () => {
  setRadius(radiusEl.value);
  try {
    localStorage.setItem('evl.radius', radiusEl.value);
  } catch {}
});

// ---------- pedido de permissão de um site ----------
const permEl = $('perm');
let permId = 0;
function permName(kind) {
  if (kind === 'microphone') return t('microfone');
  if (kind === 'camera') return t('câmera');
  if (kind === 'geolocation') return t('sua localização');
  if (kind === 'notifications') return t('notificações');
  if (kind === 'midi') return t('dispositivos MIDI');
  return t('área de transferência');
}
const permBtn = $('perm-btn');
const permList = $('perm-list');
let permOpen = false; // aberto pelo botão ao lado da estrela
let permAsk = null; // pedido do site esperando resposta
let sitePerms = null; // { host, perms } do site da aba ativa (vem no estado)
let permKey = '';

function setPermOpen(open) {
  permOpen = open;
  window.evl.permPanel(open); // a interface cresce por cima da página para o painel caber
  drawPerms();
}

// Cada clique anda um passo: Perguntar -> Permitido -> Bloqueado -> Perguntar.
const PERM_NEXT = new Map([[null, true], [true, false], [false, null]]);
function drawPerms() {
  const show = (permOpen && !!sitePerms) || !!permAsk;
  permEl.hidden = !show;
  permBtn.setAttribute('aria-expanded', String(permOpen));
  $('perm-ask').hidden = !permAsk;
  if (!show) return;
  $('perm-host').textContent = permAsk?.host ?? sitePerms.host;
  const key = JSON.stringify(sitePerms) + lang;
  $('perm-note').hidden = permList.hidden = !sitePerms;
  if (key === permKey || !sitePerms) return;
  permKey = key;
  permList.replaceChildren(
    ...Object.entries(sitePerms.perms).map(([kind, value]) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = permName(kind);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = value === true ? 'allow' : value === false ? 'block' : '';
      btn.textContent = value === true ? t('Permitido') : value === false ? t('Bloqueado') : t('Perguntar');
      btn.setAttribute('aria-label', `${permName(kind)}: ${btn.textContent}`);
      btn.addEventListener('click', () => window.evl.permSet(kind, PERM_NEXT.get(value)));
      li.append(name, btn);
      return li;
    })
  );
}

// Chamado a cada estado novo (ui_main.js): o botão fica sempre na barra; colorido se o site tem algo permitido.
function applyPerms(perms) {
  sitePerms = perms ?? null;
  permBtn.disabled = !sitePerms;
  permBtn.classList.toggle('on', !!sitePerms && Object.values(sitePerms.perms).includes(true));
  if (!sitePerms && permOpen) return setPermOpen(false);
  drawPerms();
}

function answerPerm(allow) {
  window.evl.permAnswer(permAsk?.id, allow, $('perm-remember').checked);
  permAsk = null;
  drawPerms();
}
window.evl.onPermAsk((ask) => {
  permAsk = ask;
  $('perm-text').textContent = `${t('quer usar:')} ${ask.kinds.map(permName).join(', ')}`;
  $('perm-remember').checked = false;
  drawPerms();
});
window.evl.onPermClose(() => {
  permAsk = null;
  drawPerms();
});
permBtn.addEventListener('click', () => setPermOpen(!permOpen));
$('perm-allow').addEventListener('click', () => answerPerm(true));
$('perm-block').addEventListener('click', () => answerPerm(false));
permEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (permAsk) answerPerm(false);
  else setPermOpen(false);
});
document.addEventListener('mousedown', (event) => {
  if (permOpen && !permEl.contains(event.target) && !permBtn.contains(event.target)) setPermOpen(false);
});

// Cartão em Configurações > Privacidade: sites com resposta lembrada.
let permSitesKey = '';
async function loadPerms() {
  const list = await window.evl.permList();
  const key = JSON.stringify(list) + lang;
  if (key === permSitesKey) return; // roda a cada 2 s: só redesenha se mudou
  permSitesKey = key;
  $('perm-count').textContent = `${list.length} ${t('sites com permissão salva')}`;
  $('perm-sites').replaceChildren(
    ...list.map((s) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'x-name';
      name.textContent = s.origin.replace(/^https:\/\//, '');
      const what = document.createElement('span');
      what.className = 'hint';
      what.textContent = [s.allowed.length && `${t('Permitido')}: ${s.allowed.map(permName).join(', ')}`, s.blocked.length && `${t('Bloqueado')}: ${s.blocked.map(permName).join(', ')}`].filter(Boolean).join(' · ');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'text-btn';
      del.textContent = t('Esquecer');
      del.addEventListener('click', async () => {
        await window.evl.permForget(s.origin);
        loadPerms();
      });
      li.append(name, what, del);
      return li;
    })
  );
}
$('perm-clear').addEventListener('click', async () => {
  await window.evl.permClear();
  loadPerms();
});

// ---------- aparência: tamanho e fonte do texto da interface ----------
// --ui-scale multiplica os tamanhos do style.css; --font-ui troca a fonte. Os sites não mudam.

const FONTS = {
  system: '"Segoe UI", system-ui, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  mono: '"Cascadia Mono", Consolas, monospace',
};
const fontSizeEl = $('f-size');
const fontFamilyEl = $('f-family');
const fontNumEl = $('f-size-num');
const fontNameEl = $('f-family-name');
const PRESET_SCALES = ['0.9', '1', '1.15', '1.3'];
const cleanFontName = (s) => String(s ?? '').replace(/[^\p{L}\p{N} .\-]/gu, '').trim().slice(0, 60);

function applyFont(f) {
  const scale = Math.min(2, Math.max(0.7, Number(f?.scale) || 1));
  const raw = String(f?.family ?? 'system');
  const name = raw.startsWith('custom:') ? cleanFontName(raw.slice(7)) : '';
  const family = FONTS[raw] ? raw : name ? 'custom' : 'system';
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  document.documentElement.style.setProperty('--font-ui', name ? `"${name}", ${FONTS.system}` : FONTS[family] ?? FONTS.system);
  const preset = PRESET_SCALES.includes(String(scale));
  fontSizeEl.value = preset ? String(scale) : 'custom';
  fontNumEl.value = String(Math.round(scale * 100));
  $('f-size-custom').hidden = preset;
  fontFamilyEl.value = family;
  fontNameEl.value = name;
  $('f-family-custom').hidden = family !== 'custom';
}
function saveFont() {
  const scale = fontSizeEl.value === 'custom' ? Math.min(200, Math.max(70, Number(fontNumEl.value) || 100)) / 100 : Number(fontSizeEl.value);
  let family = fontFamilyEl.value;
  if (family === 'custom') {
    const name = cleanFontName(fontNameEl.value);
    family = name ? `custom:${name}` : 'system';
  }
  applyFont({ scale, family });
  window.evl.setFont(scale, family);
}
fontSizeEl.addEventListener('change', () => {
  if (fontSizeEl.value === 'custom') {
    $('f-size-custom').hidden = false;
    fontNumEl.focus();
  } else saveFont();
});
fontNumEl.addEventListener('change', saveFont);
fontFamilyEl.addEventListener('change', () => {
  if (fontFamilyEl.value === 'custom') {
    $('f-family-custom').hidden = false;
    fontNameEl.focus();
  } else saveFont();
});
fontNameEl.addEventListener('change', saveFont);

// ---------- aparência: abas (posição, altura e largura) ----------

const tabModeEl = $('t-mode');
const tabHEl = $('t-h');
const tabWEl = $('t-w');
const sideWEl = $('t-side-w');

function applyTabLayout(l) {
  const mode = l?.mode === 'side' ? 'side' : 'top';
  const root = document.documentElement.style;
  root.setProperty('--tab-h', `${l?.tabH ?? 32}px`);
  root.setProperty('--tab-w', `${l?.tabW ?? 200}px`);
  root.setProperty('--side-w', `${l?.sideW ?? 220}px`);
  document.body.classList.toggle('side-tabs', mode === 'side');
  tabModeEl.value = mode;
  tabHEl.value = String(l?.tabH ?? 32);
  tabWEl.value = String(l?.tabW ?? 200);
  sideWEl.value = String(l?.sideW ?? 220);
  $('t-line').setAttribute('aria-checked', String(l?.line === true));
  const custom = /^#[0-9a-f]{6}$/i.test(l?.lineColor || '');
  lineColorValue = custom ? l.lineColor : '';
  if (custom && l.line === true) root.setProperty('--ring', l.lineColor);
  else root.removeProperty('--ring');
  if (custom) $('t-line-color').value = l.lineColor;
  $('t-line-auto').disabled = !custom; // já está em automático
  $('t-line-color-row').hidden = l?.line !== true;
  $('t-w-label').hidden = mode === 'side';
  $('t-side-label').hidden = mode !== 'side';
}
let lineColorValue = ''; // '' = automática (cor do ícone/site)
function saveTabLayout() {
  window.evl.setTabLayout({ mode: tabModeEl.value, tabH: Number(tabHEl.value), tabW: Number(tabWEl.value), sideW: Number(sideWEl.value), line: $('t-line').getAttribute('aria-checked') === 'true', lineColor: lineColorValue });
}
[tabModeEl, tabHEl, tabWEl, sideWEl].forEach((el) => el.addEventListener('change', saveTabLayout));
$('t-line-color').addEventListener('change', (event) => {
  lineColorValue = event.currentTarget.value;
  saveTabLayout();
});
$('t-line-auto').addEventListener('click', () => {
  lineColorValue = '';
  saveTabLayout();
});
$('t-line').addEventListener('click', (event) => {
  const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
  event.currentTarget.setAttribute('aria-checked', String(on));
  saveTabLayout();
});

// Luz na aba ativa (desligado por padrão; guardado só neste computador)
const tabGlow = $('tab-glow');
function setTabGlow(on) {
  document.body.classList.toggle('tab-glow', on);
  tabGlow.setAttribute('aria-checked', String(on));
}
try {
  setTabGlow(localStorage.getItem('evl.tabGlow') === '1');
} catch {}
tabGlow.addEventListener('click', () => {
  const on = tabGlow.getAttribute('aria-checked') !== 'true';
  setTabGlow(on);
  try {
    localStorage.setItem('evl.tabGlow', on ? '1' : '0');
  } catch {}
});

// Imagem de fundo da aba Configurações: reduzida (máx. 1920 px) e guardada neste computador
const bgStatus = $('bg-status');
function applyBg(url, dim) {
  // a imagem (pode ter centenas de KB) fica só na tela de Configurações, não na página toda
  const page = $('page-settings').style;
  if (url) page.setProperty('--settings-bg', `url("${url}")`);
  else page.removeProperty('--settings-bg');
  page.setProperty('--bg-dim', String((Number(dim) || 0) / 100));
  document.body.classList.toggle('has-bg', !!url);
  $('bg-clear').disabled = !url;
  $('bg-dim').value = String(Number(dim) || 0);
}
try {
  applyBg(localStorage.getItem('evl.bgImage'), localStorage.getItem('evl.bgDim') ?? 35);
} catch {}
// Lê a imagem escolhida, reduz (máx. 1920 px) e guarda em localStorage[key]; serve às Configurações e à Página inicial.
function loadImage(event, key, status, done) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  const say = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
  // lê como data: (a política de segurança da interface não aceita blob:)
  const reader = new FileReader();
  const img = new Image();
  reader.onerror = () => img.onerror();
  reader.onload = () => {
    img.src = reader.result;
  };
  img.onload = () => {
    const k = Math.min(1, 1920 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.82);
    try {
      localStorage.setItem(key, url);
      say('');
      done(url);
    } catch {
      say(t('Não deu para guardar a imagem (muito grande).'));
    }
  };
  img.onerror = () => say(t('Não deu para abrir essa imagem.'));
  reader.readAsDataURL(file);
}
const saveLocal = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
};
$('bg-pick').addEventListener('click', () => $('bg-file').click());
$('bg-file').addEventListener('change', (event) => loadImage(event, 'evl.bgImage', bgStatus, (url) => applyBg(url, $('bg-dim').value)));
$('bg-clear').addEventListener('click', () => {
  saveLocal('evl.bgImage', null);
  applyBg(null, $('bg-dim').value);
});
$('bg-dim').addEventListener('input', () => {
  $('page-settings').style.setProperty('--bg-dim', String(Number($('bg-dim').value) / 100));
});
$('bg-dim').addEventListener('change', () => saveLocal('evl.bgDim', $('bg-dim').value));

// ---------- página inicial (aba nova): título, texto, atalhos e imagem de fundo ----------
// Tudo fica só neste computador (localStorage): evl.home = { title, sub, links }, evl.homeBg, evl.homeDim.

// "Nome | endereço" por linha (só o endereço também vale); no máximo 12 atalhos.
function homeLinks(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf('|');
    const url = (i < 0 ? line : line.slice(i + 1)).trim().slice(0, 500);
    if (url && out.length < 12) out.push([(i < 0 ? '' : line.slice(0, i).trim().slice(0, 30)) || url, url]);
  }
  return out;
}
function applyHome(h) {
  $('home-title').textContent = h.title || 'EVL'; // textContent: nunca HTML
  $('home-sub').textContent = h.sub || '';
  $('home-sub').hidden = !h.sub;
  $('home-hint').hidden = !!h.sub;
  const links = homeLinks(h.links).map(([name, url]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'white-btn';
    b.textContent = name;
    b.title = url;
    b.addEventListener('click', () => window.evl.navigate(url)); // passa pelo mesmo filtro da barra de endereço
    return b;
  });
  $('home-links').replaceChildren(...links);
  $('home-links').hidden = links.length === 0;
}
function applyHomeBg(url, dim) {
  const page = $('page-blank');
  if (url) page.style.setProperty('--home-bg', `url("${url}")`);
  else page.style.removeProperty('--home-bg');
  page.style.setProperty('--home-dim', String((Number(dim) || 0) / 100));
  page.classList.toggle('has-bg', !!url);
  $('home-bg-clear').disabled = !url;
  $('home-dim').value = String(Number(dim) || 0);
}
let home = {};
try {
  home = JSON.parse(localStorage.getItem('evl.home')) || {};
} catch {}
try {
  applyHomeBg(localStorage.getItem('evl.homeBg'), localStorage.getItem('evl.homeDim') ?? 35);
} catch {}
applyHome(home);
for (const [id, key] of [['home-title-in', 'title'], ['home-sub-in', 'sub'], ['home-links-in', 'links']]) {
  const el = $(id);
  el.value = home[key] ?? '';
  el.addEventListener('input', () => {
    home[key] = el.value;
    applyHome(home);
  });
  el.addEventListener('change', () => saveLocal('evl.home', JSON.stringify(home)));
}
$('home-edit').addEventListener('click', () => window.evl.openSettings('appearance'));
$('home-bg-pick').addEventListener('click', () => $('home-bg-file').click());
$('home-bg-file').addEventListener('change', (event) => loadImage(event, 'evl.homeBg', $('home-status'), (url) => applyHomeBg(url, $('home-dim').value)));
$('home-bg-clear').addEventListener('click', () => {
  saveLocal('evl.homeBg', null);
  applyHomeBg(null, $('home-dim').value);
});
$('home-dim').addEventListener('input', () => $('page-blank').style.setProperty('--home-dim', String(Number($('home-dim').value) / 100)));
$('home-dim').addEventListener('change', () => saveLocal('evl.homeDim', $('home-dim').value));

// ---------- estilo das abas: formato, espaço, ícone, botão de fechar, só o ícone ----------
// Só visual (CSS), guardado neste computador em evl.tabStyle.
const tabStyle = { shape: '', gap: 2, icon: 16, iconShape: '', close: '', iconOnly: false };
const TAB_STYLE_INPUTS = [['t-shape', 'shape'], ['t-gap', 'gap'], ['t-icon', 'icon'], ['t-icon-shape', 'iconShape'], ['t-close', 'close']];
const between = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
function applyTabStyle(patch) {
  Object.assign(tabStyle, patch);
  const s = tabStyle;
  s.gap = between(s.gap, 0, 12, 2);
  s.icon = between(s.icon, 12, 28, 16);
  const body = document.body.classList;
  const root = document.documentElement.style;
  body.toggle('tab-flat', s.shape === 'flat');
  body.toggle('tab-pill', s.shape === 'pill');
  body.toggle('tab-close-hover', s.close === 'hover');
  body.toggle('tab-close-none', s.close === 'none');
  body.toggle('tab-icon-only', s.iconOnly === true);
  root.setProperty('--tab-gap', `${s.gap}px`);
  root.setProperty('--tab-icon', `${s.icon}px`);
  if (s.iconShape === 'square' || s.iconShape === 'circle') root.setProperty('--tab-icon-r', s.iconShape === 'circle' ? '50%' : '0');
  else root.removeProperty('--tab-icon-r');
  for (const [id, key] of TAB_STYLE_INPUTS) $(id).value = String(s[key]);
  $('t-icon-only').setAttribute('aria-checked', String(s.iconOnly === true));
}
try {
  applyTabStyle(JSON.parse(localStorage.getItem('evl.tabStyle')));
} catch {}
const saveTabStyle = (patch) => {
  applyTabStyle(patch);
  saveLocal('evl.tabStyle', JSON.stringify(tabStyle));
};
for (const [id, key] of TAB_STYLE_INPUTS) $(id).addEventListener('change', (event) => saveTabStyle({ [key]: event.currentTarget.value }));
$('t-icon-only').addEventListener('click', () => saveTabStyle({ iconOnly: !tabStyle.iconOnly }));

// User agent (aba Cookies)
const uaInput = $('ua-input');
const uaStatus = $('ua-status');
async function loadUa() {
  const r = await window.evl.uaGet();
  if (!r) return;
  uaInput.value = r.value;
  uaInput.placeholder = r.default;
}
async function saveUa(value) {
  const r = await window.evl.uaSet(value);
  uaStatus.textContent = r?.ok ? t('Salvo. Vale ao abrir ou recarregar páginas.') : t('User agent inválido (texto simples, de 8 a 400 caracteres).');
  uaStatus.hidden = false;
  if (r?.ok) loadUa();
}
$('ua-save').addEventListener('click', () => saveUa(uaInput.value));
$('ua-reset').addEventListener('click', () => saveUa(null));

// Restaurar padrões: confirma em 2 passos; limpa as preferências desta tela e pede ao main.js o resto
const resetAsk = $('reset-ask');
const resetYes = $('reset-yes');
const resetNo = $('reset-no');
let resetTimer = 0;
function resetStep(confirming) {
  resetAsk.hidden = confirming;
  resetYes.hidden = !confirming;
  resetNo.hidden = !confirming;
  clearTimeout(resetTimer);
  if (confirming) resetTimer = setTimeout(() => resetStep(false), 8000);
}
resetAsk.addEventListener('click', () => resetStep(true));
resetNo.addEventListener('click', () => resetStep(false));
resetYes.addEventListener('click', () => {
  try {
    for (const k of ['compact', 'oneColor', 'lessColor', 'amoled', 'tint', 'look', 'radius', 'icons', 'tabGlow', 'bgImage', 'bgDim', 'home', 'homeBg', 'homeDim', 'tabStyle']) localStorage.removeItem(`evl.${k}`);
  } catch {}
  window.evl.settingsReset();
});

// Menos cor: tira brilhos, linhas e setas coloridas das Configurações
const lessColor = $('less-color');
function setLessColor(on) {
  document.body.classList.toggle('less-color', on);
  lessColor.setAttribute('aria-checked', String(on));
}
try {
  setLessColor(localStorage.getItem('evl.lessColor') === '1');
} catch {}
lessColor.addEventListener('click', () => {
  const on = lessColor.getAttribute('aria-checked') !== 'true';
  setLessColor(on);
  try {
    localStorage.setItem('evl.lessColor', on ? '1' : '0');
  } catch {}
});

// Usar só 1 cor: a 2ª variação (--accent2) passa a ser igual à principal
const oneColor = $('one-color');
function setOneColor(on) {
  document.body.classList.toggle('one-color', on);
  oneColor.setAttribute('aria-checked', String(on));
}
try {
  setOneColor(localStorage.getItem('evl.oneColor') === '1');
} catch {}
oneColor.addEventListener('click', () => {
  const on = oneColor.getAttribute('aria-checked') !== 'true';
  setOneColor(on);
  try {
    localStorage.setItem('evl.oneColor', on ? '1' : '0');
  } catch {}
});

// ---------- aparência: cor principal ----------
// Troca só as variáveis --accent e --glow da interface (as páginas dos sites não mudam).

const accentEl = $('accent');
let accent = null; // #rrggbb escolhido, ou null = padrão do tema

function applyAccent(color) {
  accent = color;
  const root = document.documentElement.style;
  if (color) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    root.setProperty('--accent', color);
    root.setProperty('--glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--glow');
  }
  // o quadrado mostra a cor em uso (a do tema, quando não há escolha)
  const shown = color ?? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(shown)) accentEl.value = shown.toLowerCase();
}

accentEl.addEventListener('input', () => applyAccent(accentEl.value)); // ao vivo
accentEl.addEventListener('change', () => window.evl.setAccent(accentEl.value)); // salva ao confirmar
// botão direito no bloco de cor volta ao padrão do tema
accentEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  applyAccent(null);
  window.evl.setAccent(null);
});

// ---------- estilo dos ícones do menu das Configurações ----------
const ICON_EMOJI = { search: '🔍', memory: '🧠', render: '🖼️', privacy: '🔒', adblock: '🛡️', appearance: '🎨', history: '🕘', bookmarks: '⭐', cookies: '🍪', extensions: '🧩', passwords: '🔑' };
for (const item of document.querySelectorAll('.nav-item')) {
  const emo = document.createElement('span');
  emo.className = 'nav-emo';
  emo.setAttribute('aria-hidden', 'true');
  emo.textContent = ICON_EMOJI[item.dataset.panel] || '•';
  item.insertBefore(emo, item.firstChild);
}
const iconSetEl = $('icon-set');
function setIconSet(v) {
  const ok = ['line', 'bold', 'soft', 'emoji', 'none'].includes(v) ? v : 'line';
  document.body.dataset.icons = ok;
  iconSetEl.value = ok;
}
try {
  setIconSet(localStorage.getItem('evl.icons'));
} catch {
  setIconSet('line');
}
iconSetEl.addEventListener('change', () => {
  setIconSet(iconSetEl.value);
  try {
    localStorage.setItem('evl.icons', iconSetEl.value);
  } catch {}
});
