'use strict';
// Idiomas da interface: pt (padrão, é o texto escrito no HTML), en e es.
// O texto estático do HTML é traduzido sozinho (a chave é o texto em português);
// textos criados pelo JavaScript usam t('texto em português').

const LANGS = ['pt', 'en', 'es'];
const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
let lang = 'pt';

// [português, english, español]
const WORDS = [
  ['Adicionar', 'Add', 'Añadir'],
  ['Apagar todos', 'Delete all', 'Borrar todo'],
  ['Aparência', 'Appearance', 'Apariencia'],
  ['Arquivo .zip ou .crx', '.zip or .crx file', 'Archivo .zip o .crx'],
  ['Baixar', 'Download', 'Descargar'],
  ['Cancelar', 'Cancel', 'Cancelar'],
  ['Chromium e NS Nord Suite', 'Chromium and NS Nord Suite', 'Chromium y NS Nord Suite'],
  ['Claro', 'Light', 'Claro'],
  ['Compatibilidade parcial: scripts de página e parte das APIs funcionam; botão e popup na barra não existem ainda.',
    'Partial compatibility: page scripts and some APIs work; toolbar button and popup do not exist yet.',
    'Compatibilidad parcial: los scripts de página y parte de las API funcionan; aún no hay botón ni ventana en la barra.'],
  ['Configurações', 'Settings', 'Configuración'],
  ['Endereço de busca', 'Search address', 'Dirección de búsqueda'],
  ['Escolha o esquema de cores do Evl. Os sites que respeitam a preferência de tema seguem a mesma escolha.',
    'Choose the Evl color scheme. Sites that respect the theme preference follow the same choice.',
    'Elige el esquema de colores de Evl. Los sitios que respetan la preferencia de tema siguen la misma elección.'],
  ['Escreva', 'Type', 'Escribe'],
  ['Escuro', 'Dark', 'Oscuro'],
  ['Extensões', 'Extensions', 'Extensiones'],
  ['Histórico', 'History', 'Historial'],
  ['Importar ▾', 'Import ▾', 'Importar ▾'],
  ['Importar de arquivo .json', 'Import from .json file', 'Importar de archivo .json'],
  ['Importar do Chromium', 'Import from Chromium', 'Importar de Chromium'],
  ['Importar do Firefox', 'Import from Firefox', 'Importar de Firefox'],
  ['Instalar ▾', 'Install ▾', 'Instalar ▾'],
  ['Limpar histórico', 'Clear history', 'Borrar historial'],
  ['MB no total', 'MB in total', 'MB en total'],
  ['Memória', 'Memory', 'Memoria'],
  ['Memória usada por cada processo', 'Memory used by each process', 'Memoria usada por cada proceso'],
  ['Motor', 'Engine', 'Motor'],
  ['Motor de sites', 'Site engine', 'Motor de sitios'],
  ['Motores de busca', 'Search engines', 'Motores de búsqueda'],
  ['Nenhum cookie salvo ainda.', 'No cookies saved yet.', 'Aún no hay cookies guardadas.'],
  ['Nenhuma configuração encontrada.', 'No settings found.', 'No se encontró ninguna configuración.'],
  ['Nenhuma extensão instalada.', 'No extensions installed.', 'No hay extensiones instaladas.'],
  ['Nenhuma página visitada ainda.', 'No pages visited yet.', 'Aún no hay páginas visitadas.'],
  ['Nome', 'Name', 'Nombre'],
  ['O que roda por baixo dos panos para mostrar as páginas.', 'What runs under the hood to show pages.',
    'Lo que funciona por debajo para mostrar las páginas.'],
  ['Pasta descompactada', 'Unpacked folder', 'Carpeta descomprimida'],
  ['Pesquisa', 'Search', 'Búsqueda'],
  ['Processo', 'Process', 'Proceso'],
  ['Páginas visitadas', 'Visited pages', 'Páginas visitadas'],
  ['Salvar', 'Save', 'Guardar'],
  ['Tema', 'Theme', 'Tema'],
  ['Tipo', 'Type', 'Tipo'],
  ['Usado quando o que você digita na barra de endereço não parece um endereço. Marque o padrão no círculo.',
    "Used when what you type in the address bar doesn't look like an address. Mark the default in the circle.",
    'Se usa cuando lo que escribes en la barra de direcciones no parece una dirección. Marca el predeterminado en el círculo.'],
  ['Uso de memória', 'Memory usage', 'Uso de memoria'],
  ['Versão do Chromium', 'Chromium version', 'Versión de Chromium'],
  ['foca a barra de endereço', 'focuses the address bar', 'enfoca la barra de direcciones'],
  ['onde vai o texto pesquisado.', 'where the searched text goes.', 'dónde va el texto buscado.'],
  ['· atualiza a cada 2 s enquanto esta tela está aberta', '· updates every 2 s while this screen is open',
    '· se actualiza cada 2 s mientras esta pantalla está abierta'],
  // atributos (placeholder, aria-label, title)
  ['Abas', 'Tabs', 'Pestañas'],
  ['Aumentar zoom', 'Zoom in', 'Aumentar zoom'],
  ['Aumentar zoom (Ctrl++)', 'Zoom in (Ctrl++)', 'Aumentar zoom (Ctrl++)'],
  ['Avançar', 'Forward', 'Adelante'],
  ['Categorias de configurações', 'Settings categories', 'Categorías de configuración'],
  ['Clique para trocar a cor · botão direito volta ao padrão', 'Click to change the color · right-click resets',
    'Clic para cambiar el color · clic derecho restablece'],
  ['Cor principal do navegador. Clique para escolher; botão direito volta ao padrão',
    'Browser accent color. Click to choose; right-click resets',
    'Color principal del navegador. Clic para elegir; clic derecho restablece'],
  ['Digite um endereço ou faça uma busca', 'Type an address or search', 'Escribe una dirección o busca'],
  ['Diminuir zoom', 'Zoom out', 'Reducir zoom'],
  ['Diminuir zoom (Ctrl+-)', 'Zoom out (Ctrl+-)', 'Reducir zoom (Ctrl+-)'],
  ['Endereço ou busca', 'Address or search', 'Dirección o búsqueda'],
  ['ID ou link da Chrome Web Store', 'Chrome Web Store ID or link', 'ID o enlace de Chrome Web Store'],
  ['Memória do Evl Browser. Clique para abrir o menu', 'Evl Browser memory. Click to open the menu',
    'Memoria de Evl Browser. Clic para abrir el menú'],
  ['Menu do Evl', 'Evl menu', 'Menú de Evl'],
  ['Menu do Evl: memória, zoom e configurações', 'Evl menu: memory, zoom and settings',
    'Menú de Evl: memoria, zoom y configuración'],
  ['Motor de busca padrão', 'Default search engine', 'Motor de búsqueda predeterminado'],
  ['Nova aba', 'New tab', 'Nueva pestaña'],
  ['Nova aba (Ctrl+T)', 'New tab (Ctrl+T)', 'Nueva pestaña (Ctrl+T)'],
  ['Procurar em configurações', 'Search settings', 'Buscar en configuración'],
  ['Recarregar', 'Reload', 'Recargar'],
  ['Recarregar (Ctrl+R)', 'Reload (Ctrl+R)', 'Recargar (Ctrl+R)'],
  ['Sugestões do histórico', 'History suggestions', 'Sugerencias del historial'],
  ['Voltar', 'Back', 'Atrás'],
  ['Voltar para 100% (Ctrl+0)', 'Reset to 100% (Ctrl+0)', 'Volver a 100% (Ctrl+0)'],
  ['Zoom atual. Clique para voltar a 100%', 'Current zoom. Click to reset to 100%', 'Zoom actual. Clic para volver a 100%'],
  // criados pelo JavaScript
  ['Resultados da busca', 'Search results', 'Resultados de la búsqueda'],
  ['Fechar aba (Ctrl+W)', 'Close tab (Ctrl+W)', 'Cerrar pestaña (Ctrl+W)'],
  ['Fechar aba', 'Close tab', 'Cerrar pestaña'],
  ['Apagar', 'Delete', 'Borrar'],
  ['Editar', 'Edit', 'Editar'],
  ['Apagar os cookies de {d}', 'Delete cookies from {d}', 'Borrar las cookies de {d}'],
  ['Importando…', 'Importing…', 'Importando…'],
  ['Não foi possível importar agora.', 'Could not import right now.', 'No se pudo importar ahora.'],
  ['Não foi possível apagar agora.', 'Could not delete right now.', 'No se pudo borrar ahora.'],
  ['{n} importados', '{n} imported', '{n} importadas'],
  ['{n} ignorados (vencidos ou recusados)', '{n} skipped (expired or rejected)', '{n} omitidas (caducadas o rechazadas)'],
  ['{n} protegidos pelo navegador de origem (não dá para ler)', '{n} protected by the source browser (cannot be read)',
    '{n} protegidas por el navegador de origen (no se pueden leer)'],
  ['Arquivo', 'File', 'Archivo'],
  ['{n} cookies apagados', '{n} cookies deleted', '{n} cookies borradas'],
  ['{n} cookies apagados de {d}', '{n} cookies deleted from {d}', '{n} cookies borradas de {d}'],
  ['Confirmar: apagar todos', 'Confirm: delete all', 'Confirmar: borrar todo'],
  ['Remover', 'Remove', 'Quitar'],
  ['Remover {n}', 'Remove {n}', 'Quitar {n}'],
  ['Ligar', 'Turn on', 'Activar'],
  ['Desligar', 'Turn off', 'Desactivar'],
  ['ligado', 'on', 'activada'],
  ['desligado', 'off', 'desactivada'],
  ['Instalando…', 'Installing…', 'Instalando…'],
  ['Baixando…', 'Downloading…', 'Descargando…'],
  ['Instalada', 'Installed', 'Instalada'],
  ['O arquivo é grande demais (máximo 20 MB).', 'The file is too large (maximum 20 MB).', 'El archivo es demasiado grande (máximo 20 MB).'],
  ['Cole o ID (32 letras) ou o link da Chrome Web Store', 'Paste the ID (32 letters) or the Chrome Web Store link', 'Pega el ID (32 letras) o el enlace de Chrome Web Store'],
  ['Download falhou ({s})', 'Download failed ({s})', 'La descarga falló ({s})'],
  ['Arquivo grande demais', 'File too large', 'Archivo demasiado grande'],
  ['manifest.json não encontrado', 'manifest.json not found', 'No se encontró manifest.json'],
  ['Versão de .crx não suportada', 'Unsupported .crx version', 'Versión de .crx no compatible'],
  ['Arquivo zip inválido', 'Invalid zip file', 'Archivo zip no válido'],
  ['Zip com arquivos demais', 'Zip has too many files', 'El zip tiene demasiados archivos'],
  ['Zip corrompido', 'Corrupted zip', 'Zip dañado'],
  ['Caminho inseguro no zip', 'Unsafe path in zip', 'Ruta insegura en el zip'],
  ['Extensão grande demais', 'Extension too large', 'Extensión demasiado grande'],
  ['Compressão do zip não suportada', 'Unsupported zip compression', 'Compresión del zip no compatible'],
  ['Esta versão do Electron não consegue ler bancos SQLite.', 'This Electron version cannot read SQLite databases.', 'Esta versión de Electron no puede leer bases SQLite.'],
  ['Não encontrei um perfil do Firefox neste computador.', 'Could not find a Firefox profile on this computer.', 'No encontré un perfil de Firefox en este equipo.'],
  ['Não encontrei Chrome, Edge, Brave nem Chromium neste computador.', 'Could not find Chrome, Edge, Brave or Chromium on this computer.', 'No encontré Chrome, Edge, Brave ni Chromium en este equipo.'],
  ['O arquivo não é um JSON válido.', 'The file is not valid JSON.', 'El archivo no es un JSON válido.'],
  ['Formato não reconhecido: esperava uma lista de cookies.', 'Unrecognized format: expected a list of cookies.', 'Formato no reconocido: se esperaba una lista de cookies.'],
  ['Anúncios', 'Ads', 'Anuncios'],
  ['Bloqueador de anúncios', 'Ad blocker', 'Bloqueador de anuncios'],
  ['Bloqueia anúncios e rastreadores de terceiros antes de baixarem, o que também economiza dados e memória.', 'Blocks third-party ads and trackers before they download, which also saves data and memory.', 'Bloquea anuncios y rastreadores de terceros antes de descargarse, lo que también ahorra datos y memoria.'],
  ['bloqueados nesta sessão', 'blocked this session', 'bloqueados en esta sesión'],
  ['Não bloqueia anúncios dentro de vídeos (por exemplo, os do YouTube).', 'Does not block ads inside videos (for example, YouTube ones).', 'No bloquea anuncios dentro de vídeos (por ejemplo, los de YouTube).'],
  ['Remover do histórico', 'Remove from history', 'Quitar del historial'],
];
const DICT = new Map(WORDS.map(([pt, en, es]) => [pt, { en, es }]));

