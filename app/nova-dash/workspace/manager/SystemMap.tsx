/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';

// ============================================================================
// MAPA DO SISTEMA — visualização futurista e interativa de TUDO que a
// plataforma tem hoje, agrupado em "constelações" (módulos) orbitando o
// núcleo. Vive no fim do dashboard "Desempenho do Chatbot".
//
// Conforme o projeto ganhar features, é só adicionar nós em NODES (e, se
// preciso, um cluster novo) — o layout se recalcula sozinho.
//
// Técnica (herdada do cerebro-ia, já otimizado): fundo pré-renderizado,
// sprites de brilho em cache (nada de shadowBlur por frame), DPR limitado e
// loop a 30fps. Hover = tooltip; clique = painel de detalhe; legenda filtra.
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
  /** Destaque: ganha uma "plaquinha" estilo terminal no mapa (como no vídeo). */
  hot?: boolean;
  /** Novidade recente — ganha um ping pulsante. */
  novo?: boolean;
  // calculados no layout:
  baseAngle?: number; baseR?: number; phase?: number; speed?: number;
}

const CLUSTERS: Cluster[] = [
  { id: 'kanban',      label: 'KANBAN & CARDS',        color: '#5aa2ff' },
  { id: 'whatsapp',    label: 'ATENDIMENTO WHATSAPP',  color: '#35e39b' },
  { id: 'ia',          label: 'CÉREBRO DA IA',         color: '#b18cff' },
  { id: 'automacoes',  label: 'AUTOMAÇÕES',            color: '#ffc554' },
  { id: 'docs',        label: 'DOCUMENTOS & ROTEIROS', color: '#4fd8ff' },
  { id: 'equipe',      label: 'EQUIPE & CHAT',         color: '#ff7ad1' },
  { id: 'gestao',      label: 'GESTÃO & MÉTRICAS',     color: '#ff6470' },
  { id: 'cliente',     label: 'ÁREA DO CLIENTE',       color: '#3ce8c8' },
  { id: 'integracoes', label: 'INTEGRAÇÕES',           color: '#ffa04f' },
];

