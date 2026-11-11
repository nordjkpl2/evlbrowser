# Mapa do Evl Browser

## 1. Mapa do projeto

```
evl browser/
├── main.js                       Entrada do Electron: janela, atalhos, menu de contexto, IPC, ciclo de vida
├── preload.js                    Ponte segura: expõe window.evl para a interface
├── preload_web_pages.js          Roda em cada página web: preenche senhas (ao clicar), esconde caixas de anúncio e reforça o bloqueio no YouTube
├── package.json                  Só uma dependência: electron (dev). Scripts: start, test
├── src/                          Nomes: assunto_oquefaz.js
│   ├── app_config.js             Constantes (tempos, memória, buscador padrão, flags do Chromium)
│   ├── tabs_manager.js           TabManager: abas web/em branco/Configurações, zoom, sessão, reabrir
│   ├── memory_policy.js          Política de descarte de abas + medição de RAM
│   ├── url_address_parser.js     Texto da barra -> URL segura (ou busca); setSearchUrl
│   ├── settings_store.js         createStore: JSON em disco (settings, session, extensions)
│   ├── history_store.js          Histórico (um item por site), sugestões da barra, remover
│   ├── search_engines.js         Validação/lista de motores de busca
│   ├── cookies_import.js         Importar cookies (Firefox, Chromium, .json)
│   ├── extension_zip_reader.js   Leitor mínimo de .zip/.crx (sem dependências)
│   ├── extension_manager.js      Extensões: instalar, ligar/desligar, remover, recarregar ao abrir
│   ├── passwords_vault.js        Cofre de senhas (cifrado pelo sistema), CSV do Firefox/Chrome, logins por site
│   ├── bookmarks_store.js        Favoritos (estrela, Ctrl+D, aba Favoritos)
│   ├── adblock_lists.js          Domínios, subdomínios-padrão (ads., tracker.…) e trechos de endereço de anúncios
│   ├── adblock_engine.js         Decide se um pedido é bloqueado (cache por host, sites permitidos, contador)
│   ├── privacy_engine.js         cleanUrl (tira utm_/fbclid…), siteOf, isThirdParty, opções de privacidade
│   ├── network_hub.js            ÚNICO dono do session.webRequest: anúncios + privacidade (só registra o que está ligado)
│   └── ipc/
│       ├── cookies_ipc.js        Canais cookies:list/import/remove
│       ├── extension_ipc.js      Canais extensions:list/pick/store/enable/remove
│       ├── adblock_ipc.js        Canais adblock:get/set/enabled/allow (sites permitidos)
│       ├── privacy_ipc.js        Canais privacy:get/set/clear; aplica rede, WebRTC e DNS seguro
│       ├── bookmarks_ipc.js      Canais bookmarks:*
│       └── password_ipc.js       Canais passwords:* (tela) e autofill:query/fill (páginas)
├── ui/                           Scripts clássicos; só i18n, ui_main e ui_boot carregam no início — os settings_*.js entram na 1ª vez que abre Configurações (`SETTINGS_SCRIPTS` em ui_main.js)
│   ├── index.html                Barra, menu da RAM, sugestões, Nova aba e Configurações
│   ├── style.css                 Visual, temas, cor principal
│   ├── ui_i18n_languages.js      Idiomas pt/en/es: dicionário, t(), botão de idioma
│   ├── ui_main.js                Abas, menu, Configurações (menu lateral/busca), tema, cor, sugestões, histórico
│   ├── settings_cookies.js       Categoria Cookies
│   ├── settings_search_engines.js  Cartão de motores de busca
│   ├── settings_extensions.js    Categoria Extensões
│   ├── settings_passwords.js     Categoria Senhas (adicionar, importar CSV, mostrar/copiar/apagar)
│   ├── settings_adblock.js       Categoria Anúncios (interruptor + contador + sites permitidos)
│   ├── settings_bookmarks.js     Categoria Favoritos
│   ├── settings_privacy.js       Categoria Privacidade (interruptores + limpar dados)
│   └── ui_boot.js                Liga os eventos do main.js e pede o primeiro estado (por último)
└── test/                         node --test (um arquivo por módulo: tabs_manager, history_store,
                                  url_address_parser, settings_store, search_engines, cookies_import,
                                  extension_manager, adblock_engine, passwords_vault, bookmarks_store, privacy_engine (+network_hub), page_preload, ui_smoke)
```

