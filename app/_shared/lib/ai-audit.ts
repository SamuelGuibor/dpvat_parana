/* eslint-disable @typescript-eslint/no-explicit-any */
// Auditoria de documentos por IA (Claude).
//
// Três tipos de auditoria, pensados para rodar quando o card entra numa coluna
// (ação de automação "ai_audit") ou manualmente pelo card dialog:
//
//  - "documento_pessoal" (Checagem 1): lê o RG/CNH/CIN anexado ao card, extrai
//    a data de expedição (>10 anos = desatualizado → tag "DOCUMENTO VENCIDO" +
//    menção a um responsável) e cruza os dados do documento com os campos do
//    card.
//
//  - "inss_roteiro" — PRÉ-ROTEIRO (Checagem 2): analisa a documentação
//    previdenciária (CNIS, cartas de concessão, laudos, prontuário...) e decide
//    qual benefício/NB usar no roteiro, valida qualidade de segurado,
//    titularidade, duplicidade e coerência do relato, e renomeia os arquivos.
//    A CHAVE continua "inss_roteiro" de propósito: ela está gravada no
//    marcador dos comentários já publicados e no metadata dos logs — só o
//    RÓTULO virou "Pré-roteiro" (06/08/2026), agora que existe uma segunda
//    auditoria de docs do INSS.
//
//  - "inss_pre_envio" — PRÉ-ENVIO DE PASTAS: auditoria FINAL, rodada depois de
//    o roteiro já estar preenchido. Confere a completude documental do caso
//    (CTPS normal + "Outros Vínculos", identificação, comprovante de endereço,
//    procuração ad judicia, roteiro, documentação médica e os documentos do
//    INSS exigidos conforme o benefício ter sido concedido ou negado),
//    reconfirma a correlação médica × benefício e valida campo a campo o
//    roteiro já preenchido. Não renomeia arquivos.
//
// O resultado vira um comentário no card com um marcador estruturado na
// primeira linha ("[[AI_AUDIT|tipo|status]]"), que a CommentsTab renderiza com
// layout destacado e botões de feedback.

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./prisma";
import { createLog } from "./log";
import { markPersonalDocChecklistItem } from "./admin-checklist";

export type AiAuditType = "documento_pessoal" | "inss_roteiro" | "inss_pre_envio";

// Rótulos exibidos (a chave "inss_roteiro" é legado — ver cabeçalho).
export const AI_AUDIT_TYPE_LABELS: Record<AiAuditType, string> = {
  documento_pessoal: "Documento Pessoal (RG/CNH/CIN)",
  inss_roteiro: "Docs INSS — Pré-roteiro",
  inss_pre_envio: "Docs INSS — Pré-envio de pastas",
};

export const AI_AUDIT_AUTHOR = "🤖 IA — Auditoria";
export const AI_AUDIT_MARKER = "[[AI_AUDIT|";
export const AI_AUDIT_FEEDBACK_MARKER = "[[AI_AUDIT_FEEDBACK|";
// Comentário-placeholder criado no INÍCIO da auditoria (a CommentsTab renderiza
// um cartão animado de "analisando documentos..."); é apagado quando o
// resultado fica pronto.
export const AI_AUDIT_PENDING_MARKER = "[[AI_AUDIT_PENDING|";

// Responsável notificado quando o documento pessoal está vencido.
const EXPIRED_DOC_MENTION_NAME = "Luana Oliveira";
const EXPIRED_DOC_TAG = "DOCUMENTO VENCIDO";

const MAX_FILES = 12;
const MAX_FILES_PRE_ENVIO = 20; // auditoria da pasta fechada — ver buildContent
const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // limite de request da API é 32MB
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function fetchS3Buffer(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

type MediaKind = { kind: "image"; mediaType: string } | { kind: "pdf" } | null;

function mediaKind(name: string): MediaKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg"].includes(ext)) return { kind: "image", mediaType: "image/jpeg" };
  if (ext === "png") return { kind: "image", mediaType: "image/png" };
  if (ext === "webp") return { kind: "image", mediaType: "image/webp" };
  if (ext === "gif") return { kind: "image", mediaType: "image/gif" };
  if (ext === "pdf") return { kind: "pdf" };
  return null;
}

// Campos do card mostrados à IA para o cruzamento de dados.
const CARD_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  cpf: "CPF",
  rg: "RG",
  data_nasc: "Data de nascimento",
  nome_mae: "Nome da mãe",
  nacionalidade: "Nacionalidade / naturalidade",
  estado_civil: "Estado civil",
  profissao: "Profissão",
  rua: "Rua",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  cep: "CEP",
  data_acidente: "Data do acidente",
  hospital: "Hospital",
  lesoes: "Lesões",
  service: "Serviço",
  obs: "Observações",
  observacao: "Observações",
};

function cardSummary(card: Record<string, any>): string {
  const lines: string[] = [];
  for (const [field, label] of Object.entries(CARD_FIELD_LABELS)) {
    const v = card[field];
    if (v === null || v === undefined || v === "") continue;
    lines.push(`${label}: ${v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v)}`);
  }
  return lines.join("\n") || "(nenhum campo preenchido)";
}

// ─── Prompts ────────────────────────────────────────────────────────────────

