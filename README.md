# Evl Browser

✦ Navegador de internet leve, feito com Electron, HTML, CSS e JavaScript, com foco em usar pouca memória RAM.
Estilo Firefox rodando sobre Chromium, com as engines NS Nord Suite.

**Versão 1.0.0, o primeiro release.**

## Destaques

- **Pouca RAM**: abas paradas dormem e depois são descartadas (aba com som ou vídeo nunca é descartada), orçamento de memória ajustável e serviços de fundo do Chromium desligados.
- **Privacidade**: bloqueio de anúncios, popups e rastreadores, cookies de terceiros bloqueados, DNS seguro, proteção de WebRTC e menos impressão digital.
- **Permissões por site**: câmera, microfone, localização e notificações, escolhidas site a site.
- **Downloads** em paralelo, que continuam sozinhos se a conexão cair.
- **Extensões** do Chrome e do Firefox (`.zip`, `.crx`, `.xpi`), isoladas da internet por padrão.
- **Visuais**: Atual, **Lua** (inspirado no Pale Moon), Antigo 1800 e Antigo 1900, além de tema claro, escuro e AMOLED, cor principal, cantos, fonte e fundo.
- **5 idiomas**: português, inglês, espanhol, chinês e japonês.

<details>
<summary><b>Compilar e gerar o instalador</b></summary>

```text
npm install
npm start          # roda o navegador
npm test           # testes
npm run dist:win   # instalador + versão portátil para Windows em dist/
npm run dist:linux # AppImage para Linux em dist/
```

</details>

<details>
<summary><b>Atalhos</b></summary>

| Atalho | Ação |
|---|---|
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba |
| Ctrl+L | Focar a barra de endereço |
| Ctrl+R | Recarregar |
| Ctrl++ / Ctrl+- | Aumentar / diminuir o zoom (também Ctrl + roda do mouse) |
| Ctrl+0 | Zoom em 100% |
| Ctrl+D | Adicionar aos favoritos |
| Ctrl+, | Configurações |
| Ctrl+H | Histórico |
| Ctrl+J | Downloads |
| Ctrl+Shift+T | Reabrir a última aba fechada |
| Ctrl+Shift+I | DevTools da aba ativa |
| F12 | DevTools da interface do navegador |

</details>

<details>
<summary><b>Por que usar o Evl Browser?</b></summary>

O Evl é um navegador feito pela comunidade, de código aberto: qualquer pessoa pode ajudar, auditar ou melhorar.

- Navegação segura: cada aba roda isolada e não consegue ler os dados das outras.
- Rápido e leve, com as engines NS Nord Suite.
- Muito personalizável.

</details>

## Licença

MIT. Veja [LICENSE](LICENSE).
