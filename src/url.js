// Converte o texto digitado na barra de endereço em uma URL segura.
// Retorna uma string (URL) ou null quando o texto deve ser ignorado.
// Não depende do Electron, então dá para testar só com `npm test`.

const { SEARCH_URL } = require('./config');

// Esquemas que nunca abrimos a partir da barra de endereço.
const BLOCKED = /^(javascript|data|file|vbscript|blob|about|chrome|view-source):/i;
// Qualquer outro "esquema://" que não seja http(s).
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
// localhost ou IPv4, com porta e caminho opcionais.
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]\S*)?$/i;
// algo.tld (com porta e caminho opcionais), sem espaços.
const DOMAIN = /^[^\s/:?#]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;

function search(text) {
  return SEARCH_URL + encodeURIComponent(text);
}

function toUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).href;
    } catch {
      return search(text);
    }
  }

  if (BLOCKED.test(text) || OTHER_SCHEME.test(text)) return null;

  if (LOCAL.test(text)) return 'http://' + text;

  if (DOMAIN.test(text)) {
    try {
      return new URL('https://' + text).href;
    } catch {
      return search(text);
    }
  }

  return search(text);
}

module.exports = { toUrl };
