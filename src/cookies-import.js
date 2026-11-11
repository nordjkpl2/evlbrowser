// Importa cookies de outros navegadores (Firefox e Chromium/Chrome/Edge/Brave...).
// Não depende do Electron: recebe `setCookie(detalhes)` (main.js passa session.cookies.set),
// então dá para testar só com `npm test`. Os valores dos cookies nunca vão para a interface.
//
// Firefox guarda os valores em texto puro (cookies.sqlite) e dá para importar.
// Chromium/Chrome/Edge guardam os valores CRIPTOGRAFADOS com uma chave presa ao próprio
// navegador; esses não dá para ler aqui. Só entram os (raros) cookies sem criptografia,
// e o resto é contado em `encrypted` para a interface avisar.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_COOKIES = 20000;

// Copia o banco para uma pasta temporária (o navegador de origem mantém o original
// travado) e abre a cópia. A pasta temporária é apagada no fim.
function withDb(file, fn) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    throw new Error('Esta versão do Electron não consegue ler bancos SQLite.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evl-ck-'));
  try {
    const copy = path.join(dir, 'db.sqlite');
    fs.copyFileSync(file, copy);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(file + ext)) fs.copyFileSync(file + ext, copy + ext);
    }
    const db = new DatabaseSync(copy);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Detalhes no formato de session.cookies.set().
function details({ host, name, value, path: cpath, expires, secure, httpOnly, sameSite }) {
  const bare = host.replace(/^\./, '');
  const p = cpath || '/';
  const d = {
    url: `${secure ? 'https' : 'http'}://${bare}${p}`,
    name,
    value,
    path: p,
    secure: !!secure,
    httpOnly: !!httpOnly,
    sameSite,
  };
  if (host.startsWith('.')) d.domain = host; // cookie de domínio (vale para subdomínios)
  if (expires > 0) d.expirationDate = expires; // sem isso, é cookie de sessão
  return d;
}

// ---------- Firefox ----------

// Acha a pasta do perfil em uso lendo o profiles.ini.
function firefoxProfileDir(appData) {
  const root = path.join(appData, 'Mozilla', 'Firefox');
  let ini;
  try {
    ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8');
  } catch {
    return null;
  }
  const sections = [];
  let cur = null;
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      cur = { name: head[1], v: {} };
      sections.push(cur);
    } else if (cur && line.includes('=')) {
      const i = line.indexOf('=');
      cur.v[line.slice(0, i)] = line.slice(i + 1);
    }
  }
  const profileDir = (s) =>
    s.v.Path ? (s.v.IsRelative === '0' ? s.v.Path : path.join(root, s.v.Path)) : null;
  const candidates = [
    ...sections.filter((s) => s.name.startsWith('Install') && s.v.Default).map((s) => path.join(root, s.v.Default)),
    ...sections.filter((s) => s.name.startsWith('Profile') && s.v.Default === '1').map(profileDir),
    ...sections.filter((s) => s.name.startsWith('Profile')).map(profileDir),
  ];
  return candidates.find((dir) => dir && fs.existsSync(path.join(dir, 'cookies.sqlite'))) ?? null;
}

function readFirefox(appData, now) {
  const dir = firefoxProfileDir(appData);
  if (!dir) throw new Error('Não encontrei um perfil do Firefox neste computador.');
  const SAME = ['no_restriction', 'lax', 'strict'];
  const out = [];
  let skipped = 0;
  withDb(path.join(dir, 'cookies.sqlite'), (db) => {
    // originAttributes vazio = cookies normais (ignora contêineres e abas privadas)
    const rows = db
      .prepare(
        `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
         FROM moz_cookies WHERE originAttributes = ''`
      )
      .all();
    for (const r of rows) {
      const expires = r.expiry > 1e11 ? r.expiry / 1000 : r.expiry; // alguns guardam em ms
      if (expires > 0 && expires < now / 1000) {
        skipped++; // já venceu
        continue;
      }
      out.push(details({ ...r, expires, secure: r.isSecure, httpOnly: r.isHttpOnly, sameSite: SAME[r.sameSite] ?? 'unspecified' }));
    }
  });
  return { cookies: out, skipped, encrypted: 0 };
}

// ---------- Chromium (Chrome, Edge, Brave, Vivaldi...) ----------

const CHROMIUM_APPS = [
  ['Google', 'Chrome'],
  ['Microsoft', 'Edge'],
  ['BraveSoftware', 'Brave-Browser'],
  ['Chromium'],
  ['Vivaldi'],
];

function chromiumDbs(localAppData) {
  if (!localAppData) return [];
  const found = [];
  for (const app of CHROMIUM_APPS) {
    const base = path.join(localAppData, ...app, 'User Data', 'Default');
    const file = [path.join(base, 'Network', 'Cookies'), path.join(base, 'Cookies')].find((f) => fs.existsSync(f));
    if (file) found.push(file);
  }
  return found;
}

