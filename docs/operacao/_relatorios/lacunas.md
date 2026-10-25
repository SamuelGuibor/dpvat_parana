---
kind: extraido_do_codigo
status: rascunho
fonte: banco
atualizado_em: 2026-10-24
pendente_humano: []
---

# Lacunas do vault de hospitais

> Gerado em 24/10/2026, 21:29:50 por `scripts/vault-seed-hospitais.mjs`. Corrigir o cadastro (nome do hospital no card, GHOST, automação) é trabalho humano no CRM.

## Resumo

- Automações na coluna "DISTRIBUIÇÃO DE SOLICITAÇÕES": 283 (278 ativas, 5 inativas fora do vault)
- Hospitais distintos nas ativas: 276 · nomes repetidos juntados: 2 · sem condição de hospital: 0
- GHOST (catálogo): 249 · hospitais das automações que casam com um GHOST: 243
- Cards ativos com hospital: 113 · com procedimento: 85 (75%)

## Cards ativos de hospitais sem procedimento (27)

Nome como está no card. Pode ser hospital sem automação **ou** nome digitado diferente do da automação.

| Hospital (no card) | cards ativos |
|---|---|
| Hospital Municipal de Araucária | 2 |
| Hospital e Maternidade Itaipulândia | 1 |
| HOSPITAL FREI BRUNO | 1 |
| H MUNICIPAL DE ACARAPE | 1 |
| H OSWALDO CRUZ | 1 |
| H JOÃO MANOEL FRANCISCO GUERREIRO | 1 |
| H AME BARRETOS | 1 |
| Hospital Universitário Evangélico Mackenzie | 1 |
| H ESTADUAL DE DIADEMA | 1 |
| UPA FAZENDA RIO GRANDE | 1 |
| H MUNICIPAL ELIDIA MACHIETTO SANTILLO | 1 |
| INSTITUTO DOUTOR FEITOSA (IDF) | 1 |
| Hospital Luiza Borba Carneiro | 1 |
| Hospital das Clínicas FMUSP | 1 |
| H DE CEILANDIA | 1 |
| Hospital Maice | 1 |
| Hospital Regional Dr. Leopoldo Bevilacqua | 1 |
| Hospital Municipalizado Adão Pereira Nunes | 1 |
| Hospital Municipal Professor Doutor Alípio Corrêa Netto – Ermelino Matarazzo | 1 |
| São Camilo Campo Largo | 1 |
| JOÃO XXIII | 1 |
| REGIONAL PG | 1 |
| Hospital municipal do Campo Limpo | 1 |
| upa pato branco | 1 |
| Hospital São rafael | 1 |
| Pronto Socorro Central - Bauru | 1 |
| Upa de Itaquera | 1 |

## GHOST sem automação (6)

- [HOSPITAL] JOAO XXIII BELO HORIZONTE
- [HOSPITAL] PREVIDENCIÁRIO
- [HOSPITAL] STA RITA ARAPONGAS
- [HOSPITAL] TRABALHADOR
- [HOSPITAL] TRABALHADOR RONDA ALTA
- [HOSPITAL] UPAS COLOMBO

## Automação sem GHOST com o mesmo nome (33)

- H DE URGENCIA DE TERESINA
- H MUNICIPAL DA JAPUIBA
- H MUNICIPAL DE S JORGE DO PATROCINIO
- H MUNICIPAL DE STO ANDRE
- H MUNICIPAL GETÚLIO VARGAS
- H PILAR
- H S JOSÉ - JOINVILLE
- H SANTA CATARINA DE LOANDA
- H SANTA RITA - SP
- HMA - Hospital e Maternidade de Assis
- hospital de Dois Vizinhos
- HOSPITAL DE GOIAS VALDEMIRO CRUZ (HUGO)
- HOSPITAL DE OLHOS
- Hospital do Coração Bom Jesus
- Hospital dos Acidentados - RO
- Hospital Estadual de Jataí Dr. Serafim de Carvalho
- Hospital M'Boi Mirim
- Hospital Municipal Dr. Amadeu Puppi
- Hospital santa casa de Cianorte
- HOSPITAL UNIMED - UNIDADE GLORIA
- NOSSA SRA DE FATIMA
- REGIONAL S PAULO
- S DOMINGOS
- S JOSE DO AVAI
- São José de Laranjeiras do Sul
- STA CASA CATALÃO
- STA CASA LIMEIRA
- STA CASA MOGI DAS CRUZES
- STA CASA SOROCABA
- STO ANTONIO ARMAZEM
- STO ANTONIO TAPEJARA
- UPA coronel vivida
- UPA ITARIRI

## Nomes repetidos juntados numa nota (2)

- SÃO LUCAS PATO BRANCO: automation:cmqffev0q000hl9040jfz691r, automation:cmrcadqet0005l805st7583dm
- BRASIL MAUA: automation:cmqjhkpt40006l204g2cj3n38, automation:cmqjhl2880008l204fh71z9ma
