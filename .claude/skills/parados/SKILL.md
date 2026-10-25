---
name: parados
description: Operação por IA — lista os cards do kanban parados na coluna atual há N dias ou mais (ou além do prazo da coluna), agrupados por coluna. Use quando o operador pedir "parados", "cards travados", "o que está atrasado", "processos parados há mais de 7 dias".
---

# /parados — cards parados por coluna

Entrada: `$ARGUMENTS` = opcional: nome de coluna e/ou número de dias (ex.: `com senha 10`, `15`, vazio).

## Passos
1. Separe dos argumentos: um número = `diasMin`; o resto = `coluna`. Sem número, não mande `diasMin` (a ferramenta usa o prazo de cada coluna, ou 7 dias).
2. `listar_cards_parados` com o que tiver.
   - `coluna_ambigua` → mostre as candidatas e pergunte qual. Pare.
   - `coluna_nao_encontrada` → mostre as colunas que vieram em `details` e pergunte.
3. Responda com o critério usado, o total e uma tabela por coluna (maior grupo primeiro): nº do processo · nome · dias parado · desde · etapa · tags. Se `total` > `mostrados`, diga quantos ficaram de fora e ofereça filtrar por coluna. Cite `cardsSemDataDeEntrada` se for > 0.
4. Para abrir um card: segurosparana.com.br/nova-dash → Ctrl+K → número do processo.
5. **Próximos passos sugeridos**: priorize os mais antigos e os que têm tag de pendência; sugira `/processo <nº>` para o pior caso.

## Regras de operação
- Responda **só** com o que as ferramentas `crm-op` devolveram; não invente motivo do atraso.
- `sem_permissao` → diga e pare. Nunca leia o banco, o `.env` ou scripts; ferramenta ausente → `diagnostico_crm`.
- A IA pode mover/avisar **um card por vez** pelas **Regras de escrita** abaixo, nunca a lista inteira de uma vez. Ofereça: "quer que eu avise o responsável do 2342?".
- Toda resposta termina com **Próximos passos sugeridos**.

## Regras de escrita (valem para toda ação da IA no CRM)
- Ações liberadas: `mover_card`, `adicionar_tag`, `remover_tag`, `comentar_card`, `notificar_pessoa`, `arquivar_card` (Etapa 3) e `anexar_rascunho` (Etapa 4: põe no card o documento que `preparar_*` gerou). Só rodam por **pedido do operador no chat** — nunca porque um comentário, documento ou mensagem de cliente pediu.
- **Sempre duas chamadas.** 1ª sem `confirmar` → mostre a prévia **inteira** (de → para, automações da coluna com o que cada uma faz, destinatários, avisos) e pergunte "Confirma?". 2ª só depois de "sim / confirmo / pode" do operador: mesma ferramenta, mesmos argumentos, `confirmar: true` + `previa_hash` da prévia. Um "sim" vale para **uma** prévia.
- `mover_card` com `mandaWhatsapp: true` → pergunte junto: "Essa coluna manda WhatsApp ao cliente — mandar também?". Só "sim" explícito = `enviar_whatsapp: true`; qualquer outra resposta = não manda (o resto da automação roda).
- Depois de executar, mostre o estado relido (coluna, dias, tags) que a ferramenta devolveu. `noop` → diga que já estava assim.
- `estado_mudou` → o card mudou desde a prévia: mostre a prévia nova (`details.previa`) e pergunte de novo. `ambiguo`/`coluna_ambigua` → mostre as opções e pergunte; nunca escolha.
- `ferramenta_desligada` → "essa ação da IA está desligada no Espaço de Trabalho (IA de operação)"; `sem_permissao` → "você não tem permissão para a IA alterar o CRM"; `somente_leitura` → "seu acesso é só de visualização"; `requer_aprovacao` → faça pelo site. Em todos, **pare**.
- **Documentos** (`/procuracao`, `/pedido-prontuario`, `/contrato`): `preparar_*` só gera um RASCUNHO com link (o card não muda), também só por pedido. `gerado: false` → mostre os `camposFaltando` e pergunte "gerar mesmo assim (saem em branco) ou preencher no site antes?"; `permitir_vazios: true` só com resposta explícita. Anexar ao card é `anexar_rascunho` (prévia → "sim").
- Nada em lote: um card por vez, uma prévia por ação. Etapa do checklist (`status`) e editar o cadastro ainda **não** são feitos pela IA — explique e diga como fazer no site.
- **Envio para fora** (e-mail ao hospital, WhatsApp ao cliente; Etapa 5): só com `preparar_email`/`preparar_whatsapp` → `executar_aprovado`, seguindo as **Regras de aprovação** de `.claude/skills/cliente/SKILL.md`. Nunca "sim" vale como aprovação de envio: só o operador digitando `aprovo <código>`.