// t('texto em português', { n: 3 }) -> texto no idioma atual
function t(pt, vars) {
  let out = lang === 'pt' ? pt : (DICT.get(pt)?.[lang] ?? pt);
  if (vars) for (const k in vars) out = out.replaceAll(`{${k}}`, String(vars[k]));
  return out;
}

// Mensagem vinda do main.js (erros): traduz se conhecer; "Download falhou (403)" tem número.
function tm(text) {
  const m = String(text).match(/^Download falhou \((.+)\)$/);
  return m ? t('Download falhou ({s})', { s: m[1] }) : t(String(text));
}

// Texto e atributos estáticos do HTML: guarda o original (português) e troca ao mudar de idioma.
const staticNodes = []; // { node, attr, pt }
(function collect() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const pt = n.nodeValue.trim();
    if (pt && DICT.has(pt) && !['SCRIPT', 'STYLE'].includes(n.parentNode.nodeName)) {
      staticNodes.push({ node: n, attr: null, pt, raw: n.nodeValue });
    }
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) {
    for (const attr of ['placeholder', 'aria-label', 'title']) {
      const pt = el.getAttribute(attr);
      if (pt && DICT.has(pt)) staticNodes.push({ node: el, attr, pt });
    }
  }
})();

function applyStatic() {
  for (const { node, attr, pt, raw } of staticNodes) {
    if (attr) node.setAttribute(attr, t(pt));
    else node.nodeValue = raw.replace(pt, t(pt));
  }
}

