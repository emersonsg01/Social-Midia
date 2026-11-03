# Social Hub

App para **gerenciar, analisar e agendar publicações** no LinkedIn, Facebook, Instagram, YouTube, Twitch e X. Ele traz um **assistente de IA** (Claude, ChatGPT, Gemini, Ollama ou LM Studio), um **navegador embutido** e integração **MCP** nos dois sentidos.

- **Computador (Windows/macOS/Linux):** Electron. Versão completa, com navegador em abas, servidor MCP local e agendador rodando na bandeja do sistema.
- **Celular (Android/iOS):** Capacitor. Usa a mesma interface e o mesmo núcleo.

## Começando

```bash
npm install
npm run dev        # abre o app em modo desenvolvimento
```

## Instaladores

| Sistema | Arquivo | Comando local |
|---|---|---|
| Windows (x64/ARM) | `Social-Hub-<versão>-win-x64.exe` / `-arm64.exe` | `npm run dist:win` |
| macOS (Intel/Apple Silicon) | `Social-Hub-<versão>-mac-x64.dmg` / `-arm64.dmg` | `npm run dist:mac` (só num Mac) |
| Linux | `.AppImage` e `.deb` | `npm run dist:linux` (só no Linux) |
| Android | `Social-Hub-<versão>-android.apk` | `npm run android:apk` (requer Android SDK) |

Os arquivos locais ficam em `release/<versão>/`. O workflow **Instaladores** do GitHub Actions gera os quatro na nuvem. Você pode rodá-lo manualmente em *Actions → Instaladores → Run workflow* e baixar os arquivos em *Artifacts*. Ao enviar uma tag (`git tag v0.2.0 && git push --tags`), ele também publica um **Release** com todos os instaladores.

Os instaladores não são assinados digitalmente:
- **Windows:** o SmartScreen avisa na primeira execução. Clique em *Mais informações → Executar assim mesmo*.
- **macOS:** clique com o botão direito no app e escolha *Abrir*. Se o sistema disser que o app está "danificado", rode `xattr -cr "/Applications/Social Hub.app"`.
- **Android:** o APK é de depuração. Permita "instalar apps desconhecidos". Para publicar na Play Store, é preciso gerar um AAB assinado com a sua keystore.

Para mudar o ícone, edite `build/icon.svg` e rode `npm run icons`.

## Funções

| Tela | O que faz |
|---|---|
| Visão geral | Total de seguidores, crescimento, próximos posts e status das contas |
| Criar post | Um texto para várias redes, com versão por rede, mídia, link, ajuda da IA (gerar, melhorar, hashtags, adaptar por rede), agendar ou publicar agora |
| Calendário | Visão mensal, filtros, editar, publicar, tentar de novo só as contas que falharam |
| Análises | Métricas por conta, histórico diário de seguidores e engajamento dos posts recentes. Atualiza sozinho a cada 6 h |
| Assistente IA | Chat que usa as ferramentas do app (contas, métricas, criar e agendar posts) e as dos seus servidores MCP |
| Navegador | Abas, sessão persistente (você entra nos sites normalmente) e atalhos para cada rede |
| Configurações | Provedores de IA, servidor MCP do app, servidores MCP externos, tema |

## Conectando as redes

Cada rede exige que **você registre um app de desenvolvedor** no portal dela. É assim que as APIs oficiais funcionam. Em **Contas → 🔑**, o app mostra o passo a passo, o link do portal e a *Redirect URI* que você deve cadastrar. Depois disso, clique em **Conectar** e faça o login no navegador.

| Rede | O que dá para publicar | Observações |
|---|---|---|
| LinkedIn | texto, imagem, link (perfil pessoal) | Produtos "Sign In with OpenID Connect" + "Share on LinkedIn". A API não fornece métricas de perfil pessoal. Token de 60 dias |
| Facebook | texto, fotos, vídeo, link em **Páginas** | Sem publicação em perfil pessoal (limite da API) |
| Instagram | foto, carrossel, Reels | Conta Profissional ligada a uma Página. Mídia precisa de **URL pública** |
| YouTube | upload de vídeo | Projetos não verificados pelo Google publicam como privado |
| Twitch | atualiza o título da live | Mostra seguidores, status ao vivo e vídeos |
| X | texto e até 4 imagens | OAuth 2.0 "Native App". A API do X é paga por uso |

Tokens, segredos e chaves de API ficam **criptografados** no dispositivo (Electron `safeStorage`).

## IA

Em **Configurações → Inteligência artificial**, adicione um ou mais provedores:

- **Claude** (chave da Anthropic), **ChatGPT** (chave da OpenAI), **Gemini** (chave do Google AI Studio)
- **Ollama** (`http://localhost:11434/v1`) e **LM Studio** (`http://localhost:1234/v1`), que rodam localmente e sem chave
- qualquer servidor **compatível com OpenAI**

O botão "Listar" busca os modelos disponíveis.

## MCP

**1. O app como servidor MCP.** Em *Configurações → Servidor MCP do Social Hub* ficam a URL (`http://127.0.0.1:3917/mcp`), o token e configurações prontas para Claude Desktop, Claude Code, LM Studio e Gemini CLI. Ferramentas expostas: `list_accounts`, `get_analytics`, `get_growth_history`, `list_posts`, `create_post`, `reschedule_post`, `publish_post`, `delete_post`, `network_guidelines`. O servidor só aceita conexões locais e com token.

**2. O app como cliente MCP.** Em *Servidores MCP externos*, adicione servidores (comando local via stdio ou HTTP). As ferramentas deles passam a aparecer no Assistente IA.

## Celular

```bash
npx cap add android     # uma vez (requer Android Studio)
npm run cap:android
```

No celular não há servidor MCP local nem upload de arquivo local. No YouTube, o envio de vídeo precisa de arquivo, então use o computador. O login OAuth usa deep link: cadastre `com.socialhub.app://oauth` como Redirect URI nas redes que aceitam esquemas personalizados.

## Estrutura

```
electron/           processo principal: janela, bandeja, cofre, OAuth loopback, servidor MCP
src/core/           núcleo compartilhado (desktop e mobile)
  networks/         conectores de cada rede
  ai.ts             Anthropic + provedores compatíveis com OpenAI, com uso de ferramentas
  service.ts        agendador, publicação, métricas, chat
  tools.ts          ferramentas usadas pelo assistente e pelo servidor MCP
src/pages/          telas
src/mobile/         plataforma Capacitor
```
