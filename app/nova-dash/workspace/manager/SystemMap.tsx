/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';

// ============================================================================
// MAPA DO SISTEMA — visualização interativa de TUDO que a plataforma tem hoje,
// agrupado em "constelações" (módulos) em volta do núcleo. Vive no fim da aba
// Chatbot (ChatbotDashboard).
//
// Conforme o projeto ganhar features, é só adicionar nós em NODES (e, se
// preciso, um cluster novo e LINKS) — o layout se recalcula sozinho. Pontos
// revisados em 30/09/2026 contra docs/ai/*.md: nada desligado de propósito
// (assinatura, chat da equipe) ou removido (urgência, Discord, ZapSign)
// aparece como ativo.
//
// Núcleo (30/09/2026, aprovado pelo Samuel): esfera de partículas em 3D no
// lugar do buraco negro. O mouse agita a esfera (gira mais rápido, inclina
// para o cursor e afasta os pontos perto dele); clique solta uma onda e abre
// o detalhe do núcleo.
//
// Leveza: fundo pré-renderizado, sprites de brilho em cache (nada de
// shadowBlur), DPR ≤ 1,25, 30 fps, pontos da esfera em 20 lotes de cor (um
// fill por lote) e o loop PARA quando o mapa sai da tela ou a aba fica oculta
// — ele mora no fim de uma página longa e antes desenhava o tempo todo.
// prefers-reduced-motion = quadro parado, redesenhado só na interação.
// ============================================================================

interface Cluster {
  id: string;
  label: string;
  color: string;
  // calculados no layout:
  a0?: number; a1?: number; mid?: number;
}

interface NodeDef {
  id: string;
  c: string;
  name: string;
  desc: string;
  /** Destaque: ganha uma "plaquinha" estilo terminal no mapa. */
  hot?: boolean;
  /** Novidade recente (desde ~01/09/2026) — ganha um ping pulsante. */
  novo?: boolean;
  // calculados no layout:
  baseAngle?: number; baseR?: number; phase?: number; speed?: number;
  /** Rótulo cabe sem encavalar e de que lado fica (decidido 1x por layout). */
  showLabel?: boolean;
  labelRight?: boolean;
}

const CLUSTERS: Cluster[] = [
  { id: 'ia', label: 'CÉREBRO DA IA', color: '#b18cff' },
  { id: 'linhas', label: 'LINHAS & ANTI-SPAM', color: '#c6f36b' },
  { id: 'copiloto', label: 'COPILOTO DO ATENDENTE', color: '#8b93ff' },
  { id: 'whatsapp', label: 'INBOX WHATSAPP', color: '#35e39b' },
  { id: 'kanban', label: 'KANBAN & CARDS', color: '#5aa2ff' },
  { id: 'automacoes', label: 'AUTOMAÇÕES', color: '#ffc554' },
  { id: 'docs', label: 'DOCUMENTOS & MODELOS', color: '#4fd8ff' },
  { id: 'gestao', label: 'GESTÃO & MÉTRICAS', color: '#ff6470' },
  { id: 'cliente', label: 'SITE & ÁREA DO CLIENTE', color: '#3ce8c8' },
  { id: 'equipe', label: 'EQUIPE & ACESSO', color: '#ff7ad1' },
  { id: 'integracoes', label: 'INTEGRAÇÕES', color: '#ffa04f' },
];

