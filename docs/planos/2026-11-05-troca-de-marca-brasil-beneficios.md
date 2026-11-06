# Troca de marca: Seguros Paraná / Paraná Seguros → Brasil Benefícios e Indenizações

Inventário levantado em 05/11/2026. **Nada foi alterado:** nem código, nem banco, nem S3.

Variantes procuradas: `Seguros Paraná`, `Paraná Seguros`, `Parana Seguros`, `segurosparana`, `paranaseguros`, `seguros-parana`, `Paraná DPVAT`, `DPVAT Paraná`, `dpvatparana`, `paranadpvat`, `Paraná Consultoria em Seguros`.

Volume no repositório: 260 ocorrências em 104 arquivos das variantes `Seguros Paraná`/`Paraná Seguros` (a maior parte é URL, slug, teste e doc interna), mais as de `dpvat paraná` e os itens que não são texto.

## 1. Decisões que travam a troca

| # | Decisão | Por que trava |
|---|---|---|
| 1 | **Mudou a empresa ou só o nome de fantasia?** Hoje o rodapé mostra `Paraná Consultoria em Seguros`, CNPJ `48.270.397/0001-68` e registro Susep | Define o que entra em rodapé, política de privacidade (controlador de dados na LGPD), procurações e consentimento de assinatura |
| 2 | **O domínio muda?** Hoje é `segurosparana.com.br` (site) e `dpvatparana.com.br` (e-mails) | Se mudar, exige redirects 301, novo `NEXTAUTH_URL`, `BRAIN_PROMPT_URL` no Railway, URL do webhook na Meta, domínio no SES, reconfiguração dos operadores e SEO |
| 3 | **Arquivos da logo nova:** versão colorida, versão clara (fundo escuro), favicon e selo para PDF | Não há nenhum arquivo da marca nova no repositório |
| 4 | **Redes sociais:** `@paranasegurospr`, `facebook.com/paranadpvat`, `instagram.com/paranadpvat`, LinkedIn `paraná-seguros-e-previdência` | Os links só podem mudar depois que os perfis forem renomeados |
| 5 | **Número Susep correto** | **Divergência encontrada:** o rodapé do site diz `221140431`; o fluxo do WhatsApp "DADOS - infos da empresa" diz `222140501` |

## 2. Site público

### Landing page (`app/_components/landing_page/`)
| Arquivo:linha | O que é |
|---|---|
| `Header.tsx:66,69` | Logo e alt |
| `Header.tsx:163` | Nome no menu mobile |
| `Hero.tsx:35` | Alt da imagem |
| `video.tsx:42` | Título "Por que escolher a Paraná Seguros?" |
| `video.tsx:17,45` | **Revisar o texto** (sem o nome, mas ligado à marca antiga): "Especialistas em Seguros", "Mais do que seguros…" |
| `Contact.tsx:160,171` | Facebook e nome exibido |
| `Contact.tsx:178,189` | Instagram e arroba |
| `Contact.tsx:196,207` | LinkedIn e nome exibido |
| `Contact.tsx:240` | Imagem do mapa e alt |
| `Footer.tsx:11` | Logo e alt |
| `Footer.tsx:43,46,52,55,61,64` | Links e aria-labels das redes |
| `Footer.tsx:74` | Copyright |
| `Footer.tsx:76-77` | Razão social e CNPJ (decisão 1) |
| `Footer.tsx:80-81` | Susep e arroba (decisão 5) |
| `BlogSection.tsx:12,21,32,44,93` | Links do blog (slug) |

### Metadados e SEO
| Arquivo:linha | O que é |
|---|---|
| `app/layout.tsx:17-51` | `metadataBase`, título padrão, template `%s \| Paraná Seguros`, autor, keywords, Open Graph, Twitter, imagem OG |
| `app/(site)/page.tsx:13-42` | Título, canonical, OG, Twitter, `creator: @ParanaSeguros` |
| `app/(site)/layout.tsx:54-56,69-70` | JSON-LD da organização: nome, URL, logo, `sameAs` das redes |
| `app/sitemap.ts:3,9-13` · `app/robots.ts:14` | Domínio e slugs |
| `app/(site)/nossa-equipe/layout.tsx:6` · `app/(site)/faq/layout.tsx:7` | Descrições |
| `public/llms-full.txt` (linhas 4,7,12,13,24,39,49,56) | Guia para IAs inteiro como "Paraná DPVAT", com `dpvatparana.com.br` e `suporte@dpvatparana.com.br` |