function readChromium(localAppData, now) {
  const dbs = chromiumDbs(localAppData);
  if (dbs.length === 0) throw new Error('Não encontrei Chrome, Edge, Brave nem Chromium neste computador.');
  const SAME = { 0: 'no_restriction', 1: 'lax', 2: 'strict' }; // -1 = sem definição
  const out = [];
  let skipped = 0;
  let encrypted = 0;
  for (const file of dbs) {
    withDb(file, (db) => {
      // expires_utc é em microssegundos desde 1601: converte no SQL para segundos desde 1970
      const rows = db
        .prepare(
          `SELECT host_key, name, value, encrypted_value, path, is_secure, is_httponly, samesite,
                  CASE WHEN expires_utc = 0 THEN 0 ELSE expires_utc / 1000000 - 11644473600 END AS expires
           FROM cookies`
        )
        .all();
      for (const r of rows) {
        if (r.encrypted_value && r.encrypted_value.length > 0) {
          encrypted++; // valor protegido pelo navegador de origem
          continue;
        }
        if (r.expires > 0 && r.expires < now / 1000) {
          skipped++;
          continue;
        }
        out.push(details({ host: r.host_key, name: r.name, value: r.value, path: r.path, expires: r.expires, secure: r.is_secure, httpOnly: r.is_httponly, sameSite: SAME[r.samesite] ?? 'unspecified' }));
      }
    });
  }
  return { cookies: out, skipped, encrypted };
}

// ---------- arquivo .json (formato do Cookie-Editor / EditThisCookie) ----------
// Lista de objetos { name, value, domain, hostOnly, path, secure, httpOnly, sameSite,
// session, expirationDate, partitionKey... }. Também aceita { "cookies": [ ... ] }.

const SAME_JSON = { strict: 'strict', lax: 'lax', no_restriction: 'no_restriction', none: 'no_restriction' };

function parseCookieJson(text, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const list = Array.isArray(data) ? data : data?.cookies;
  if (!Array.isArray(list)) throw new Error('Formato não reconhecido: esperava uma lista de cookies.');

  const cookies = [];
  let skipped = 0;
  for (const c of list) {
    const valid = c && typeof c.name === 'string' && c.name && typeof c.domain === 'string' && c.domain && typeof c.value === 'string';
    if (!valid || c.partitionKey) {
      skipped++; // incompleto, ou cookie particionado (CHIPS), que o Electron não recebe
      continue;
    }
    const expires = c.session ? 0 : Number(c.expirationDate) || 0;
    if (expires > 0 && expires < now / 1000) {
      skipped++; // já venceu
      continue;
    }
    const domainCookie = c.hostOnly === false || (c.hostOnly === undefined && c.domain.startsWith('.'));
    const host = domainCookie ? (c.domain.startsWith('.') ? c.domain : '.' + c.domain) : c.domain.replace(/^\./, '');
    cookies.push(
      details({
        host,
        name: c.name,
        value: c.value,
        path: typeof c.path === 'string' && c.path ? c.path : '/',
        expires,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: SAME_JSON[String(c.sameSite ?? '').toLowerCase()] ?? 'unspecified',
      })
    );
  }
  return { cookies, skipped, encrypted: 0 };
}

// ---------- aplicar ----------

// Grava os cookies lidos (em blocos de 50). O que o navegador recusar conta como ignorado.
async function applyAll(read, setCookie) {
  let { cookies, skipped } = read;
  if (cookies.length > MAX_COOKIES) {
    skipped += cookies.length - MAX_COOKIES;
    cookies = cookies.slice(0, MAX_COOKIES);
  }
  let imported = 0;
  for (let i = 0; i < cookies.length; i += 50) {
    const results = await Promise.allSettled(cookies.slice(i, i + 50).map(setCookie));
    for (const r of results) r.status === 'fulfilled' ? imported++ : skipped++;
  }
  return { imported, skipped, encrypted: read.encrypted };
}

// kind: 'firefox' | 'chromium'. env: { appData, localAppData }.
// Devolve { imported, skipped, encrypted } ou lança Error com mensagem para a pessoa.
async function importCookies(kind, env, setCookie, now = Date.now()) {
  const read = kind === 'firefox' ? readFirefox(env.appData, now) : readChromium(env.localAppData, now);
  return applyAll(read, setCookie);
}

async function importCookiesFromJson(text, setCookie, now = Date.now()) {
  return applyAll(parseCookieJson(text, now), setCookie);
}

module.exports = { importCookies, importCookiesFromJson, parseCookieJson, firefoxProfileDir };