### Quem fala com quem

```
 ui/*.js ──window.evl──► preload.js ──IPC──► main.js ──► src/tabs_manager.js, memory_policy.js, history_store.js, settings_store.js
    ▲                                          ├──► src/ipc/cookies_ipc.js ──► cookies_import.js
    └──── "state" / "memory" / "focus-address" ┴──► src/ipc/extension_ipc.js ──► extension_manager.js ──► extension_zip_reader.js
```

- **Processo principal** (`main.js` + `src/`): Node, controla tudo.
- **Interface** (`ui/`): página sem acesso ao computador; só usa `window.evl`.
- **Abas web**: uma `WebContentsView` por aba, isoladas (`sandbox`, sem Node). Estados: active → sleeping → discarded.

### Onde mexer para...

| Quero mudar | Arquivo |
|---|---|
| Tempos, limite de RAM, flags do Chromium | `src/app_config.js` |
| Cores e tema | variáveis no topo de `ui/style.css` |
| O que a barra aceita | `src/url_address_parser.js` |
| Abas, zoom, sessão | `src/tabs_manager.js` |
| Atalhos | `onShortcut` em `main.js` |
| Nova categoria nas Configurações | `ui/index.html` (nav + cartão) + novo `ui/settings_<nome>.js` (listar em `SETTINGS_SCRIPTS`, ui_main.js) + canais em `src/ipc/` + `preload.js` |
| Anúncios bloqueados | `src/adblock_lists.js` (listas), `src/adblock_engine.js` (regras), `preload_web_pages.js` (CSS genérico) |
| Privacidade | `src/privacy_engine.js`, `src/network_hub.js`, `src/ipc/privacy_ipc.js`, `ui/settings_privacy.js`, flags em `src/app_config.js` |
| Tamanho/fonte da interface | `font:set` em `main.js`, `applyFont` em `ui/ui_main.js` (CSS usa `--ui-scale`, `--font-ui`) |
| Senhas e preenchimento | `src/passwords_vault.js`, `src/ipc/password_ipc.js`, `preload_web_pages.js`, `ui/settings_passwords.js` |
| Bloqueio no YouTube | `preload_web_pages.js` (filtro do player, CSS, pular anúncio) + regras em `src/adblock_lists.js` |
| Extensões | `src/extension_manager.js`, `src/ipc/extension_ipc.js`, `ui/settings_extensions.js` |

## 2. Funções principais

### main.js
`createWindow`, `onShortcut`, `onTabsChanged`/`flushState`, `sampleMemory`, `saveSession`/`scheduleSession`, `openSettings(panel)`, `settingsReport`, `send`, `focusAddress`, `fromUi`/`isId`, `engineState`/`saveEngines`/`loadEngines`, `app.whenReady` (tema, permissões, extensões em segundo plano, janela). O `history:suggest` também abre a conexão (preconnect) com o 1º site sugerido.

### src/extension_manager.js — `createExtensions({ ext, dir, store })`
`loadAll()`, `list()`, `install({ folder | buffer })`, `setEnabled(id, on)`, `remove(id)`; auxiliares `parseStoreId`, `findRoot`, `readManifest`. Só extensões descompactadas (limite do Electron); sem botão/popup na barra.

### src/adblock_engine.js — `createAdblock()`
`shouldBlock(url, tipo, páginaOrigem)`, `check(...)` (conta), `setAllow(lista)`, `allowedHost`, `blocked`, `reset()`. Ordem das regras: domínio da lista → `ping` de terceiro → subdomínio-padrão de terceiro → trecho típico de terceiro → trechos por site. Nunca bloqueia a página principal nem o próprio site. Não bloqueia anúncios dentro de vídeo.