### Políticas e páginas legais
| Arquivo:linha | O que é |
|---|---|
| `app/(site)/politica-de-privacidade/page.tsx:6-8,22` | Título, descrição, canonical e **texto que identifica a empresa** |
| `app/(site)/politica-privacidade/page.tsx:45,186` | URL do site e e-mail `politica.privacidade@dpvatparana.com.br`. **É a política linkada no rodapé** |
| `app/(site)/termos-de-uso/page.tsx:47,197` | URL do site e o mesmo e-mail |
| `app/(site)/exclusao-de-dados/page.tsx:6-8` | Título, descrição, canonical |

Existem **duas** políticas de privacidade. Vale unificar em vez de manter as duas. Antes, confirmar qual URL está cadastrada no app da Meta, porque não consegui verificar isso daqui.

### Blog (`app/(site)/blog-seguros-parana/`)
| Arquivo:linha | O que é |
|---|---|
| `page.tsx:168` | Título "Blog Seguros Paraná" |
| `documentacao/page.tsx:56,303,305` | Autor e fonte com URL |
| `auxilio-maternidade/page.tsx:152` | Autor |
| `dpvat/layout.tsx:6` · `inss/layout.tsx:6` · `auxilio-maternidade/layout.tsx:6` | Descrições |
| Pasta inteira, `middleware.ts:24`, `sitemap.ts`, canonicals e links internos | **O slug `/blog-seguros-parana` é URL pública.** Renomear exige redirect 301 para não perder SEO |

### Equipe
`app/(site)/nossa-equipe/page.tsx:20-196`: 16 e-mails públicos (`@segurosparana.com.br` e `*.paranaseguros@gmail.com`). Dependem de as contas novas existirem.

## 3. Área do cliente, login e páginas de sistema

| Arquivo:linha | O que é |
|---|---|
| `app/(cliente)/layout.tsx:4` | Título |
| `app/(cliente)/area-do-cliente/section/sidebar.tsx:45` | Logo e alt ("DPVAT Paraná") |
| `app/(cliente)/status/page.tsx:9` · `status/[processId]/page.tsx:9` | Logo |
| `app/login/sections/AuthShell.tsx:42,45,88,98,114` | Logos, copyright e CNPJ |
| `app/not-found.tsx:8` · `app/error.tsx:22` · `app/global-error.tsx:29` | Logo e texto de erro |
| `app/assinar/[token]/page.tsx:15` · `SignFlow.tsx:692` | Assinatura (desativada) |
| `app/verificar/[token]/page.tsx:22,66` | Verificação de documento |
| `app/(site)/section/stats.tsx:8` | Logo |

## 4. CRM interno

| Arquivo:linha | O que é |
|---|---|
| `app/nova-dash/layout.tsx:9` | Título "CRM \| Paraná Seguros" |
| `app/nova-dash/page.tsx:226,442` | Logo e "© 2025 Sistema de Gestão Seguros Paraná" |
| `app/nova-dash/_components/DashboardTour.tsx:29` | "Bem-vindo(a) ao CRM…" |
| `app/nova-dash/workspace/manager/SystemMap.tsx:854` | Rótulo |
| `app/nova-dash/card-dialog/ScriptTab.tsx:546` · `app/api/roteiro/download/route.ts:18` | Título do roteiro gerado |

## 5. O que chega ao cliente ou a terceiros

### SMS, e-mail e WhatsApp no código
| Arquivo:linha | O que é |
|---|---|
| `app/_actions/auth/password-reset.ts:173` | SMS de recuperação de senha |
| `app/_actions/auth/password-reset.ts:181,182,184` | E-mail de recuperação |
| `app/_actions/auth/password-reset.ts:214` | WhatsApp de recuperação |
| `app/_shared/lib/aws-messaging.ts:58` | Remetente de SMS `ParanaSeg` (padrão de `SNS_SMS_SENDER_ID`; o limite é curto, a sigla nova precisa ser definida) |
| `.claude/skills/prontuario/SKILL.md:18` | **Assinatura do e-mail aos hospitais** ("Seguros Paraná") |
| `app/_shared/lib/meta-conversions.ts:122` | `lead_event_source` da API de Conversões (conferir efeito antes de mudar) |