function personalDocPrompt(card: Record<string, any>, today: string): string {
  return `Você é o auditor de documentos da Paraná Seguros (assessoria jurídica previdenciária). Hoje é ${today}. Esta é a "Checagem 1 — Documento Pessoal", disparada quando o cartão entra na coluna "FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL".

Analise os arquivos anexados ao cartão e localize o DOCUMENTO PESSOAL do cliente. Ignore os demais arquivos para esta auditoria.

## Passo a passo

1. **Identificar o tipo de documento:**
   - **RG clássico** — "REGISTRO GERAL", "CARTEIRA DE IDENTIDADE", impressão digital, CPF em campo separado, brasão estadual (SSP).
   - **CNH** — física (Ministério dos Transportes/DETRAN) ou digital/e-CNH (SENATRAN/Serpro, assinatura digital, QR code). Trate as duas variantes como "CNH".
   - **CIN** (Carteira de Identidade Nacional, modelo novo unificado desde ~2022) — "GOVERNO FEDERAL", campo único "Registro Geral-CPF", QR code, bilíngue.

2. **Extrair a data de expedição/emissão** — NUNCA a validade/vencimento; só a emissão importa.

3. **Regra dos 10 anos:**
   - Emitido há 10 anos ou menos → documento ATUALIZADO. Novo nome do arquivo: "DOCUMENTO PESSOAL ATUALIZADO (TIPO)" (ex.: "DOCUMENTO PESSOAL ATUALIZADO (CNH)").
   - Emitido há MAIS de 10 anos → DESATUALIZADO. Novo nome: "DOCUMENTO PESSOAL DESATUALIZADO (TIPO)".
   - Data ilegível/não visível → **não arrisque palpite**: marque como PENDENTE de verificação manual (nem atualizado nem desatualizado, sem renomear).

4. **Cruzamento de dados:** compare todos os campos do cartão relacionados ao documento (nome completo, CPF, RG, data de nascimento, naturalidade/nacionalidade, filiação/nome da mãe) contra o que está escrito no documento. Cada divergência deve ser direta, sem rodeios, no formato "CPF no cartão (000.000.000-00) ≠ CPF no documento (068.990.079-16)". Diferenças de caixa alta/baixa e abreviações equivalentes não são divergências. Grafia de nome levemente variada entre sistemas não é erro de titularidade — confirme por CPF + nome da mãe + data de nascimento.

DADOS DO CARTÃO:
${cardSummary(card)}

Cada arquivo anexado está precedido do seu documentId e nome atual. Responda SOMENTE com um JSON válido, sem markdown, neste formato:
{
  "documentoEncontrado": boolean,
  "tipoDocumento": "RG" | "CNH" | "CIN" | null,
  "documentId": "id do arquivo do documento pessoal" | null,
  "dataExpedicao": "dd/mm/aaaa" | null,
  "situacao": "atualizado" | "desatualizado" | "pendente",
  "novoNomeArquivo": "DOCUMENTO PESSOAL ATUALIZADO (TIPO)" | "DOCUMENTO PESSOAL DESATUALIZADO (TIPO)" | null,
  "dadosDocumento": { "nome": string|null, "cpf": string|null, "rg": string|null, "nascimento": string|null, "naturalidade": string|null, "filiacao": string|null },
  "divergencias": [ { "campo": string, "noDocumento": string, "noCartao": string } ],
  "resumo": "resumo objetivo em 2-4 frases, em português, direto e sem justificativas longas"
}`;
}

