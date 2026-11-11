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

  // Gravação em segundo plano para o que muda toda hora (a sessão): atualiza na memória, junta as
  // mudanças e escreve sem travar o programa. flush() escreve na hora o que estiver pendente.
  let timer = null;
  let dirty = false;
  async function writeLater() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    try {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, JSON.stringify(data));
    } catch {
      // sem permissão de escrita: vale só até fechar o app
    }
  }

  return {
    setLater(key, value, delay = 300) {
      load()[key] = value;
      dirty = true;
      if (!timer) {
        timer = setTimeout(writeLater, delay);
        timer.unref?.();
      }
    },
    flush() {
      clearTimeout(timer);
      timer = null;
      if (!dirty) return;
      dirty = false;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      } catch {
        // idem
      }
    },
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
