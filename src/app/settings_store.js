// Preferências do usuário salvas em um arquivo JSON simples.
// Não depende do Electron (recebe o caminho do arquivo), então dá para
// testar só com `npm test`.

const fs = require('fs');
const path = require('path');

// Valores usados enquanto a pessoa não escolheu nada.
const DEFAULTS = { theme: 'dark' };

function createStore(file, defaults = DEFAULTS) {
  let data = null;

  function load() {
    if (data) return data;
    try {
      data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      data = { ...defaults }; // arquivo não existe ou está quebrado
    }
    return data;
  }

  return {
    get(key) {
      return load()[key];
    },
    set(key, value) {
      load()[key] = value;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch {
        // sem permissão de escrita: a escolha vale só até fechar o app
      }
    },
  };
}

module.exports = { createStore };