function inssPreRoteiroPrompt(card: Record<string, any>, today: string): string {
  return `Você é o auditor previdenciário da Paraná Seguros (assessoria jurídica, benefícios por incapacidade do INSS). Hoje é ${today}. Esta é a "Checagem 2 — Previdenciário × Prontuário (PRÉ-ROTEIRO)", disparada quando o cartão entra na coluna "DISTRIBUIÇÃO DE PROCESSOS". Objetivo: relacionar prontuário(s) com benefício(s) do INSS (NB), decidir qual NB será usado no roteiro, organizar/renomear os arquivos e deixar um comentário-resumo.

## Tipos de documento esperados

Já recebidos e validados em casos reais: Declaração de Benefícios, CNIS / Extrato Previdenciário (extrato completo, relações previdenciárias simples, extrato por ano civil, dados cadastrais), Carta de Concessão / Memória de Cálculo, Resultado de Perícia / Comunicação de Decisão (deferimento, indeferimento, aprovação de antecipação), Laudos Médicos (Laudo SABI e Perícia Médica Federal por análise documental), Cópia do Processo (protocolo completo do Meu INSS, com anexos, despachos e relações previdenciárias), Comprovante de Protocolo de Requerimento, Comprovante de Solicitação de Prorrogação do Benefício (referencia um NB já existente, NÃO é benefício novo — nomear "COMPROVANTE DE PRORROGAÇÃO NB {número} ({ano})"), prontuário médico, atestado avulso, sumário de alta/evolução, raio-X, e documentos de identificação que às vezes vêm no mesmo lote (pertencem à Checagem 1).

Citados no roteiro mas ainda sem exemplo real recebido — trate quando aparecerem: CAT (até hoje só apareceu embutida na Cópia do Processo), Boletim de Ocorrência, Boletim de Acidente de Trânsito Eletrônico Unificado, Comunicado de Acidente de Trabalho isolado, CTPS e Extrato de Outros Vínculos como documentos previdenciários próprios (úteis para profissão/vínculos do roteiro). Carta de Concessão de Pensão por Morte ou outro benefício de dependente NÃO é do escopo desta checagem.

**Terminologia interna (obrigatória):** o escritório chama de "Resultado de Perícia" o que o INSS chama de "Comunicação de Decisão", e de "Laudos Médicos" tanto o Laudo SABI quanto a Perícia Médica Federal por análise documental. NUNCA renomeie para a nomenclatura técnica oficial do INSS — use sempre os nomes internos.

## Passo a passo
1. **Titularidade** — confirme que todos os documentos pertencem ao mesmo cliente (CPF + nome da mãe + data de nascimento; grafia de nome variando entre sistemas NÃO é erro de titularidade). Pegue mixups como página de outro paciente dentro de um prontuário.
2. **Duplicidade por conteúdo** (não só por nome) — mesmo protocolo/NB/conteúdo com nomes diferentes = duplicata, sinalize. **Exceção:** a Cópia do Processo sempre traz embutidos os arquivos médicos, CNIS etc. — duplicidade DENTRO da Cópia do Processo é normal, não sinalize. Só sinalize duplicidade que apareça FORA do processo.
3. **Separar por ano e caso** — cada fato gerador distinto é um bloco próprio; nunca misture casos diferentes na mesma análise.
4. Levante todos os NBs presentes nos documentos de cada bloco.
5. Case cada NB com um prontuário/registro médico (data do acidente, diagnóstico/CID, médico responsável).
6. **Coerência do relato do acidente** entre prontuário e laudo pericial — divergência de mecanismo de lesão é sempre sinalizada, mesmo que não mude o NB escolhido.
7. **Qualidade de segurado em TODO caso** (regra fixa, nunca opcional): precisa de ≥1 contribuição na janela de 12 meses antes do acidente E ≥12 contribuições ao longo da vida.
   - **Se qualificado:** apenas declare "qualificado". SEM justificativa, sem citar de onde vieram as contribuições.
   - **Se não qualificado:** justifique o motivo (ex.: intervalo sem contribuição, tempo desde a última).
   - Em NENHUM dos dois casos cite nomes de empresas, instituições ou empregadores.
8. **Desempate entre NBs/casos candidatos** (um benefício por vez; nesta ordem):
   1. Filtro eliminatório: só concorrem NBs que passam na regra de contribuições do item 7.
   2. Fratura vence não-fratura. (CIDs que geralmente indicam fratura: S02, S12/S22/S32, S42, S52, S62, S72, S82, S92. Geralmente NÃO fratura: S43, S53/S63/S73/S83/S93, S06. Confirme sempre pela descrição por extenso.)
   3. Cirurgia é preferência explícita — pesa ainda mais quando já houve afastamento (benefício usufruído de fato).
   4. Entre fraturas de acidentes diferentes: vence a mais grave.
   5. NBs com prontuário/data do acidente a até 30 dias um do outro (ou NBs sequenciais do mesmo fato gerador — 2º começando logo após a cessação do 1º) são O MESMO CASO e são usados juntos, não competem. Indicação explícita de que dois eventos são "o mesmo processo/caso inicial" prevalece sobre a regra automática dos 30 dias.
   Quando mais de um caso é viável, explique por que o escolhido é melhor E por que os outros são menos favoráveis, citando o critério específico.
9. **Casos sem benefício concedido ("negativa"):** a Comunicação de Decisão de indeferimento substitui a Carta de Concessão. Verifique se ela realmente bate com a data/lesão do prontuário — nem sempre bate; se não bater, sinalize claramente e NÃO presuma relação só porque os dois vieram no mesmo lote. Se não houver Cópia do Processo anexada, avise explicitamente que está faltando.
10. **Padrão de nomenclatura:** "{TIPO DE DOCUMENTO} NB {número} ({ano do acidente})" — o ano é SEMPRE o do fato gerador/acidente, nunca o do requerimento/concessão/cessação. Prontuário: "PRONTUÁRIO {NOME COMPLETO DO CLIENTE} ({ANO})". **NUNCA renomear:** CTPS, CNIS (qualquer variante) e Declaração de Benefício que lista mais de um NB. Se dois arquivos colidirem em nome (ex.: dois prontuários do mesmo ano, acidentes diferentes), acrescente o NB no nome do prontuário do caso NÃO usado.
11. **A renomeação é uma ação SILENCIOSA:** preencha "renomearArquivos", mas NÃO descreva, liste ou comente as renomeações no resumo.
12. **Comentário-resumo (o único texto da resposta):** todo NB não usado precisa de motivo explícito de exclusão; o usado, de motivo de escolha. Caso reprovado → a PRIMEIRA frase é o motivo pelo qual não pode continuar. Caso aprovado → 1ª linha "NB a ser utilizado: {número} ({ano}) ({fato gerador})" (só a sigla NB em caixa alta, nunca o rótulo inteiro), depois o casamento prontuário↔NB + a qualidade de segurado conforme o item 7, e uma linha "NB que não deve ser utilizado: {número} ({ano})" + motivo para cada NB excluído. Não escreva análise expandida, passo a passo, tabelas nem nomes de empresas/instituições em nenhuma parte.

## Casos especiais conhecidos
- Pensão por Morte (dependente) não é incapacidade do próprio cliente — exclua da disputa direto.
- Página de outro paciente dentro de um prontuário (erro de mesclagem de PDF) — sinalize, não descarte o arquivo inteiro.
- Antecipação de pagamento (regra COVID-19, Lei 13.982/2020 e Portaria Conjunta MPS/INSS) é aprovada só com atestado simples — não estranhe a ausência de Laudo SABI/Perícia nesses casos; a Comunicação de Decisão cita a lei/portaria.
- "Protocolo de Requerimento" / "Comprovante do Protocolo de Requerimento" (tela do Meu INSS) = pedido em andamento, ainda sem NB/decisão.
- Da Carta de Concessão só importa extrair: número do benefício, vigência/cessação, requerido em, renda mensal.
- NB cujo início cai no dia seguinte (ou poucos dias depois) à cessação de outro, mesma espécie, costuma ser continuação do mesmo caso — cheque a proximidade antes de tratar como concorrência.

DADOS DO CARTÃO:
${cardSummary(card)}

Cada arquivo anexado está precedido do seu documentId e nome atual. Responda SOMENTE com um JSON válido, sem markdown, neste formato:
{
  "podeSeguir": boolean,
  "motivoReprovacao": string | null,
  "nbUtilizar": string | null,
  "beneficioEscolhido": string | null,
  "qualidadeSegurado": "valida" | "invalida" | "indeterminada",
  "justificativaEscolha": string | null,
  "beneficiosDescartados": [ { "beneficio": string, "motivo": string } ],
  "problemas": [ string ],
  "renomearArquivos": [ { "documentId": string, "novoNome": string } ],
  "instrucaoFinal": "Use os documentos médicos que se referem à data {data do acidente}, {fratura/dano}. Use os documentos do INSS que tangem o benefício de número {NB}." | null,
  "resumo": "o comentário-resumo, em português, com o motivo de reprovação em primeiro lugar quando houver"
}

"instrucaoFinal" é obrigatória sempre que o caso puder seguir, exatamente nesse formato, e não deve ser repetida dentro do "resumo".`;
}

