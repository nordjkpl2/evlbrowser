# Evl Browser

Webbrowser made using electron html css and javascript with focus in using lower ram
firefox style running in chromium and NS Nord Suite Engines

/Build

```text
npm install
npm start
npm test
```

/Para testar o descarte de abas sem esperar 10 minutos (aba de fundo descarta após 20 s):

```text
:: cmd
set EVL_DISCARD_SECONDS=20 && npm start

# PowerShell
$env:EVL_DISCARD_SECONDS=20; npm start
```

/Mapa ai que o claude fez

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba |
| Ctrl+L | Focar a barra de endereço |
| Ctrl+R | Recarregar |
| Ctrl+Shift+I | DevTools da aba ativa |
| F12 | DevTools da interface do navegador |

- **Processo principal** (`main.js`, `src/`): roda em Node, controla janelas e abas. `main()`.
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
