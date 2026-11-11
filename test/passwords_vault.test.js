const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createVault, normalizeSite, parsePasswordCsv } = require('../src/data/passwords_vault');

const cipher = {
  available: () => true,
  encrypt: (t) => Buffer.from(`enc:${t}`).toString('base64'),
  decrypt: (b) => Buffer.from(b, 'base64').toString().slice(4),
};
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'evl-pw-')), 'passwords.json');

test('normalizeSite aceita endereço completo ou só o site', () => {
  assert.strictEqual(normalizeSite('https://www.Exemplo.com/login?a=1'), 'exemplo.com');
  assert.strictEqual(normalizeSite('exemplo.com'), 'exemplo.com');
  assert.strictEqual(normalizeSite('android://abc@com.app/'), null);
  assert.strictEqual(normalizeSite('javascript:alert(1)'), null);
  assert.strictEqual(normalizeSite('semponto'), null);
});

test('CSV do Firefox', () => {
  const csv =
    '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n' +
    '"https://accounts.exemplo.com","ana","s,3""nha","","https://accounts.exemplo.com","{1}","1","2","3"\n' +
    '"https://outro.org","bia","abc","","","{2}","1","2","3"\n';
  const { entries, skipped } = parsePasswordCsv(csv);
  assert.strictEqual(skipped, 0);
  assert.deepStrictEqual(entries[0], { site: 'accounts.exemplo.com', username: 'ana', password: 's,3"nha' });
  assert.strictEqual(entries[1].site, 'outro.org');
});

test('CSV do Chrome (BOM, CRLF, app do Android e senha vazia ficam de fora)', () => {
  const csv =
    '﻿name,url,username,password,note\r\n' +
    'exemplo,https://exemplo.com/login,ana,123,\r\n' +
    'app,android://hash@com.app/,ana,456,\r\n' +
    'vazio,https://vazio.com,ana,,\r\n';
  const { entries, skipped } = parsePasswordCsv(csv);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(skipped, 2);
  assert.throws(() => parsePasswordCsv('a,b\n1,2'), /CSV de senhas/);
});

test('cofre: criar, listar sem senha, revelar, atualizar, importar e remover', () => {
  const file = tmp();
  const v = createVault(file, cipher);
  assert.strictEqual(v.add({ site: 'https://www.exemplo.com/x', username: 'ana', password: 'p1' }), 'added');
  assert.strictEqual(v.add({ site: 'exemplo.com', username: 'ana', password: 'p2' }), 'updated');
  const [item] = v.list();
  assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'site', 'username']);
  assert.strictEqual(v.reveal(item.id), 'p2');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('p2'), 'a senha não pode ficar em texto no arquivo');

  const r = v.importCsv('url,username,password\nhttps://b.com,x,1\nhttps://exemplo.com,ana,novo\n');
  assert.deepStrictEqual(r, { added: 1, updated: 1, skipped: 0 });
  assert.strictEqual(v.reveal(item.id), 'novo');

  // uma página só recebe credencial do próprio site
  assert.strictEqual(v.forSite('www.exemplo.com').length, 1);
  assert.strictEqual(v.credential(item.id, 'exemplo.com').password, 'novo');
  assert.strictEqual(v.credential(item.id, 'b.com'), null);

  assert.strictEqual(createVault(file, cipher).list().length, 2); // recarrega do disco
  assert.ok(v.remove(item.id));
  assert.strictEqual(v.list().length, 1);
  assert.throws(() => v.add({ site: 'x', username: '', password: 'a' }), /Site inválido/);
  assert.throws(() => v.add({ site: 'a.com', username: '', password: '' }), /senha/);
});

test('sem cofre do sistema não guarda nada', () => {
  const v = createVault(tmp(), { ...cipher, available: () => false });
  assert.throws(() => v.add({ site: 'a.com', username: 'x', password: 'y' }), /não está disponível/);
});