const NODES: NodeDef[] = [
  // ---- CÉREBRO DA IA ----
  { id: 'ia_triagem', c: 'ia', hot: true, name: 'triagem_e_qualificacao', desc: 'O bot conduz a triagem (acidente, hospital, lesão, INSS), roda o roteiro comercial e decide: qualificar, desqualificar com sub-motivo nq_*, transferir ou encerrar a dúvida.' },
  { id: 'ia_instrucoes', c: 'ia', hot: true, name: 'instrucoes_no_banco', desc: 'O prompt vivo é o texto publicado na aba Instruções, servido ao cérebro no Railway com cache de 5 min. Editar só o código do microserviço não muda produção.' },
  { id: 'ia_playbook', c: 'ia', name: 'playbook_e_revisao', desc: 'Conversas encerradas viram revisão; as lições são destiladas num playbook de regras (R1..Rn) e em exemplos revisados que entram no prompt.' },
  { id: 'ia_metricas', c: 'ia', name: 'metricas_de_regras', desc: 'Cada decisão registra as regras que aplicou, junto com eventos de follow-up, recuperação e intervenções do código, na aba Métricas da Revisão da IA.' },
  { id: 'ia_fatos', c: 'ia', novo: true, name: 'fatos_do_atendimento', desc: 'O código manda fatos e o cérebro decide: documentos recebidos neste atendimento, cliente já cadastrado, atendente na conversa nos últimos 7 dias, desfecho anterior e nº de "não entendi".' },
  { id: 'ia_handoff', c: 'ia', name: 'transferencia_com_motivo', desc: 'Falha ou dúvida do bot vira transferência para a Fila, com o motivo e a transcrição dos áudios numa nota interna. Nunca vira erro para o cliente e nunca tira a conversa de quem já assumiu.' },
  { id: 'ia_lookup', c: 'ia', name: 'consultas_ao_banco', desc: 'O bot pode consultar o status do processo, se o cliente já é cadastrado e quais documentos enviou; nada de CPF ou endereço.' },
  { id: 'ia_memoria', c: 'ia', name: 'memoria_por_conversa', desc: 'Etapa e ficha de fatos ficam salvas por conversa; acima do limite o cérebro compacta a memória sem perder fatos, e ela é limpa ao reabrir depois de 7 dias se o lead não foi qualificado.' },
  { id: 'ia_debounce', c: 'ia', name: 'debounce_de_rajada', desc: 'Mensagens picadas em sequência esperam ~8 s e viram UMA decisão; se chega mensagem nova no meio, o envio para e a resposta seguinte cobre o lote.' },
  { id: 'ia_cache', c: 'ia', name: 'prompt_caching', desc: 'Instruções e playbook vão num bloco estável cacheado na Anthropic, então a maior parte do input de cada decisão sai a 10% do preço.' },
  { id: 'ia_silencio', c: 'ia', name: 'silencio_e_despedida', desc: 'Cliente parado 30 min recebe um follow-up decidido pela IA, só das 7h às 21h; sem resposta vem a despedida, e pergunta que ficou sem decisão do bot vai para a Fila.' },
  { id: 'ia_recuperacao', c: 'ia', name: 'recuperacao_standby', desc: 'Lead que sumiu entra em standby e recebe provocações da IA (texto livre na janela de 24 h, template fora dela) até o teto do número, e termina recuperado, esgotado ou em opt-out.' },

  // ---- LINHAS & ANTI-SPAM ----
  { id: 'ln_numeros', c: 'linhas', hot: true, name: 'multi_numero', desc: 'Várias linhas da empresa, cada uma com token criptografado e cadastro na tela Números. Todo envio sai pela linha do contato, e o mesmo telefone vira um contato por linha.' },
  { id: 'ln_2323', c: 'linhas', novo: true, name: 'linha_2323_somente_leitura', desc: 'Número desativado mantém o histórico visível, mas sem composer: os crons o ignoram e o envio é recusado, sem cair na linha padrão.' },
  { id: 'ln_templates', c: 'linhas', name: 'templates_por_waba', desc: 'Catálogo de templates por conta da Meta, criado e sincronizado pela tela, com aprovação por webhook. Só template APROVADO sai, e é o único envio possível com a janela de 24 h fechada.' },
  { id: 'ln_pausa', c: 'linhas', novo: true, name: 'pausa_de_templates', desc: 'Interruptor por número que bloqueia só os templates (pagos) daquela linha; texto livre na janela segue normal. Usado na linha DPVAT BOT.' },
  { id: 'ln_optout', c: 'linhas', name: 'opt_in_e_opt_out', desc: 'Opt-in registrado na 1ª mensagem do cliente. Descadastro só por regex: "SAIR" vale sempre, frase ambígua só fora do bot, e o erro 131050 da Meta também marca.' },
  { id: 'ln_cooldown', c: 'linhas', name: 'cooldown_de_proativas', desc: 'Toda mensagem proativa (automação, progresso, recuperação) passa pelo mesmo portão: opt-out, intervalo mínimo de 6 h por contato e, fora da janela, opt-in mais template.' },
  { id: 'ln_marcapasso', c: 'linhas', hot: true, name: 'marcapasso_e_tetos', desc: 'Os crons enviam em ritmo humano (7 a 15 s entre mensagens) e só das 7h às 21h, com teto diário de recuperação e teto de provocações por número desde o aviso de spam da Meta.' },

  // ---- COPILOTO DO ATENDENTE ----
  { id: 'cp_sugestao', c: 'copiloto', hot: true, name: 'sugestao_de_resposta', desc: 'Botão no composer e no Copiloto: a IA propõe a próxima resposta a partir da conversa, e o atendente revisa, edita e envia.' },
  { id: 'cp_resumo', c: 'copiloto', name: 'resumo_no_card', desc: 'Ao vincular a conversa a um card, a IA resume o histórico em tópicos e grava como comentário, em segundo plano.' },
  { id: 'cp_transcricao', c: 'copiloto', name: 'transcricao_de_audio', desc: 'Áudio do cliente vira texto (Gemini): já na chegada, para o bot, e com um clique, para o atendente. O gasto de cada transcrição fica registrado.' },
  { id: 'cp_ficha', c: 'copiloto', name: 'ficha_do_cliente', desc: 'Aba Ficha do Copiloto: dados e documentos do lead antes de virar card. "Adicionar cliente" cria o card no Kanban com tudo.' },
  { id: 'cp_ficha_auto', c: 'copiloto', hot: true, name: 'ficha_automatica', desc: 'Claude Haiku lê cada rajada de mensagens e anexos e preenche os campos da ficha, marcando o que veio da IA; também existe o botão "Preencher com IA".' },
  { id: 'cp_arquivos', c: 'copiloto', novo: true, name: 'arquivos_e_notas_da_conversa', desc: 'Grade com toda a mídia da conversa ainda não anexada (não só as 50 mensagens recentes), anexo em lote ao card e o histórico completo de notas.' },

  // ---- INBOX WHATSAPP ----
  { id: 'wa_inbox', c: 'whatsapp', hot: true, name: 'inbox_multinumero', desc: 'Conversas da Cloud API oficial de todas as linhas numa tela. A lista sincroniza por delta a cada 15 s e a thread a cada 8 s, e "não lida" conta só mensagem recebida.' },
  { id: 'wa_fila', c: 'whatsapp', hot: true, name: 'fila_com_sla', desc: 'Conversa sem atendente espera na Fila com degraus de alerta (10 min, 1 h, 4 h, 24 h, 48 h) que sobem do dono para o setor, a equipe e os gestores.' },
  { id: 'wa_dono', c: 'whatsapp', novo: true, name: 'dono_pegajoso', desc: 'Devolver ao bot, reabrir ou transferir mantém o último atendente como dono por 7 dias, e o aviso vai primeiro para ele.' },
  { id: 'wa_pastas', c: 'whatsapp', novo: true, name: 'pastas_por_desfecho', desc: 'Rail de pastas (Ativas, Bot, Recuperação, Qualificadas, Não qualificadas, Transferidos, Churn…) e tag automática do desfecho em todo encerramento.' },
  { id: 'wa_filtros', c: 'whatsapp', novo: true, name: 'filtros_no_banco', desc: 'Busca, tag, data de entrada do lead e coluna do Kanban consultam o banco inteiro, com total real "X de Y" e "Carregar mais".' },
  { id: 'wa_tags', c: 'whatsapp', name: 'tags_de_conversa', desc: 'Tags coloridas por conversa (Qualificada, Contratados…) aplicadas na hora, com log de quem pôs e tirou; alimentam o funil.' },
  { id: 'wa_flows', c: 'whatsapp', name: 'fluxos_e_respostas_rapidas', desc: 'Sequências prontas de texto e mídia com intervalo, disparadas pelo atendente ou pela IA (que escolhe pela descrição), além dos snippets de resposta rápida.' },
  { id: 'wa_notas', c: 'whatsapp', name: 'notas_internas', desc: 'Recados na thread que o cliente nunca vê: motivo da transferência, transcrição dos áudios e @menções que viram tarefa.' },
  { id: 'wa_media', c: 'whatsapp', name: 'midia_audio_e_reacoes', desc: 'Fotos, vídeos, PDFs e áudio com player próprio, gravação de voz, emojis e reações. A mídia ganha nome legível e "tentar de novo" quando o envio falha.' },
  { id: 'wa_entrega', c: 'whatsapp', name: 'alerta_de_entrega', desc: 'Mensagem recusada pela Meta ou parada no tique único volta para a Fila com o dono e um aviso, no máximo uma vez por contato por dia.' },
  { id: 'wa_agenda', c: 'whatsapp', name: 'agenda_de_contatos', desc: 'Diretório de contatos por linha para abrir conversa, criar contato novo ou bloquear (permissão manage_wa_contacts).' },

  // ---- KANBAN & CARDS ----
  { id: 'kb_board', c: 'kanban', hot: true, name: 'quadro_kanban', desc: 'Colunas com cor, ordem e limite de dias; cada card é um cliente arrastado entre elas, sincronizado por polling de 7 s com hash. A busca acha até arquivados e o Ctrl+K abre qualquer card.' },
  { id: 'kb_timer', c: 'kanban', name: 'timer_por_coluna', desc: 'Cada card mostra há quantos dias está na coluna; passou do limite, o badge fica vermelho e o cron avisa a equipe no sino, no máximo uma vez a cada 24 h por card.' },
  { id: 'kb_tags', c: 'kanban', name: 'tags_de_card', desc: 'Tags livres com cor criadas dentro do card, exibidas no quadro com "+N" e usadas como condição nas automações.' },
  { id: 'kb_arquivo', c: 'kanban', name: 'arquivamento', desc: '12 destinos (APTOS CCS/UNI, enviados, pastas negadas, desistências…) com "Desfazer". A aba Arquivados pagina no servidor e gera as planilhas Caique/UNI de pastas enviadas.' },
  { id: 'kb_checklist', c: 'kanban', name: 'checklist_admin', desc: 'Checklist interno por card (Comercial, ADM, Médico) e checklist previdenciário na aba Arquivos; a Auditoria IA marca sozinha o item de documento pessoal.' },
  { id: 'kb_etapas', c: 'kanban', name: 'etapas_do_processo', desc: 'Etapas por serviço (INSS, DPVAT) dentro do card. Mudar a etapa grava histórico, avisa o cliente no WhatsApp e atualiza a timeline da área do cliente.' },
  { id: 'kb_afast', c: 'kanban', name: 'afastamentos', desc: 'Data de fim do afastamento no card; um cron de 30 min avisa a equipe quando ela vence.' },
  { id: 'kb_hosp', c: 'kanban', name: 'catalogo_de_hospitais', desc: 'A lista de hospitais sai dos nomes usados nos cards, semeada por cards-fantasma (GHOST) que nunca aparecem no quadro; criar hospital novo exige create_hospitals.' },

  // ---- AUTOMAÇÕES ----
  { id: 'au_gatilho', c: 'automacoes', hot: true, name: 'gatilho_por_coluna', desc: 'Card entrou na coluna X: rodam as automações dela, com condições E/OU sobre os campos e as tags do card.' },
  { id: 'au_prazo', c: 'automacoes', name: 'automacao_por_prazo', desc: 'Condições de tempo na coluna e de vencimento do afastamento, varridas por um cron de 30 min com um disparo só por ciclo.' },
  { id: 'au_coment', c: 'automacoes', name: 'acao_comentario', desc: 'Comentário automático no card com variáveis [[campo]] e @menções, que caem na caixa de tarefas.' },
  { id: 'au_wa', c: 'automacoes', name: 'acao_whatsapp', desc: 'Mensagem ao cliente pela linha certa (template da conta daquele número), respeitando opt-out, cooldown e opt-in; o motivo de cada "não enviou" fica no card.' },
  { id: 'au_docx', c: 'automacoes', name: 'acao_arquivo_docx', desc: 'Gera um .docx a partir de um modelo com os dados do card e anexa direto nos arquivos.' },
  { id: 'au_mover', c: 'automacoes', name: 'acao_mover_card', desc: 'Move o card para outra coluna e encerra a automação; encadeia no máximo 3 movimentos para não entrar em loop.' },
  { id: 'au_tag', c: 'automacoes', name: 'acao_tag_e_planilha', desc: 'Aplica uma tag no card ou acrescenta uma linha numa planilha do Google Sheets.' },

  // ---- DOCUMENTOS & MODELOS ----
  { id: 'dc_s3', c: 'docs', name: 'upload_direto_s3', desc: 'O navegador sobe o arquivo direto ao S3 por URL pré-assinada (nada passa pelo limite de 4,5 MB da Vercel), e só depois o card registra o documento.' },
  { id: 'dc_pastas', c: 'docs', name: 'pastas_de_documentos', desc: 'Arquivos do card em pastas (Procuração, Docs INSS…) com inferência pelo nome, ordem manual e download em zip por pasta.' },
  { id: 'dc_lixeira', c: 'docs', name: 'lixeira_30_dias', desc: 'Excluir manda para a lixeira: dá para restaurar por 30 dias e depois um cron purga, preservando no S3 o que outra mensagem ou documento ainda usa.' },
  { id: 'dc_modelos', c: 'docs', novo: true, name: 'modelos_docx_gerenciaveis', desc: 'Procurações e o KIT de contrato viram modelos .docx gerenciados na tela (subir, renomear, ocultar) e guardados no S3; exige manage_templates.' },
  { id: 'dc_procuracao', c: 'docs', name: 'procuracoes', desc: 'Gera a procuração a partir do modelo escolhido com os dados do card e entrega em PDF.' },
  { id: 'dc_roteiro', c: 'docs', hot: true, name: 'roteiro_com_ia', desc: 'Chat com a IA na aba Roteiro, com os anexos do caso, que devolve o roteiro preenchido em PDF; a IA roda no docx-converter.' },
  { id: 'dc_auditoria', c: 'docs', hot: true, name: 'auditoria_ia', desc: 'Claude confere os documentos do card (3 tipos de auditoria), responde em comentário com status, renomeia arquivos e recebe feedback. Roda por automação ou por botão (run_ai_audit).' },
  { id: 'dc_gerador', c: 'docs', name: 'gerador_de_documento_ia', desc: 'Gemini preenche as tags {{IA}} de um .docx a partir dos documentos do card, confere acidente × DIB e gera uma versão "digitalizada" no navegador; acesso por lista fixa.' },

  // ---- GESTÃO & MÉTRICAS ----
  { id: 'gs_funil', c: 'gestao', hot: true, novo: true, name: 'funil_por_coorte', desc: 'Funil do bot e Fluxo de Eventos Rápidos contados sobre a mesma coorte (conversas criadas no período), com meta mensal; contratado conta no mês de entrada do lead.' },
  { id: 'gs_fluxo', c: 'gestao', name: 'fluxo_do_kanban', desc: 'KPIs do caminho dos cards a partir dos logs de movimento: tempo por coluna, fluxos esperados, throughput por hospital e comparação com o período anterior, com export CSV/JPEG.' },
  { id: 'gs_origem', c: 'gestao', name: 'origem_dos_leads', desc: 'Leads por campanha e anúncio (Click-to-WhatsApp da Meta), com drill-down de cada lead e do desfecho dele.' },
  { id: 'gs_chatbot', c: 'gestao', name: 'desempenho_do_chatbot', desc: 'Aba Chatbot da Gestão Estratégica: decisões do bot, avisos automáticos entregues × falhas com motivo, saúde da conta na Meta e atividade da equipe, agregados em SQL.' },
  { id: 'gs_canto', c: 'gestao', hot: true, name: 'canto_da_ia', desc: 'Extrato do gasto de IA por operação e modelo: mês, 30 dias, hoje, projeção e custo por decisão do bot, somado de todo log com consumo de tokens.' },
  { id: 'gs_custos', c: 'gestao', novo: true, name: 'painel_de_custos', desc: 'Consumo diário por serviço, puxado das APIs dos provedores ou estimado pelos logs, com projeção do mês, crédito pré-pago ("dura X dias") e faturas manuais; exige view_costs.' },
  { id: 'gs_gestor', c: 'gestao', name: 'visao_do_gestor', desc: 'Ranking de atividade, heatmap semanal por hora, detalhe por colaborador e a aba de rendimento por setor.' },
  { id: 'gs_logs', c: 'gestao', name: 'logs_e_retencao', desc: 'Toda ação relevante vira log com autor, setor e diff de/para. Logs de rotina e notificações antigas são purgados, mas movimentos e histórico do card ficam para sempre.' },
  { id: 'gs_sino', c: 'gestao', name: 'notificacoes', desc: 'Sino com menções, fila, transferências, falhas de entrega e cards estourados, roteados por dono, setor, equipe e gestores; LEAD QUALIFICADO fica fixo no topo por 24 h.' },
  { id: 'gs_mapa', c: 'gestao', name: 'mapa_do_sistema', desc: 'Você está aqui: o raio-X vivo da plataforma. Cada novidade entra como uma estrela nova.' },

  // ---- SITE & ÁREA DO CLIENTE ----
  { id: 'cl_status', c: 'cliente', hot: true, name: 'status_do_processo', desc: 'O cliente vê cartões "Acidente N" com a timeline da etapa do processo por serviço (DPVAT/INSS), sem precisar perguntar.' },
  { id: 'cl_acesso', c: 'cliente', name: 'acesso_por_cpf', desc: 'Login com CPF e senha (mesma base da equipe) e recuperação por código de 6 dígitos via SMS ou e-mail (AWS SNS/SES).' },
  { id: 'cl_site', c: 'cliente', name: 'site_blog_e_faq', desc: 'Site institucional com blog, FAQ e páginas legais, medido por GA4, Meta Pixel e RD Station.' },
  { id: 'cl_form', c: 'cliente', name: 'formulario_de_contato', desc: 'Formulário do site com anti-spam que vira lead na aba Leads da Gestão Estratégica, exportável em CSV.' },

  // ---- EQUIPE & ACESSO ----
  { id: 'eq_mencoes', c: 'equipe', hot: true, name: 'mencoes_e_tarefas', desc: 'Caixa Pendente → Visto → Feito para toda @menção em comentário ou nota do WhatsApp, e tarefas automáticas do bot e do BotConversa roteadas por setor.' },
  { id: 'eq_setores', c: 'equipe', name: 'setores', desc: 'Áreas da equipe (Comercial, ADM…) com cor e membros; recebem as tarefas e os avisos da Fila do setor.' },
  { id: 'eq_ponto', c: 'equipe', name: 'controle_de_ponto', desc: 'Batidas de início, pausa e fim no próprio CRM, escala por pessoa e banco de horas com abonos, exportável em CSV.' },
  { id: 'eq_eventos', c: 'equipe', name: 'agenda_de_eventos', desc: 'Eventos da equipe no cabeçalho, com badge do que acontece nas próximas 24 h.' },
  { id: 'eq_tickets', c: 'equipe', name: 'tickets_dev', desc: 'Kanban de pedidos ao desenvolvimento com fotos, responsável e status, mais os pop-ups de aviso do setor de dev.' },
  { id: 'eq_meuespaco', c: 'equipe', name: 'meu_espaco', desc: 'Atividade pessoal, perfil com foto e setor, quem está online no cabeçalho e o tour guiado pelas telas.' },
  { id: 'eq_permissoes', c: 'equipe', hot: true, name: 'permissoes_admin', desc: 'Cargos ADMIN, ADMIN+ e ADMIN++ com 23 permissões ajustáveis por pessoa; toda ação da equipe é conferida no servidor, lendo o banco.' },
  { id: 'eq_trava_ip', c: 'equipe', novo: true, name: 'trava_de_ip', desc: 'A área da equipe só abre nos IPs do escritório cadastrados na tela Segurança, com exceção por permissão (bypass_ip_lock).' },

  // ---- INTEGRAÇÕES ----
  { id: 'in_meta', c: 'integracoes', hot: true, name: 'meta_cloud_api', desc: 'WhatsApp oficial: webhook assinado (HMAC) que roteia por número, envio de texto, mídia, voz e template, status de entrega e avisos da conta.' },
  { id: 'in_claude', c: 'integracoes', hot: true, name: 'claude_anthropic', desc: 'Modelo do cérebro do bot (saída estruturada, com um raciocínio que nunca é enviado), da sugestão, do resumo, da ficha, da Auditoria IA e do Roteiro; todo uso grava tokens no log.' },
  { id: 'in_gemini', c: 'integracoes', name: 'gemini_google', desc: 'O ouvido do sistema (transcrição de áudio) e o motor do Gerador de Documento IA.' },
  { id: 'in_s3', c: 'integracoes', name: 'aws_s3', desc: 'Todos os arquivos num bucket só: anexos do card, mídia do WhatsApp, modelos .docx e snapshots do cérebro, sempre por URL pré-assinada.' },
  { id: 'in_railway', c: 'integracoes', name: 'microsservicos_railway', desc: 'Três serviços com deploy próprio: o cérebro do bot (Express + Claude), o docx-converter (LibreOffice + IA do Roteiro) e o relay SSE de eventos; o inbox hoje vive do delta.' },
  { id: 'in_cron', c: 'integracoes', name: 'vercel_cron', desc: '8 crons no vercel.json: fila/SLA, silêncio e recuperação a cada 15 min, afastamentos e prazos a cada 30 min, e lixeira, custos e retenção uma vez por dia.' },
  { id: 'in_infra', c: 'integracoes', name: 'vercel_neon', desc: 'App Next.js na Vercel Pro, com as funções em Cleveland junto do banco, e Postgres serverless no Neon via Prisma.' },
  { id: 'in_capi', c: 'integracoes', name: 'meta_conversions_api', desc: 'Devolve à Meta o estágio do lead (qualificado ou não) para otimizar as campanhas de Click-to-WhatsApp.' },
  { id: 'in_botconv', c: 'integracoes', name: 'botconversa_legado', desc: 'Webhook de entrada que ainda recebe alguns eventos do BotConversa: o "contratado" cria card e tarefa de setor. A triagem hoje é toda do bot próprio.' },
];

