# Wave Overlap

<div align="center">
  <img src="public/assets/wave_overlap.gif" width="256" height="256" alt="Wave Overlap Demo 1" />
  <img src="public/assets/wave_overlap_2.gif" width="256" height="256" alt="Wave Overlap Demo 2" />
  <img src="public/assets/wave_overlap_3.gif" width="256" height="256" alt="Wave Overlap Demo 3" />
</div>

**Wave Overlap** é uma aplicação web interativa que demonstra o poderoso algoritmo de geração procedural **Wave Function Collapse (Overlapping Model)** rodando diretamente no seu navegador. 

Desenhada para aliar **interatividade** a **alta performance**, esta aplicação demonstra **Polyglot Programming** ao unir o ecossistema Web e Back-end. Permite que os usuários desenhem padrões simples em uma grade, e em tempo real, assistam o algoritmo "colapsar" as possibilidades para gerar uma nova imagem, maior e estruturalmente coerente com o padrão original.

---

## ✦ Principais Funcionalidades

- **◈ Desenho Interativo:** Um canvas intuitivo para que o usuário crie seus próprios padrões de input.
- **⟡ Geração em Tempo Real (Live Preview):** Acompanhe o processo de decisão do WFC célula a célula, sem travamentos na interface.
- **⬡ Otimização Extrema com WASM:** Toda a carga computacional é executada em **Go compilado para WebAssembly (WASM)**. O uso consciente de estruturas de dados brutas (`Uint8Array`) garante alta velocidade e previne gargalos causados pelo Garbage Collector.
- **❖ Zero Serialização (Shared Memory):** Utiliza `SharedArrayBuffer` para troca de dados entre o React e o módulo WASM, garantindo atualizações instantâneas de tela a 60FPS.
- **▣ Interface Moderna e Responsiva:** Construída com React 19 e Vite, proporcionando uma experiência de usuário polida e ágil.

---

## ▤ Sistemas de Compartilhamento e Exportação

A aplicação conta com um ecossistema robusto para exportar suas criações e compartilhar com a comunidade ou utilizá-las em motores de jogos:

- **🔗 Link Direto (State Sharing):** O estado completo do grid, seed e configurações de pós-processamento são empacotados (`nibble-pack`), comprimidos nativamente (CompressionStream) e convertidos em um Base64 URL-safe. Isso gera um link enxuto que permite que outros usuários continuem a geração exatamente de onde você parou.
- **🎬 Exportação em GIF:** Permite capturar a animação da geração em um GIF fluido. O processo de renderização e quantização de cores ocorre offline frame a frame, com interrupções controladas (yields) para não travar a interface do usuário.
- **📦 Exportação JSON (Tilemap):** O output gerado pelo WFC pode ser convertido e baixado como um arquivo Tilemap JSON. Essa função extrai a máscara de bits e mapeia o resultado para índices, incluindo marcações especiais (-1) para células que entraram em contradição. O JSON inclui paleta e metadados completos da grid original, pronto para ser lido em motores de jogos (Godot, Unity, etc.).

---

## ◧ Tecnologias Utilizadas

A arquitetura do projeto foi pensada para dividir claramente as responsabilidades de UI e processamento bruto, demonstrando competências em integração avançada:

### Frontend (UI & Renderização)
- **[React 19](https://react.dev/)** + **[TypeScript](https://www.typescriptlang.org/)**: Gerenciamento de estado, ciclo de vida dos componentes e tipagem estática.
- **[Vite](https://vitejs.dev/)**: Bundler ultra-rápido para desenvolvimento e build.
- **CSS / Animações**: Interface fluida, desenhada do zero para imersão do usuário.

### Backend/Engine (Lógica & Algoritmo)
- **[Go (Golang)](https://go.dev/)**: Linguagem escolhida pela sua performance e forte tipagem na construção do core do solver WFC.
- **[WebAssembly (WASM)](https://webassembly.org/)**: O código Go é compilado para WASM, rodando na velocidade nativa (ou próxima disso) diretamente no browser.

### Comunicação e Conceitos Modernos de Browser
- **SharedArrayBuffer**: Memória compartilhada bidirecional, evitando o overhead do `postMessage` durante o processamento do grid. Lidar com essas limitações no ambiente sandboxed do navegador requer a configuração avançada de headers de segurança `Cross-Origin-Opener-Policy` (COOP) e `Cross-Origin-Embedder-Policy` (COEP).

---

## ◨ Arquitetura e Fluxo de Dados

A mágica acontece na sincronia entre o ecossistema JavaScript e a máquina virtual WASM:

1. **Input do Usuário:** O React captura o desenho feito no grid (matriz de pixels/cores).
2. **Extração de Regras:** O Go extrai padrões NxN (Pattern Extraction) e mapeia as frequências e regras de adjacência (Overlapping Model).
3. **Solver WFC Inicia:** O solver inicia a propagação.
4. **Live Rendering:** A cada N passos, o Go escreve o "snapshot" (estado atual da entropia/colapso) diretamente no `SharedArrayBuffer`.
5. **Renderização JS:** O React lê dessa memória de forma síncrona via `requestAnimationFrame` e exibe na tela!

---

## ◯ Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** (v18+)
- **Go** (v1.21+)

### Passos para Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/SrLeal42/Wave_Overlap.git
   cd Wave_Overlap
   ```

2. **Instale as dependências do Frontend:**
   ```bash
   npm install
   ```

3. **Compile o módulo WebAssembly (Go para WASM):**
   ```bash
   npm run build:wasm
   ```
   *O script irá compilar os arquivos dentro de `./wasm` e gerar o arquivo `main.wasm` na pasta pública.*

4. **Inicie o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```
   *Abra o navegador em `http://localhost:5173`.*

---

## ◉ Entendendo o Wave Function Collapse

O **Wave Function Collapse (WFC)** é um algoritmo sofisticado de geração procedural da família dos algoritmos **CSP (Constraint Satisfaction Problem)** inspirados na mecânica quântica. Ele começa com uma grade onde toda célula está em uma "superposição" de todos os estados possíveis (cores ou tiles). 
A cada passo:
1. **Observação (Colapso):** Escolhe-se a célula com menor entropia (menos opções válidas) e ela é colapsada para um único estado.
2. **Propagação:** As regras de adjacência (extraídas do seu desenho inicial) são aplicadas para restringir as opções das células vizinhas.
3. Repete-se o ciclo até a grade toda ser preenchida, ou chegar a uma contradição.

---