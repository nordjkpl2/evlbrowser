// Downloads: nome seguro do arquivo, caminho sem sobrescrever e a lista salva (downloads.json).
// Não depende do Electron (testável com `npm test`).

const path = require('path');

const MAX_ITEMS = 200;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i; // nomes proibidos no Windows

// Tira barras, caracteres de controle e pontos/espaços no fim; nunca devolve vazio.
function safeName(name) {
  const clean = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(-180);
  const base = clean.split('.')[0];
  return !clean || RESERVED.test(base) ? `download_${clean}`.replace(/_$/, '') : clean;
}

// "foto.png" -> "foto (1).png" se já existir (exists = fs.existsSync).
function uniquePath(dir, name, exists) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let file = path.join(dir, name);
  for (let i = 1; exists(file) && i < 1000; i++) file = path.join(dir, `${stem} (${i})${ext}`);
  return file;
}

// store: { get, setLater } de settings_store.js. Guarda só downloads terminados (os em andamento vivem no ipc).
function createDownloads(store) {
  const items = () => (Array.isArray(store.get('list')) ? store.get('list') : []);
  const save = (list) => store.setLater('list', list.slice(-MAX_ITEMS));
  return {
    list: items,
    add: (item) => save([...items(), item]),
    get: (id) => items().find((i) => i.id === id) ?? null,
    remove: (id) => save(items().filter((i) => i.id !== id)),
    clear: () => save([]),
  };
}

module.exports = { safeName, uniquePath, createDownloads, MAX_ITEMS };