// Sinapses entre módulos: quem conversa com quem.
const LINKS: [string, string][] = [
  ['ia_triagem', 'in_claude'], ['ia_triagem', 'wa_fila'], ['ia_triagem', 'wa_flows'],
  ['ia_triagem', 'ia_fatos'], ['ia_triagem', 'kb_hosp'], ['ia_instrucoes', 'ia_playbook'],
  ['ia_instrucoes', 'ia_cache'], ['ia_instrucoes', 'in_railway'], ['ia_playbook', 'ia_metricas'],
  ['ia_playbook', 'in_s3'], ['ia_fatos', 'wa_media'], ['ia_fatos', 'wa_dono'], ['ia_handoff', 'wa_fila'],
  ['ia_handoff', 'wa_notas'], ['ia_handoff', 'cp_transcricao'], ['ia_lookup', 'kb_etapas'],
  ['ia_memoria', 'ia_cache'], ['ia_debounce', 'in_meta'], ['ia_silencio', 'in_cron'],
  ['ia_silencio', 'wa_fila'], ['ia_silencio', 'ln_marcapasso'], ['ia_recuperacao', 'ln_marcapasso'],
  ['ia_recuperacao', 'ln_templates'], ['ln_numeros', 'wa_inbox'], ['ln_numeros', 'wa_agenda'],
  ['ln_2323', 'ln_numeros'], ['ln_pausa', 'ln_templates'], ['ln_templates', 'in_meta'],
  ['ln_optout', 'ln_cooldown'], ['ln_cooldown', 'au_wa'], ['ln_cooldown', 'kb_etapas'],
  ['ln_marcapasso', 'in_cron'], ['cp_sugestao', 'in_claude'], ['cp_sugestao', 'wa_inbox'],
  ['cp_resumo', 'kb_board'], ['cp_resumo', 'cp_ficha'], ['cp_transcricao', 'in_gemini'],
  ['cp_transcricao', 'wa_media'], ['cp_ficha', 'kb_board'], ['cp_ficha_auto', 'cp_ficha'],
  ['cp_ficha_auto', 'in_claude'], ['cp_arquivos', 'dc_pastas'], ['cp_arquivos', 'wa_notas'],
  ['wa_inbox', 'in_meta'], ['wa_fila', 'gs_sino'], ['wa_fila', 'eq_setores'], ['wa_dono', 'wa_fila'],
  ['wa_pastas', 'wa_tags'], ['wa_tags', 'gs_funil'], ['wa_filtros', 'kb_board'], ['wa_notas', 'eq_mencoes'],
  ['wa_media', 'in_s3'], ['wa_entrega', 'gs_sino'], ['kb_board', 'au_gatilho'], ['kb_timer', 'gs_sino'],
  ['kb_timer', 'in_cron'], ['kb_tags', 'au_gatilho'], ['kb_arquivo', 'gs_fluxo'],
  ['kb_checklist', 'dc_auditoria'], ['kb_etapas', 'cl_status'], ['kb_afast', 'au_prazo'],
  ['kb_hosp', 'gs_fluxo'], ['au_prazo', 'in_cron'], ['au_coment', 'eq_mencoes'], ['au_wa', 'in_meta'],
  ['au_docx', 'in_s3'], ['au_mover', 'kb_board'], ['au_tag', 'kb_tags'], ['au_gatilho', 'dc_auditoria'],
  ['dc_s3', 'in_s3'], ['dc_lixeira', 'dc_pastas'], ['dc_modelos', 'dc_procuracao'],
  ['dc_procuracao', 'in_railway'], ['dc_roteiro', 'in_railway'], ['dc_roteiro', 'in_claude'],
  ['dc_auditoria', 'in_claude'], ['dc_gerador', 'in_gemini'], ['gs_funil', 'gs_origem'],
  ['gs_origem', 'in_capi'], ['gs_chatbot', 'gs_canto'], ['gs_chatbot', 'gs_mapa'], ['gs_canto', 'gs_custos'],
  ['gs_canto', 'in_claude'], ['gs_gestor', 'gs_logs'], ['gs_gestor', 'eq_setores'], ['gs_fluxo', 'gs_logs'],
  ['cl_acesso', 'eq_permissoes'], ['cl_form', 'gs_funil'], ['cl_site', 'cl_form'],
  ['eq_mencoes', 'eq_setores'], ['eq_mencoes', 'gs_sino'], ['eq_permissoes', 'eq_trava_ip'],
  ['eq_permissoes', 'gs_custos'], ['eq_ponto', 'eq_permissoes'], ['eq_eventos', 'eq_meuespaco'],
  ['eq_tickets', 'eq_setores'], ['eq_meuespaco', 'gs_logs'], ['in_botconv', 'eq_mencoes'],
  ['in_botconv', 'kb_board'], ['in_railway', 'in_infra'], ['in_cron', 'in_infra'],
];

