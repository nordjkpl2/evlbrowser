// Pedido de permissão de sites (microfone, câmera, localização...), como o Firefox.
// Sem Electron aqui dentro: tudo chega por parâmetro, então dá para testar com `npm test`.
//
// Respostas lembradas ficam em settings.json: "sitePerms": { origem: { microphone: true, ... } }.

// Permissões que perguntamos; as demais continuam negadas (exceto as de ALLOWED).
const PROMPTABLE = new Set(['media', 'geolocation', 'notifications', 'midi', 'clipboard-read']);
const ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write']);
// O que aparece no painel ao lado da estrela, nesta ordem.
const KINDS = ['microphone', 'camera', 'geolocation', 'notifications', 'midi', 'clipboard-read'];

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

  let panel = false; // painel aberto pela pessoa (botão ao lado da estrela)
  const sync = () => getTabs()?.setPrompt(panel || !!current);

  function showNext() {
    if (current || queue.length === 0) return;
    current = queue.shift();
    send('perm:ask', view(current));
    sync();
  }

  const originOf = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
    } catch {
      return null;
    }
  };

  // Permissões do site de uma página: { host, perms: { microphone: true | false | null, ... } }, ou null.
  function siteState(url) {
    const u = originOf(url);
    if (!u) return null;
    const saved = getStore().get('sitePerms')?.[u.origin] ?? {};
    return { host: u.host, perms: Object.fromEntries(KINDS.map((k) => [k, typeof saved[k] === 'boolean' ? saved[k] : null])) };
  }

  // value: true = permitir, false = bloquear, null = perguntar de novo.
  function setSite(url, kind, value) {
    const u = originOf(url);
    if (!u || !KINDS.includes(kind) || !(value === null || typeof value === 'boolean')) return false;
    const all = { ...(getStore().get('sitePerms') ?? {}) };
    const site = { ...all[u.origin] };
    if (value === null) delete site[kind];
    else site[kind] = value;
    if (Object.keys(site).length) all[u.origin] = site;
    else delete all[u.origin];
    getStore().set('sitePerms', all);
    return true;
  }

  // Sites com resposta lembrada (cartão em Configurações > Privacidade).
  const list = () =>
    Object.entries(getStore().get('sitePerms') ?? {}).map(([origin, p]) => ({
      origin,
      allowed: KINDS.filter((k) => p[k] === true),
      blocked: KINDS.filter((k) => p[k] === false),
    }));
  function forget(origin) {
    const all = { ...(getStore().get('sitePerms') ?? {}) };
    delete all[origin];
    getStore().set('sitePerms', all);
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
      sync();
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
    siteState,
    setSite,
    list,
    forget,
    setPanel(open) {
      panel = open === true;
      sync();
    },
    answer: (id, allow, remember) => current?.id === id && finish(current, allow === true, remember === true),
    pending: () => (current ? view(current) : null),
  };
}

// ctx: { ipcMain, fromUi, session, getStore, getTabs, send, getActiveUrl(): endereço da aba ativa, refresh(): redesenha a interface }
function registerPermissionIpc({ ipcMain, fromUi, session, getStore, getTabs, send, getActiveUrl = () => '', refresh = () => {} }) {
  const perms = createPermissions({ getStore, getTabs, send });
  ipcMain.on('perm:answer', (event, id, allow, remember) => {
    if (fromUi(event)) perms.answer(id, allow, remember);
  });
  ipcMain.on('perm:panel', (event, open) => fromUi(event) && perms.setPanel(open === true));
  // Muda uma permissão do site da aba ativa (painel ao lado da estrela).
  ipcMain.on('perm:set', (event, kind, value) => {
    if (fromUi(event) && perms.setSite(getActiveUrl(), kind, value)) refresh();
  });
  ipcMain.handle('perm:list', (event) => (fromUi(event) ? perms.list() : []));
  ipcMain.handle('perm:forget', (event, origin) => {
    if (fromUi(event) && typeof origin === 'string') perms.forget(origin);
    refresh();
  });
  ipcMain.handle('perm:clear', (event) => {
    if (fromUi(event)) getStore().set('sitePerms', {});
    refresh();
  });
  return {
    pending: perms.pending,
    siteState: perms.siteState,
    // chamar quando o app estiver pronto (a sessão só existe depois)
    // ses: a sessão padrão ou a de um perfil (cada uma precisa dos seus handlers)
    install(ses = session.defaultSession) {
      ses.setPermissionRequestHandler(perms.ask);
      ses.setPermissionCheckHandler((_wc, permission, origin, details) => perms.check(permission, origin, details));
    },
  };
}

module.exports = { KINDS, PROMPTABLE, permKinds, createPermissions, registerPermissionIpc };