function inssPreEnvioPrompt(card: Record<string, any>, today: string): string {
  return `Você é o auditor previdenciário da Paraná Seguros (assessoria jurídica, benefícios por incapacidade do INSS). Hoje é ${today}. Esta é a "Auditoria PRÉ-ENVIO DE PASTAS": a checagem FINAL, feita quando o roteiro JÁ está preenchido e a pasta está prestes a ser enviada. Objetivo: verificar a completude documental do caso, reconfirmar que a documentação médica se correlaciona com o benefício do INSS, e validar se o roteiro preenchido está correto.

Você NÃO renomeia arquivos nesta auditoria.

## Base mantida
A correlação médica × INSS continua sendo o núcleo: mesmo NB, mesma data do acidente, mesmo diagnóstico/CID, qualidade de segurado (≥1 contribuição nos 12 meses antes do fato gerador E ≥12 contribuições na vida). Os critérios de desempate entre NBs concorrentes (filtro de contribuições → fratura vence não-fratura → cirurgia, ainda mais com afastamento já usufruído → fratura mais grave → agrupamento de NBs a até 30 dias como o mesmo caso) valem quando houver mais de um candidato.

## Checklist de documentos obrigatórios

Sempre obrigatórios, todos da mesma titularidade:
- Carteira de Trabalho Digital — a versão normal E a versão "Outros Vínculos" (as duas).
- Algum documento de identificação (se emitido há mais de 10 anos, declare isso explicitamente).
- Comprovante de endereço.
- Procuração Ad Judicia — confira se os dados (nome, CPF etc.) batem com os demais documentos, mesma lógica de titularidade.
- Roteiro preenchido.
- Documentação médica.

Conforme a situação do benefício correlacionado:
- **Benefício CONCEDIDO e qualidade de segurado constatada:** CNIS (os 3 tipos/variantes), Declaração de Beneficiário, Carta de Concessão, Resultado da Perícia / Resultado do Benefício, Laudos Médicos, e CAT apenas se fizer sentido (ex.: acidente de trabalho).
- **Benefício NEGADO (qualquer motivo, exceto não comparecimento):** os mesmos documentos acima; para os que não existem por não ter havido concessão, é obrigatório um print do Meu INSS comprovando a ausência (ex.: "Documento não encontrado para este CPF"), COM os dados do cliente visíveis no print. Além disso, a **Cópia do Processo é obrigatória** neste caso.
- **Benefício NEGADO POR NÃO COMPARECIMENTO À PERÍCIA:** não é resultado válido para esta auditoria. NÃO aplique o checklist normal — a conclusão é que o caso deve ser DEVOLVIDO para a coluna "Agendar Perícia ADM".

Quando há mais de um NB no cartão: o checklist precisa estar completo para o **NB a ser utilizado** (documento faltando aqui é pendência do caso). Nos NBs não utilizados, registre o que existe, mas documentação incompleta neles NÃO bloqueia a auditoria.

## Validação do roteiro — checklist FIXO (rode TODOS os itens, sempre, um a um)
Não é uma lista de coisas para notar caso apareçam: é uma sequência a executar em todo roteiro, independentemente de quão óbvios sejam os outros achados. Reporte cada item como ok, erro ou não verificável.
1. Campo de e-mail não pode conter placeholder não substituído (ex.: "inserir_email-+{telefone}@gmail.com").
2. Campo RG não pode ser idêntico ao número do CPF — exceto quando a identificação for CIN, que legitimamente une RG e CPF no mesmo número (aí não é erro).
3. Profissão (atual e na época do acidente): confira cargo por extenso E código CBO. Localize na CTPS o vínculo cuja janela de datas cobre a data em questão e use exatamente o cargo e o CBO daquele trecho. Cargo certo com CBO de outro período ainda é erro. Sem CTPS enviada, marque como não verificável — nunca presuma correto.
4. Veículos envolvidos: todos os veículos citados no prontuário/laudo (inclusive de terceiros) precisam aparecer na resposta do roteiro.
5. Tempo de afastamento: REFAÇA a conta a partir das datas de início/cessação do benefício; não confie no valor escrito.
6. Consistência interna do prontuário/laudo (lateralidade direito × esquerdo, datas divergentes entre páginas) e entre o prontuário e o que o roteiro registrou.

## Duplicidade
Cheque duplicidade por conteúdo, não só por nome. Duplicidade DENTRO da Cópia do Processo é esperada — não sinalize. Só sinalize a que aparece fora dela.

## Qualidade de segurado
Se qualificado: diga apenas que o cliente é qualificado — sem justificativa, sem datas de contribuição, sem nomes de instituições. Se não qualificado: justifique o motivo (ex.: última contribuição X meses antes do acidente), também sem citar instituição/empregador.

## Avisos obrigatórios
- Documento médico sem relação com o benefício correlacionado → avise.
- Item do checklist faltando → avise dizendo especificamente o que falta.
- Cliente sem qualidade de segurado → é o motivo de reprovação, vem em primeiro lugar.
- Roteiro incorreto → especifique o campo e a divergência.

## Heurísticas
- CIDs que geralmente indicam fratura: S02, S12/S22/S32, S42, S52, S62, S72, S82, S92. Geralmente NÃO fratura: S43, S53/S63/S73/S83/S93, S06. Confirme sempre pela descrição por extenso.
- Antecipação de pagamento (regras excepcionais) pode ser aprovada só com atestado médico simples, sem laudo pericial completo.
- Grafia de nome variando entre sistemas (hospital × INSS × documentos assinados digitalmente) não é erro de titularidade — confirme por CPF + nome da mãe + data de nascimento.

DADOS DO CARTÃO:
${cardSummary(card)}

Cada arquivo anexado está precedido do seu documentId e nome atual. Responda SOMENTE com um JSON válido, sem markdown, neste formato:
{
  "podeSeguir": boolean,
  "motivoReprovacao": string | null,
  "devolverParaAgendarPericia": boolean,
  "nbUtilizar": string | null,
  "beneficioEscolhido": string | null,
  "situacaoBeneficio": "concedido" | "negado" | "negado_nao_comparecimento" | "indeterminada",
  "qualidadeSegurado": "valida" | "invalida" | "indeterminada",
  "justificativaEscolha": string | null,
  "beneficiosDescartados": [ { "beneficio": string, "motivo": string } ],
  "checklist": [ { "item": string, "situacao": "ok" | "faltando" | "nao_aplicavel", "observacao": string | null } ],
  "roteiro": [ { "campo": string, "situacao": "ok" | "erro" | "nao_verificavel", "divergencia": string | null } ],
  "problemas": [ string ],
  "resumo": "o comentário-resumo, coeso e objetivo, em português, com o motivo de reprovação em primeiro lugar quando houver"
}

O array "checklist" precisa conter uma entrada para CADA documento obrigatório aplicável ao caso, e o array "roteiro", uma entrada para CADA um dos 6 itens do checklist fixo do roteiro — inclusive os que estão corretos.`;
}

