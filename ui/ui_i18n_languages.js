'use strict';
// Idiomas da interface: pt (padrão, é o texto escrito no HTML), en, es, zh e ja.
// A tabela de textos está em ui_i18n_strings.js (carregada antes deste arquivo).
// O texto estático do HTML é traduzido sozinho (a chave é o texto em português);
// textos criados pelo JavaScript usam t('texto em português').

const LANGS = ['pt', 'en', 'es', 'zh', 'ja'];
const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', zh: 'zh-CN', ja: 'ja-JP' };
let lang = 'pt';

// pt -> { en, es, zh, ja }
const DICT = new Map(I18N_ROWS.map(([pt, en, es, zh, ja]) => [pt, { en, es, zh, ja }]));

// t('texto em português', { n: 3 }) -> texto no idioma atual
function t(pt, vars) {
  const d = DICT.get(pt);
  let out = lang === 'pt' ? pt : (d?.[lang] ?? d?.en ?? pt); // sem tradução: inglês, depois português
  if (vars) for (const k in vars) out = out.replaceAll(`{${k}}`, String(vars[k]));
  return out;
}

// Mensagem vinda do main.js (erros): traduz se conhecer; "Download falhou (403)" tem número.
function tm(text) {
  const m = String(text).match(/^Download falhou \((.+)\)$/);
  return m ? t('Download falhou ({s})', { s: m[1] }) : t(String(text));
}

// Texto e atributos estáticos do HTML: guarda o original (português) e troca ao mudar de idioma.
const staticNodes = []; // { node, attr, pt }
(function collect() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const pt = n.nodeValue.trim();
    if (pt && DICT.has(pt) && !['SCRIPT', 'STYLE'].includes(n.parentNode.nodeName)) {
      staticNodes.push({ node: n, attr: null, pt, raw: n.nodeValue });
    }
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) {
    for (const attr of ['placeholder', 'aria-label', 'title']) {
      const pt = el.getAttribute(attr);
      if (pt && DICT.has(pt)) staticNodes.push({ node: el, attr, pt });
    }
  }
})();

function applyStatic() {
  for (const { node, attr, pt, raw } of staticNodes) {
    if (attr) node.setAttribute(attr, t(pt));
    else node.nodeValue = raw.replace(pt, t(pt));
  }
}

const langBtn = document.getElementById('lang-btn');
const langMenu = document.getElementById('lang-menu');

function setLang(next) {
  if (!LANGS.includes(next)) next = 'pt';
  lang = next;
  document.documentElement.lang = LOCALES[next];
  applyStatic();
  const item = langMenu.querySelector(`[data-lang="${next}"]`);
  langBtn.replaceChildren(item.querySelector('svg').cloneNode(true), document.createTextNode(next.toUpperCase()));
  langMenu.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === item)));
  // refaz o que o JavaScript desenhou (título, listas, abas)
  try {
    showPanel(panel);
    loadEngines();
    if (current) {
      lastKey = '';
      render(current);
    }
  } catch {}
}

function setLangMenu(open) {
  langMenu.hidden = !open;
  langBtn.setAttribute('aria-expanded', String(open));
}
langBtn.addEventListener('click', () => setLangMenu(langMenu.hidden));
langMenu.addEventListener('click', (event) => {
  const next = event.target.closest('button')?.dataset.lang;
  if (!next) return;
  setLangMenu(false);
  setLang(next);
  window.evl.setLang(next);
});
document.addEventListener('mousedown', (event) => {
  if (!langMenu.hidden && !langMenu.contains(event.target) && !langBtn.contains(event.target)) setLangMenu(false);
});
