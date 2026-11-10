# Evl Browser

Webbrowser made using electron html css and javascript with focus in using lower ram
firefox style running in chromium and NS Nord Suite Engines

/Build

```text
npm install
npm start
npm test
```

Para testar o descarte de abas sem esperar 10 minutos (aba de fundo descartada após 20 s):

```
:: cmd
set EVL_DISCARD_SECONDS=20 && npm start

# PowerShell
$env:EVL_DISCARD_SECONDS=20; npm start
```

Abra 2 abas, volte para a primeira e espere: a aba de fundo fica "apagada" na barra
(descartada) e o número de MB no canto direito cai. Clicar nela recarrega a página.

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba |
| Ctrl+L | Focar a barra de endereço |
| Ctrl+R | Recarregar |
| Ctrl+Shift+I | DevTools da aba ativa |
| F12 | DevTools da interface do navegador |

## JavaScript para quem vem de C

| Em C | Em JavaScript |
|---|---|
| `#include "x.h"` | `const x = require('./x')` |
| o que o `.h` expõe | `module.exports = { ... }` |
| `int n = 5;` / constante | `let n = 5;` / `const n = 5;` (sem tipos) |
| `struct` | objeto: `{ id: 1, title: 'oi' }` |
| array + tamanho | `[1, 2, 3]` (já sabe seu tamanho: `.length`) |
| ponteiro de função / callback | funções são valores: `(x) => x + 1` |
| `malloc` / `free` | não existe: o *garbage collector* libera sozinho |
| `printf` | `console.log(...)` |
| `NULL` | `null` ou `undefined` |
| `==` | prefira sempre `===` (compara sem converter tipos) |

Duas ideias importantes do Electron:

- **Processo principal** (`main.js`, `src/`): roda em Node, controla janelas e abas. É o `main()`.
- **Páginas** (`ui/` e cada aba): processos isolados, sem acesso ao computador. Pedem coisas
  ao principal mandando mensagens (IPC), parecido com um syscall. A ponte é o `preload.js`.

## Mapa dos arquivos

```
main.js          inicia o app, cria a janela, recebe mensagens da interface
preload.js       expõe a pequena API window.evl para a interface
src/config.js    todas as constantes (tempos, orçamento de memória, buscador)
src/tabs.js      abas: criar, trocar, fechar, dormir, descartar
src/memory.js    política de memória + medidor de RAM
src/url.js       transforma o que foi digitado em URL segura (testável sem Electron)
ui/              barra de abas e endereço (HTML/CSS/JS puros, tema Evl em style.css)
test/            testes (npm test)
```

## Como a memória é economizada

1. Cada aba é uma `WebContentsView` (leve), e a interface inteira é uma página pequena sem framework.
2. Aba de fundo sai da janela ("sleeping"). Depois de `DISCARD_AFTER_MS` (10 min) a página é
   **destruída** ("discarded"): guardamos só URL, título e ícone.
3. Se o app passar de `MEMORY_BUDGET_MB` (1500), a aba de fundo mais antiga é descartada antes.
4. Aba tocando áudio e aba ativa nunca são descartadas.
5. O medidor no canto direito mostra a RAM total do app para medirmos de verdade.

Ajuste os números em `src/config.js`.

## Segurança (ponto de partida)

- Abas rodam com `sandbox` e `contextIsolation` ligados e sem acesso ao Node.
- A interface só aceita mensagens dela mesma e valida os dados recebidos.
- A barra de endereço bloqueia `javascript:`, `data:`, `file:` e outros esquemas.
- Sites só podem usar tela cheia e copiar para a área de transferência; o resto das
  permissões (câmera, microfone, localização...) é negado até criarmos uma tela de pedido.

## Próximos passos sugeridos

1. Rodar, abrir sites reais e anotar o que quebra.
2. Favoritos e histórico (guardar em arquivo JSON simples).
3. Tela de permissões estilo Firefox e bloqueio de rastreadores.
4. Empacotar um instalador.
5. Se algum dia fizer falta, um módulo nativo pequeno em C (o Electron aceita).
