---
kind: oficial
status: publicado
fonte: "ticket:C-IJWLE"
redigido_por: Samuel Guibor
validado_por: Samuel Guibor
publicado_por: Samuel Guibor
atualizado_em: 2026-11-17
pendente_humano: []
---
# Roteiro de Visita (modelo 11/2026): preencher, revisar e montar a pasta

## 1. Seções e campos do modelo
Cada pergunta de opção usa a **grafia exata** das opções do modelo.

1. **Qualificação do cliente**: nome, nacionalidade, RG, CPF, endereço, CEP, cidade/UF, telefone, e-mail, estado civil, telefone/nome/parentesco do contato para recado.
2. **Dados do acidente**: descrição dos fatos, data, onde aconteceu, trajeto, veículo, proprietário do veículo, condição da vítima, partes do corpo, lado afetado, membro dominante.
3. **Situação profissional**: profissão na época, CLT, permanece na empresa, mês/ano da saída, voltou a trabalhar, mesma função, profissão atual.
4. **Histórico médico**: internação +1 dia, cirurgia, material de síntese e situação, sequelas e quais, acompanhamento, redução da capacidade.
5. **INSS**: afastamento e tempo, auxílio por incapacidade e data de cessação, qualidade de segurado, acidente de trabalho, CAT, BO.

## 2. Regras de preenchimento
- Sem informação → "Não apurado" (nenhuma caixa marcada).
- Condicional que não se aplica → "Não se aplica".
- Identificação vem dos dados do card; se faltar, dos documentos.
- E-mail vazio → `inserir_email-<telefone>@gmail.com`.
- Data do acidente pelos documentos médicos; se não houver, pelo relato.
- O relato do acidente informado pelo escritório é a fonte principal da dinâmica do acidente e completa o que os documentos não trazem. Documento que comprove o contrário (prontuário, CTPS/CNIS, Declaração de Benefícios, CAT, BO) prevalece.
- Não inventar além do relato.

## 3. Revisão Pré-Envio
Revisar o roteiro preenchido campo a campo, como texto, contra os documentos do card.

## 4. Montagem da pasta (ordem e nomes)
0. Documentação CCS (Kit CCS + Declaração de Hipossuficiência), em pasta separada
1. Fatos (roteiro)
2. Identificação
3. Comprovante de endereço
4. CTPS / Extrato de Outros Vínculos
5. Fato gerador (CAT, BO)
6. Docs. médicos da época (prontuário primeiro, depois cronológico)
7. Docs. atuais da sequela
8. INSS, nesta ordem: Declaração de Benefícios, CNIS, Carta de Concessão, Comunicado de Decisão, Laudo SABI, Cópia do Processo
9. Outros

Nomes dos arquivos:
- `{TIPO} NB {número} ({ano})`
- `PRONTUÁRIO {NOME} ({ANO})`
- `DOCUMENTO PESSOAL ATUALIZADO (RG)`
- Numeração `01.`, `06.1`…

Não vão na pasta: procuração, contrato de honorários, duplicados e arquivos de outra pessoa.

## Fonte
Ticket C-IJWLE (aberto por Henrique via IA em 2026-11-16), a partir do artefato "Central de Roteiros" (modelo do Roteiro de Visita 11/2026). Texto literal do pedido:

```text
1) Roteiro de Visita — as 5 seções e os campos do modelo: Qualificação do cliente (nome, nacionalidade, RG, CPF, endereço, CEP, cidade/UF, telefone, e-mail, estado civil, telefone/nome/parentesco do contato para recado); Dados do acidente (descrição dos fatos, data, onde aconteceu, trajeto, veículo, proprietário do veículo, condição da vítima, partes do corpo, lado afetado, membro dominante); Situação profissional (profissão na época, CLT, permanece na empresa, mês/ano da saída, voltou a trabalhar, mesma função, profissão atual); Histórico médico (internação +1 dia, cirurgia, material de síntese e situação, sequelas e quais, acompanhamento, redução da capacidade); INSS (afastamento e tempo, auxílio por incapacidade e data de cessação, qualidade de segurado, acidente de trabalho, CAT, BO). Cada pergunta de opção usa a grafia exata das opções do modelo.

2) Regras de preenchimento: sem informação = "Não apurado" (nenhuma caixa marcada); condicional que não se aplica = "Não se aplica"; identificação vem dos dados do card e, se faltar, dos documentos; e-mail vazio = inserir_email-<telefone>@gmail.com; data do acidente pelos documentos médicos (se não houver, pelo relato). Relato do acidente informado pelo escritório é a fonte principal da dinâmica do acidente e completa o que os documentos não trazem, mas documento que comprove o contrário (prontuário, CTPS/CNIS, Declaração de Benefícios, CAT, BO) prevalece. Não inventar além do relato.

3) Revisão Pré-Envio: revisa o roteiro preenchido (campo a campo, como texto) contra os documentos.

4) Montagem da pasta (ordem e nomes): 0 Documentação CCS (Kit CCS + Declaração de Hipossuficiência, pasta separada) · 1 Fatos (roteiro) · 2 Identificação · 3 Comprovante de endereço · 4 CTPS/Extrato de Outros Vínculos · 5 Fato gerador (CAT, BO) · 6 Docs. médicos da época (prontuário primeiro, depois cronológico) · 7 Docs. atuais da sequela · 8 INSS na ordem Declaração de Benefícios, CNIS, Carta de Concessão, Comunicado de Decisão, Laudo SABI, Cópia do Processo · 9 Outros. Nomes: "{TIPO} NB {número} ({ano})", "PRONTUÁRIO {NOME} ({ANO})", "DOCUMENTO PESSOAL ATUALIZADO (RG)"; numeração 01., 06.1…; procuração, contrato de honorários, duplicados e arquivos de outra pessoa não vão.
```
