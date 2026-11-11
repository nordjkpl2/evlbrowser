// Pedido de permissão de sites (microfone, câmera, localização...), como o Firefox.
// Sem Electron aqui dentro: tudo chega por parâmetro, então dá para testar com `npm test`.
//
// Respostas lembradas ficam em settings.json: "sitePerms": { origem: { microphone: true, ... } }.

// Permissões que perguntamos; as demais continuam negadas (exceto as de ALLOWED).
const PROMPTABLE = new Set(['media', 'geolocation', 'notifications', 'midi', 'clipboard-read']);
const ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write']);

// 'media' vira câmera e/ou microfone; as outras usam o próprio nome.
function permKinds(permission, details) {
  if (permission !== 'media') return [permission];
  const types = details?.mediaTypes ?? [];
  const kinds = [types.includes('video') && 'camera', types.includes('audio') && 'microphone'].filter(Boolean);
  return kinds.length ? kinds : ['microphone'];
}

// ctx: { getStore, getTabs, send } — getTabs() devolve o TabManager; send(canal, dados) fala com a interface.
function createPermissions({ getStore, getTabs, send }) {
  const queue = [];
  let current = null;
  let seq = 0;

  // true/false = já decidido antes; null = perguntar
  function sitePerm(origin, kinds) {
    const saved = getStore().get('sitePerms')?.[origin];
    if (!saved) return null;
    if (kinds.some((k) => saved[k] === false)) return false;
    return kinds.every((k) => saved[k] === true) ? true : null;
  }

  const view = (entry) => ({ id: entry.id, host: entry.host, kinds: entry.kinds });

  function showNext() {
    if (current || queue.length === 0) return;
    current = queue.shift();
    send('perm:ask', view(current));
    getTabs()?.setPrompt(true);
  }

  function finish(entry, allow, remember) {
    if (entry.done) return;
    entry.done = true;
    entry.callback(allow);
    if (remember) {
      const all = { ...(getStore().get('sitePerms') ?? {}) };
      all[entry.origin] = { ...all[entry.origin], ...Object.fromEntries(entry.kinds.map((k) => [k, allow])) };
      getStore().set('sitePerms', all);
    }
    const i = queue.indexOf(entry);
    if (i >= 0) queue.splice(i, 1);
    if (current === entry) {
      current = null;
      send('perm:close');
      getTabs()?.setPrompt(false);
      showNext();
    }
  }

  // setPermissionRequestHandler(wc, permission, callback, details)
  function ask(wc, permission, callback, details) {
    if (ALLOWED.has(permission)) return callback(true);
    if (!PROMPTABLE.has(permission) || wc.isDestroyed()) return callback(false);
    let url;
    try {
      url = new URL(details?.requestingUrl || wc.getURL());
    } catch {
      return callback(false);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return callback(false);
    const kinds = permKinds(permission, details);
    const saved = sitePerm(url.origin, kinds);
    if (saved !== null) return callback(saved);
    // só a aba que você está vendo pode perguntar; as de fundo são negadas sem barulho
    const tabs = getTabs();
    if (wc !== tabs?.tabs.get(tabs.activeId)?.view?.webContents) return callback(false);
    const entry = { id: ++seq, origin: url.origin, host: url.host, kinds, callback, done: false };
    const cancel = () => finish(entry, false, false);
    wc.once('did-navigate', cancel); // saiu da página: o pedido some
    wc.once('destroyed', cancel);
    queue.push(entry);
    showNext();
  }

  // setPermissionCheckHandler: só libera o que a pessoa já permitiu e lembrou
  function check(permission, origin, details) {
    if (!PROMPTABLE.has(permission)) return true;
    const kinds = permission === 'media' ? [details?.mediaType === 'video' ? 'camera' : 'microphone'] : [permission];
    return sitePerm(origin, kinds) === true;
  }

  return {
    ask,
    check,
    sitePerm,
    answer: (id, allow, remember) => current?.id === id && finish(current, allow === true, remember === true),
    pending: () => (current ? view(current) : null),
  };
}

// ctx: { ipcMain, fromUi, session, getStore, getTabs, send }
function registerPermissionIpc({ ipcMain, fromUi, session, getStore, getTabs, send }) {
  const perms = createPermissions({ getStore, getTabs, send });
  ipcMain.on('perm:answer', (event, id, allow, remember) => {
    if (fromUi(event)) perms.answer(id, allow, remember);
  });
  ipcMain.handle('perm:count', (event) => (fromUi(event) ? Object.keys(getStore().get('sitePerms') ?? {}).length : 0));
  ipcMain.handle('perm:clear', (event) => {
    if (fromUi(event)) getStore().set('sitePerms', {});
  });
  return {
    pending: perms.pending,
    // chamar quando o app estiver pronto (a sessão só existe depois)
    install() {
      session.defaultSession.setPermissionRequestHandler(perms.ask);
      session.defaultSession.setPermissionCheckHandler((_wc, permission, origin, details) => perms.check(permission, origin, details));
    },
  };
}

module.exports = { PROMPTABLE, permKinds, createPermissions, registerPermissionIpc };
