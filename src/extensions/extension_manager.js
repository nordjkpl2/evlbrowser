// Extensões do Chromium (e do Firefox, adaptadas). O Electron só carrega extensões DESCOMPACTADAS e com suporte
// parcial às APIs (sem botão na barra: popup e opções abrem numa aba). Guardamos uma cópia de cada uma.
// A cópia passa por secure(): saem as permissões que deixam a extensão acompanhar você ENTRE sites.

const fs = require('fs');
const path = require('path');
const { extractZip } = require('./extension_zip_reader');

// "abcdefghijklmnopabcdefghijklmnop" (32 letras a-p) ou um link da Chrome Web Store.
function parseStoreId(text) {
  const m = String(text).match(/(?:^|\/)([a-p]{32})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

// O manifest pode estar na raiz ou dentro de uma única pasta (zip feito de uma pasta).
function findRoot(dir) {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  const subs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  if (subs.length === 1 && fs.existsSync(path.join(dir, subs[0].name, 'manifest.json'))) {
    return path.join(dir, subs[0].name);
  }
  throw new Error('manifest.json não encontrado');
}

// Nomes de extensões da loja vêm como "__MSG_extName__": o texto real está em
// _locales/<idioma>/messages.json (primeiro o idioma padrão da extensão, depois inglês, depois qualquer um).
const stripBom = (text) => text.replace(/^\uFEFF/, '');

function localizedName(root, text, defaultLocale) {
  const match = /^__MSG_(.+)__$/.exec(text);
  if (!match) return text;
  const key = match[1].toLowerCase();
  let others = [];
  try {
    others = fs.readdirSync(path.join(root, '_locales'));
  } catch {}
  for (const loc of new Set([defaultLocale, 'en', 'en_US', 'en_GB', ...others])) {
    if (!loc) continue;
    try {
      const msgs = JSON.parse(stripBom(fs.readFileSync(path.join(root, '_locales', loc, 'messages.json'), 'utf8')));
      const found = Object.entries(msgs).find(([k]) => k.toLowerCase() === key);
      if (found && typeof found[1]?.message === 'string' && found[1].message) return found[1].message;
    } catch {}
  }
  return null;
}

// "meu-addon" a partir de um link de addons.mozilla.org.
function parseAmoSlug(text) {
  const m = String(text).match(/addons\.mozilla\.org\/(?:[\w-]+\/)?(?:firefox|android)\/addon\/([\w.@+-]{1,80})/);
  return m ? m[1] : null;
}

// ---------- isolamento: a extensão não olha entre sites ----------
// Com estas permissões uma extensão vê a lista de abas, o histórico, os cookies ou o tráfego de TODOS os sites.
// Elas saem do manifest da nossa cópia; o Chromium então nega essas APIs. Scripts de página continuam valendo
// (cada um só enxerga a página onde roda) e a rede da extensão é cortada em network_hub.js.
const CROSS_SITE = new Set([
  'tabs', 'history', 'cookies', 'webRequest', 'webRequestBlocking', 'webRequestAuthProvider', 'webNavigation', 'management',
  'topSites', 'sessions', 'browsingData', 'clipboardRead', 'proxy', 'debugger', 'nativeMessaging', 'pageCapture',
  'tabCapture', 'desktopCapture', 'declarativeNetRequestFeedback', 'processes',
]);
function isolate(m) {
  const removed = [];
  for (const key of ['permissions', 'optional_permissions']) {
    if (!Array.isArray(m[key])) continue;
    m[key] = m[key].filter((p) => !CROSS_SITE.has(p) || (removed.push(p), false));
  }
  // sites conversando direto com a extensão e atualização automática (contato com servidor de fora)
  for (const key of ['externally_connectable', 'update_url']) delete m[key];
  return [...new Set(removed)];
}

// ---------- Firefox: `browser.*` com Promise e fundo em service worker ----------
const SHIM = 'evl_browser.js';
const SHIM_CODE = `// Evl: extensões do Firefox usam browser.* (com Promise); o Chromium só tem chrome.*.
if (typeof globalThis.browser === 'undefined' && typeof chrome !== 'undefined') {
  const wrap = (o) => new Proxy(o, { get(t, k) {
    const v = t[k];
    if (typeof v === 'function') return (...a) => {
      if (typeof a[a.length - 1] === 'function') return v.apply(t, a);
      let ok, bad;
      const p = new Promise((res, rej) => { ok = res; bad = rej; });
      try {
        v.call(t, ...a, (r) => (chrome.runtime.lastError ? bad(new Error(chrome.runtime.lastError.message)) : ok(r)));
        return p;
      } catch { return v.apply(t, a); } // função sem callback (getURL, getManifest...)
    };
    return v && typeof v === 'object' ? wrap(v) : v;
  } });
  globalThis.browser = chrome.runtime.getManifest().manifest_version >= 3 ? chrome : wrap(chrome);
}
`;

function adaptFirefox(root, m) {
  if (!m.browser_specific_settings && !m.applications) return;
  delete m.browser_specific_settings;
  delete m.applications;
  fs.writeFileSync(path.join(root, SHIM), SHIM_CODE);
  const first = (list) => [SHIM, ...list.filter((x) => x !== SHIM)];
  for (const c of Array.isArray(m.content_scripts) ? m.content_scripts : []) if (Array.isArray(c?.js)) c.js = first(c.js);
  const bg = m.background;
  if (Array.isArray(bg?.scripts)) {
    if (m.manifest_version >= 3) {
      // o Firefox aceita background.scripts no manifest v3; o Chromium exige um service worker
      const mod = bg.type === 'module';
      const lines = first(bg.scripts).map((s) => (mod ? `import ${JSON.stringify(`./${s.replace(/^\/+/, '')}`)};` : `importScripts(${JSON.stringify(s)});`));
      fs.writeFileSync(path.join(root, 'evl_sw.js'), `${lines.join('\n')}\n`);
      m.background = { service_worker: 'evl_sw.js', ...(mod ? { type: 'module' } : {}) };
    } else bg.scripts = first(bg.scripts);
  }
  // páginas da extensão (popup, opções, fundo): o shim entra antes do primeiro script
  const p = pagesOf(m);
  for (const page of [p.popup, p.options, bg?.page]) {
    try {
      const file = path.join(root, page.split(/[?#]/)[0]);
      const html = fs.readFileSync(file, 'utf8');
      if (file.startsWith(root + path.sep) && !html.includes(SHIM)) fs.writeFileSync(file, html.replace(/<script/i, `<script src="/${SHIM}"></script><script`));
    } catch {}
  }
}

// Popup e página de opções (caminhos dentro da extensão), para abrir numa aba.
function pagesOf(m) {
  const clean = (v) => (typeof v === 'string' && v ? v.replace(/^\/+/, '') : null);
  return {
    popup: clean(m.action?.default_popup ?? m.browser_action?.default_popup ?? m.page_action?.default_popup),
    options: clean(m.options_ui?.page ?? m.options_page),
  };
}

// Aplica o isolamento e a adaptação na cópia instalada. Devolve as permissões tiradas. Pode rodar de novo sem efeito.
function secure(root) {
  const file = path.join(root, 'manifest.json');
  const before = stripBom(fs.readFileSync(file, 'utf8'));
  const m = JSON.parse(before);
  const removed = isolate(m);
  adaptFirefox(root, m);
  const after = JSON.stringify(m, null, 2);
  if (JSON.stringify(JSON.parse(before)) !== JSON.stringify(m)) fs.writeFileSync(file, after);
  return removed;
}

// Resumo do que a extensão pode acessar (para avisar a pessoa): todos os sites e permissões sensíveis.
const ALL_SITES = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/;
const SENSITIVE = ['cookies', 'webRequest', 'webRequestBlocking', 'tabs', 'history', 'scripting', 'management', 'clipboardRead'];
function accessOf(m) {
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const hosts = [
    ...strings(m.host_permissions),
    ...strings(m.permissions),
    ...strings(m.optional_host_permissions),
    ...(Array.isArray(m.content_scripts) ? m.content_scripts.flatMap((c) => strings(c?.matches)) : []),
  ];
  const perms = strings(m.permissions);
  return {
    allSites: hosts.some((h) => ALL_SITES.test(h)),
    perms: SENSITIVE.filter((p) => perms.includes(p)),
  };
}

function readManifest(root) {
  const m = JSON.parse(stripBom(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')));
  const name = (typeof m.name === 'string' && localizedName(root, m.name, m.default_locale)) || path.basename(root);
  return { name: name.slice(0, 80), version: String(m.version ?? ''), access: accessOf(m), pages: pagesOf(m) };
}

// `ext` é session.extensions (ou o próprio session nas versões antigas); `store` tem get/set.
function createExtensions({ ext, dir, store }) {
  const loaded = new Map(); // id nosso -> objeto Extension do Electron
  const errors = new Map();
  const items = () => store.get('list') ?? [];
  const save = (list) => store.set('list', list);

  async function load(item) {
    try {
      const e = await ext.loadExtension(path.join(dir, item.id), { allowFileAccess: false });
      loaded.set(item.id, e);
      errors.delete(item.id);
    } catch (err) {
      errors.set(item.id, String(err.message ?? err).slice(0, 160));
    }
  }
  async function unload(id) {
    const e = loaded.get(id);
    loaded.delete(id);
    if (!e) return;
    try {
      (ext.removeExtension ?? (() => {}))(e.id);
    } catch {}
  }

  // chrome-extension://<id do Chromium>/<popup ou opções>, só com a extensão carregada
  const pageUrl = (item, kind) => {
    const e = loaded.get(item.id);
    const file = item.pages?.[kind];
    return e && file ? `chrome-extension://${e.id}/${file}` : null;
  };

  return {
    pageUrl: (id, kind) => {
      const item = items().find((i) => i.id === id);
      return item ? pageUrl(item, kind) : null;
    },
    async loadAll() {
      // extensões instaladas antes de resolvermos __MSG_...__ ficaram com o nome da pasta: corrige
      const list = items();
      let changed = false;
      for (const item of list) {
        try {
          // extensões instaladas antes do isolamento passam por ele aqui (nada de permissão antiga sobrando)
          const removed = [...new Set([...(item.removed ?? []), ...secure(path.join(dir, item.id))])];
          const next = { ...item, ...readManifest(path.join(dir, item.id)), removed };
          if (JSON.stringify(next) !== JSON.stringify(item)) {
            Object.assign(item, next);
            changed = true;
          }
        } catch {}
      }
      if (changed) save(list);
      await Promise.all(items().filter((i) => i.enabled).map(load));
    },
    list() {
      return items().map((i) => ({
        popup: pageUrl(i, 'popup'),
        options: pageUrl(i, 'options'),
        removed: i.removed ?? [],
        id: i.id,
        name: i.name,
        version: i.version,
        access: i.access ?? { allSites: false, perms: [] },
        enabled: i.enabled,
        loaded: loaded.has(i.id),
        error: errors.get(i.id) ?? null,
      }));
    },
    // `src`: pasta com manifest.json ou arquivo .zip/.crx (em Buffer via `buffer`).
    async install({ folder, buffer }) {
      fs.mkdirSync(dir, { recursive: true });
      const id = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const dest = path.join(dir, id);
      try {
        if (buffer) extractZip(buffer, dest);
        else fs.cpSync(folder, dest, { recursive: true });
        const root = findRoot(dest);
        if (root !== dest) {
          const tmp = `${dest}.tmp`;
          fs.renameSync(root, tmp);
          fs.rmSync(dest, { recursive: true, force: true });
          fs.renameSync(tmp, dest);
        }
        const removed = secure(dest);
        const item = { id, ...readManifest(dest), removed, enabled: true };
        save([...items(), item]);
        await load(item);
        return this.list().find((x) => x.id === id);
      } catch (err) {
        fs.rmSync(dest, { recursive: true, force: true });
        throw err;
      }
    },
    async setEnabled(id, enabled) {
      const list = items();
      const item = list.find((i) => i.id === id);
      if (!item) return false;
      item.enabled = enabled === true;
      save(list);
      if (item.enabled) await load(item);
      else await unload(id);
      return true;
    },
    async remove(id) {
      if (!items().some((i) => i.id === id)) return false;
      await unload(id);
      save(items().filter((i) => i.id !== id));
      fs.rmSync(path.join(dir, id), { recursive: true, force: true });
      return true;
    },
  };
}

module.exports = { createExtensions, parseAmoSlug, secure, isolate, pagesOf, parseStoreId, findRoot, readManifest, localizedName };