const NODES: NodeDef[] = [
  // ---- KANBAN & CARDS ----
  { id: 'kb_board',      c: 'kanban', hot: true, name: 'quadro_kanban',       desc: 'Colunas com cor, ordem e limite de dias. Cards de clientes (User) e processos (Process) com drag-and-drop.' },
  { id: 'kb_timer',      c: 'kanban', name: 'timer_por_coluna',    desc: 'Cada card mostra há quantos dias está na coluna; estourou o limite, o badge fica vermelho — e o cron passa a notificar a equipe.' },
  { id: 'kb_tags',       c: 'kanban', novo: true, name: 'tags_de_card',        desc: 'Tags livres com cor, criadas e gerenciadas dentro do card; aparecem ao lado do serviço no quadro com overflow "+N".' },
  { id: 'kb_busca',      c: 'kanban', name: 'busca_e_filtros',     desc: 'Busca por nome ou nº do cartão e filtro por serviço, com colunas vazias escondidas durante a busca.' },
  { id: 'kb_arquivo',    c: 'kanban', name: 'arquivamento',        desc: 'Pagos CCS/UNI, enviados, pastas negadas, desistências… cada desfecho vira um arquivo consultável fora do quadro.' },
  { id: 'kb_checklist',  c: 'kanban', name: 'checklist_admin',     desc: 'Checklist interno por card com seções (comercial, ADM, médico) e o checklist previdenciário na aba Arquivos.' },
  { id: 'kb_prontuario', c: 'kanban', name: 'fluxo_prontuario',    desc: 'Solicitação e acompanhamento de prontuário médico integrados às etapas do processo.' },
  { id: 'kb_afast',      c: 'kanban', name: 'afastamentos',        desc: 'Data de afastamento no card com aviso automático quando vence.' },
  { id: 'kb_draft',      c: 'kanban', name: 'rascunho_automatico', desc: 'Fechou o card sem salvar? O preenchimento fica guardado no navegador e é oferecido de volta.' },
  { id: 'kb_status',     c: 'kanban', name: 'progresso_do_cliente', desc: 'Etapas de progresso por serviço (DPVAT/INSS) — a mesma timeline que o cliente vê na área dele.' },

  // ---- ATENDIMENTO WHATSAPP ----
  { id: 'wa_inbox',    c: 'whatsapp', hot: true, name: 'inbox_em_tempo_real', desc: 'Conversas via Cloud API oficial da Meta, em tempo real (SSE no Railway + polling de segurança).' },
  { id: 'wa_fila',     c: 'whatsapp', name: 'fila_com_sla',        desc: 'Cliente sem atendente entra na fila; 10min sem ninguém assumir → alerta pra equipe (e re-alerta a cada hora).' },
  { id: 'wa_tags',     c: 'whatsapp', name: 'tags_de_conversa',    desc: 'Tags coloridas por conversa (Qualificada, VIP, Recontato…) com filtro na lista.' },
  { id: 'wa_flows',    c: 'whatsapp', name: 'fluxos_de_mensagens', desc: 'Sequências pré-setadas (texto/mídia com delay) disparadas pelo atendente — ou pela própria IA, que escolhe pela descrição.' },
  { id: 'wa_quick',    c: 'whatsapp', name: 'respostas_rapidas',   desc: 'Snippets reutilizáveis inseridos no composer com um clique.' },
  { id: 'wa_tpl',      c: 'whatsapp', name: 'templates_meta',      desc: 'Mensagens de template aprovadas na Meta — únicos envios permitidos com a janela de 24h fechada.' },
  { id: 'wa_notas',    c: 'whatsapp', name: 'notas_internas',      desc: 'Recados na thread que o cliente nunca recebe — contexto de transferência, avisos entre atendentes.' },
  { id: 'wa_ficha',    c: 'whatsapp', name: 'ficha_do_cliente',    desc: 'Dados e documentos preenchidos durante o atendimento; "Adicionar cliente" transforma tudo em card no kanban.' },
  { id: 'wa_optout',   c: 'whatsapp', name: 'opt_in_e_opt_out',    desc: 'Opt-in documentado na 1ª mensagem; "SAIR" honrado sempre; a IA detecta pedidos de descadastro pelo contexto.' },
  { id: 'wa_entrega',  c: 'whatsapp', name: 'alerta_de_entrega',   desc: 'Mensagem recusada ou parada no tique único → equipe é avisada (número errado? bloqueio? janela fechada?).' },
  { id: 'wa_leitura',  c: 'whatsapp', name: 'leitura_por_atendente', desc: 'Cada atendente tem o próprio "até onde li" — abrir a conversa não zera o não-lido dos colegas.' },
  { id: 'wa_media',    c: 'whatsapp', novo: true, name: 'midia_repaginada',   desc: 'Fotos, vídeos, documentos e áudio com player próprio (play, barra de progresso e tempo) no inbox.' },

  // ---- CÉREBRO DA IA ----
  { id: 'ia_triagem',  c: 'ia', hot: true, name: 'triagem_e_qualificacao', desc: 'A IA conduz a triagem (acidente, lesão, INSS), qualifica ou desqualifica o lead e dispara o roteiro comercial completo.' },
  { id: 'ia_lookup',   c: 'ia', name: 'consultas_ao_banco',   desc: 'A IA pode pedir status do processo, cadastro e nº de documentos — só dados não sensíveis, nunca CPF/endereço.' },
  { id: 'ia_memoria',  c: 'ia', name: 'memoria_por_conversa', desc: 'Ficha de fatos + etapa persistidas por conversa; acima do limite, a própria IA compacta a ficha sem perder fatos.' },
  { id: 'ia_audio',    c: 'ia', name: 'transcricao_de_audio', desc: 'Áudio do cliente é transcrito (Gemini) e entra na conversa como texto — pro bot e, agora, pro atendente com um clique.', novo: true },
  { id: 'ia_suggest',  c: 'ia', novo: true, name: 'sugestao_de_resposta', desc: 'Botão ✨ no composer: a IA propõe a próxima resposta com base na conversa e na ficha; o humano revisa, edita e envia.' },
  { id: 'ia_resumo',   c: 'ia', novo: true, name: 'resumo_no_card',       desc: 'Ao vincular a conversa a um card, a IA resume o histórico em tópicos e grava como comentário.' },
  { id: 'ia_debounce', c: 'ia', novo: true, name: 'debounce_de_rajada',   desc: 'Mensagens picadas em sequência são agregadas por ~8s e viram UMA chamada à IA — sem respostas fora de ordem.' },
  { id: 'ia_cache',    c: 'ia', novo: true, name: 'prompt_caching',       desc: 'O prompt fixo (roteiro inteiro) é cacheado na Anthropic — ~90% do input passa a custar 10% do preço.' },
  { id: 'ia_nudge',    c: 'ia', name: 'nudges_e_despedida',   desc: 'Silêncio de 30min → "precisa de algo mais?"; sem resposta → despedida contextual gerada pela IA e encerramento.' },
  { id: 'ia_urgente',  c: 'ia', name: 'deteccao_de_urgencia', desc: 'A IA marca conversas urgentes — selo vermelho no inbox e prioridade na fila.' },
  { id: 'ia_staging',  c: 'ia', novo: true, name: 'ambiente_de_teste',    desc: 'Números de teste conversam com um cérebro de staging — prompts novos são validados sem tocar em cliente real.' },
  { id: 'ia_custo',    c: 'ia', name: 'custo_por_decisao',    desc: 'Tokens de cada chamada (input, output, cache) viram gasto semanal/mensal no dashboard.' },

  // ---- AUTOMAÇÕES ----
  { id: 'au_gatilho',  c: 'automacoes', hot: true, name: 'gatilho_por_coluna', desc: 'Card entrou na coluna X → dispara a automação, com condições AND/OR sobre os campos do card.' },
  { id: 'au_coment',   c: 'automacoes', name: 'acao_comentario',   desc: 'Comentário automático no card com variáveis [[name]], [[cpf]]… e @menções.' },
  { id: 'au_wa',       c: 'automacoes', name: 'acao_whatsapp',     desc: 'Mensagem automática pro cliente no WhatsApp, com cap anti-spam de frequência.' },
  { id: 'au_docx',     c: 'automacoes', name: 'acao_arquivo_docx', desc: 'Gera .docx a partir de template com os dados do card e anexa nos arquivos.' },
  { id: 'au_progresso',c: 'automacoes', name: 'mensagens_de_progresso', desc: 'Avanço de etapa → mensagem automática pro cliente (texto configurável por serviço e status).' },
  { id: 'au_atraso',   c: 'automacoes', novo: true, name: 'alerta_de_atraso',  desc: 'Card estourou o limite de dias da coluna → notificação insistente pra equipe inteira, repetida a cada 24h.' },

  // ---- DOCUMENTOS & ROTEIROS ----
  { id: 'dc_s3',        c: 'docs', name: 'arquivos_no_s3',     desc: 'Upload direto ao S3 com URL pré-assinada — documentos do card, da ficha do WhatsApp e anexos do chat.' },
  { id: 'dc_roteiro',   c: 'docs', hot: true, name: 'roteiro_com_ia',     desc: 'Geração de roteiro do caso com IA na aba Roteiro do card, com anexos e revisão.' },
  { id: 'dc_procuracao',c: 'docs', name: 'procuracoes',        desc: 'Procurações geradas de templates .docx com os dados do card, baixadas em PDF.' },
  { id: 'dc_pdf',       c: 'docs', name: 'docx_para_pdf',      desc: 'Microserviço próprio (Railway + LibreOffice) converte os .docx gerados em PDF.' },
  { id: 'dc_kit',       c: 'docs', name: 'kit_de_templates',   desc: 'Biblioteca de templates (roteiros e procurações) versionada no projeto.' },

  // ---- EQUIPE & CHAT ----
  { id: 'eq_chat',     c: 'equipe', hot: true, name: 'chat_da_equipe',   desc: 'Canais, DMs e canais privados em tempo real (SSE + polling), com edição e exclusão de mensagens.' },
  { id: 'eq_aviso',    c: 'equipe', name: 'canais_de_aviso',   desc: 'Modo mural: só o dono publica, o resto lê — pra comunicados oficiais.' },
  { id: 'eq_reacoes',  c: 'equipe', name: 'reacoes_e_anexos',  desc: 'Reações com emoji, anexos de qualquer tipo e Ctrl+V de print direto no composer.' },
  { id: 'eq_mencoes',  c: 'equipe', name: 'mencoes',           desc: '@pessoa, @everyone e @setor — menção notifica no sino e destaca a mensagem.' },
  { id: 'eq_setores',  c: 'equipe', name: 'setores',           desc: 'Áreas da equipe (comercial, ADM…) com cor, dashboard de rendimento e tag no perfil.' },
  { id: 'eq_presenca', c: 'equipe', name: 'presenca_online',   desc: 'Quem está online agora, direto na sidebar do espaço de trabalho.' },
  { id: 'eq_avatar',   c: 'equipe', name: 'foto_de_perfil',    desc: 'Upload de avatar (JPEG/PNG) pros membros da equipe.' },
  { id: 'eq_ponto',    c: 'equipe', name: 'sessoes_de_trabalho', desc: 'Início/pausa/fim de expediente registrados via Discord (WorkSession).' },

  // ---- GESTÃO & MÉTRICAS ----
  { id: 'gs_gestor',   c: 'gestao', hot: true, name: 'visao_do_gestor',    desc: 'Ranking de atividade, heatmap semanal por hora e detalhe por colaborador.' },
  { id: 'gs_chatbot',  c: 'gestao', name: 'desempenho_do_chatbot', desc: 'Qualificações, dúvidas, erros, taxa de entendimento, custo da API e atividade dos atendentes — este painel.' },
  { id: 'gs_setores',  c: 'gestao', name: 'dashboard_de_setores',  desc: 'Rendimento por setor: total, média por pessoa e comparativo em gráfico.' },
  { id: 'gs_logs',     c: 'gestao', name: 'logs_detalhados',    desc: 'Toda ação relevante vira log com autor, setor no momento e diff de/para.' },
  { id: 'gs_sino',     c: 'gestao', name: 'notificacoes',       desc: 'Sino unificado: menções, comentários, fila do WhatsApp, entregas falhas e cards estourados — com "Limpar".' },
  { id: 'gs_mapa',     c: 'gestao', novo: true, name: 'mapa_do_sistema',   desc: 'Você está aqui: o raio-X vivo da plataforma. Cada novidade entra como uma estrela nova.' },

  // ---- ÁREA DO CLIENTE ----
  { id: 'cl_status',  c: 'cliente', hot: true, name: 'status_do_processo', desc: 'Timeline amigável por serviço (DPVAT/INSS): o cliente acompanha a etapa sem precisar perguntar.' },
  { id: 'cl_docs',    c: 'cliente', name: 'documentos',        desc: 'O cliente vê e baixa os arquivos do próprio processo.' },
  { id: 'cl_faq',     c: 'cliente', name: 'faq',               desc: 'Dúvidas frequentes sobre perícia, prazos e a área do cliente.' },
  { id: 'cl_site',    c: 'cliente', name: 'site_e_blog',       desc: 'Site institucional com blog (DPVAT, INSS, auxílios) que alimenta o funil de leads.' },

  // ---- INTEGRAÇÕES ----
  { id: 'in_meta',    c: 'integracoes', name: 'meta_cloud_api',  desc: 'WhatsApp oficial: webhook assinado (HMAC), envio de texto/mídia/template e status de entrega.' },
  { id: 'in_claude',  c: 'integracoes', hot: true, name: 'claude_anthropic', desc: 'O modelo por trás do cérebro: decisões estruturadas (JSON schema), sugestões e resumos.' },
  { id: 'in_gemini',  c: 'integracoes', name: 'gemini_google',   desc: 'Transcrição de áudio multimodal — o ouvido do sistema.' },
  { id: 'in_s3',      c: 'integracoes', name: 'aws_s3',          desc: 'Todos os arquivos do sistema num bucket só, com URLs pré-assinadas.' },
  { id: 'in_relay',   c: 'integracoes', name: 'relay_sse_railway', desc: 'Servidor de eventos no Railway: chat e WhatsApp em tempo real, com polling de fallback.' },
  { id: 'in_discord', c: 'integracoes', name: 'discord',         desc: 'Avisos da fila/entregas em canal do Discord + registro de expediente.' },
  { id: 'in_cron',    c: 'integracoes', name: 'cron_job_org',    desc: 'Batida a cada 15min: nudges do bot, SLA da fila, entregas travadas e cards estourados.' },
  { id: 'in_botconv', c: 'integracoes', name: 'botconversa_zapier', desc: 'Webhooks de entrada de leads (Botconversa) e integrações externas (Zapier).' },
  { id: 'in_infra',   c: 'integracoes', name: 'vercel_neon',     desc: 'App Next.js na Vercel + Postgres serverless no Neon (Prisma).' },
];