### src/network_hub.js — `createNetworkHub({ session, adblock, getAdblockOn, getPrivacy })`
`refresh()` registra `onBeforeRequest` (anúncios; limpa endereços), `onBeforeSendHeaders` (DNT/GPC; tira Cookie de terceiro) e `onHeadersReceived` (tira Set-Cookie de terceiro) — cada um vira `null` quando nada o usa (custo zero).

### src/passwords_vault.js — `createVault(arquivo, cipher)`
`add`, `list` (sem senhas), `reveal(id)`, `importCsv(texto)`, `forSite(host)`, `credential(id, host)` (só se o item for desse site), `remove`, `clear`; auxiliares `normalizeSite`, `parsePasswordCsv`. A senha vai cifrada (`safeStorage`, ligado no `main.js`).

### preload_web_pages.js
Mundo isolado de cada página: clique de verdade num campo de login -> pergunta `autofill:query` -> preenche (1 login) ou mostra lista (vários); só https/localhost. No YouTube (se o bloqueador estiver ligado): `youtubeMainWorldShield` tira `adPlacements/playerAds/adSlots` das respostas, CSS esconde anúncios, `startYoutubeAdSkipper` pula o que sobrar.

### src/extension_zip_reader.js
`extractZip(buf, dir)` (bloqueia caminhos fora da pasta, limites de arquivos/tamanho), `readEntries`.

### src/tabs_manager.js — `TabManager`
`create`, `openSettings`, `activate`, `close`, `navigate`, `back/forward/reload`, zoom (`zoomIn/Out/Reset`), `setMenu`, `setSuggest`, `restore`, `sessionSnapshot`, `reopenClosed`, `discard`, `layout`, `snapshot`, `destroyAll`.

### memory_policy · url_address_parser · settings_store · history_store · search_engines
`startMemoryPolicy`, `processReport`, `totalMemoryMB` · `toUrl`, `setSearchUrl` · `createStore` · `createHistory` (`add`, `setTitle`, `list`, `suggest`, `remove`, `clear`) · `validateEngine`, `normalizeList`, `uniqueId`.

### Canais (interface → main.js)

| Canal | Efeito |
|---|---|
| `ui:ready` | Envia estado, cor e MB iniciais |
| `tab:new/close/activate`, `nav:go/back/forward/reload` | Abas e navegação |
| `settings:open`, `settings:report` | Abre Configurações / relatório |
| `history:list/open/clear/suggest` | Histórico e autocompletar |
| `engines:list/select/save/remove` | Motores de busca |
| `cookies:list/import/remove` | Cookies (`src/ipc/cookies_ipc.js`) |
| `passwords:list/add/show/copy/remove/clear/import` | Senhas (`src/ipc/password_ipc.js`) |
| `autofill:query/fill` | Vindos das páginas (só a página principal da aba, nunca a interface) |
| `adblock:get/set/allow/enabled` | Bloqueador, sites permitidos (`src/ipc/adblock_ipc.js`) |
| `privacy:get/set/clear` | Privacidade (`src/ipc/privacy_ipc.js`) |
| `bookmarks:*` | Favoritos (`src/ipc/bookmarks_ipc.js`) |
| `font:set` | Tamanho e fonte da interface |
| `history:remove`, `lang:set` | Remover site do histórico; idioma |
| `extensions:list/pick/store/enable/remove` | Extensões (`src/ipc/extension_ipc.js`) |
| `menu:set`, `suggest:set`, `zoom:set` | Submenu da RAM, sugestões, zoom |
| `theme:set`, `accent:set` | Tema e cor principal |

Do main para a interface: `state`, `memory`, `focus-address`, `accent`, `panel`, `lang`, `font`.

O teste `ui_smoke` confere que todo `window.evl.*` usado existe no preload e que todo canal do preload tem handler no main.