// ─── Execução ───────────────────────────────────────────────────────────────

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta da IA sem JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function buildContent(
  auditType: AiAuditType,
  card: Record<string, any>,
  docs: { id: string; key: string; name: string }[]
): Promise<{ content: any[]; usedFiles: string[]; skipped: string[] }> {
  const content: any[] = [];
  const usedFiles: string[] = [];
  const skipped: string[] = [];
  let total = 0;

  // O pré-envio confere a PASTA inteira (CTPS × 2, identificação, endereço,
  // procuração, roteiro, médicos e o bloco do INSS) — 12 arquivos estouram
  // fácil e um anexo cortado vira "documento faltando" falso.
  const maxFiles = auditType === "inss_pre_envio" ? MAX_FILES_PRE_ENVIO : MAX_FILES;

  for (const doc of docs.slice(0, maxFiles)) {
    const kind = mediaKind(doc.name || doc.key);
    if (!kind) { skipped.push(doc.name); continue; }
    try {
      const buf = await fetchS3Buffer(doc.key);
      if (buf.length > MAX_FILE_BYTES || total + buf.length > MAX_TOTAL_BYTES) {
        skipped.push(doc.name);
        continue;
      }
      total += buf.length;
      content.push({ type: "text", text: `Arquivo (documentId: ${doc.id}) — nome atual: "${doc.name}"` });
      if (kind.kind === "image") {
        content.push({
          type: "image",
          source: { type: "base64", media_type: kind.mediaType, data: buf.toString("base64") },
        });
      } else {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
        });
      }
      usedFiles.push(doc.name);
    } catch {
      skipped.push(doc.name);
    }
  }

  const today = new Date().toLocaleDateString("pt-BR");
  const prompt =
    auditType === "documento_pessoal"
      ? personalDocPrompt(card, today)
      : auditType === "inss_pre_envio"
        ? inssPreEnvioPrompt(card, today)
        : inssPreRoteiroPrompt(card, today);
  content.push({ type: "text", text: prompt });
  return { content, usedFiles, skipped };
}

/**
 * Consumo da última chamada à IA, no formato que o Canto da IA lê do log
 * (metadata.usage). Antes o `response.usage` era descartado e as auditorias —
 * que leem documentos inteiros com sonnet-5 — não apareciam em lugar nenhum.
 */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

async function callClaude(content: any[]): Promise<{ result: any; usage: AiUsage }> {
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("A IA recusou a análise deste conteúdo.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return {
    result: extractJson(text),
    usage: {
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: (response.usage as any)?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: (response.usage as any)?.cache_creation_input_tokens ?? 0,
    },
  };
}

// Garante a tag e conecta ao card; menciona e notifica a responsável.
async function flagExpiredDocument(cardId: string, isProcess: boolean) {
  let tag = await db.cardTag.findUnique({ where: { name: EXPIRED_DOC_TAG } });
  if (!tag) {
    tag = await db.cardTag.create({ data: { name: EXPIRED_DOC_TAG, color: "#dc2626" } });
  }
  if (isProcess) {
    await db.process.update({ where: { id: cardId }, data: { cardTags: { connect: { id: tag.id } } } });
  } else {
    await db.user.update({ where: { id: cardId }, data: { cardTags: { connect: { id: tag.id } } } });
  }

  const responsible = await db.user.findFirst({
    where: { name: { contains: EXPIRED_DOC_MENTION_NAME, mode: "insensitive" }, role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] } },
    select: { id: true, name: true },
  });
  return responsible;
}