// O núcleo vira um pseudo-nó: tem tooltip, painel de detalhe e sinapses.
const CORE_CLUSTER: Cluster = { id: '__core', label: 'NÚCLEO', color: '#6fe7ff' };
const CORE_NODE: NodeDef = {
  id: '__core',
  c: '__core',
  name: 'cerebro_da_ia',
  desc: 'Instruções e playbook publicados no banco + os fatos do atendimento que o CRM monta; o Claude, no microserviço do Railway, decide cada resposta do bot.',
};
const CORE_LINKS = ['ia_triagem', 'ia_instrucoes', 'ia_playbook', 'ia_fatos', 'in_claude', 'wa_inbox'];

const MONO = '"Cascadia Code", "Consolas", ui-monospace, monospace';

interface Runtime extends NodeDef {
  cl: Cluster;
}

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** "Ruído" barato da esfera: soma de senos, contínuo e animado. */
function field(x: number, y: number, z: number, t: number): number {
  return Math.sin(x * 3.1 + t * 0.9) * Math.sin(y * 2.7 - t * 0.6 + z * 1.3)
    + Math.sin(z * 3.7 + x * 1.9 + t * 0.5) * 0.8
    + Math.sin(y * 4.3 + x * 0.7 - t * 0.75) * 0.5;
}