### PDFs gerados
`app/_shared/lib/signature/pdf.ts:90,316,405,429`: constante `BRAND`, logo lida do disco e selo circular "PARANÁ SEGUROS • ASSINATURA ELETRÔNICA". Documentos já assinados não mudam.

### Modelos Word
**Os modelos vivos estão no S3:** as 11 linhas de `doc_templates` têm `s3Key`, que sobrepõe `templates/`. Trocar no repositório sem subir pela tela de modelos não muda produção. A pasta `templates-assinatura/` tem cópias paralelas.

| Modelo | Marca no texto | Imagem com a marca |
|---|---|---|
| `-PROCURAÇÃO-ESPECÍFICA_CURITIBA` e `_ASSINATURA` | `@paranasegurospr`, `contato@dpvatparana.com.br`, `www.segurosparana.com.br` | Logo Paraná Seguros (`image1.jpg`) |
| `-PROCURAÇÃO-ESPECÍFICA-TAYNARA` e `_ASSINATURA` | `contato@dpvatparana.com` (2x, sem `.br`: conferir se é erro) | Logo Paraná Seguros com site (`image2.png`) |
| `PEDIDO_HOSPITALAR` | Nenhuma | Cabeçalho com logo, site e **QR code** (`image1.png`) |
| `KIT_TAYNARA-PREVIDENCIARIO` | Nenhuma | 1 imagem **não conferida** |
| `KIT_PREV_CSS`, `DECLARACAO_DE_HIPOSSUFICIENCIA`, `KIT DRA EVELYN INSS` (oculto), `Roteiro_` | Nenhuma | Nenhuma (o KIT Evelyn traz a logo da advogada) |

**Procuração e contrato são documentos jurídicos:** a redação nova precisa de validação da advogada, especialmente se a decisão 1 for mudança de empresa.

## 6. Logos, imagens e vídeos

| Arquivo | O que tem | Onde é usado |
|---|---|---|
| `public/paranaseguros.png` | Logo colorida | Header, login, área do cliente, erro, CRM, verificação, stats, OG e PDF de assinatura |
| `public/logo_text_white.png` | Logo clara | Login e CRM no modo escuro |
| `public/logo_sem_fundo.png` | Logo contorno | Rodapé |
| `app/favicon.ico` | Logo reduzida | Aba do navegador |
| `public/maps.png` | **Print do Google Maps com "PARANÁ SEGUROS \| Resgate DPVAT"** | `Contact.tsx:240` |
| `videos/video.mp4` (Mux) | **Marca d'água `@paranasegurospr` no vídeo inteiro** (77 s) | Home (`video.tsx`). Precisa de versão nova e novo upload |
| `public/assinatura/como-assinar.mp4` | **Logo no canto do vídeo** | Assinatura (desativada) |
| `public/logo_preta.jpg`, `public/logoooo.jpeg`, `public/celular_stats.png` | Logo ou tela com a marca | **Sem referência em `app/`:** podem ser apagados |

Abri 22 imagens ilustrativas do `public/` (fotos, ilustrações, cards) e **não vi marca**. Não abri as fotos da equipe nem `car.jpg`, `moto.jpg`, `protect.jpg` e `christian-bowen-*.jpg` (as três primeiras não têm referência em `app/`).

## 7. Banco de produção