function fmtDivergencias(divs: any[]): string {
  if (!Array.isArray(divs) || divs.length === 0) return "";
  return (
    "\n\n⚠️ **Divergências encontradas:**\n" +
    divs
      .map((d) => `- **${d.campo}**: documento diz "${d.noDocumento}" · cartão diz "${d.noCartao}"`)
      .join("\n")
  );
}

/**
 * Roda a auditoria e registra o resultado como comentário destacado no card.
 * Nunca lança — falhas viram um comentário de erro discreto + log no console.
 */
export async function runAiAudit({
  cardId,
  isProcess,
  auditType,
  authorId,
  authorName,
  trigger,
}: {
  cardId: string;
  isProcess: boolean;
  auditType: AiAuditType;
  authorId: string;
  authorName: string;
  trigger: "automation" | "manual";
}): Promise<void> {
  let pendingId: string | null = null;
  try {
    const card = isProcess
      ? await db.process.findUnique({ where: { id: cardId } })
      : await db.user.findUnique({ where: { id: cardId } });
    if (!card) return;
    const cardData = card as unknown as Record<string, any>;
    const targetName = String(cardData.name ?? "");

    // Placeholder de "analisando..." — vira um cartão animado na aba de
    // comentários enquanto a IA trabalha; removido quando o resultado sai.
    try {
      const pending = await db.comment.create({
        data: {
          text: `${AI_AUDIT_PENDING_MARKER}${auditType}]]`,
          authorName: AI_AUDIT_AUTHOR,
          targetName,
          userId: isProcess ? null : cardId,
          processId: isProcess ? cardId : null,
        },
      });
      pendingId = pending.id;
    } catch { /* placeholder é cosmético */ }

    const docs = await db.document.findMany({
      where: isProcess
        ? { processId: cardId, deletedAt: null }
        : { userId: cardId, processId: null, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { uploadedAt: "desc" }],
      select: { id: true, key: true, name: true },
    });

    // Cancelamento: o botão "Cancelar" da UI apaga o comentário-placeholder;
    // aqui a auditoria percebe o sumiço e descarta o resultado sem publicar.
    const wasCancelled = async (): Promise<boolean> => {
      if (!pendingId) return false;
      const still = await db.comment.findUnique({ where: { id: pendingId }, select: { id: true } });
      return !still;
    };

    const clearPending = async () => {
      if (!pendingId) return;
      try { await db.comment.delete({ where: { id: pendingId } }); } catch { /* já removido */ }
      pendingId = null;
    };

    const makeComment = async (status: string, body: string) => {
      await clearPending();
      return db.comment.create({
        data: {
          text: `${AI_AUDIT_MARKER}${auditType}|${status}]]\n${body}`,
          authorName: AI_AUDIT_AUTHOR,
          targetName,
          userId: isProcess ? null : cardId,
          processId: isProcess ? cardId : null,
        },
      });
    };

    if (docs.length === 0) {
      await makeComment("alerta", "Nenhum arquivo anexado ao cartão — auditoria não pôde ser realizada.");
      return;
    }

    const { content, usedFiles, skipped } = await buildContent(auditType, cardData, docs);
    if (usedFiles.length === 0) {
      await makeComment("alerta", "Nenhum arquivo legível (imagem ou PDF) entre os anexos — auditoria não pôde ser realizada.");
      return;
    }

    if (await wasCancelled()) return;
    const { result, usage } = await callClaude(content);
    if (await wasCancelled()) return; // cancelada durante a análise — descarta

    const skippedNote = skipped.length
      ? `\n\n_Arquivos não analisados (formato/tamanho): ${skipped.join(", ")}_`
      : "";

    if (auditType === "documento_pessoal") {
      let status = "ok";
      let body = "";
      let checklistMarked = false;

      // Renomeia o arquivo do documento pessoal conforme a regra dos 10 anos
      // ("DOCUMENTO PESSOAL ATUALIZADO/DESATUALIZADO (TIPO)").
      let renameNote = "";
      if (result.documentId && result.novoNomeArquivo && result.situacao !== "pendente") {
        const doc = docs.find((d) => d.id === result.documentId);
        if (doc) {
          const ext = (doc.name.match(/\.[a-zA-Z0-9]+$/) ?? [""])[0];
          const clean = String(result.novoNomeArquivo).replace(/\.[a-zA-Z0-9]+$/, "").trim().slice(0, 120);
          if (clean && `${clean}${ext}` !== doc.name) {
            await db.document.update({ where: { id: doc.id }, data: { name: `${clean}${ext}` } });
            renameNote = `\n\n_Arquivo renomeado: "${doc.name}" → "${clean}${ext}"_`;
          }
        }
      }

      const notifyResponsible = async (motivo: string) => {
        const responsible = await flagExpiredDocument(cardId, isProcess);
        if (responsible) {
          await db.notification.create({
            data: {
              recipientId: responsible.id,
              authorId,
              authorName: AI_AUDIT_AUTHOR,
              userId: isProcess ? null : cardId,
              processId: isProcess ? cardId : null,
              targetName,
              message: `${motivo} — ${targetName}`,
            },
          });
        }
        return responsible;
      };

      if (!result.documentoEncontrado) {
        status = "alerta";
        body = `Documento pessoal (RG/CNH/CIN) não localizado entre os anexos.\n\n${result.resumo ?? ""}`;
      } else if (result.situacao === "desatualizado") {
        status = "reprovado";
        const responsible = await notifyResponsible("Documento pessoal vencido detectado pela IA");
        const mention = responsible ? `\n\n@[${responsible.name}](${responsible.id}) — documento vencido, verificar com o cliente.` : "";
        body =
          `**${result.tipoDocumento ?? "Documento"}** expedido em **${result.dataExpedicao ?? "?"}** — emitido há mais de 10 anos: **DESATUALIZADO**. Etiqueta "${EXPIRED_DOC_TAG}" aplicada.` +
          fmtDivergencias(result.divergencias) +
          `\n\n${result.resumo ?? ""}${mention}`;
      } else if (result.situacao === "pendente") {
        // Data de expedição ilegível: não arriscar palpite — etiqueta + menção
        // à responsável para verificação manual (regra da skill).
        status = "alerta";
        const responsible = await notifyResponsible("Data de expedição ilegível — documento pendente de verificação manual");
        const mention = responsible ? `\n\n@[${responsible.name}](${responsible.id}) — data de expedição ilegível, verificar manualmente.` : "";
        body =
          `**${result.tipoDocumento ?? "Documento"}** localizado, mas a data de expedição está ilegível — **PENDENTE de verificação manual** (sem palpite). Etiqueta "${EXPIRED_DOC_TAG}" aplicada por precaução.` +
          fmtDivergencias(result.divergencias) +
          `\n\n${result.resumo ?? ""}${mention}`;
      } else {
        const hasDivs = Array.isArray(result.divergencias) && result.divergencias.length > 0;
        status = hasDivs ? "alerta" : "ok";
        body =
          `**${result.tipoDocumento ?? "Documento"}** expedido em **${result.dataExpedicao ?? "?"}** — dentro dos 10 anos: **ATUALIZADO**.` +
          fmtDivergencias(result.divergencias) +
          `\n\n${result.resumo ?? ""}`;

        // Documento em dia → marca "DOCUMENTO PESSOAL (ATUALIZADO)" no
        // Checklist Previdenciário da aba Arquivos.
        checklistMarked = await markPersonalDocChecklistItem(cardId, isProcess, true)
          .catch((err) => { console.error("[AI-AUDIT] Falha ao marcar checklist:", cardId, err); return false; });
        if (checklistMarked) {
          body += `\n\n_Checklist: "DOCUMENTO PESSOAL (ATUALIZADO)" marcado automaticamente._`;
        }
      }

      const comment = await makeComment(status, body + renameNote + skippedNote);
      await createLog({
        action: "ai_audit",
        message: `auditou o documento pessoal via IA (${status === "ok" ? "sem pendências" : status === "alerta" ? "com alertas" : "documento vencido"})`,
        authorId,
        authorName,
        userId: isProcess ? null : cardId,
        processId: isProcess ? cardId : null,
        metadata: { auditType, status, trigger, commentId: comment.id, files: usedFiles, usage, checklistMarked },
      });
      return;
    }

    if (auditType === "inss_pre_envio") {
      const faltando = (Array.isArray(result.checklist) ? result.checklist : []).filter(
        (c: any) => c?.situacao === "faltando",
      );
      const roteiroErros = (Array.isArray(result.roteiro) ? result.roteiro : []).filter(
        (r: any) => r?.situacao === "erro",
      );
      const roteiroNaoVerificavel = (Array.isArray(result.roteiro) ? result.roteiro : []).filter(
        (r: any) => r?.situacao === "nao_verificavel",
      );

      const parts: string[] = [];
      let status: string;

      if (result.devolverParaAgendarPericia) {
        // Negativa por não comparecimento não é desfecho auditável: o caso
        // volta para a fila de perícia em vez de seguir para o envio.
        status = "reprovado";
        parts.push(
          '**🚫 Benefício negado por NÃO COMPARECIMENTO à perícia** — não é um resultado válido para esta auditoria. ' +
            'Devolver o card para a coluna **"Agendar Perícia ADM"**.',
        );
      } else {
        status = result.podeSeguir && !faltando.length && !roteiroErros.length ? "ok" : result.podeSeguir ? "alerta" : "reprovado";
        if (!result.podeSeguir && result.motivoReprovacao) {
          parts.push(`**🚫 Motivo de reprovação:** ${result.motivoReprovacao}`);
        }
        if (result.nbUtilizar) {
          parts.push(
            `**NB a utilizar:** ${result.nbUtilizar}${result.beneficioEscolhido ? ` (${result.beneficioEscolhido})` : ""}` +
              (result.situacaoBeneficio && result.situacaoBeneficio !== "indeterminada"
                ? ` · benefício ${String(result.situacaoBeneficio).replace(/_/g, " ")}`
                : ""),
          );
        }
        parts.push(
          `**Qualidade de segurado:** ${
            result.qualidadeSegurado === "valida" ? "✅ qualificado" : result.qualidadeSegurado === "invalida" ? "❌ não qualificado" : "⚠️ indeterminada"
          }`,
        );
        if (result.justificativaEscolha) parts.push(`**Correlação:** ${result.justificativaEscolha}`);
      }

      if (Array.isArray(result.beneficiosDescartados) && result.beneficiosDescartados.length) {
        parts.push(
          "**Benefícios descartados:**\n" +
            result.beneficiosDescartados.map((b: any) => `- ${b.beneficio}: ${b.motivo}`).join("\n"),
        );
      }
      if (faltando.length) {
        parts.push(
          "**📋 Checklist — FALTANDO:**\n" +
            faltando.map((c: any) => `- ${c.item}${c.observacao ? ` — ${c.observacao}` : ""}`).join("\n"),
        );
      } else if (!result.devolverParaAgendarPericia) {
        parts.push("**📋 Checklist:** ✅ completo.");
      }
      if (roteiroErros.length) {
        parts.push(
          "**📝 Roteiro — divergências:**\n" +
            roteiroErros.map((r: any) => `- **${r.campo}**: ${r.divergencia ?? "divergência encontrada"}`).join("\n"),
        );
      } else if (!result.devolverParaAgendarPericia) {
        parts.push("**📝 Roteiro:** ✅ sem divergências nos itens verificados.");
      }
      if (roteiroNaoVerificavel.length) {
        parts.push(
          "**Itens do roteiro NÃO verificáveis:**\n" +
            roteiroNaoVerificavel
              .map((r: any) => `- **${r.campo}**${r.divergencia ? ` — ${r.divergencia}` : " — sem documento de apoio anexado"}`)
              .join("\n"),
        );
      }
      if (Array.isArray(result.problemas) && result.problemas.length) {
        parts.push("**⚠️ Problemas encontrados:**\n" + result.problemas.map((p: string) => `- ${p}`).join("\n"));
      }
      parts.push(result.resumo ?? "");

      const comment = await makeComment(status, parts.filter(Boolean).join("\n\n") + skippedNote);
      await createLog({
        action: "ai_audit",
        message: `auditou a pasta antes do envio via IA (${
          result.devolverParaAgendarPericia
            ? "devolver para agendar perícia"
            : status === "ok"
              ? "pasta completa"
              : status === "alerta"
                ? "com pendências"
                : "caso reprovado"
        })`,
        authorId,
        authorName,
        userId: isProcess ? null : cardId,
        processId: isProcess ? cardId : null,
        metadata: {
          auditType, status, trigger, commentId: comment.id, files: usedFiles,
          missingCount: faltando.length, roteiroErrorCount: roteiroErros.length,
        },
      });
      return;
    }

    // inss_roteiro (pré-roteiro)
    const renamed: string[] = [];
    if (Array.isArray(result.renomearArquivos)) {
      for (const r of result.renomearArquivos) {
        const doc = docs.find((d) => d.id === r.documentId);
        if (!doc || !r.novoNome || typeof r.novoNome !== "string") continue;
        const ext = (doc.name.match(/\.[a-zA-Z0-9]+$/) ?? [""])[0];
        const clean = r.novoNome.replace(/\.[a-zA-Z0-9]+$/, "").trim().slice(0, 120);
        if (!clean || clean === doc.name) continue;
        await db.document.update({ where: { id: doc.id }, data: { name: `${clean}${ext}` } });
        renamed.push(`"${doc.name}" → "${clean}${ext}"`);
      }
    }

    const status = result.podeSeguir ? "ok" : "reprovado";
    const parts: string[] = [];
    if (!result.podeSeguir && result.motivoReprovacao) {
      parts.push(`**🚫 Motivo de reprovação:** ${result.motivoReprovacao}`);
    }
    if (result.podeSeguir) {
      if (result.nbUtilizar) parts.push(`**NB a utilizar:** ${result.nbUtilizar}${result.beneficioEscolhido ? ` (${result.beneficioEscolhido})` : ""}`);
      parts.push(`**Qualidade de segurado:** ${result.qualidadeSegurado === "valida" ? "✅ válida" : result.qualidadeSegurado === "invalida" ? "❌ inválida" : "⚠️ indeterminada"}`);
      if (result.justificativaEscolha) parts.push(`**Justificativa:** ${result.justificativaEscolha}`);
    }
    if (Array.isArray(result.beneficiosDescartados) && result.beneficiosDescartados.length) {
      parts.push(
        "**Benefícios descartados:**\n" +
          result.beneficiosDescartados.map((b: any) => `- ${b.beneficio}: ${b.motivo}`).join("\n")
      );
    }
    if (Array.isArray(result.problemas) && result.problemas.length) {
      parts.push("**⚠️ Problemas encontrados:**\n" + result.problemas.map((p: string) => `- ${p}`).join("\n"));
    }
    // A renomeação é ação SILENCIOSA (regra da skill): os arquivos são
    // renomeados de fato, mas a lista não entra no comentário — fica só no log
    // (metadata.renamedCount) e visível na aba Arquivos.
    parts.push(result.resumo ?? "");
    // Última linha obrigatória do comentário-resumo, quando o caso pode seguir.
    if (result.podeSeguir && typeof result.instrucaoFinal === "string" && result.instrucaoFinal.trim()) {
      parts.push(result.instrucaoFinal.trim());
    }

    const comment = await makeComment(status, parts.filter(Boolean).join("\n\n") + skippedNote);
    await createLog({
      action: "ai_audit",
      message: `auditou a documentação do INSS (pré-roteiro) via IA (${result.podeSeguir ? "caso pode seguir" : "caso reprovado"})`,
      authorId,
      authorName,
      userId: isProcess ? null : cardId,
      processId: isProcess ? cardId : null,
      metadata: { auditType, status, trigger, commentId: comment.id, files: usedFiles, renamedCount: renamed.length, usage },
    });
  } catch (err) {
    console.error(`[AI_AUDIT] Erro na auditoria ${auditType} do card ${cardId}:`, err);
    // Se o placeholder já sumiu, a auditoria foi CANCELADA pelo usuário — não
    // publica comentário de erro.
    if (pendingId) {
      try {
        const still = await db.comment.findUnique({ where: { id: pendingId }, select: { id: true } });
        if (!still) return;
        await db.comment.delete({ where: { id: pendingId } });
      } catch { /* ok */ }
    }
    try {
      const card = isProcess
        ? await db.process.findUnique({ where: { id: cardId }, select: { name: true } })
        : await db.user.findUnique({ where: { id: cardId }, select: { name: true } });
      await db.comment.create({
        data: {
          text: `${AI_AUDIT_MARKER}${auditType}|erro]]\nA auditoria por IA falhou: ${err instanceof Error ? err.message : "erro desconhecido"}. Tente novamente pelo botão "Auditoria IA" do card.`,
          authorName: AI_AUDIT_AUTHOR,
          targetName: String(card?.name ?? ""),
          userId: isProcess ? null : cardId,
          processId: isProcess ? cardId : null,
        },
      });
    } catch { /* último recurso: só o console */ }
  }
}
