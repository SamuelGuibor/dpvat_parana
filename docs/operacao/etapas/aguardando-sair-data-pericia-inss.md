---
kind: extraido_dos_logs
status: rascunho
fonte: "logs:2026-10-24:90d"
coluna: AGUARDANDO SAIR DATA PERÍCIA INSS
redigido_por: null
validado_por: null
publicado_por: null
atualizado_em: 2026-10-24
pendente_humano: ["confirmar as perguntas sim/não com o dono"]
---

# 8. AGUARDANDO SAIR DATA PERÍCIA INSS

> Rascunho **extraído dos logs** (90 dias até 2026-10-24, `scripts/mapa-etapas.mjs --vault`). Mostra o que a equipe FEZ, não a regra. Vira regra quando o dono responder as perguntas e a nota for publicada.

## Resumo

- Prazo da coluna: sem prazo · mediana até sair: 6.9 dia(s)
- Passagens: 70 entradas · 54 saídas · 16 em andamento
- Vem de: AGENDAR PERÍCIA ADM (87%) · PERÍCIA INSS AGENDADA (6%) · FALTA SENHA - SOLICITADO (3%) · COM SENHA - SOLICITADO (1%)
- Vai para: FAZER ROTEIRO PREV (76%) · AUDITORIA (7%) · DISTRIBUIÇÃO DE PROCESSOS (6%) · AGENDAR PERÍCIA ADM (4%) · 6% voltaram para trás

## Para entrar (proposta)

- Chega com **DOCUMENTO DE IDENTIFICAÇÃO** (96% das saídas de AGENDAR PERÍCIA ADM, de onde o card mais vem)
- Chega com **PROCURAÇÃO** (74% das saídas de AGENDAR PERÍCIA ADM, de onde o card mais vem)
- Chega com **EXAME MÉDICO** (89% das saídas de AGENDAR PERÍCIA ADM, de onde o card mais vem)
- Chega com **DOCS INSS** (93% das saídas de AGENDAR PERÍCIA ADM, de onde o card mais vem)

## Para sair (proposta)

- Em 93% das saídas o card já tinha **DOCUMENTO DE IDENTIFICAÇÃO**
- Em 93% das saídas o card já tinha **EXAME MÉDICO**
- Em 100% das saídas o card já tinha **DOCS INSS**
- Em 74% das saídas o card já tinha **PROCESSO**

## O que acontece na etapa

- Arquivos recebidos em 79% das passagens: DOCS INSS 67% · PROCESSO 56% · EXAME MÉDICO 46% · OUTROS 41%
- Comentários: 1.0 por passagem · auditoria IA em 0%
- Etapa do checklist: Aguardando perícia administrativa (2)
- Arquivados a partir daqui: VOLTAR UM DIA (1%)

## Automações da coluna (ativas)

- Nenhuma.

## Hoje

- 15 card(s) ativos; tags mais comuns: COM SENHA (67%) · PRONTUÁRIO ANEXADO (47%) · SEM PROCESSO (27%) · BOTCONVERSA (7%) · RESUMO DE ALTA/ATESTADOS (7%)

## Perguntas para confirmar (sim/não)

1. Para sair de AGUARDANDO SAIR DATA PERÍCIA INSS, o card precisa ter **DOCUMENTO DE IDENTIFICAÇÃO**? (93% das saídas já tinham)
2. Para sair de AGUARDANDO SAIR DATA PERÍCIA INSS, o card precisa ter **EXAME MÉDICO**? (93% das saídas já tinham)
3. Para sair de AGUARDANDO SAIR DATA PERÍCIA INSS, o card precisa ter **DOCS INSS**? (100% das saídas já tinham)
4. Para sair de AGUARDANDO SAIR DATA PERÍCIA INSS, o card precisa ter **PROCESSO**? (74% das saídas já tinham)