| Onde | O que mudar | Como |
|---|---|---|
| **Instruções do bot v28** | 4 seções: "DECISÃO FINAL", "ÁREA DO CLIENTE" (cita o site), "CONSULTA DE STATUS", "ENCERRAMENTO CONTEXTUAL" (despedidas) | Aba Instruções, publicando versão nova. **É o que o bot fala hoje** |
| **Linhas do WhatsApp** | `Seguros Paraná IA`, `2 Seguros Paraná IA`, `Paraná DPVAT BOT` (inativa) | Tela Números. Só rótulo interno |
| **Fluxos do WhatsApp** | "ATENDIMENTO - Área do cliente" (site), "DADOS - infos da empresa" (Susep e redes), "EXPLICAÇÃO DE COMO ASSINAR POR AUDIO" (**texto de consentimento:** "autorizo a Paraná Seguros a solicitar meu prontuário") | Tela de fluxos. O consentimento precisa de validação jurídica |
| **Automações** | 9 de pedido de hospital com `prontuarios.*@dpvatparana.com.br` | Só se os e-mails mudarem; essas contas são canal ativo com hospitais |
| **Instruções da equipe** ("Instruções de Hospital") | 21 ocorrências em 2 registros, com e-mails `@dpvatparana.com.br` | Só se os e-mails mudarem |

### Templates da Meta
20 de 112 linhas do catálogo têm a marca, em 10 templates distintos, nas 3 linhas. Eles vivem na Meta: a linha local é só um espelho, e **cada alteração volta para análise**.

| Template | Campo | Categoria | Linhas |
|---|---|---|---|
| `recuperacao_triagem_1` | Cabeçalho | MARKETING | 3 |
| `recuperacao_triagem_final` | Cabeçalho | MARKETING | 3 |
| `lembrete_assinatura` | Rodapé | UTILITY | 3 |
| `atualizacao_status` | Cabeçalho | UTILITY | 2 |
| `atendimento_inicial_1` | Cabeçalho | MARKETING | 2 |
| `resgate_1` | Cabeçalho e corpo | MARKETING | 2 |
| `retomar_contato_botconversa` | Corpo | MARKETING | 2 |
| `chamar_cliente_indicado` | Corpo | MARKETING | 1 |
| `resgate_lista_90_mil` | Corpo | MARKETING | 1 |
| `atendimento_1` | Corpo | MARKETING | 1 |

Atenção à regra anti-spam do projeto: as duas WABAs já levaram aviso da Meta. Um nome desconhecido chegando a quem conhecia a marca antiga pode aumentar denúncias, então não é momento de afrouxar o marcapasso nem de disparar aviso em massa.

### Histórico: não mexer
`Comment`, `Notification`, `logs`, `whatsapp_messages`, `whatsapp_rule_events`, `whatsapp_contacts.adReferral` e `adHeadline`, `op_*`, `chat_messages`, `dev_tickets`. São registro do que aconteceu.

## 8. Prompts de IA

| Arquivo:linha | Papel |
|---|---|
| `app/api/doc-ia/route.ts:177,286` | Auditor e redator do Gerador de Documento |
| `app/_shared/lib/ai-audit.ts:134,172,235` | Auditorias do card |
| `app/_shared/lib/whatsapp/ficha-ai.ts:268` | Ficha automática |
| `app/api/chat/modules/chat.service.ts:69` | Assistente ("DPVAT Paraná") |

## 9. Microserviços (deploy próprio)

| Arquivo:linha | O que é |
|---|---|
| `D:\Chatbot_whatsapp\bot.js:871,1046,1089,1313` | Prompt de fallback (o vivo está no banco) |
| `D:\Chatbot_whatsapp\bot.js:2610,2688,2758,3007` | **Prompts auxiliares do micro:** não vêm do banco, então só mudam com deploy no Railway |
| `D:\Chatbot_whatsapp\package.json:5` · `README.md:1` | Descrição |
| `D:\docx-converter\index.js:124` | Prompt da IA do Roteiro |

## 10. Fora do código (não acessei nada disso)

- **Meta:** nome de exibição das WABAs/números (passa por aprovação), perfil comercial do WhatsApp, Página do Facebook, Instagram, nome do app, URLs de privacidade e de exclusão de dados, nomes das contas de anúncio.
- **Anúncios:** criativos e textos que citam a marca.
- **Google:** Perfil da Empresa (o nome que aparece no mapa), Search Console.
- **LinkedIn.**
- **Registros:** Receita Federal e Susep, se a decisão 1 for mudança de empresa.
- **Domínio e e-mail:** DNS, SES (remetente), caixas `@segurosparana.com.br` e `@dpvatparana.com.br`, contas `*.paranaseguros@gmail.com`.
- **Formulários externos** (Google Forms/Drive citados nas automações) e materiais impressos.
- **Skills externas** que citam o CRM: `conferencia-planilha-pastas-*`, `envio-pastas-email-uni`.

