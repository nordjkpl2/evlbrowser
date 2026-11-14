// Importação do histórico de OUTRO navegador a partir de um arquivo .json exportado.
// Não depende do Electron: a função recebe o texto do arquivo e o histórico de destino.
//
// Formatos aceitos (detectados sozinhos):
//  - array de visitas: [{ url, title, lastVisitTime }]  (Chrome, Edge, Brave, Opera, Vivaldi)
//  - array de visitas com outros nomes: { uri | href, name, visitTime | lastVisited | time | timestamp }
//  - objeto com o array dentro: { history: [...] }, { items: [...] }, { "Browser history": [...] } etc.
//  - o próprio history.json do EVL (url, title, time em ms).
//
// Timestamps aceitos (pelo tamanho do número, sem precisar saber o navegador):
//  - WebKit/Chrome: microssegundos desde 1601 (ex.: 13.3e15)
//  - Firefox: microssegundos desde 1970 (ex.: 1.7e15)
//  - milissegundos desde 1970 (ex.: 1.7e12)
//  - segundos desde 1970 (ex.: 1.7e9)
//  - string de data (ISO, ex.: "2024-05-01T10:00:00Z")

const WEBKIT_EPOCH_OFFSET_MS = Date.UTC(1601, 0, 1); // ms de 1601-01-01 até 1970 (valor negativo)
const LIMITE_BYTES = 200 * 1024 * 1024; // arquivos maiores que isso são recusados antes do JSON.parse

// Converte qualquer formato de tempo para ms desde 1970. Retorna NaN se não der.
function paraMs(v) {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return NaN;
  if (v >= 1e16) return v / 1000 + WEBKIT_EPOCH_OFFSET_MS; // WebKit: µs desde 1601
  if (v >= 1e14) return v / 1000; // µs desde 1970 (Firefox)
  if (v >= 1e11) return v; // ms desde 1970
  return v * 1000; // s desde 1970
}

// Acha a lista de visitas dentro do JSON: o próprio array, ou o primeiro array de objetos com `url`.
function acharLista(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    }
  }
  return [];
}

// Lê uma visita. Devolve { url, title, time } ou null se não tiver URL/tempo válidos.
function lerVisita(i) {
  if (!i || typeof i !== 'object') return null;
  const url = i.url ?? i.uri ?? i.href ?? i.Url;
  if (typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url)) return null;
  const time = paraMs(i.lastVisitTime ?? i.last_visit_time ?? i.visitTime ?? i.lastVisited ?? i.time ?? i.timestamp ?? i.date);
  if (!Number.isFinite(time)) return null;
  const title = i.title ?? i.name ?? i.Title ?? '';
  return { url, title: String(title).slice(0, 300), time };
}

// Lê o texto de um .json de histórico e devolve as visitas válidas (sem deduplicar: quem faz isso é o merge).
// Lança erro se o texto não for JSON.
function lerHistoricoJson(texto) {
  if (typeof texto !== 'string') throw new TypeError('o arquivo precisa ser texto JSON');
  if (texto.length > LIMITE_BYTES) throw new RangeError('arquivo grande demais (limite de 200 MB)');
  const data = JSON.parse(texto);
  const lista = acharLista(data);
  const visitas = [];
  for (const i of lista) {
    const v = lerVisita(i);
    if (v) visitas.push(v);
  }
  return visitas;
}

// Importa para o histórico `destino` (objeto do createHistory). Retorna { lidas, importadas, ignoradas }.
// `lidas` = entradas do arquivo; `importadas` = sites que entraram ou ficaram mais recentes; o resto é ignorado.
function importarHistorico(texto, destino) {
  const visitas = lerHistoricoJson(texto);
  const importadas = destino.merge(visitas);
  return { lidas: visitas.length, importadas, ignoradas: visitas.length - importadas };
}

module.exports = { importarHistorico, lerHistoricoJson, paraMs };
