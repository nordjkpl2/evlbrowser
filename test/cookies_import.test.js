// Testa a importação de cookies com bancos de mentira (rode: npm test).
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { importCookies } = require('../src/data/cookies_import');

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch { /* sem SQLite neste Node: testes pulados */ }

const NOW = Date.UTC(2026, 10, 11); // fixo
const nowSec = NOW / 1000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evl-ct-'));

test('Firefox: importa normais e de sessão; ignora vencidos e contêineres', { skip: !sqlite }, async () => {
  const appData = tmp();
  const root = path.join(appData, 'Mozilla', 'Firefox');
  const prof = path.join(root, 'Profiles', 'abc.default-release');
  fs.mkdirSync(prof, { recursive: true });
  fs.writeFileSync(path.join(root, 'profiles.ini'),
    '[Profile1]\nName=velho\nIsRelative=1\nPath=Profiles/velho\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abc.default-release\nDefault=1\n');
  const db = new sqlite.DatabaseSync(path.join(prof, 'cookies.sqlite'));
  db.exec('CREATE TABLE moz_cookies (name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER, originAttributes TEXT)');
  const ins = db.prepare('INSERT INTO moz_cookies VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run('sid', 'v1', '.exemplo.com', '/', nowSec + 1000, 1, 1, 1, '');
  ins.run('sessao', 'v2', 'app.exemplo.com', '/x', 0, 0, 0, 0, '');
  ins.run('velho', 'v3', '.exemplo.com', '/', nowSec - 5, 0, 0, 0, '');
  ins.run('conteiner', 'v4', '.exemplo.com', '/', nowSec + 1000, 0, 0, 0, '^userContextId=2');
  db.close();

  const got = [];
  const r = await importCookies('firefox', { appData }, async (c) => { got.push(c); }, NOW);
  assert.deepStrictEqual(r, { imported: 2, skipped: 1, encrypted: 0 });
  const sid = got.find((c) => c.name === 'sid');
  assert.deepStrictEqual(sid, { url: 'https://exemplo.com/', name: 'sid', value: 'v1', path: '/', secure: true, httpOnly: true, sameSite: 'lax', domain: '.exemplo.com', expirationDate: nowSec + 1000 });
  const sess = got.find((c) => c.name === 'sessao');
  assert.strictEqual(sess.url, 'http://app.exemplo.com/x');
  assert.strictEqual(sess.domain, undefined, 'cookie só do host não leva domain');
  assert.strictEqual(sess.expirationDate, undefined, 'sessão não leva validade');
});

test('Firefox: sem perfil dá erro claro', async () => {
  await assert.rejects(importCookies('firefox', { appData: tmp() }, async () => {}, NOW), /Firefox/);
});

test('Chromium: importa só os sem criptografia; conta os protegidos', { skip: !sqlite }, async () => {
  const local = tmp();
  const dir = path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Network');
  fs.mkdirSync(dir, { recursive: true });
  const db = new sqlite.DatabaseSync(path.join(dir, 'Cookies'));
  db.exec('CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER)');
  const ins = db.prepare('INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?)');
  const chromeTime = (sec) => (sec + 11644473600) * 1000000; // maior que 2^53: precisa converter no SQL
  ins.run('.site.com', 'claro', 'abc', new Uint8Array(0), '/', chromeTime(nowSec + 1000), 1, 0, 2);
  ins.run('.site.com', 'cifrado', '', new Uint8Array([0x76, 0x31, 0x30, 1, 2, 3]), '/', chromeTime(nowSec + 1000), 1, 1, -1);
  ins.run('.site.com', 'vencido', 'x', new Uint8Array(0), '/', chromeTime(nowSec - 10), 0, 0, 0);
  db.close();

  const got = [];
  const r = await importCookies('chromium', { localAppData: local }, async (c) => { got.push(c); }, NOW);
  assert.deepStrictEqual(r, { imported: 1, skipped: 1, encrypted: 1 });
  assert.strictEqual(got[0].name, 'claro');
  assert.strictEqual(got[0].sameSite, 'strict');
  assert.strictEqual(got[0].expirationDate, nowSec + 1000);
});

test('Chromium: sem navegador instalado dá erro claro; falhas do setCookie contam como ignorados', { skip: !sqlite }, async () => {
  await assert.rejects(importCookies('chromium', { localAppData: tmp() }, async () => {}, NOW), /Chrome|Chromium/);

  const appData = tmp();
  const prof = path.join(appData, 'Mozilla', 'Firefox', 'Profiles', 'p');
  fs.mkdirSync(prof, { recursive: true });
  fs.writeFileSync(path.join(appData, 'Mozilla', 'Firefox', 'profiles.ini'), '[Profile0]\nIsRelative=1\nPath=Profiles/p\nDefault=1\n');
  const db = new sqlite.DatabaseSync(path.join(prof, 'cookies.sqlite'));
  db.exec('CREATE TABLE moz_cookies (name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER, originAttributes TEXT)');
  db.prepare('INSERT INTO moz_cookies VALUES (?,?,?,?,?,?,?,?,?)').run('a', '1', 'x.com', '/', 0, 0, 0, 0, '');
  db.prepare('INSERT INTO moz_cookies VALUES (?,?,?,?,?,?,?,?,?)').run('b', '2', 'x.com', '/', 0, 0, 0, 0, '');
  db.close();
  const r = await importCookies('firefox', { appData }, async (c) => { if (c.name === 'b') throw new Error('recusado'); }, NOW);
  assert.deepStrictEqual(r, { imported: 1, skipped: 1, encrypted: 0 });
});

// ---------- arquivo .json (formato do Cookie-Editor) ----------
const { importCookiesFromJson, parseCookieJson } = require('../src/data/cookies_import');

const jsonCookie = (extra) => ({
  name: 'n', value: 'v', domain: 'github.com', hostOnly: true, path: '/', secure: true, httpOnly: true,
  sameSite: 'lax', session: false, firstPartyDomain: '', partitionKey: null, expirationDate: nowSec + 1000, storeId: null, ...extra,
});

test('JSON: domínio x só do host, sessão, sameSite e validade', () => {
  const text = JSON.stringify([
    jsonCookie({ name: 'dom', domain: '.github.com', hostOnly: false, sameSite: 'no_restriction' }),
    jsonCookie({ name: 'host', domain: 'github.com', hostOnly: true }),
    jsonCookie({ name: 'sess', session: true, expirationDate: undefined, sameSite: 'unspecified' }),
    jsonCookie({ name: 'semponto', domain: 'x.com', hostOnly: false, sameSite: 'None' }),
  ]);
  const { cookies, skipped } = parseCookieJson(text, NOW);
  assert.strictEqual(skipped, 0);
  const by = Object.fromEntries(cookies.map((c) => [c.name, c]));
  assert.strictEqual(by.dom.domain, '.github.com');
  assert.strictEqual(by.dom.sameSite, 'no_restriction');
  assert.strictEqual(by.host.domain, undefined, 'só do host não leva domain');
  assert.strictEqual(by.host.url, 'https://github.com/');
  assert.strictEqual(by.host.expirationDate, nowSec + 1000);
  assert.strictEqual(by.sess.expirationDate, undefined);
  assert.strictEqual(by.sess.sameSite, 'unspecified');
  assert.strictEqual(by.semponto.domain, '.x.com', 'hostOnly:false ganha o ponto');
  assert.strictEqual(by.semponto.sameSite, 'no_restriction');
});

test('JSON: ignora vencidos, particionados e incompletos; aceita { cookies: [...] }', async () => {
  const text = JSON.stringify({ cookies: [
    jsonCookie({ name: 'ok' }),
    jsonCookie({ name: 'velho', expirationDate: nowSec - 1 }),
    jsonCookie({ name: 'part', partitionKey: { topLevelSite: 'https://a.com' } }),
    { name: 'semdominio', value: 'x' },
    'lixo',
    jsonCookie({ name: 'recusado' }),
  ] });
  const got = [];
  const r = await importCookiesFromJson(text, async (c) => { if (c.name === 'recusado') throw new Error('x'); got.push(c.name); }, NOW);
  assert.deepStrictEqual(got, ['ok']);
  assert.deepStrictEqual(r, { imported: 1, skipped: 5, encrypted: 0 });
});

test('JSON: arquivo inválido dá erro claro', () => {
  assert.throws(() => parseCookieJson('{ não é json'), /JSON válido/);
  assert.throws(() => parseCookieJson('{"a":1}'), /lista de cookies/);
});
