// Extensões do Chromium. O Electron só carrega extensões DESCOMPACTADAS e com suporte parcial
// às APIs (sem botão/popup na barra). Guardamos uma cópia de cada uma e recarregamos ao abrir.

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

function readManifest(root) {
  const m = JSON.parse(stripBom(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')));
  const name = (typeof m.name === 'string' && localizedName(root, m.name, m.default_locale)) || path.basename(root);
  return { name: name.slice(0, 80), version: String(m.version ?? '') };
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

  return {
    async loadAll() {
      // extensões instaladas antes de resolvermos __MSG_...__ ficaram com o nome da pasta: corrige
      const list = items();
      let changed = false;
      for (const item of list) {
        try {
          const info = readManifest(path.join(dir, item.id));
          if (info.name !== item.name || info.version !== item.version) {
            Object.assign(item, info);
            changed = true;
          }
        } catch {}
      }
      if (changed) save(list);
      await Promise.all(items().filter((i) => i.enabled).map(load));
    },
    list() {
      return items().map((i) => ({
        id: i.id,
        name: i.name,
        version: i.version,
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
        const info = readManifest(dest);
        const item = { id, name: info.name, version: info.version, enabled: true };
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

module.exports = { createExtensions, parseStoreId, findRoot, readManifest, localizedName };