const langBtn = document.getElementById('lang-btn');
const langMenu = document.getElementById('lang-menu');

function setLang(next) {
  if (!LANGS.includes(next)) next = 'pt';
  lang = next;
  document.documentElement.lang = LOCALES[next];
  applyStatic();
  const item = langMenu.querySelector(`[data-lang="${next}"]`);
  langBtn.replaceChildren(item.querySelector('svg').cloneNode(true), document.createTextNode(next.toUpperCase()));
  langMenu.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === item)));
  // refaz o que o JavaScript desenhou (título, listas, abas)
  try {
    showPanel(panel);
    loadEngines();
    if (current) {
      lastKey = '';
      render(current);
    }
  } catch {}
}

function setLangMenu(open) {
  langMenu.hidden = !open;
  langBtn.setAttribute('aria-expanded', String(open));
}
langBtn.addEventListener('click', () => setLangMenu(langMenu.hidden));
langMenu.addEventListener('click', (event) => {
  const next = event.target.closest('button')?.dataset.lang;
  if (!next) return;
  setLangMenu(false);
  setLang(next);
  window.evl.setLang(next);
});
document.addEventListener('mousedown', (event) => {
  if (!langMenu.hidden && !langMenu.contains(event.target) && !langBtn.contains(event.target)) setLangMenu(false);
});
