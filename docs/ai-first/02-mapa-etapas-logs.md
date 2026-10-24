# Mapa das etapas do kanban pelos logs — últimos 90 dias

> Gerado por `scripts/mapa-etapas.mjs` em 24/10/2026, 18:47:33. Só números agregados.
> 1074 cards com movimento na janela · 26082 logs lidos · passagem = entrada na coluna por `move` até o próximo `move`.
> **Isto é o que a equipe FEZ, não a regra oficial.** Serve de rascunho para as notas `etapas/<coluna>.md`; uma pessoa confirma.

## Resumo do fluxo

| # | Coluna | entradas | saídas | em andamento | dias até sair (mediana) | prazo da coluna | voltou para trás | vem de (top) | vai para (top) |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Filtro de Cartões | 21 | 19 | 2 | 0.0 | 1 | 0% | COLHER-ASSINATURA (67%) · CARTÕES PARA NIKOLAS ANALISAR (10%) | COLHER-ASSINATURA (68%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (11%) |
| 1 | COLHER-ASSINATURA | 799 | 676 | 123 | 0.7 | 2 | 2% | Filtro de Cartões (97%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (1%) | FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (86%) · CARTÕES PARA NIKOLAS ANALISAR (6%) |
| 2 | FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL | 753 | 735 | 18 | 0.1 | — | 2% | COLHER-ASSINATURA (78%) · Filtro de Cartões (13%) | DISTRIBUIÇÃO DE SOLICITAÇÕES (71%) · FALTA SENHA - SOLICITADO (18%) |
| 3 | DISTRIBUIÇÃO DE SOLICITAÇÕES | 550 | 544 | 6 | 0.0 | — | 7% | FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (96%) · FALTA SENHA - SOLICITADO (1%) | FALTA SENHA - SOLICITADO (80%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (7%) |
| 4 | FALTA SENHA - SOLICITADO | 641 | 614 | 27 | 1.1 | — | 3% | DISTRIBUIÇÃO DE SOLICITAÇÕES (68%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (20%) | COM SENHA - SOLICITADO (37%) · INSS/OAB/POUPA TEMPO (30%) |
| 5 | COM SENHA - SOLICITADO | 363 | 301 | 62 | 0.1 | 30 | 5% | FALTA SENHA - SOLICITADO (65%) · INSS/OAB/POUPA TEMPO (14%) | AUDITORIA (57%) · DISTRIBUIÇÃO DE PROCESSOS (20%) |
| 6 | INSS/OAB/POUPA TEMPO | 260 | 228 | 32 | 1.2 | — | 39% | FALTA SENHA - SOLICITADO (72%) · COLHER-ASSINATURA (9%) | DISTRIBUIÇÃO DE PROCESSOS (38%) · COM SENHA - SOLICITADO (23%) |
| 7 | AGENDAR PERÍCIA ADM | 124 | 106 | 18 | 1.7 | — | 20% | DISTRIBUIÇÃO DE PROCESSOS (34%) · COM SENHA - SOLICITADO (15%) | AGUARDANDO SAIR DATA PERÍCIA INSS (58%) · INSS/OAB/POUPA TEMPO (13%) |
| 8 | AGUARDANDO SAIR DATA PERÍCIA INSS | 70 | 54 | 16 | 6.9 | — | 6% | AGENDAR PERÍCIA ADM (87%) · PERÍCIA INSS AGENDADA (6%) | FAZER ROTEIRO PREV (76%) · AUDITORIA (7%) |
| 9 | PERÍCIA INSS AGENDADA | 11 | 10 | 1 | 0.0 | — | 50% | AFASTADOS (36%) · AGENDAR PERÍCIA ADM (36%) | AFASTADOS (40%) · AGUARDANDO SAIR DATA PERÍCIA INSS (30%) |
| 10 | AFASTADOS | 83 | 50 | 33 | 11.2 | — | 14% | EM ANALISE UNI / AFASTADOS APTOS (12%) · AFASTADOS APTOS (11%) | FAZER ROTEIRO PREV (76%) · REVISÃO PRÉ-PASTA |UNI (6%) |
| 11 | DISTRIBUIÇÃO DE PROCESSOS | 282 | 270 | 12 | 0.1 | — | 25% | INSS/OAB/POUPA TEMPO (30%) · COM SENHA - SOLICITADO (23%) | AUDITORIA (39%) · FAZER ROTEIRO PREV (34%) |
| 12 | AUDITORIA | 423 | 390 | 33 | 1.0 | — | 13% | COM SENHA - SOLICITADO (41%) · DISTRIBUIÇÃO DE PROCESSOS (25%) | FAZER ROTEIRO PREV (81%) · DISTRIBUIÇÃO DE PROCESSOS (5%) |
| 13 | FAZER ROTEIRO PREV | 631 | 616 | 15 | 0.1 | — | 5% | AUDITORIA (52%) · DISTRIBUIÇÃO DE PROCESSOS (15%) | REVISÃO PRÉ-PASTA |UNI (48%) · REVISÃO PRÉ-PASTA | CAIQUE (44%) |
| 14 | REVISÃO PRÉ-PASTA |UNI | 330 | 317 | 13 | 0.1 | — | 4% | FAZER ROTEIRO PREV (89%) · ENVIAR  EMAIL UNI (3%) | ENVIAR  EMAIL UNI (54%) · ENVIAR  EMAIL UNI/CCS (35%) |
| 15 | ENVIAR  EMAIL UNI/CCS | 116 | 115 | 1 | 0.1 | — | 7% | REVISÃO PRÉ-PASTA |UNI (95%) · ENVIADOS P/ UNI/CCS (3%) | ENVIADOS P/ UNI/CCS (91%) · REVISÃO PRÉ-PASTA |UNI (6%) |
| 16 | ENVIADOS P/ UNI/CCS | 126 | 77 | 49 | 0.8 | — | 12% | ENVIAR  EMAIL UNI/CCS (83%) · REVISÃO PRÉ-PASTA |UNI (6%) | EM ANALISE UNI (66%) · EM ANALISE UNI / AFASTADOS APTOS (14%) |
| 17 | EM ANALISE UNI | 178 | 73 | 105 | 2.0 | — | 29% | ENVIADOS P/ UNI (51%) · ENVIADOS P/ UNI/CCS (29%) | PENDÊNCIAS JUDICIAL (60%) · AUDITORIA (12%) |
| 18 | COBRANÇA | 12 | 1 | 11 | 1.0 | — | 100% | REVISÃO PRÉ-PASTA |UNI (67%) · PENDÊNCIAS JUDICIAL (17%) | EM ANALISE UNI (100%) |
| 19 | PENDÊNCIAS JUDICIAL | 150 | 91 | 59 | 2.8 | — | 55% | ENVIADO P/ CAIQUE (44%) · EM ANALISE UNI (29%) | EM ANALISE UNI (20%) · ENVIAR  EMAIL UNI (18%) |

Nomes que não estão na lista de colunas de hoje (ex.: "REVISÃO PRÉ-PASTA | CAIQUE", "ENVIAR  EMAIL UNI") são colunas antigas, renomeadas ou apagadas: aparecem em "vem de/vai para" mas não contam como "voltou". A coluna 0 recebe quase todos os cards por criação (log `create`), não por `move`, então tem poucas entradas aqui.

## O que o card já tem ao sair de cada coluna (% das saídas com ≥ 1 arquivo na pasta)

| Coluna | saídas | DOCUMENTO DE IDENTIFICAÇÃO | PROCURAÇÃO | DECLARAÇÃO DE HIPOSSUFICIÊNCIA | EXAME MÉDICO | DOCS INSS | PROCESSO | ROTEIRO | OUTROS |
|---|---|---|---|---|---|---|---|---|---|
| Filtro de Cartões | 19 | **84** | 16 | 11 | 32 | 21 | 11 | 16 | 11 |
| COLHER-ASSINATURA | 676 | **87** | 46 | 27 | 8 | 6 | 2 | 0 | 16 |
| FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL | 735 | **90** | 62 | 34 | 15 | 16 | 6 | 0 | 16 |
| DISTRIBUIÇÃO DE SOLICITAÇÕES | 544 | **94** | 60 | 26 | 17 | 15 | 5 | 1 | 17 |
| FALTA SENHA - SOLICITADO | 614 | **95** | 67 | 34 | 34 | 58 | 17 | 0 | 26 |
| COM SENHA - SOLICITADO | 301 | **94** | 54 | 22 | 54 | **97** | 29 | 0 | 34 |
| INSS/OAB/POUPA TEMPO | 228 | **99** | **83** | 35 | 38 | **80** | 20 | 5 | 17 |
| AGENDAR PERÍCIA ADM | 106 | **96** | **74** | 24 | **89** | **93** | 19 | 7 | 51 |
| AGUARDANDO SAIR DATA PERÍCIA INSS | 54 | **93** | 52 | 19 | **93** | **100** | **74** | 2 | 63 |
| PERÍCIA INSS AGENDADA | 10 | **90** | 40 | 0 | **90** | **80** | 40 | 10 | 20 |
| AFASTADOS | 50 | **96** | **86** | 24 | **88** | **96** | 46 | 38 | 20 |
| DISTRIBUIÇÃO DE PROCESSOS | 270 | **95** | **77** | 42 | 56 | **98** | 26 | 2 | 20 |
| AUDITORIA | 390 | **93** | 58 | 31 | **85** | **99** | 41 | 8 | 35 |
| FAZER ROTEIRO PREV | 616 | **93** | 62 | 27 | **92** | **100** | 46 | **82** | 39 |
| REVISÃO PRÉ-PASTA |UNI | 317 | **100** | **91** | 51 | **88** | **100** | 38 | **96** | 17 |
| ENVIAR  EMAIL UNI/CCS | 115 | **100** | **99** | **83** | **99** | **100** | 38 | **100** | 13 |
| ENVIADOS P/ UNI/CCS | 77 | **100** | **100** | **71** | **99** | **100** | 34 | **100** | 12 |
| EM ANALISE UNI | 73 | **100** | **97** | 45 | **81** | **100** | 44 | **100** | 19 |
| COBRANÇA | 1 | **100** | **100** | 0 | **100** | **100** | **100** | **100** | **100** |
| PENDÊNCIAS JUDICIAL | 91 | **97** | **91** | 24 | **80** | **97** | 47 | **85** | 38 |

Em negrito: ≥ 70% — forte candidato a "precisa ter para sair". A coluna em que uma pasta passa de fraca para negrito é onde a equipe costuma completá-la.

## Por coluna

### 0. Filtro de Cartões
- **Passagens**: 21 entradas · 19 saídas · 2 em andamento · mediana até sair: 0.0 dia(s) (prazo da coluna: 1).
- **Vem de**: COLHER-ASSINATURA (67%) · CARTÕES PARA NIKOLAS ANALISAR (10%) · PORTAL CAIQUE PAGOS (5%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (5%)
- **Vai para**: COLHER-ASSINATURA (68%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (11%) · ENVIAR  EMAIL UNI (5%) · REVISÃO PRÉ-PASTA | CAIQUE (5%)
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (10%)
- **Recebeu durante a etapa**:
  - arquivos: 19% das passagens; por pasta: OUTROS 19% · DOCUMENTO DE IDENTIFICAÇÃO 14%
  - campos do cadastro editados: 62% das passagens; mais editados: Lesões 33% · Cidade 33% · Número 29% · Bairro 29% · CEP 29% · Estado 29%
  - etapa do checklist mudou: 10% → Filtro de Cartões (1) · CARTÕES PARA NIKOLAS ANALISAR (1)
  - comentários: 0.3 por passagem · auditoria IA: 10%
- **O card tinha ao sair** (19 saídas): DOCUMENTO DE IDENTIFICAÇÃO 84% · PROCURAÇÃO 16% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 11% · EXAME MÉDICO 32% · DOCS INSS 21% · PROCESSO 11% · ROTEIRO 16% · OUTROS 11%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, campo Lesões, campo Cidade
- **Hoje**: 3 card(s); tags mais comuns: —

### 1. COLHER-ASSINATURA
- **Passagens**: 799 entradas · 676 saídas · 123 em andamento · mediana até sair: 0.7 dia(s) (prazo da coluna: 2).
- **Vem de**: Filtro de Cartões (97%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (1%) · CARTÕES PARA NIKOLAS ANALISAR (1%) · INSS/OAB/POUPA TEMPO (1%)
- **Vai para**: FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (86%) · CARTÕES PARA NIKOLAS ANALISAR (6%) · INSS/OAB/POUPA TEMPO (4%) · Filtro de Cartões (2%) · 2% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: PERDEU CONTATO - DEFINITIVO (3%) · DESCARTADOS ANÁLISE INTERNA (3%) · VOLTAR UM DIA (2%) · DESISTIRAM EXPRESSAMENTE (1%)
- **Recebeu durante a etapa**:
  - arquivos: 67% das passagens; por pasta: OUTROS 49% · PROCURAÇÃO 39% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 23% · DOCUMENTO DE IDENTIFICAÇÃO 20% · EXAME MÉDICO 5% · DOCS INSS 4% · PROCESSO 3% · ROTEIRO 0%
  - campos do cadastro editados: 45% das passagens; mais editados: CEP 13% · CPF 12% · Nacionalidade 11% · Outro hospital 10% · Outra observação 10% · Observação 8%
  - etapa do checklist mudou: 0% → Processo iniciado (1)
  - comentários: 0.2 por passagem · auditoria IA: 2%
- **O card tinha ao sair** (676 saídas): DOCUMENTO DE IDENTIFICAÇÃO 87% · PROCURAÇÃO 46% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 27% · EXAME MÉDICO 8% · DOCS INSS 6% · PROCESSO 2% · ROTEIRO 0% · OUTROS 16%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO
- **Hoje**: 60 card(s); tags mais comuns: TEL RESGATE (17%) · SEM PROCESSO (8%) · BOTCONVERSA (2%) · FALTA SENHA (2%)

### 2. FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL
- **Passagens**: 753 entradas · 735 saídas · 18 em andamento · mediana até sair: 0.1 dia(s).
- **Vem de**: COLHER-ASSINATURA (78%) · Filtro de Cartões (13%) · DISTRIBUIÇÃO DE SOLICITAÇÕES (5%) · FALTA SENHA - SOLICITADO (1%)
- **Vai para**: DISTRIBUIÇÃO DE SOLICITAÇÕES (71%) · FALTA SENHA - SOLICITADO (18%) · DISTRIBUIÇÃO DE PROCESSOS (3%) · AUDITORIA (2%) · 2% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (1%) · VOLTAR UM DIA (0%) · DESISTIRAM EXPRESSAMENTE (0%)
- **Recebeu durante a etapa**:
  - arquivos: 31% das passagens; por pasta: OUTROS 22% · PROCURAÇÃO 12% · EXAME MÉDICO 11% · DOCS INSS 10% · DOCUMENTO DE IDENTIFICAÇÃO 8% · PROCESSO 7% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 6% · ROTEIRO 0%
  - campos do cadastro editados: 44% das passagens; mais editados: Hospital 23% · Outro hospital 13% · Data do acidente 6% · Senha INSS 6% · Observação 6% · Nacionalidade 4%
  - etapa do checklist mudou: 4% → Processo iniciado (26) · Documentação médica hospitalar (2) · Filtro de Cartões (1)
  - comentários: 0.5 por passagem · auditoria IA: 28%
- **O card tinha ao sair** (735 saídas): DOCUMENTO DE IDENTIFICAÇÃO 90% · PROCURAÇÃO 62% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 34% · EXAME MÉDICO 15% · DOCS INSS 16% · PROCESSO 6% · ROTEIRO 0% · OUTROS 16%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO
- **Hoje**: 6 card(s); tags mais comuns: SEM PROCESSO (17%)

### 3. DISTRIBUIÇÃO DE SOLICITAÇÕES
- **Passagens**: 550 entradas · 544 saídas · 6 em andamento · mediana até sair: 0.0 dia(s).
- **Vem de**: FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (96%) · FALTA SENHA - SOLICITADO (1%) · COLHER-ASSINATURA (1%) · INSS/OAB/POUPA TEMPO (1%)
- **Vai para**: FALTA SENHA - SOLICITADO (80%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (7%) · COM SENHA - SOLICITADO (5%) · DISTRIBUIÇÃO DE PROCESSOS (3%) · 7% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (1%) · DESISTIRAM EXPRESSAMENTE (0%)
- **Recebeu durante a etapa**:
  - arquivos: 21% das passagens; por pasta: OUTROS 13% · PROCURAÇÃO 6% · EXAME MÉDICO 6% · DOCUMENTO DE IDENTIFICAÇÃO 5% · DOCS INSS 2% · PROCESSO 2% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 0%
  - campos do cadastro editados: 20% das passagens; mais editados: Hospital 12% · Outro hospital 2% · Observação 1% · Data do acidente 1% · Senha INSS 1% · Nome 1%
  - etapa do checklist mudou: 8% → Processo iniciado (43) · Documentação médica hospitalar (1)
  - comentários: 0.5 por passagem · auditoria IA: 1%
- **O card tinha ao sair** (544 saídas): DOCUMENTO DE IDENTIFICAÇÃO 94% · PROCURAÇÃO 60% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 26% · EXAME MÉDICO 17% · DOCS INSS 15% · PROCESSO 5% · ROTEIRO 1% · OUTROS 17%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO
- **Hoje**: 2 card(s); tags mais comuns: COM SENHA (50%) · SEM PROCESSO (50%)

### 4. FALTA SENHA - SOLICITADO
- **Passagens**: 641 entradas · 614 saídas · 27 em andamento · mediana até sair: 1.1 dia(s).
- **Vem de**: DISTRIBUIÇÃO DE SOLICITAÇÕES (68%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (20%) · INSS/OAB/POUPA TEMPO (5%) · PROTOCOLO IMPRESSO NA PASTA DO HOSPITAL (2%)
- **Vai para**: COM SENHA - SOLICITADO (37%) · INSS/OAB/POUPA TEMPO (30%) · DISTRIBUIÇÃO DE PROCESSOS (9%) · AUDITORIA (7%) · 3% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: PERDEU CONTATO - DEFINITIVO (2%) · DESCARTADOS ANÁLISE INTERNA (1%) · NÃO ASSINARAM PROCURAÇÃO (0%) · DESISTIRAM EXPRESSAMENTE (0%)
- **Recebeu durante a etapa**:
  - arquivos: 60% das passagens; por pasta: DOCS INSS 52% · OUTROS 51% · EXAME MÉDICO 40% · PROCESSO 28% · PROCURAÇÃO 4% · DOCUMENTO DE IDENTIFICAÇÃO 2% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 1% · ROTEIRO 0%
  - campos do cadastro editados: 52% das passagens; mais editados: Senha INSS 29% · Observação 23% · Hospital 3% · Telefone secundário 2% · Nome 2% · Outro hospital 2%
  - etapa do checklist mudou: 7% → Processo iniciado (32) · Documentação médica hospitalar (14) · COLHER-ASSINATURA (1)
  - comentários: 0.4 por passagem · auditoria IA: 1%
- **O card tinha ao sair** (614 saídas): DOCUMENTO DE IDENTIFICAÇÃO 95% · PROCURAÇÃO 67% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 34% · EXAME MÉDICO 34% · DOCS INSS 58% · PROCESSO 17% · ROTEIRO 0% · OUTROS 26%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO
- **Hoje**: 4 card(s); tags mais comuns: FALTA SENHA (100%) · SEM PROCESSO (75%) · NÃO AFASTOU (25%)

### 5. COM SENHA - SOLICITADO
- **Passagens**: 363 entradas · 301 saídas · 62 em andamento · mediana até sair: 0.1 dia(s) (prazo da coluna: 30).
- **Vem de**: FALTA SENHA - SOLICITADO (65%) · INSS/OAB/POUPA TEMPO (14%) · DISTRIBUIÇÃO DE SOLICITAÇÕES (7%) · AUDITORIA (2%)
- **Vai para**: AUDITORIA (57%) · DISTRIBUIÇÃO DE PROCESSOS (20%) · AGENDAR PERÍCIA ADM (6%) · FAZER ROTEIRO PREV (5%) · 5% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (4%) · PERDEU CONTATO - DEFINITIVO (1%) · DESISTIRAM EXPRESSAMENTE (0%)
- **Recebeu durante a etapa**:
  - arquivos: 28% das passagens; por pasta: EXAME MÉDICO 22% · OUTROS 15% · DOCS INSS 10% · PROCESSO 4% · PROCURAÇÃO 1% · DOCUMENTO DE IDENTIFICAÇÃO 0% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 0%
  - campos do cadastro editados: 37% das passagens; mais editados: Observação 16% · Senha INSS 16% · Hospital 2% · Nome 2% · Outro hospital 2% · Data do acidente 1%
  - etapa do checklist mudou: 2% → Processo iniciado (3) · Documentos INSS (3) · Documentação médica hospitalar (2)
  - comentários: 0.7 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (301 saídas): DOCUMENTO DE IDENTIFICAÇÃO 94% · PROCURAÇÃO 54% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 22% · EXAME MÉDICO 54% · DOCS INSS 97% · PROCESSO 29% · ROTEIRO 0% · OUTROS 34%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta DOCS INSS
- **Hoje**: 46 card(s); tags mais comuns: COM SENHA (78%) · SEM PROCESSO (22%) · NÃO AFASTOU (13%) · TRABALHADOR (11%) · TEL PRETO (7%)

### 6. INSS/OAB/POUPA TEMPO
- **Passagens**: 260 entradas · 228 saídas · 32 em andamento · mediana até sair: 1.2 dia(s).
- **Vem de**: FALTA SENHA - SOLICITADO (72%) · COLHER-ASSINATURA (9%) · AGENDAR PERÍCIA ADM (5%) · PENDÊNCIAS JUDICIAL (3%)
- **Vai para**: DISTRIBUIÇÃO DE PROCESSOS (38%) · COM SENHA - SOLICITADO (23%) · FALTA SENHA - SOLICITADO (13%) · FAZER ROTEIRO PREV (8%) · 39% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (3%) · PERDEU CONTATO - DEFINITIVO (1%)
- **Recebeu durante a etapa**:
  - arquivos: 68% das passagens; por pasta: OUTROS 65% · DOCS INSS 63% · EXAME MÉDICO 50% · PROCESSO 34% · PROCURAÇÃO 5% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 3% · DOCUMENTO DE IDENTIFICAÇÃO 2%
  - campos do cadastro editados: 47% das passagens; mais editados: Senha INSS 34% · Observação 17% · Nacionalidade 2% · Hospital 2% · Nome 2% · CPF 2%
  - etapa do checklist mudou: 0%
  - comentários: 0.2 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (228 saídas): DOCUMENTO DE IDENTIFICAÇÃO 99% · PROCURAÇÃO 83% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 35% · EXAME MÉDICO 38% · DOCS INSS 80% · PROCESSO 20% · ROTEIRO 5% · OUTROS 17%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta DOCS INSS, campo Senha INSS
- **Hoje**: 20 card(s); tags mais comuns: SEM PROCESSO (55%) · NÃO AFASTOU (40%) · FALTA SENHA (35%) · PRONTUÁRIO ANEXADO (20%) · POUPA TEMPO (10%)

### 7. AGENDAR PERÍCIA ADM
- **Passagens**: 124 entradas · 106 saídas · 18 em andamento · mediana até sair: 1.7 dia(s).
- **Vem de**: DISTRIBUIÇÃO DE PROCESSOS (34%) · COM SENHA - SOLICITADO (15%) · INSS/OAB/POUPA TEMPO (12%) · FALTA SENHA - SOLICITADO (7%)
- **Vai para**: AGUARDANDO SAIR DATA PERÍCIA INSS (58%) · INSS/OAB/POUPA TEMPO (13%) · CARTÕES PARA NIKOLAS ANALISAR (7%) · FAZER ROTEIRO PREV (7%) · 20% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (2%) · VOLTAR UM DIA (2%)
- **Recebeu durante a etapa**:
  - arquivos: 52% das passagens; por pasta: OUTROS 48% · DOCS INSS 28% · EXAME MÉDICO 4% · PROCESSO 2%
  - campos do cadastro editados: 28% das passagens; mais editados: Senha INSS 16% · Data do acidente 9% · Nome 4% · Profissão 2% · Bairro 2% · Hospital 2%
  - etapa do checklist mudou: 2% → Documentos INSS (1) · Documentação médica hospitalar (1)
  - comentários: 1.4 por passagem · auditoria IA: 2%
- **O card tinha ao sair** (106 saídas): DOCUMENTO DE IDENTIFICAÇÃO 96% · PROCURAÇÃO 74% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 24% · EXAME MÉDICO 89% · DOCS INSS 93% · PROCESSO 19% · ROTEIRO 7% · OUTROS 51%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS
- **Hoje**: 12 card(s); tags mais comuns: PRONTUÁRIO ANEXADO (58%) · COM SENHA (50%) · SEM PROCESSO (33%) · NÃO AFASTOU (17%) · TEL RESGATE (17%)

### 8. AGUARDANDO SAIR DATA PERÍCIA INSS
- **Passagens**: 70 entradas · 54 saídas · 16 em andamento · mediana até sair: 6.9 dia(s).
- **Vem de**: AGENDAR PERÍCIA ADM (87%) · PERÍCIA INSS AGENDADA (6%) · FALTA SENHA - SOLICITADO (3%) · COM SENHA - SOLICITADO (1%)
- **Vai para**: FAZER ROTEIRO PREV (76%) · AUDITORIA (7%) · DISTRIBUIÇÃO DE PROCESSOS (6%) · AGENDAR PERÍCIA ADM (4%) · 6% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: VOLTAR UM DIA (1%)
- **Recebeu durante a etapa**:
  - arquivos: 79% das passagens; por pasta: DOCS INSS 67% · PROCESSO 56% · EXAME MÉDICO 46% · OUTROS 41%
  - campos do cadastro editados: 17% das passagens; mais editados: Senha INSS 6% · Nome 4% · Observação 4% · Telefone secundário 3% · Estado 1% · Bairro 1%
  - etapa do checklist mudou: 3% → Aguardando perícia administrativa (2)
  - comentários: 1.0 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (54 saídas): DOCUMENTO DE IDENTIFICAÇÃO 93% · PROCURAÇÃO 52% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 19% · EXAME MÉDICO 93% · DOCS INSS 100% · PROCESSO 74% · ROTEIRO 2% · OUTROS 63%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta PROCESSO
- **Hoje**: 15 card(s); tags mais comuns: COM SENHA (67%) · PRONTUÁRIO ANEXADO (47%) · SEM PROCESSO (27%) · BOTCONVERSA (7%) · RESUMO DE ALTA/ATESTADOS (7%)

### 9. PERÍCIA INSS AGENDADA
- **Passagens**: 11 entradas · 10 saídas · 1 em andamento · mediana até sair: 0.0 dia(s).
- **Vem de**: AFASTADOS (36%) · AGENDAR PERÍCIA ADM (36%) · AGUARDANDO SAIR DATA PERÍCIA INSS (18%) · DISTRIBUIÇÃO DE PROCESSOS (9%)
- **Vai para**: AFASTADOS (40%) · AGUARDANDO SAIR DATA PERÍCIA INSS (30%) · AGENDAR PERÍCIA ADM (20%) · FAZER ROTEIRO PREV (10%) · 50% voltaram para uma coluna anterior
- **Recebeu durante a etapa**:
  - arquivos: 18% das passagens; por pasta: OUTROS 9% · EXAME MÉDICO 9% · DOCUMENTO DE IDENTIFICAÇÃO 9% · DOCS INSS 9%
  - campos do cadastro editados: 27% das passagens; mais editados: Nome 27% · Telefone secundário 9%
  - etapa do checklist mudou: 0%
  - comentários: 0.5 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (10 saídas): DOCUMENTO DE IDENTIFICAÇÃO 90% · PROCURAÇÃO 40% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 0% · EXAME MÉDICO 90% · DOCS INSS 80% · PROCESSO 40% · ROTEIRO 10% · OUTROS 20%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS
- **Hoje**: 1 card(s); tags mais comuns: COM SENHA (100%) · FALTA SENHA (100%)

### 10. AFASTADOS
- **Passagens**: 83 entradas · 50 saídas · 33 em andamento · mediana até sair: 11.2 dia(s).
- **Vem de**: EM ANALISE UNI / AFASTADOS APTOS (12%) · AFASTADOS APTOS (11%) · ENVIADOS P/ UNI (7%) · DISTRIBUIÇÃO DE PROCESSOS (7%)
- **Vai para**: FAZER ROTEIRO PREV (76%) · REVISÃO PRÉ-PASTA |UNI (6%) · PERÍCIA INSS AGENDADA (4%) · AGENDAR PERÍCIA ADM (4%) · 14% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (2%) · APTOS UNI (2%)
- **Recebeu durante a etapa**:
  - arquivos: 20% das passagens; por pasta: EXAME MÉDICO 14% · DOCS INSS 7% · OUTROS 7% · PROCESSO 4%
  - campos do cadastro editados: 59% das passagens; mais editados: Nome 58% · Observação 5% · Senha INSS 1% · Data do acidente 1% · Outra observação 1%
  - etapa do checklist mudou: 1% → Documentação médica hospitalar (1)
  - comentários: 0.3 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (50 saídas): DOCUMENTO DE IDENTIFICAÇÃO 96% · PROCURAÇÃO 86% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 24% · EXAME MÉDICO 88% · DOCS INSS 96% · PROCESSO 46% · ROTEIRO 38% · OUTROS 20%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, campo Nome
- **Hoje**: 31 card(s); tags mais comuns: COM SENHA (55%) · PRONTUÁRIO ANEXADO (32%) · AFASTADOS (10%) · TEL PRETO (6%) · FALTA SENHA (6%)

### 11. DISTRIBUIÇÃO DE PROCESSOS
- **Passagens**: 282 entradas · 270 saídas · 12 em andamento · mediana até sair: 0.1 dia(s).
- **Vem de**: INSS/OAB/POUPA TEMPO (30%) · COM SENHA - SOLICITADO (23%) · FALTA SENHA - SOLICITADO (21%) · AUDITORIA (7%)
- **Vai para**: AUDITORIA (39%) · FAZER ROTEIRO PREV (34%) · AGENDAR PERÍCIA ADM (16%) · COM SENHA - SOLICITADO (3%) · 25% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (2%)
- **Recebeu durante a etapa**:
  - arquivos: 20% das passagens; por pasta: OUTROS 16% · EXAME MÉDICO 15% · DOCS INSS 6% · PROCESSO 5% · ROTEIRO 0%
  - campos do cadastro editados: 30% das passagens; mais editados: Senha INSS 10% · Outra observação 8% · Data do acidente 7% · Nome 5% · Observação 4% · Hospital 1%
  - etapa do checklist mudou: 2% → Documentos INSS (6) · Análise de documentos (1) · Documentação médica hospitalar (1)
  - comentários: 0.2 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (270 saídas): DOCUMENTO DE IDENTIFICAÇÃO 95% · PROCURAÇÃO 77% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 42% · EXAME MÉDICO 56% · DOCS INSS 98% · PROCESSO 26% · ROTEIRO 2% · OUTROS 20%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta DOCS INSS
- **Hoje**: 6 card(s); tags mais comuns: COM SENHA (83%) · SEM PROCESSO (50%)

### 12. AUDITORIA
- **Passagens**: 423 entradas · 390 saídas · 33 em andamento · mediana até sair: 1.0 dia(s).
- **Vem de**: COM SENHA - SOLICITADO (41%) · DISTRIBUIÇÃO DE PROCESSOS (25%) · FALTA SENHA - SOLICITADO (9%) · FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (4%)
- **Vai para**: FAZER ROTEIRO PREV (81%) · DISTRIBUIÇÃO DE PROCESSOS (5%) · EM ANALISE UNI (3%) · COM SENHA - SOLICITADO (2%) · 13% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (4%) · VOLTAR UM DIA (0%)
- **Recebeu durante a etapa**:
  - arquivos: 77% das passagens; por pasta: EXAME MÉDICO 70% · OUTROS 48% · PROCESSO 7% · DOCS INSS 7% · PROCURAÇÃO 4% · DOCUMENTO DE IDENTIFICAÇÃO 2% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 0%
  - campos do cadastro editados: 21% das passagens; mais editados: Nome 6% · Outra observação 5% · Data do acidente 3% · E-mail 2% · Telefone secundário 2% · Hospital 2%
  - etapa do checklist mudou: 5% → Perícia realizada (15) · Documentos INSS (3) · Documentação médica hospitalar (2)
  - comentários: 0.1 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (390 saídas): DOCUMENTO DE IDENTIFICAÇÃO 93% · PROCURAÇÃO 58% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 31% · EXAME MÉDICO 85% · DOCS INSS 99% · PROCESSO 41% · ROTEIRO 8% · OUTROS 35%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS
- **Hoje**: 18 card(s); tags mais comuns: SEM PROCESSO (89%) · COM SENHA (83%) · PENDÊNCIA (6%) · LAUDO MÉDICO UNI (6%) · PENDÊNCIA UNI (6%)

### 13. FAZER ROTEIRO PREV
- **Passagens**: 631 entradas · 616 saídas · 15 em andamento · mediana até sair: 0.1 dia(s).
- **Vem de**: AUDITORIA (52%) · DISTRIBUIÇÃO DE PROCESSOS (15%) · AGUARDANDO SAIR DATA PERÍCIA INSS (8%) · AFASTADOS (7%)
- **Vai para**: REVISÃO PRÉ-PASTA |UNI (48%) · REVISÃO PRÉ-PASTA | CAIQUE (44%) · AUDITORIA (2%) · AGENDAR PERÍCIA ADM (1%) · 5% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (1%) · APTOS CCS (0%)
- **Recebeu durante a etapa**:
  - arquivos: 88% das passagens; por pasta: ROTEIRO 86% · OUTROS 17% · PROCURAÇÃO 8% · DOCUMENTO DE IDENTIFICAÇÃO 6% · EXAME MÉDICO 4% · DOCS INSS 2% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 1% · PROCESSO 1%
  - campos do cadastro editados: 12% das passagens; mais editados: E-mail 3% · Nome 2% · Outra observação 2% · Data do acidente 1% · Observação 1% · Senha INSS 1%
  - etapa do checklist mudou: 6% → Perícia realizada (27) · Aguardando perícia administrativa (7) · Documentos INSS (6)
  - comentários: 0.2 por passagem · auditoria IA: 1%
- **O card tinha ao sair** (616 saídas): DOCUMENTO DE IDENTIFICAÇÃO 93% · PROCURAÇÃO 62% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 27% · EXAME MÉDICO 92% · DOCS INSS 100% · PROCESSO 46% · ROTEIRO 82% · OUTROS 39%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO
- **Hoje**: 10 card(s); tags mais comuns: COM SENHA (90%) · SEM PROCESSO (60%) · PRONTUÁRIO ANEXADO (30%) · ⚠️ PROCURAÇÃO TRANSGÊNICA ⚠️ (10%) · WHATSAPP  41 92005-4618 (10%)

### 14. REVISÃO PRÉ-PASTA |UNI
- **Passagens**: 330 entradas · 317 saídas · 13 em andamento · mediana até sair: 0.1 dia(s).
- **Vem de**: FAZER ROTEIRO PREV (89%) · ENVIAR  EMAIL UNI (3%) · ENVIAR  EMAIL UNI/CCS (2%) · CARTÕES PARA NIKOLAS ANALISAR (1%)
- **Vai para**: ENVIAR  EMAIL UNI (54%) · ENVIAR  EMAIL UNI/CCS (35%) · FAZER ROTEIRO PREV (3%) · ENVIADOS P/ UNI/CCS (3%) · 4% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESISTIRAM EXPRESSAMENTE (1%) · DESCARTADOS ANÁLISE INTERNA (1%) · APTOS UNI (0%)
- **Recebeu durante a etapa**:
  - arquivos: 63% das passagens; por pasta: OUTROS 59% · DOCUMENTO DE IDENTIFICAÇÃO 55% · PROCURAÇÃO 28% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 12% · ROTEIRO 4% · DOCS INSS 2% · PROCESSO 2% · EXAME MÉDICO 2%
  - campos do cadastro editados: 7% das passagens; mais editados: Nome 2% · Profissão 2% · Senha INSS 1% · Nacionalidade 1% · Bairro 1% · Data do acidente 0%
  - etapa do checklist mudou: 0% → Aguardando perícia administrativa (1)
  - comentários: 0.1 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (317 saídas): DOCUMENTO DE IDENTIFICAÇÃO 100% · PROCURAÇÃO 91% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 51% · EXAME MÉDICO 88% · DOCS INSS 100% · PROCESSO 38% · ROTEIRO 96% · OUTROS 17%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO
- **Hoje**: 7 card(s); tags mais comuns: DOCUMENTO VENCIDO (100%) · COM SENHA (43%) · PRONTUÁRIO ANEXADO (29%) · RETIRADA PRESENCIAL (14%) · SEM PROCESSO (14%)

### 15. ENVIAR  EMAIL UNI/CCS
- **Passagens**: 116 entradas · 115 saídas · 1 em andamento · mediana até sair: 0.1 dia(s).
- **Vem de**: REVISÃO PRÉ-PASTA |UNI (95%) · ENVIADOS P/ UNI/CCS (3%) · FAZER ROTEIRO PREV (2%) · ENVIADO P/ CAIQUE (1%)
- **Vai para**: ENVIADOS P/ UNI/CCS (91%) · REVISÃO PRÉ-PASTA |UNI (6%) · COBRANÇA (1%) · EM ANALISE UNI (1%) · 7% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: DESCARTADOS ANÁLISE INTERNA (1%)
- **Recebeu durante a etapa**:
  - arquivos: 31% das passagens; por pasta: DECLARAÇÃO DE HIPOSSUFICIÊNCIA 16% · OUTROS 16% · PROCURAÇÃO 15% · DOCUMENTO DE IDENTIFICAÇÃO 12% · ROTEIRO 3% · PROCESSO 3% · DOCS INSS 2%
  - campos do cadastro editados: 12% das passagens; mais editados: Profissão 8% · Nome 3% · Data do acidente 1%
  - etapa do checklist mudou: 0%
  - comentários: 0.1 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (115 saídas): DOCUMENTO DE IDENTIFICAÇÃO 100% · PROCURAÇÃO 99% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 83% · EXAME MÉDICO 99% · DOCS INSS 100% · PROCESSO 38% · ROTEIRO 100% · OUTROS 13%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta DECLARAÇÃO DE HIPOSSUFICIÊNCIA, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO

### 16. ENVIADOS P/ UNI/CCS
- **Passagens**: 126 entradas · 77 saídas · 49 em andamento · mediana até sair: 0.8 dia(s).
- **Vem de**: ENVIAR  EMAIL UNI/CCS (83%) · REVISÃO PRÉ-PASTA |UNI (6%) · EM ANALISE UNI (3%) · EM ANALISE UNI / AFASTADOS APTOS (2%)
- **Vai para**: EM ANALISE UNI (66%) · EM ANALISE UNI / AFASTADOS APTOS (14%) · AFASTADOS (8%) · PENDÊNCIAS JUDICIAL (8%) · 12% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: PASTAS NEGADAS UNI (13%) · APTOS UNI (6%)
- **Recebeu durante a etapa**:
  - arquivos: 2% das passagens; por pasta: PROCURAÇÃO 2% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 2% · OUTROS 1% · DOCUMENTO DE IDENTIFICAÇÃO 1%
  - campos do cadastro editados: 2% das passagens; mais editados: Nome da mãe 1% · Lesões 1% · Outra observação 1%
  - etapa do checklist mudou: 0%
  - comentários: 0.1 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (77 saídas): DOCUMENTO DE IDENTIFICAÇÃO 100% · PROCURAÇÃO 100% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 71% · EXAME MÉDICO 99% · DOCS INSS 100% · PROCESSO 34% · ROTEIRO 100% · OUTROS 12%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta DECLARAÇÃO DE HIPOSSUFICIÊNCIA, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO
- **Hoje**: 23 card(s); tags mais comuns: COM SENHA (78%) · SEM PROCESSO (57%) · PRONTUÁRIO ANEXADO (26%) · FALTA SENHA (13%) · TEL RESGATE (9%)

### 17. EM ANALISE UNI
- **Passagens**: 178 entradas · 73 saídas · 105 em andamento · mediana até sair: 2.0 dia(s).
- **Vem de**: ENVIADOS P/ UNI (51%) · ENVIADOS P/ UNI/CCS (29%) · PENDÊNCIAS JUDICIAL (10%) · AUDITORIA (6%)
- **Vai para**: PENDÊNCIAS JUDICIAL (60%) · AUDITORIA (12%) · ENVIADOS P/ UNI (8%) · AFASTADOS (5%) · 29% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: APTOS UNI (46%) · PASTAS NEGADAS UNI (17%)
- **Recebeu durante a etapa**:
  - arquivos: 11% das passagens; por pasta: OUTROS 7% · EXAME MÉDICO 7% · PROCURAÇÃO 3% · DOCS INSS 1% · PROCESSO 1% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 1%
  - campos do cadastro editados: 2% das passagens; mais editados: Senha INSS 1% · Nacionalidade 1% · RG 1%
  - etapa do checklist mudou: 1% → Acompanhamento judicial (1)
  - comentários: 0.2 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (73 saídas): DOCUMENTO DE IDENTIFICAÇÃO 100% · PROCURAÇÃO 97% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 45% · EXAME MÉDICO 81% · DOCS INSS 100% · PROCESSO 44% · ROTEIRO 100% · OUTROS 19%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO
- **Hoje**: 5 card(s); tags mais comuns: COM SENHA (60%) · SEM QUALIDADE (20%) · PENDÊNCIA (20%) · MACKENZIE (20%) · LAUDO MÉDICO UNI (20%)

### 18. COBRANÇA
- **Passagens**: 12 entradas · 1 saídas · 11 em andamento · mediana até sair: 1.0 dia(s).
- **Vem de**: REVISÃO PRÉ-PASTA |UNI (67%) · PENDÊNCIAS JUDICIAL (17%) · EM ANALISE UNI (8%) · ENVIAR  EMAIL UNI/CCS (8%)
- **Vai para**: EM ANALISE UNI (100%) · 100% voltaram para uma coluna anterior
- **Recebeu durante a etapa**:
  - arquivos: 17% das passagens; por pasta: EXAME MÉDICO 17% · OUTROS 8% · DOCS INSS 8% · PROCESSO 8%
  - campos do cadastro editados: 0% das passagens; mais editados: —
  - etapa do checklist mudou: 0%
  - comentários: 0.0 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (1 saídas): DOCUMENTO DE IDENTIFICAÇÃO 100% · PROCURAÇÃO 100% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 0% · EXAME MÉDICO 100% · DOCS INSS 100% · PROCESSO 100% · ROTEIRO 100% · OUTROS 100%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta PROCESSO, pasta ROTEIRO, pasta OUTROS
- **Hoje**: 11 card(s); tags mais comuns: FALTA KIT (82%) · COM SENHA (64%) · TEL RESGATE (64%) · PRONTUÁRIO ANEXADO (27%) · TEL PRETO (18%)

### 19. PENDÊNCIAS JUDICIAL
- **Passagens**: 150 entradas · 91 saídas · 59 em andamento · mediana até sair: 2.8 dia(s).
- **Vem de**: ENVIADO P/ CAIQUE (44%) · EM ANALISE UNI (29%) · ENVIADOS P/ UNI (11%) · ENVIADOS P/ UNI/CCS (4%)
- **Vai para**: EM ANALISE UNI (20%) · ENVIAR  EMAIL UNI (18%) · AUDITORIA (12%) · CARTÕES PARA NIKOLAS ANALISAR (11%) · 55% voltaram para uma coluna anterior
- **Arquivados a partir daqui**: APTOS CCS (13%) · APTOS UNI (9%) · PASTAS NEGADAS CCS (5%) · PASTAS NEGADAS UNI (3%)
- **Recebeu durante a etapa**:
  - arquivos: 29% das passagens; por pasta: OUTROS 21% · EXAME MÉDICO 13% · DOCS INSS 8% · PROCURAÇÃO 5% · ROTEIRO 4% · PROCESSO 4% · DOCUMENTO DE IDENTIFICAÇÃO 1% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 1%
  - campos do cadastro editados: 7% das passagens; mais editados: Senha INSS 3% · Nome 1% · Nacionalidade 1% · Telefone 1% · E-mail 1% · Outra observação 1%
  - etapa do checklist mudou: 0%
  - comentários: 0.7 por passagem · auditoria IA: 0%
- **O card tinha ao sair** (91 saídas): DOCUMENTO DE IDENTIFICAÇÃO 97% · PROCURAÇÃO 91% · DECLARAÇÃO DE HIPOSSUFICIÊNCIA 24% · EXAME MÉDICO 80% · DOCS INSS 97% · PROCESSO 47% · ROTEIRO 85% · OUTROS 38%
- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): pasta DOCUMENTO DE IDENTIFICAÇÃO, pasta PROCURAÇÃO, pasta EXAME MÉDICO, pasta DOCS INSS, pasta ROTEIRO
- **Hoje**: 17 card(s); tags mais comuns: COM SENHA (47%) · PRONTUÁRIO ANEXADO (18%) · UNI (12%) · POUPA TEMPO (12%) · TEL RESGATE (12%)
