// Converte o texto digitado na barra de endereço em uma URL segura.
// Retorna uma string (URL) ou null quando o texto deve ser ignorado.
// Não depende do Electron, então dá para testar só com `npm test`.

const { SEARCH_URL } = require('../app/app_config');

// Esquemas que nunca abrimos a partir da barra de endereço.
const BLOCKED = /^(javascript|data|file|vbscript|blob|about|chrome|view-source):/i;
// Qualquer outro "esquema://" que não seja http(s).
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
// localhost ou IPv4, com porta e caminho opcionais.
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]\S*)?$/i;
// algo.tld (com porta e caminho opcionais), sem espaços.
const DOMAIN = /^[^\s/:?#]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;

// Motor de busca em uso. Começa no de fábrica (app_config.js); main.js troca conforme as Configurações.
// Aceita %s (onde vai o texto) ou, no formato antigo, um endereço que termina em "q=".
let searchUrl = SEARCH_URL;

function setSearchUrl(url) {
  searchUrl = typeof url === 'string' && url ? url : SEARCH_URL;
}

function search(text) {
  const query = encodeURIComponent(text);
  return searchUrl.includes('%s') ? searchUrl.split('%s').join(query) : searchUrl + query;
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

module.exports = { toUrl, setSearchUrl };