export function SystemMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Runtime | null>(null);
  const [focusLock, setFocusLock] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const focusHoverRef = useRef<string | null>(null);
  const selectedRef = useRef<Runtime | null>(null);
  const setSelectedRef = useRef(setSelected);
  // Com movimento reduzido não há loop: quem muda o estado pede um quadro.
  const redrawRef = useRef<(() => void) | null>(null);
  useEffect(() => { focusRef.current = focusLock; redrawRef.current?.(); }, [focusLock]);
  useEffect(() => { selectedRef.current = selected; redrawRef.current?.(); }, [selected]);

  const novoCount = NODES.filter((n) => n.novo).length;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!wrap || !canvas || !tip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const clusterById: Record<string, Cluster> = Object.fromEntries(CLUSTERS.map((c) => [c.id, c]));
    const nodes: Runtime[] = NODES.map((n) => ({ ...n, cl: clusterById[n.c] }));
    const core: Runtime = { ...CORE_NODE, cl: CORE_CLUSTER };
    const nodeById: Record<string, Runtime> = Object.fromEntries(nodes.map((n) => [n.id, n]));
    nodeById[core.id] = core;
    const members: Record<string, Runtime[]> = Object.fromEntries(
      CLUSTERS.map((cl) => [cl.id, nodes.filter((n) => n.c === cl.id)]),
    );
    const adj: Record<string, string[]> = {};
    const link = (a: string, b: string) => {
      (adj[a] = adj[a] ?? []).push(b);
      (adj[b] = adj[b] ?? []).push(a);
    };
    for (const [a, b] of LINKS) link(a, b);
    for (const id of CORE_LINKS) link(core.id, id);
    const spaced: Record<string, string> = Object.fromEntries(CLUSTERS.map((c) => [c.id, c.label.split('').join(' ')]));

    // Sprites de brilho em cache (substituem shadowBlur).
    const glowCache: Record<string, HTMLCanvasElement> = {};
    function glowSprite(color: string, size = 32, inner = 0.6): HTMLCanvasElement {
      const key = `${color}|${size}|${inner}`;
      if (glowCache[key]) return glowCache[key];
      const s = document.createElement('canvas');
      s.width = s.height = size;
      const g = s.getContext('2d')!;
      const h = size / 2;
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, hexA(color, inner));
      grad.addColorStop(0.4, hexA(color, inner * 0.3));
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      glowCache[key] = s;
      return s;
    }
    // Cintilação das estrelas em 8 degraus: nada de string rgba() nova por estrela.
    const STAR_STYLES = Array.from({ length: 8 }, (_, i) => `rgba(232,226,255,${(0.35 * (0.35 + 0.65 * (i / 7))).toFixed(3)})`);

    let W = 0, H = 0, CX = 0, CY = 0, R = 0, ORB = 0, DPR = 1;
    let stars: { x: number; y: number; r: number; ph: number; sp: number }[] = [];
    let bg: HTMLCanvasElement | null = null;
    let hovered: Runtime | null = null;
    let lastT = 0;
    let raf = 0;
    let lastFrame = 0;
    let visible = true;
    let destroyed = false;

    // ---- esfera do núcleo ----
    // Esfera de Fibonacci (distribuição uniforme); o 4º valor é uma semente.
    const PTS = 1500;
    const pts = new Float32Array(PTS * 4);
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PTS; i++) {
      const y = 1 - (2 * (i + 0.5)) / PTS, r = Math.sqrt(1 - y * y), f = i * GA;
      pts[i * 4] = Math.cos(f) * r;
      pts[i * 4 + 1] = y;
      pts[i * 4 + 2] = Math.sin(f) * r;
      pts[i * 4 + 3] = hash(i * 1.37);
    }
    // 5 profundidades × 4 brilhos: um fillStyle e um fill por lote.
    const BUCKETS = 20;
    const bucketStyle: string[] = [];
    for (let d = 0; d < 5; d++) {
      for (let k = 0; k < 4; k++) {
        const m = d / 4;
        const a = [0.16, 0.34, 0.62, 0.98][k] * (0.3 + 0.7 * m);
        bucketStyle.push(`rgba(${Math.round(lerp(40, 138, m))},${Math.round(lerp(84, 238, m))},${Math.round(lerp(214, 255, m))},${a.toFixed(3)})`);
      }
    }
    const bx = Array.from({ length: BUCKETS }, () => new Float32Array(PTS));
    const by = Array.from({ length: BUCKETS }, () => new Float32Array(PTS));
    const bs = Array.from({ length: BUCKETS }, () => new Float32Array(PTS));
    const bn = new Int32Array(BUCKETS);
    let excite = 0, pulse = 0, spin = 0, tiltX = 0.42, yawOff = 0;
    let mouse: { x: number; y: number } | null = null;
    let overOrb = false;

    function layout() {
      W = wrap!.clientWidth;
      H = wrap!.clientHeight;
      DPR = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas!.width = Math.round(W * DPR);
      canvas!.height = Math.round(H * DPR);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      const narrow = W < 720;
      // Reserva a barra "live" em cima e a legenda (2 linhas) embaixo, para
      // os rótulos das constelações não caírem por baixo dela.
      const TOP = 44, BOTTOM = narrow ? 84 : 64;
      CX = W / 2;
      CY = TOP + (H - TOP - BOTTOM) / 2;
      R = Math.min(W, H - TOP - BOTTOM) / 2 - 34;
      ORB = Math.max(34, R * 0.21);

      // Setores angulares proporcionais ao nº de nós de cada constelação.
      const GAP = 0.05;
      const total = nodes.length;
      const usable = Math.PI * 2 - GAP * CLUSTERS.length;
      let cursor = -Math.PI / 2 - (members[CLUSTERS[0].id].length / total) * usable / 2;
      // Raios escalonados: vizinhos nunca na mesma órbita → fácil de clicar.
      const TIERS = [0.06, 0.6, 0.3, 0.9, 0.18, 0.74, 0.46, 1.0];
      for (const cl of CLUSTERS) {
        const list = members[cl.id];
        const span = (list.length / total) * usable;
        cl.a0 = cursor; cl.a1 = cursor + span; cl.mid = cursor + span / 2;
        list.forEach((n, i) => {
          n.baseAngle = cl.a0! + span * ((i + 0.5) / list.length);
          const f = TIERS[i % TIERS.length] + hash(i * 37 + cl.label.length * 13) * 0.06;
          n.baseR = R * (0.47 + 0.5 * Math.min(f, 1.04));
          n.phase = hash(i * 91 + 7) * Math.PI * 2;
          n.speed = 0.22 + hash(i * 53) * 0.35;
        });
        cursor += span + GAP;
      }
      placeLabels(narrow);

      // Fundo pré-renderizado: gradiente + nébulas azul/violeta em volta do
      // núcleo. Pintado 1x (já em DPR), copiado por quadro.
      bg = document.createElement('canvas');
      bg.width = Math.round(W * DPR);
      bg.height = Math.round(H * DPR);
      const b = bg.getContext('2d')!;
      b.setTransform(DPR, 0, 0, DPR, 0, 0);
      const base = b.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
      base.addColorStop(0, '#0d0a19');
      base.addColorStop(0.5, '#070512');
      base.addColorStop(1, '#030309');
      b.fillStyle = base;
      b.fillRect(0, 0, W, H);
      const nebs = [
        { x: CX - ORB * 1.6, y: CY - ORB * 1.1, r: ORB * 4.5, c: '60,120,255',  a: 0.09 },
        { x: CX + ORB * 1.7, y: CY + ORB * 1.2, r: ORB * 4.2, c: '160,90,255',  a: 0.09 },
        { x: CX,             y: CY,             r: ORB * 6.5, c: '70,150,255',  a: 0.05 },
        { x: CX - R * 0.8,   y: CY + R * 0.5,   r: R * 0.7,   c: '90,160,255',  a: 0.035 },
        { x: CX + R * 0.85,  y: CY - R * 0.5,   r: R * 0.75,  c: '255,110,200', a: 0.03 },
      ];
      for (const nb of nebs) {
        const g = b.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        g.addColorStop(0, `rgba(${nb.c},${nb.a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = g;
        b.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
      }

      stars = Array.from({ length: Math.floor((W * H) / 7000) }, (_, i) => ({
        x: hash(i * 3.1) * W,
        y: hash(i * 7.7) * H,
        r: 0.4 + hash(i * 13.3) * 1.2,
        ph: hash(i * 17.9) * Math.PI * 2,
        sp: 0.4 + hash(i * 23.7) * 1.4,
      }));
      draw(lastT);
    }

    // Rótulos simples decididos 1x por layout (guloso, sem sobreposição) —
    // com 90 estrelas, rótulo em todas vira borrão. Os "hot" sempre aparecem;
    // o resto aparece ao focar o módulo ou passar o mouse.
    function placeLabels(narrow: boolean) {
      ctx!.font = `10px ${MONO}`;
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      const overlaps = (bb: { x: number; y: number; w: number; h: number }) =>
        boxes.some((o) => bb.x < o.x + o.w && bb.x + bb.w > o.x && bb.y < o.y + o.h && bb.y + bb.h > o.y);
      const order = [...nodes].sort((a, b) => Number(!!b.hot) - Number(!!a.hot));
      for (const n of order) {
        const x = CX + Math.cos(n.baseAngle!) * n.baseR!;
        const y = CY + Math.sin(n.baseAngle!) * n.baseR!;
        const tw = ctx!.measureText(n.name).width + (n.hot ? 12 : 2);
        const box = (right: boolean) => ({ x: right ? x + 8 : x - 8 - tw, y: y - 9, w: tw, h: 18 });
        const fits = (bb: { x: number; w: number; y: number; h: number }) => bb.x > 4 && bb.x + bb.w < W - 4 && !overlaps(bb);
        // lado "natural" (para fora do centro); se encavala, tenta o outro
        const natural = Math.cos(n.baseAngle!) >= 0;
        const side = fits(box(natural)) ? natural : fits(box(!natural)) ? !natural : null;
        n.labelRight = side ?? natural;
        n.showLabel = !!n.hot || (!narrow && side !== null);
        if (n.showLabel) boxes.push(box(n.labelRight));
      }
    }

    function nodePos(n: Runtime, t: number) {
      const a = n.baseAngle! + Math.sin(t * n.speed! + n.phase!) * 0.006;
      const r = n.baseR! + Math.sin(t * n.speed! * 0.8 + n.phase! * 2) * 3.5;
      return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, a };
    }

    function effectiveFocus(): string | null {
      return focusRef.current ?? focusHoverRef.current;
    }

    function nodeAlpha(n: Runtime): number {
      const f = effectiveFocus();
      if (!f) return 1;
      return n.c === f ? 1 : 0.08;
    }

    function draw(t: number) {
      if (!bg) return;
      const dt = Math.min(0.1, lastT ? Math.max(0, t - lastT) : 0.033);
      lastT = t;
      ctx!.drawImage(bg, 0, 0, W, H);

      // estrelas piscando
      for (const s of stars) {
        const tw = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
        ctx!.fillStyle = STAR_STYLES[Math.round(tw * 7)];
        ctx!.fillRect(s.x, s.y, s.r, s.r);
      }

      const positions: Record<string, { x: number; y: number; a: number }> = { [core.id]: { x: CX, y: CY, a: 0 } };
      for (const n of nodes) positions[n.id] = nodePos(n, t);
      const selectedNode = selectedRef.current ? nodeById[selectedRef.current.id] ?? null : null;
      const active = selectedNode ?? hovered ?? (overOrb ? core : null);
      const f = effectiveFocus();

      // Constelações: liga os nós de cada cluster em sequência (traço fino).
      ctx!.lineWidth = 1;
      for (const cl of CLUSTERS) {
        const al = !f ? 0.16 : f === cl.id ? 0.42 : 0.03;
        ctx!.strokeStyle = hexA(cl.color, al);
        ctx!.beginPath();
        members[cl.id].forEach((n, i) => {
          const p = positions[n.id];
          if (i === 0) ctx!.moveTo(p.x, p.y);
          else ctx!.lineTo(p.x, p.y);
        });
        ctx!.stroke();
      }

      // Sinapses do nó ativo (curvas puxadas pro núcleo)
      const activeLinks = active ? adj[active.id] ?? [] : [];
      if (active) {
        const p1 = positions[active.id];
        for (const otherId of activeLinks) {
          const p2 = positions[otherId];
          if (!p2) continue;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          const g = ctx!.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          g.addColorStop(0, hexA(active.cl.color, 0.8));
          g.addColorStop(1, hexA(nodeById[otherId].cl.color, 0.8));
          ctx!.strokeStyle = g;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.moveTo(p1.x, p1.y);
          ctx!.quadraticCurveTo(mx + (CX - mx) * 0.4, my + (CY - my) * 0.4, p2.x, p2.y);
          ctx!.stroke();
          ctx!.lineWidth = 1;
        }
      }

      drawSphere(t, dt);

      // Nós + rótulos
      ctx!.font = `10px ${MONO}`;
      for (const n of nodes) {
        const p = positions[n.id];
        const alpha = nodeAlpha(n);
        const isHot = hovered === n || selectedNode === n;
        const linked = activeLinks.includes(n.id);
        const rr = isHot ? 5 : linked ? 4 : n.hot ? 3.2 : 2.6;
        const na = Math.max(alpha, linked ? 1 : 0);

        const gs = isHot ? 46 : n.hot ? 30 : 22;
        ctx!.globalAlpha = na;
        ctx!.drawImage(glowSprite(n.cl.color), p.x - gs / 2, p.y - gs / 2, gs, gs);
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = hexA(n.cl.color, na);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx!.fill();

        // ping de novidade
        if (n.novo && na > 0.4) {
          const pr = 6 + 3 * (0.5 + 0.5 * Math.sin(t * 2.2 + (n.phase ?? 0)));
          ctx!.strokeStyle = `rgba(255,255,255,${0.35 * na})`;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, pr, 0, Math.PI * 2);
          ctx!.stroke();
        }

        if (isHot) {
          ctx!.strokeStyle = hexA(n.cl.color, 0.9);
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, rr + 4.5, 0, Math.PI * 2);
          ctx!.stroke();
        }

        // Rótulo: nós "hot" ganham plaquinha estilo terminal; os demais,
        // texto simples quando cabem, o módulo está em foco ou estão ligados.
        const focused = f === n.c;
        const la = isHot || linked ? 1 : alpha;
        if (la > 0.25 && (n.showLabel || isHot || linked || focused)) {
          const right = n.labelRight ?? Math.cos(p.a) >= 0;
          if (n.hot || isHot || linked) {
            const tw = ctx!.measureText(n.name).width;
            const bx0 = right ? p.x + 10 : p.x - 20 - tw;
            const by0 = p.y - 8;
            ctx!.fillStyle = `rgba(8,6,16,${0.72 * la})`;
            ctx!.strokeStyle = hexA(n.cl.color, 0.55 * la);
            ctx!.beginPath();
            ctx!.rect(bx0, by0, tw + 10, 16);
            ctx!.fill();
            ctx!.stroke();
            ctx!.fillStyle = isHot || linked ? 'rgba(240,236,255,.96)' : hexA(n.cl.color, 0.95 * la);
            ctx!.textAlign = 'left';
            ctx!.textBaseline = 'middle';
            ctx!.fillText(n.name, bx0 + 5, by0 + 8.5);
          } else {
            ctx!.fillStyle = `rgba(196,190,224,${(focused ? 0.8 : 0.5) * la})`;
            ctx!.textAlign = right ? 'left' : 'right';
            ctx!.textBaseline = 'middle';
            ctx!.fillText(n.name, p.x + (right ? 8 : -8), p.y);
          }
        }
      }

      // Rótulos das constelações (na borda, sempre dentro do quadro)
      ctx!.font = `600 10px ${MONO}`;
      for (const cl of CLUSTERS) {
        const a = cl.mid!;
        let x = CX + Math.cos(a) * (R + 28);
        let y = CY + Math.sin(a) * (R + 28);
        const al = !f || f === cl.id ? 0.85 : 0.15;
        ctx!.fillStyle = hexA(cl.color, al);
        const align: CanvasTextAlign = Math.abs(Math.cos(a)) < 0.35 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
        const label = W < 720 ? cl.label : spaced[cl.id];
        const tw = ctx!.measureText(label).width;
        if (align === 'left') x = Math.min(x, W - 10 - tw);
        if (align === 'right') x = Math.max(x, 10 + tw);
        if (align === 'center') x = Math.max(10 + tw / 2, Math.min(W - 10 - tw / 2, x));
        y = Math.max(14, Math.min(H - 60, y));
        ctx!.textAlign = align;
        ctx!.textBaseline = 'middle';
        ctx!.fillText(label, x, y);
      }

      // legenda do núcleo
      ctx!.font = `600 9px ${MONO}`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      const ly = CY + ORB * 1.3 + 10;
      ctx!.fillStyle = 'rgba(236,222,206,.82)';
      ctx!.fillText('N Ú C L E O', CX, ly);
      ctx!.fillStyle = 'rgba(170,160,190,.58)';
      ctx!.fillText('cérebro da IA', CX, ly + 13);
    }

    function drawSphere(t: number, dt: number) {
      // estado da interação, suavizado
      const d0 = mouse ? Math.hypot(mouse.x - CX, mouse.y - CY) : Infinity;
      const target = overOrb ? 1 : d0 < ORB * 2.2 ? 0.25 : 0;
      excite += (target - excite) * Math.min(1, dt * 4);
      pulse = Math.max(0, pulse - dt * 0.7);
      if (!reduce) spin += dt * (0.22 + 0.8 * excite);
      const tx = 0.42 + (overOrb && mouse ? ((mouse.y - CY) / ORB) * 0.3 : 0);
      const ty = overOrb && mouse ? ((mouse.x - CX) / ORB) * 0.45 : 0;
      tiltX += (tx - tiltX) * Math.min(1, dt * 3);
      yawOff += (ty - yawOff) * Math.min(1, dt * 3);
      const yaw = spin + yawOff;
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cx = Math.cos(tiltX), sx = Math.sin(tiltX);
      const tt = reduce ? 1.7 : t;
      const Rr = ORB * (1 + 0.015 * Math.sin(t * 1.2) + 0.05 * excite);
      const waveZ = 1 - 2 * (1 - pulse);
      const rad = ORB * 0.6, rad2 = rad * rad;
      const mx = mouse ? mouse.x : -1e4, my = mouse ? mouse.y : -1e4;

      // halo
      ctx!.globalCompositeOperation = 'lighter';
      const hs = ORB * (3.3 + 0.5 * excite);
      ctx!.globalAlpha = Math.min(1, 0.5 + 0.4 * excite + 0.3 * pulse);
      ctx!.drawImage(glowSprite('#3b7dff', 128, 0.45), CX - hs / 2, CY - hs / 2, hs, hs);
      ctx!.globalAlpha = 1;

      bn.fill(0);
      for (let i = 0; i < PTS; i++) {
        const o = i * 4;
        let x = pts[o], z = pts[o + 2];
        let y = pts[o + 1];
        const fv = field(x, y, z, tt);
        // redemoinho: gira cada ponto em torno do eixo Y conforme o campo
        const ang = 0.42 * fv, ca = Math.cos(ang), sa = Math.sin(ang);
        const x2 = x * ca + z * sa;
        z = -x * sa + z * ca;
        x = x2;
        const r = 1 + (0.045 + 0.04 * excite) * fv;
        x *= r; y *= r; z *= r;
        const band = 0.5 + 0.5 * Math.cos(fv * 2.6);
        const bright = band * band * band * band;
        // pontos apagados ficam ralos: a esfera mantém a forma sem virar borrão
        if (bright < 0.08 && pts[o + 3] > 0.45) continue;

        // projeção (giro + inclinação + perspectiva leve + onda do clique)
        const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw;
        const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const persp = (1 + z2 * 0.2) * (1 + 0.16 * pulse * Math.exp(-(z2 - waveZ) * (z2 - waveZ) * 14));
        let px = CX + x1 * Rr * persp;
        let py = CY + y2 * Rr * persp;
        let near = 0;
        if (excite > 0.02) {
          // o cursor empurra e acende os pontos perto dele
          const dx = px - mx, dy = py - my, d2 = dx * dx + dy * dy;
          if (d2 < rad2 && d2 > 0.01) {
            const dd = Math.sqrt(d2);
            near = 1 - dd / rad;
            const push = near * near * ORB * 0.28 * excite;
            px += (dx / dd) * push;
            py += (dy / dd) * push;
          }
        }
        const d = Math.max(0, Math.min(4, Math.floor((z2 + 1) * 2.5)));
        let k = bright < 0.12 ? 0 : bright < 0.35 ? 1 : bright < 0.7 ? 2 : 3;
        if (near > 0.25) k = Math.min(3, k + 1 + (near > 0.6 ? 1 : 0));
        const bIdx = d * 4 + k;
        const c = bn[bIdx]++;
        bx[bIdx][c] = px;
        by[bIdx][c] = py;
        bs[bIdx][c] = 0.9 + 0.35 * d + (k === 3 ? 0.5 : 0);
      }
      for (let bIdx = 0; bIdx < BUCKETS; bIdx++) {
        const c = bn[bIdx];
        if (!c) continue;
        ctx!.fillStyle = bucketStyle[bIdx];
        ctx!.beginPath();
        const X = bx[bIdx], Y = by[bIdx], S = bs[bIdx];
        for (let i = 0; i < c; i++) {
          const s = S[i];
          ctx!.rect(X[i] - s / 2, Y[i] - s / 2, s, s);
        }
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';
    }

    function hitTest(x: number, y: number): Runtime | null {
      let best: Runtime | null = null;
      let bestD = 16;
      for (const n of nodes) {
        if (nodeAlpha(n) < 0.3) continue;
        const p = nodePos(n, lastT);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse = { x, y };
      const n = hitTest(x, y);
      const wasOver = overOrb;
      overOrb = !n && Math.hypot(x - CX, y - CY) < ORB * 1.1;
      if (n !== hovered || wasOver !== overOrb) {
        hovered = n;
        canvas!.style.cursor = n || overOrb ? 'pointer' : 'default';
      }
      if (reduce) draw(lastT);
      const tgt = hovered ?? (overOrb ? core : null);
      if (tgt) {
        tip!.style.display = 'block';
        (tip!.querySelector('.smap-t-cluster') as HTMLElement).textContent = tgt.cl.label;
        (tip!.querySelector('.smap-t-cluster') as HTMLElement).style.color = tgt.cl.color;
        (tip!.querySelector('.smap-t-name') as HTMLElement).textContent =
          tgt.name + (tgt.novo ? '  · NOVO' : '');
        (tip!.querySelector('.smap-t-desc') as HTMLElement).textContent = tgt.desc;
        const tw = tip!.offsetWidth, th = tip!.offsetHeight;
        let tx = x + 16, ty = y + 14;
        if (tx + tw > W - 8) tx = x - tw - 16;
        if (ty + th > H - 8) ty = y - th - 14;
        tip!.style.left = `${Math.max(8, tx)}px`;
        tip!.style.top = `${Math.max(8, ty)}px`;
      } else {
        tip!.style.display = 'none';
      }
    }

    function onLeave() {
      hovered = null;
      mouse = null;
      overOrb = false;
      tip!.style.display = 'none';
      if (reduce) draw(lastT);
    }

    function onClick() {
      if (overOrb) {
        pulse = 1; // onda atravessando a esfera
        setSelectedRef.current(core);
        return;
      }
      setSelectedRef.current(hovered);
    }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    layout();
    if (reduce) redrawRef.current = () => draw(lastT);

    function frame(now: number) {
      raf = 0;
      if (destroyed || !visible || document.hidden) return;
      if (now - lastFrame >= 32) { // 30fps
        lastFrame = now;
        draw(now / 1000);
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!reduce && !destroyed && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    // Fora da tela ou com a aba oculta o loop para; volta sozinho ao reaparecer.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    io.observe(wrap);
    document.addEventListener('visibilitychange', start);
    start();

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', start);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
      redrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const neighborIds = !selected
    ? []
    : selected.id === CORE_NODE.id
      ? CORE_LINKS
      : LINKS.filter(([a, b]) => a === selected.id || b === selected.id).map(([a, b]) => (a === selected.id ? b : a));
  const selectedNeighbors = neighborIds
    .map((id) => NODES.find((n) => n.id === id))
    .filter((n): n is NodeDef => !!n);

  // Fuso fixo: o SSR roda em UTC e o texto precisa bater com o do navegador.
  const stamp = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return (
    <section className="mt-8">
      <div
        ref={wrapRef}
        className="relative h-[700px] w-full select-none overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl"
        style={{ background: '#04030a' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" aria-label="Mapa interativo de todos os módulos e features do sistema" />

        {/* HUD: barra "live" no topo */}
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 whitespace-nowrap rounded border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em]"
          style={{ fontFamily: MONO, color: '#ffc554', borderColor: 'rgba(255,197,84,.4)', background: 'rgba(10,8,4,.6)' }}
        >
          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle motion-reduce:animate-none" style={{ background: '#35e39b' }} />
          Mapa do sistema · live {stamp}
        </div>

        {/* HUD: título (compacto: com 11 módulos o anel encosta no canto) */}
        <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-[220px]">
          <p className="mb-2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: '#b18cff', fontFamily: MONO }}>
            Seguros Paraná · Plataforma
          </p>
          <h3 className="text-3xl font-extrabold uppercase leading-none tracking-wider text-white" style={{ textShadow: '0 0 32px rgba(177,140,255,.5)' }}>
            Mapa do<br />Sistema
          </h3>
          <div className="mt-3 flex gap-4 text-[10px] uppercase tracking-wider text-zinc-500" style={{ fontFamily: MONO }}>
            <span><b className="block text-base text-zinc-100">{NODES.length}</b>features</span>
            <span><b className="block text-base text-zinc-100">{CLUSTERS.length}</b>módulos</span>
            <span><b className="block text-base" style={{ color: '#35e39b' }}>{novoCount}</b>novas</span>
          </div>
        </div>

        {/* HUD: dica */}
        <p className="pointer-events-none absolute bottom-4 right-6 z-10 text-right text-[10px] leading-relaxed text-zinc-500" style={{ fontFamily: MONO }}>
          cada estrela é uma feature viva<br />
          passe o mouse pelas estrelas e pelo núcleo<br />
          <em className="not-italic" style={{ color: '#b18cff' }}>clique</em> para fixar o detalhe
        </p>

        {/* Legenda (hover foca, clique trava o filtro) */}
        <nav className="absolute bottom-4 left-6 z-10 flex max-w-[calc(100%-240px)] flex-wrap gap-1.5">
          {CLUSTERS.map((cl) => {
            const count = NODES.filter((n) => n.c === cl.id).length;
            const on = focusLock === cl.id;
            return (
              <button
                key={cl.id}
                onMouseEnter={() => { focusHoverRef.current = cl.id; redrawRef.current?.(); }}
                onMouseLeave={() => { focusHoverRef.current = null; redrawRef.current?.(); }}
                onClick={() => setFocusLock(on ? null : cl.id)}
                aria-pressed={on}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] backdrop-blur-sm transition-transform hover:-translate-y-px"
                style={{
                  fontFamily: MONO,
                  color: on ? '#fff' : cl.color,
                  borderColor: on ? cl.color : 'rgba(141,137,176,.25)',
                  background: on ? hexA(cl.color, 0.18) : 'rgba(10,9,22,.7)',
                }}
              >
                <i className="h-1.5 w-1.5 rounded-full" style={{ background: cl.color, boxShadow: `0 0 6px ${cl.color}` }} />
                {cl.label}
                <small className="opacity-50">{count}</small>
              </button>
            );
          })}
        </nav>

        {/* Tooltip (imperativo — atualizado pelo canvas) */}
        <div
          ref={tipRef}
          className="pointer-events-none absolute z-20 hidden max-w-[270px] rounded border px-3 py-2.5 backdrop-blur-md"
          style={{ background: 'rgba(10,9,22,.85)', borderColor: 'rgba(159,123,255,.25)', boxShadow: '0 8px 40px rgba(0,0,0,.6)', fontFamily: MONO }}
        >
          <div className="smap-t-cluster text-[9px] uppercase tracking-[0.2em]" />
          <div className="smap-t-name mt-0.5 text-[13px] font-semibold text-zinc-100" />
          <div className="smap-t-desc mt-1.5 text-[11px] leading-relaxed text-zinc-400" />
        </div>

        {/* Painel de detalhe (clique) */}
        {selected && (
          <aside
            className="absolute right-4 top-16 z-20 w-80 rounded-lg border p-5 backdrop-blur-lg"
            style={{ background: 'rgba(10,9,22,.85)', borderColor: hexA(selected.cl.color, 0.35), boxShadow: '0 12px 60px rgba(0,0,0,.65)' }}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute right-3 top-2 text-lg text-zinc-500 hover:text-zinc-200"
              aria-label="Fechar"
            >
              ×
            </button>
            <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: selected.cl.color, fontFamily: MONO }}>
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: selected.cl.color, boxShadow: `0 0 8px ${selected.cl.color}` }} />
              {selected.cl.label}
              {selected.novo && (
                <span className="rounded-sm px-1 py-px text-[8px]" style={{ background: 'rgba(53,227,155,.15)', color: '#35e39b' }}>NOVO</span>
              )}
            </span>
            <h4 className="mt-2.5 break-words text-lg font-semibold text-zinc-100" style={{ fontFamily: MONO }}>{selected.name}</h4>
            <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-300" style={{ fontFamily: MONO }}>{selected.desc}</p>
            {selectedNeighbors.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: 'rgba(141,137,176,.18)' }}>
                <p className="mb-2 text-[9px] uppercase tracking-[0.22em] text-zinc-500" style={{ fontFamily: MONO }}>Conecta com</p>
                <div className="flex flex-wrap gap-1">
                  {selectedNeighbors.map((n) => {
                    const cl = CLUSTERS.find((c) => c.id === n.c)!;
                    return (
                      <button
                        key={n.id}
                        onClick={() => setSelected({ ...n, cl })}
                        className="rounded border px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-100"
                        style={{ fontFamily: MONO, borderColor: hexA(cl.color, 0.45) }}
                      >
                        {n.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