## 11. NÃO trocar por localizar-e-substituir

Estes itens contêm o nome antigo, mas são identificadores. Um replace cego quebra o sistema.

| Item | Onde | O que quebra |
|---|---|---|
| **Senha padrão de cliente** (contém o nome antigo) | `app/api/botconversa/contratado/route.ts:51`, `app/_actions/whatsapp/client-info.ts:211`, `app/_shared/lib/signature/core.ts:647` e o fluxo "ATENDIMENTO - Área do cliente" | Clientes novos e antigos ficariam com senhas diferentes da informada no fluxo |
| **Bucket S3** `paranasegurosdpvat` | `app/api/instructions/_s3.ts:19` | Todos os documentos |
| **E-mails de acesso** | `app/_shared/lib/managers.ts:9-12`, `chatbot-access.ts:9-10`, `ai-review-access.ts:23-24`, `scripts/bootstrap-permissions.mjs:33-36` | Acesso de gestores (15 logins da equipe usam esses e-mails) |
| **Workspace Windmill** `parana-seguros` | `app/api/chat/modules/windmill.controller.ts:7` | Chamadas ao Windmill |
| **Plugin do operador** `crm@seguros-parana` | `tools/operacao-plugin/**`, `scripts/plugin-operacao.mjs:34` | Instalação e atualização nos Windows da equipe |
| **URL padrão do MCP e hooks** | `tools/crm-mcp/index.mjs:10,22`, `.claude/hooks/op-*.mjs` | Operadores, se o domínio mudar sem redirect |
| **Comentários com nomes de contas da Meta** | `app/_shared/lib/whatsapp/recovery-caps.ts:5-6,15`, `app/api/whatsapp/webhook/route.ts:196`, `app/_actions/botconversa.ts:14`, `app/nova-dash/minikanban.tsx:19` | Nada: registram o nome real da conta na época, sem necessidade de mudar |
| **Testes** | `tests/*` | Usam a marca como dado de exemplo; só ajustar se o código testado mudar |

## 12. Documentação interna (baixa prioridade)

`CLAUDE.md`, `README.md`, `.env.example`, `docs/ai/*`, `docs/ai-first/*`, `docs/planos/*`, `docs/operacao/hospitais/*` (2 notas), `.claude/agents/*`, `.claude/skills/whatsapp/SKILL.md`, descrições em `tools/crm-mcp/index.mjs:2,201`, `tools/operacao-plugin/README.md`, `pasta-operador/CLAUDE.md`, `plugin.json`, `marketplace.json`. Trocas de texto em `app/_shared/lib/op/conversas.ts:79` e `op/tools/listar-conversas.ts:20` acompanham o novo nome das linhas.

## 13. Ordem sugerida

1. Responder às decisões da seção 1 e receber as logos.
2. Site, área do cliente, login e CRM: texto, metadados e logos (seções 2, 3, 4 e 6), mantendo o domínio atual.
3. Políticas e termos, depois de validação jurídica.
4. Comunicação e IA: recuperação de senha, e-mail de prontuário, PDF, prompts (seções 5 e 8) e microserviços (seção 9, deploy antes do CRM).
5. Bot: instruções e fluxos no banco, publicados junto com o passo 4.
6. Modelos Word no S3, com validação da advogada.
7. Meta: nome de exibição e templates, um lote por vez, acompanhando a análise.
8. Domínio novo, se houver, por último, com redirects 301.

## Limites deste levantamento

- `logs` e `whatsapp_messages` (mais de 250 mil linhas cada) não foram varridas por serem histórico.
- O áudio dos vídeos (`videos/video.mp4`, `como-assinar*.mp4`, `public/assinatura/voz/*.mp3`) **não foi ouvido**, e pode citar a marca. O vídeo da home e o `como-assinar.mp4` foram conferidos só por 12 quadros de cada um.
- O QR code do `PEDIDO_HOSPITALAR` não foi lido (provavelmente aponta para o site antigo).
- Os documentos enviados pela equipe na tabela `instructions` (arquivos no S3) não foram abertos.
