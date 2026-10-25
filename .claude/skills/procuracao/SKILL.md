---
name: procuracao
description: Operação por IA — prepara a procuração (ou a declaração de hipossuficiência) de UM card como rascunho em PDF, conferindo antes os campos do cadastro que o modelo usa; mostra o link de prévia e, se o operador quiser, anexa na pasta PROCURAÇÃO do card. Use quando o operador pedir "/procuracao 2342", "prepara a procuração Curitiba do 2342", "gera a procuração do fulano", "declaração de hipossuficiência do card X".
---

# /procuracao — preparar procuração (rascunho → prévia → anexar)

Entrada: `$ARGUMENTS` = card (número, CPF ou nome) e, opcional, o modelo ("Curitiba", "Taynara", "hipossuficiência"…).

## Passos
1. `listar_modelos` com `tipo: "procuracao"`. Se o operador disse o modelo, ache o **nome exato** na lista (`modelo` ou `arquivo`); se casar com mais de um ou nenhum, mostre a lista e pergunte. Sem modelo dito: mostre a lista e pergunte qual. Nunca escolha sozinho.
2. `preparar_procuracao` com `card` e `modelo` (nome exato), **sem** `permitir_vazios`.
   - `ambiguo` (card) → mostre as opções e pergunte. `modelo_de_outro_tipo` → use a ferramenta que `details.ferramenta` indica (pedido → `/pedido-prontuario`, KIT → `/contrato`).
   - `gerado: false` → liste os `camposFaltando` e pergunte: **"gerar mesmo assim (esses campos saem em branco) ou preencher no site antes?"**. A IA **não** preenche o cadastro: se o operador mandar os dados no chat ("RG 12.345.678-9, casado"), diga que precisa digitar na aba Cadastro do card e chamar de novo. Só com "gera mesmo assim" → repita com `permitir_vazios: true`.
   - `gerado: true` → mostre: arquivo, link de prévia (`previewUrl`, vale até `linkValidoAte`), campos que saíram em branco (se houver) e `rascunhoVenceEm`.
3. Pergunte: **"Anexo na pasta `<pastaSugerida>` do card?"**. Só se o operador quiser → `anexar_rascunho` com `rascunho` (sem `confirmar`) → mostre a prévia inteira (arquivo, card, pasta, campos em branco, aviso de arquivado) → "Confirma?" → "sim" → `anexar_rascunho` com `confirmar: true` + `previa_hash`. Pasta diferente só se o operador pedir (`pasta`).
4. Depois de anexar, diga que o documento está na pasta do card (aba Arquivos) e termine com **Próximos passos sugeridos** (ex.: mandar para o cliente assinar — hoje pelo site/WhatsApp manual; contrato no ZapSign → `/contrato`).

## Progresso (retomada — Regras de progresso de `.claude/skills/cliente/SKILL.md`)
`workflow: "procuracao"`. Antes do passo 1: `retomar_fluxo` com `card` + `workflow`. Depois: `procuracao` com `ref` = `rascunho` (passo 2, `gerado: true`); `anexar` com `ref` = `documento.id` (passo 3). Parou em `gerado: false` para o operador preencher o cadastro → `salvar_progresso` com `passo: "procuracao"` + `bloqueio` `dado_faltante` (`campos` de `camposFaltando`). Operador não quer anexar → `fim: "concluido"`. Retomado com o rascunho ainda válido → não gere de novo: vá direto ao anexar com a key do `jaFeito`.

## Regras
- Uma geração por pedido: o conversor de PDF é fila única (gerar em série atrasa a equipe toda). Nada em lote, nem "todos da coluna".
- O link de prévia é do rascunho, tem dado pessoal: mostre só para o operador, não cole em comentário nem mande ao cliente.
- `conversor_indisponivel` → "o conversor de PDF não respondeu, nada foi gravado; tente de novo em alguns minutos". `modelo_invalido` → o modelo .docx está com problema: avise quem cuida dos modelos (tela Modelos, `manage_templates`). Não insista em loop.
- `rascunho_expirado` → prepare de novo. `sem_permissao` ao anexar rascunho de outra pessoa → prepare o seu.
- Demais regras: "Regras de operação" de `.claude/skills/cliente/SKILL.md` e "Regras de escrita" de `.claude/skills/processo/SKILL.md` (prévia → "sim" → `confirmar` + `previa_hash`; `ferramenta_desligada`/`somente_leitura` → diga e pare).