// Sinapses entre módulos: quem conversa com quem.
const LINKS: [string, string][] = [
  ['ia_suggest', 'wa_inbox'], ['ia_suggest', 'in_claude'],
  ['ia_resumo', 'wa_ficha'], ['ia_resumo', 'kb_board'],
  ['ia_audio', 'wa_media'], ['ia_audio', 'in_gemini'],
  ['ia_triagem', 'wa_fila'], ['ia_triagem', 'in_claude'], ['ia_triagem', 'wa_flows'],
  ['ia_lookup', 'kb_status'], ['ia_memoria', 'ia_cache'],
  ['ia_nudge', 'in_cron'], ['ia_custo', 'gs_chatbot'], ['ia_urgente', 'wa_fila'],
  ['ia_staging', 'in_meta'], ['ia_debounce', 'in_meta'],
  ['wa_inbox', 'in_meta'], ['wa_inbox', 'in_relay'], ['wa_ficha', 'kb_board'],
  ['wa_tpl', 'in_meta'], ['wa_entrega', 'gs_sino'], ['wa_fila', 'gs_sino'],
  ['wa_media', 'in_s3'],
  ['au_gatilho', 'kb_board'], ['au_wa', 'in_meta'], ['au_docx', 'dc_kit'],
  ['au_progresso', 'kb_status'], ['au_atraso', 'kb_timer'], ['au_atraso', 'gs_sino'], ['au_atraso', 'in_cron'],
  ['dc_pdf', 'dc_procuracao'], ['dc_pdf', 'dc_roteiro'], ['dc_s3', 'in_s3'], ['dc_roteiro', 'in_claude'],
  ['eq_chat', 'in_relay'], ['eq_mencoes', 'eq_setores'], ['eq_mencoes', 'gs_sino'], ['eq_ponto', 'in_discord'],
  ['gs_setores', 'eq_setores'], ['gs_gestor', 'gs_logs'], ['gs_chatbot', 'gs_mapa'],
  ['cl_status', 'kb_status'], ['cl_docs', 'dc_s3'], ['cl_site', 'in_botconv'],
  ['in_cron', 'wa_fila'], ['in_discord', 'wa_fila'],
];

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
  useEffect(() => { focusRef.current = focusLock; }, [focusLock]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const novoCount = NODES.filter((n) => n.novo).length;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!wrap || !canvas || !tip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clusterById = Object.fromEntries(CLUSTERS.map((c) => [c.id, c]));
    const nodes: Runtime[] = NODES.map((n) => ({ ...n, cl: clusterById[n.c] }));
    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const adj: Record<string, string[]> = {};
    for (const [a, b] of LINKS) {
      (adj[a] = adj[a] ?? []).push(b);
      (adj[b] = adj[b] ?? []).push(a);
    }

    // Sprites de brilho em cache (substituem shadowBlur).
    const glowCache: Record<string, HTMLCanvasElement> = {};
    function glowSprite(color: string): HTMLCanvasElement {
      if (glowCache[color]) return glowCache[color];
      const s = document.createElement('canvas');
      s.width = s.height = 32;
      const g = s.getContext('2d')!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, hexA(color, 0.6));
      grad.addColorStop(0.4, hexA(color, 0.18));
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      glowCache[color] = s;
      return s;
    }

    let W = 0, H = 0, CX = 0, CY = 0, R = 0, HOLE = 0;
    let stars: { x: number; y: number; r: number; ph: number; sp: number }[] = [];
    let infall: { a: number; r: number; sp: number }[] = [];
    let pulses: { id: string; t: number; dir: number; sp: number }[] = [];
    let bg: HTMLCanvasElement | null = null;
    let hovered: Runtime | null = null;
    let lastT = 0;
    let raf = 0;
    let lastFrame = 0;
    let destroyed = false;

    function spawnInfall(seed: number) {
      return {
        a: hash(seed * 5.3 + (performance.now() % 97)) * Math.PI * 2,
        r: HOLE * (2.2 + hash(seed * 9.1) * 3.4),
        sp: 0.35 + hash(seed * 3.7) * 0.5,
      };
    }

    function layout() {
      W = wrap!.clientWidth;
      H = wrap!.clientHeight;
      const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      CX = W / 2;
      CY = H / 2;
      R = Math.min(W, H) / 2 - Math.min(W, H) * 0.10;
      HOLE = Math.max(22, R * 0.11);

      // Setores angulares proporcionais ao nº de nós de cada constelação.
      const GAP = 0.05;
      const total = nodes.length;
      const usable = Math.PI * 2 - GAP * CLUSTERS.length;
      let cursor = -Math.PI / 2 - (nodes.filter((n) => n.c === CLUSTERS[0].id).length / total) * usable / 2;
      for (const cl of CLUSTERS) {
        const members = nodes.filter((n) => n.c === cl.id);
        const span = (members.length / total) * usable;
        cl.a0 = cursor; cl.a1 = cursor + span; cl.mid = cursor + span / 2;
        // Raios escalonados: vizinhos nunca na mesma órbita → fácil de clicar.
        const TIERS = [0.06, 0.6, 0.3, 0.9, 0.18, 0.74, 0.46, 1.0];
        members.forEach((n, i) => {
          const fa = (i + 0.5) / members.length;
          n.baseAngle = cl.a0! + span * fa;
          const f = TIERS[i % TIERS.length] + hash(i * 37 + cl.label.length * 13) * 0.06;
          n.baseR = R * (0.45 + 0.52 * Math.min(f, 1.04));
          n.phase = hash(i * 91 + 7) * Math.PI * 2;
          n.speed = 0.22 + hash(i * 53) * 0.35;
        });
        cursor += span + GAP;
      }

      // Fundo pré-renderizado: gradiente + nébulas laranja/violeta (o "fogo"
      // do vídeo) + brilho do núcleo. Pintado 1x, copiado por frame.
      bg = document.createElement('canvas');
      bg.width = W; bg.height = H;
      const b = bg.getContext('2d')!;
      const base = b.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
      base.addColorStop(0, '#0c0918');
      base.addColorStop(0.5, '#070512');
      base.addColorStop(1, '#03030a');
      b.fillStyle = base;
      b.fillRect(0, 0, W, H);
      const nebs = [
        { x: CX - HOLE * 2.2, y: CY - HOLE * 1.4, r: HOLE * 6.5, c: '255,120,60',  a: 0.10 },
        { x: CX + HOLE * 2.4, y: CY + HOLE * 1.6, r: HOLE * 6.0, c: '160,90,255',  a: 0.10 },
        { x: CX,              y: CY,              r: HOLE * 9.5, c: '255,170,90',  a: 0.05 },
        { x: CX - R * 0.8,    y: CY + R * 0.5,    r: R * 0.7,    c: '90,160,255',  a: 0.035 },
        { x: CX + R * 0.85,   y: CY - R * 0.5,    r: R * 0.75,   c: '255,110,200', a: 0.03 },
      ];
      for (const nb of nebs) {
        const g = b.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        g.addColorStop(0, `rgba(${nb.c},${nb.a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = g;
        b.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
      }

      stars = Array.from({ length: Math.floor((W * H) / 8000) }, (_, i) => ({
        x: hash(i * 3.1) * W,
        y: hash(i * 7.7) * H,
        r: 0.4 + hash(i * 13.3) * 1.2,
        ph: hash(i * 17.9) * Math.PI * 2,
        sp: 0.4 + hash(i * 23.7) * 1.4,
      }));
      infall = Array.from({ length: 40 }, (_, i) => spawnInfall(i));
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
      ctx!.drawImage(bg, 0, 0, W, H);

      // estrelas piscando
      for (const s of stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx!.fillStyle = `rgba(232,226,255,${0.35 * tw})`;
        ctx!.fillRect(s.x, s.y, s.r, s.r);
      }

      const positions: Record<string, { x: number; y: number; a: number }> = {};
      for (const n of nodes) positions[n.id] = nodePos(n, t);
      const selectedNode = selectedRef.current
        ? nodeById[selectedRef.current.id] ?? null
        : null;
      const active = selectedNode ?? hovered;

      // Constelações: liga os nós de cada cluster em sequência (traço fino).
      ctx!.lineWidth = 1;
      for (const cl of CLUSTERS) {
        const members = nodes.filter((n) => n.c === cl.id);
        const f = effectiveFocus();
        const al = !f ? 0.18 : f === cl.id ? 0.4 : 0.03;
        ctx!.strokeStyle = hexA(cl.color, al);
        ctx!.beginPath();
        members.forEach((n, i) => {
          const p = positions[n.id];
          if (i === 0) ctx!.moveTo(p.x, p.y);
          else ctx!.lineTo(p.x, p.y);
        });
        ctx!.stroke();

        // fio até o núcleo a partir do 1º nó do cluster
        const first = members[0];
        if (first) {
          const p = positions[first.id];
          const dx = p.x - CX, dy = p.y - CY;
          const d = Math.hypot(dx, dy) || 1;
          ctx!.strokeStyle = hexA(cl.color, al * 0.5);
          ctx!.setLineDash([2, 6]);
          ctx!.beginPath();
          ctx!.moveTo(CX + (dx / d) * HOLE * 1.6, CY + (dy / d) * HOLE * 1.6);
          ctx!.lineTo(p.x, p.y);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
      }

      // Sinapses do nó ativo (curvas puxadas pro núcleo)
      if (active && adj[active.id]) {
        const p1 = positions[active.id];
        for (const otherId of adj[active.id]) {
          const p2 = positions[otherId];
          if (!p2) continue;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          const cx2 = mx + (CX - mx) * 0.4, cy2 = my + (CY - my) * 0.4;
          const g = ctx!.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          g.addColorStop(0, hexA(active.cl.color, 0.8));
          g.addColorStop(1, hexA(nodeById[otherId].cl.color, 0.8));
          ctx!.strokeStyle = g;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.moveTo(p1.x, p1.y);
          ctx!.quadraticCurveTo(cx2, cy2, p2.x, p2.y);
          ctx!.stroke();
          ctx!.lineWidth = 1;
        }
      }

      // Pulsos: informação caindo/saindo do núcleo
      if (Math.random() < 0.10 && pulses.length < 22) {
        const cand = nodes.filter((n) => nodeAlpha(n) > 0.5);
        const n = cand[Math.floor(Math.random() * cand.length)];
        if (n) pulses.push({ id: n.id, t: 0, dir: Math.random() < 0.55 ? -1 : 1, sp: 0.010 + Math.random() * 0.010 });
      }
      ctx!.globalCompositeOperation = 'lighter';
      pulses = pulses.filter((p) => (p.t += p.sp) <= 1);
      for (const p of pulses) {
        const n = nodeById[p.id];
        const pos = positions[p.id];
        if (!n || !pos) continue;
        const k = p.dir === -1 ? 1 - p.t : p.t;
        const dx = pos.x - CX, dy = pos.y - CY;
        const d = Math.hypot(dx, dy) || 1;
        const r0 = HOLE * 1.6;
        const rr = r0 + (d - r0) * k;
        ctx!.fillStyle = hexA(n.cl.color, 0.9 * Math.sin(Math.PI * p.t));
        ctx!.beginPath();
        ctx!.arc(CX + (dx / d) * rr, CY + (dy / d) * rr, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';

      drawCore(t);

      // Nós + rótulos
      ctx!.font = `10px ${MONO}`;
      for (const n of nodes) {
        const p = positions[n.id];
        const alpha = nodeAlpha(n);
        const isHot = hovered === n || selectedNode === n;
        const linked = !!(active && adj[active.id]?.includes(n.id));
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
          ctx!.strokeStyle = hexA('#ffffff', 0.35 * na);
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

        // Rótulo: nós "hot" ganham plaquinha estilo terminal (como no vídeo);
        // os demais, texto simples.
        const la = isHot || linked ? 1 : alpha;
        if (la > 0.25) {
          const right = Math.cos(p.a) >= 0;
          const label = n.name;
          if (n.hot || isHot || linked) {
            const tw = ctx!.measureText(label).width;
            const bx = right ? p.x + 10 : p.x - 10 - tw - 10;
            const by = p.y - 8;
            ctx!.fillStyle = `rgba(8,6,16,${0.72 * la})`;
            ctx!.strokeStyle = hexA(n.cl.color, 0.55 * la);
            ctx!.beginPath();
            // retangulo com cantos levemente cortados (vibe HUD)
            ctx!.rect(bx, by, tw + 10, 16);
            ctx!.fill();
            ctx!.stroke();
            ctx!.fillStyle = isHot || linked ? 'rgba(240,236,255,.96)' : hexA(n.cl.color, 0.95 * la);
            ctx!.textAlign = 'left';
            ctx!.textBaseline = 'middle';
            ctx!.fillText(label, bx + 5, by + 8.5);
          } else {
            ctx!.fillStyle = `rgba(196,190,224,${0.6 * la})`;
            ctx!.textAlign = right ? 'left' : 'right';
            ctx!.textBaseline = 'middle';
            ctx!.fillText(label, p.x + (right ? 8 : -8), p.y);
          }
        }
      }

      // Rótulos das constelações (na borda)
      ctx!.font = `600 10px ${MONO}`;
      for (const cl of CLUSTERS) {
        const a = cl.mid!;
        const x = CX + Math.cos(a) * (R + 30);
        const y = CY + Math.sin(a) * (R + 30);
        const f = effectiveFocus();
        const al = !f || f === cl.id ? 0.85 : 0.15;
        ctx!.fillStyle = hexA(cl.color, al);
        ctx!.textAlign = Math.abs(Math.cos(a)) < 0.35 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(cl.label.split('').join(' '), x, y);
      }
    }

    function drawCore(t: number) {
      ctx!.globalCompositeOperation = 'lighter';

      // órbitas-guia
      for (const orbR of [HOLE * 1.6, HOLE * 2.3]) {
        ctx!.strokeStyle = 'rgba(255,170,110,.08)';
        ctx!.beginPath();
        ctx!.ellipse(CX, CY, orbR, orbR * 0.94, 0, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // partículas em espiral (o "fogo" ao redor do núcleo)
      for (let i = 0; i < infall.length; i++) {
        const p = infall[i];
        p.a += (0.9 / (p.r / HOLE)) * 0.05 * p.sp * 2;
        p.r -= 0.13 * p.sp;
        if (p.r < HOLE * 1.1) infall[i] = spawnInfall(i + t);
        const al = 0.55 * Math.min(1, (p.r / HOLE - 1.1) / 1.2);
        // metade quente (laranja), metade fria (violeta) — paleta do vídeo
        ctx!.fillStyle = i % 2 === 0 ? `rgba(255,170,100,${al})` : `rgba(190,140,255,${al})`;
        ctx!.fillRect(CX + Math.cos(p.a) * p.r, CY + Math.sin(p.a) * p.r * 0.94, 1.4, 1.4);
      }
      ctx!.globalCompositeOperation = 'source-over';

      // horizonte
      ctx!.fillStyle = '#010103';
      ctx!.beginPath();
      ctx!.arc(CX, CY, HOLE, 0, Math.PI * 2);
      ctx!.fill();

      // anel de fótons
      ctx!.strokeStyle = 'rgba(255,196,140,.20)';
      ctx!.lineWidth = 6;
      ctx!.beginPath();
      ctx!.arc(CX, CY, HOLE * 1.05, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.strokeStyle = 'rgba(255,244,230,.9)';
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(CX, CY, HOLE * 1.04, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.lineWidth = 1;

      ctx!.font = `600 9px ${MONO}`;
      ctx!.fillStyle = 'rgba(230,214,200,.8)';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText('S I S T E M A', CX, CY + HOLE + 15);
      ctx!.fillStyle = 'rgba(170,160,190,.55)';
      ctx!.fillText('paraná seguros · núcleo', CX, CY + HOLE + 28);
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
      const n = hitTest(x, y);
      if (n !== hovered) {
        hovered = n;
        canvas!.style.cursor = n ? 'pointer' : 'default';
      }
      if (hovered) {
        tip!.style.display = 'block';
        (tip!.querySelector('.smap-t-cluster') as HTMLElement).textContent = hovered.cl.label;
        (tip!.querySelector('.smap-t-cluster') as HTMLElement).style.color = hovered.cl.color;
        (tip!.querySelector('.smap-t-name') as HTMLElement).textContent =
          hovered.name + (hovered.novo ? '  · NOVO' : '');
        (tip!.querySelector('.smap-t-desc') as HTMLElement).textContent = hovered.desc;
        const tw = tip!.offsetWidth, th = tip!.offsetHeight;
        let tx = x + 16, ty = y + 14;
        if (tx + tw > W - 8) tx = x - tw - 16;
        if (ty + th > H - 8) ty = y - th - 14;
        tip!.style.left = `${tx}px`;
        tip!.style.top = `${ty}px`;
      } else {
        tip!.style.display = 'none';
      }
    }

    function onLeave() {
      hovered = null;
      tip!.style.display = 'none';
    }

    function onClick() {
      if (hovered) setSelectedRef.current(hovered);
      else setSelectedRef.current(null);
    }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    layout();

    function frame(now: number) {
      if (destroyed) return;
      if (now - lastFrame >= 32) { // 30fps
        lastFrame = now;
        lastT = now / 1000;
        draw(lastT);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedNeighbors = selected
    ? LINKS.filter(([a, b]) => a === selected.id || b === selected.id)
        .map(([a, b]) => (a === selected.id ? b : a))
        .map((id) => NODES.find((n) => n.id === id))
        .filter((n): n is NodeDef => !!n)
    : [];

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  return (
    <section className="mt-8">
      <div
        ref={wrapRef}
        className="relative h-[640px] w-full select-none overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl"
        style={{ background: '#04030a' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" aria-label="Mapa interativo de todos os módulos e features do sistema" />

        {/* HUD: barra "live" no topo (vibe do vídeo) */}
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em]"
          style={{ fontFamily: MONO, color: '#ffc554', borderColor: 'rgba(255,197,84,.4)', background: 'rgba(10,8,4,.6)' }}
        >
          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" style={{ background: '#35e39b' }} />
          Mapa do sistema · live {stamp}
        </div>

        {/* HUD: título */}
        <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-[300px]">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: '#b18cff', fontFamily: MONO }}>
            Paraná Seguros · Plataforma
          </p>
          <h3 className="text-3xl font-extrabold uppercase leading-none tracking-wider text-white" style={{ textShadow: '0 0 32px rgba(177,140,255,.5)' }}>
            Mapa do<br />Sistema
          </h3>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400" style={{ fontFamily: MONO }}>
            Cada estrela é uma feature viva. Tudo orbita o núcleo — e cada novidade acende um ponto novo.
          </p>
          <div className="mt-3 flex gap-4 text-[10px] uppercase tracking-wider text-zinc-500" style={{ fontFamily: MONO }}>
            <span><b className="block text-base text-zinc-100">{NODES.length}</b>features</span>
            <span><b className="block text-base text-zinc-100">{CLUSTERS.length}</b>módulos</span>
            <span><b className="block text-base" style={{ color: '#35e39b' }}>{novoCount}</b>novas</span>
          </div>
        </div>

        {/* HUD: dica */}
        <p className="pointer-events-none absolute bottom-4 right-6 z-10 text-right text-[10px] leading-relaxed text-zinc-500" style={{ fontFamily: MONO }}>
          passe o mouse pelas estrelas<br />
          <em className="not-italic" style={{ color: '#b18cff' }}>clique</em> para fixar o detalhe
        </p>

        {/* Legenda (filtra por constelação) */}
        <nav className="absolute bottom-4 left-6 z-10 flex max-w-[70%] flex-wrap gap-1.5">
          {CLUSTERS.map((cl) => {
            const count = NODES.filter((n) => n.c === cl.id).length;
            const on = focusLock === cl.id;
            return (
              <button
                key={cl.id}
                onMouseEnter={() => { /* hover-focus via ref, sem re-render */ }}
                onClick={() => setFocusLock(on ? null : cl.id)}
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
                  {selectedNeighbors.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSelected({ ...n, cl: CLUSTERS.find((c) => c.id === n.c)! })}
                      className="rounded border px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-100"
                      style={{ fontFamily: MONO, borderColor: hexA(CLUSTERS.find((c) => c.id === n.c)!.color, 0.45) }}
                    >
                      {n.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
