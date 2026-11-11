// Cofre de senhas. Não depende do Electron: quem cifra é o `cipher` que o main.js entrega
// (safeStorage, que usa a proteção do próprio Windows/macOS/Linux), então dá para testar com `npm test`.
//
// Arquivo passwords.json: site e usuário em texto, a SENHA só cifrada. Quem lê o arquivo sem
// estar na sua conta do sistema não consegue abrir as senhas. A interface nunca recebe a senha
// na lista; só pede uma por vez (mostrar/copiar) e as páginas só recebem a do próprio site.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_ITEMS = 5000;
const LIMIT = { site: 253, username: 200, password: 500 };

// "https://www.Exemplo.com/login?x=1" ou "exemplo.com" -> "exemplo.com" (ou null se não for um site).
function normalizeSite(input) {
  const text = String(input ?? '').trim();
  if (!text || text.length > LIMIT.site) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') || host === 'localhost' ? host : null;
  } catch {
    return null;
  }
}

// CSV com aspas ("a,""b""", quebras de linha dentro de aspas, BOM, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

// Firefox: url,username,password,httpRealm,formActionOrigin,guid,timeCreated,...
// Chrome/Edge/Brave: name,url,username,password,note (Edge sem "note").
// Reconhece pelas colunas, então qualquer ordem serve. Devolve { entries, skipped }.
function parsePasswordCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('O arquivo está vazio.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iUrl = col('url', 'origin', 'login_uri', 'website');
  const iUser = col('username', 'login_username', 'user', 'login');
  const iPass = col('password', 'login_password');
  if (iUrl < 0 || iPass < 0) throw new Error('Não parece um CSV de senhas do Firefox ou do Chrome.');
  const entries = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const site = normalizeSite(r[iUrl]);
    const password = r[iPass] ?? '';
    if (!site || !password) {
      skipped++; // sem endereço de site (ex.: apps do Android) ou sem senha
      continue;
    }
    entries.push({ site, username: (iUser >= 0 ? r[iUser] : '') ?? '', password });
  }
  return { entries, skipped };
}

// cipher: { available(): boolean, encrypt(texto): string, decrypt(texto): string }
function createVault(file, cipher) {
  let items = null; // [{ id, site, username, secret, created }]

  function load() {
    if (items) return items;
    items = [];
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const i of Array.isArray(data) ? data : []) {
        if (i && typeof i.id === 'string' && typeof i.site === 'string' && typeof i.secret === 'string') {
          items.push({ id: i.id, site: i.site, username: String(i.username ?? ''), secret: i.secret, created: Number(i.created) || 0 });
        }
      }
    } catch {
      // sem arquivo (ou quebrado): começa vazio
    }
    return items;
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(items));
    } catch {
      // sem permissão de escrita: vale só até fechar o app
    }
  }

  // Cria ou, se já existir esse site + usuário, troca a senha. Devolve 'added' | 'updated'.
  function put({ site, username, password }) {
    const list = load();
    const old = list.find((i) => i.site === site && i.username === username);
    if (old) {
      old.secret = cipher.encrypt(password);
      return 'updated';
    }
    if (list.length >= MAX_ITEMS) throw new Error('Limite de senhas atingido.');
    list.push({ id: crypto.randomBytes(6).toString('hex'), site, username, secret: cipher.encrypt(password), created: Date.now() });
    return 'added';
  }

  function check(input) {
    const site = normalizeSite(input?.site);
    const username = String(input?.username ?? '').trim();
    const password = String(input?.password ?? '');
    if (!site) throw new Error('Site inválido. Exemplo: exemplo.com');
    if (username.length > LIMIT.username) throw new Error('Usuário grande demais.');
    if (!password) throw new Error('Escreva a senha.');
    if (password.length > LIMIT.password) throw new Error('Senha grande demais.');
    return { site, username, password };
  }

  return {
    available: () => cipher.available(),
    // Sem as senhas: só o que a tela precisa.
    list: () =>
      load()
        .map(({ id, site, username }) => ({ id, site, username }))
        .sort((a, b) => a.site.localeCompare(b.site) || a.username.localeCompare(b.username)),
    add(input) {
      if (!cipher.available()) throw new Error('O cofre do sistema não está disponível.');
      const result = put(check(input));
      save();
      return result;
    },
    importCsv(text) {
      if (!cipher.available()) throw new Error('O cofre do sistema não está disponível.');
      const { entries, skipped } = parsePasswordCsv(text);
      let added = 0;
      let updated = 0;
      let rejected = skipped;
      for (const e of entries) {
        try {
          if (put(check(e)) === 'added') added++;
          else updated++;
        } catch {
          rejected++;
        }
      }
      save();
      return { added, updated, skipped: rejected };
    },
    reveal(id) {
      const item = load().find((i) => i.id === id);
      return item ? cipher.decrypt(item.secret) : null;
    },
    // Logins guardados para um site (nome sem "www."). Sem senhas.
    forSite(host) {
      const site = normalizeSite(host);
      return site ? load().filter((i) => i.site === site).map(({ id, username }) => ({ id, username })) : [];
    },
    // Credencial para preencher, só se o item for mesmo desse site.
    credential(id, host) {
      const site = normalizeSite(host);
      const item = load().find((i) => i.id === id);
      if (!item || !site || item.site !== site) return null;
      return { username: item.username, password: cipher.decrypt(item.secret) };
    },
    remove(id) {
      const list = load();
      const i = list.findIndex((x) => x.id === id);
      if (i === -1) return false;
      list.splice(i, 1);
      save();
      return true;
    },
    clear() {
      items = [];
      save();
    },
  };
}

module.exports = { createVault, normalizeSite, parsePasswordCsv, parseCsv };
