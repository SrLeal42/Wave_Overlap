### Objetivo

Criar uma aplicação web interativa para portfólio onde o usuário desenha um padrão simples numa grade e, a partir dele, o algoritmo **Wave Function Collapse (Overlapping Model)** gera automaticamente uma imagem maior mantendo a coerência visual do desenho original. A geração acontece com **preview em tempo real**, permitindo visualizar o algoritmo colapsando célula por célula.

---

### Arquitetura

A responsabilidade é dividida em duas camadas bem definidas:

**React/TypeScript** cuida exclusivamente da interface — o canvas de desenho, os controles do usuário e a renderização dos snapshots recebidos via SharedArrayBuffer.

**Go/WASM** cuida de toda a computação — extração de padrões e regras a partir do input do usuário, e a execução completa do algoritmo WFC.

A comunicação entre as duas camadas usa **SharedArrayBuffer**, onde o Go escreve o estado atual da geração diretamente na memória compartilhada e o React lê e renderiza via `requestAnimationFrame`, sem serialização e com performance máxima.

---

### Tecnologias

| Camada              | Tecnologia             | Papel                                  |
| ------------------- | ---------------------- | -------------------------------------- |
| UI e apresentação   | React + TypeScript     | Canvas de desenho e renderização       |
| Lógica e algoritmo  | Go compilado para WASM | Extração de regras e geração WFC       |
| Comunicação         | SharedArrayBuffer      | Memória compartilhada JS ↔ WASM        |
| Headers necessários | COOP + COEP            | Habilitar SharedArrayBuffer no browser |
| Hospedagem          | Vercel ou Cloudflare   | Suporte nativo aos headers necessários |

---

### Fluxo geral

```
Usuário desenha    →   React captura o grid
Grid enviado       →   Go extrai padrões e regras
WFC inicia         →   Go escreve snapshots no SharedArrayBuffer
React lê memória   →   Renderiza preview em tempo real
WFC finaliza       →   Imagem completa exibida
```
