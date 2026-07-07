'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Renderizador compartilhado de texto de mensagens (comentários e chat).
//
// Suporta: menções @[display](id), e-mails clicáveis (copiar), URLs,
// **negrito**, *itálico* e quebras de linha. Extraído de CommentsTab para
// ser reaproveitado pelo Chat da equipe sem duplicar o parser.

import React, { useState } from 'react';
import { Badge } from '@/app/_shared/ui/badge';
import { ExternalLink, CheckCircle2, Copy } from 'lucide-react';

function EmailChip({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
      }}
      title={copied ? 'E-mail copiado!' : 'Clique para copiar o e-mail'}
      className="text-sky-600 hover:text-sky-700 underline decoration-sky-600/40 hover:decoration-sky-700 inline items-baseline gap-0.5 break-all cursor-pointer bg-transparent p-0 m-0 border-0 font-inherit align-baseline"
      style={{ font: 'inherit' }}
    >
      <span>{email}</span>
      {copied
        ? <CheckCircle2 size={11} className="inline -mb-0.5 ml-0.5 text-emerald-500" />
        : <Copy size={11} className="inline -mb-0.5 ml-0.5 opacity-60" />}
    </button>
  );
}

function ensureHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const palette = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
];

export const colorFromId = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};

// Grupos: (1) menção completa (2) display (3) id | (4) email | (5) URL | (6) bold | (7) itálico
const SEGMENT_REGEX =
  /(@\[(.+?)\]\((.+?)\))|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?)|(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com\.br|com|net|org|io|gov|edu|app|dev|me|tv|info|gov\.br|org\.br)(?:\/[^\s<>"')*]*)?)|\*\*(.+?)\*\*|\*(.+?)\*/gi;

function parseSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  SEGMENT_REGEX.lastIndex = 0;

  for (const m of text.matchAll(SEGMENT_REGEX)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));

    if (m[1]) {
      const display = m[2]; const id = m[3];
      const isEveryone = id === 'everyone';
      const c = isEveryone
        ? { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' }
        : colorFromId(id);
      parts.push(
        <Badge key={`${keyPrefix}-mention-${key++}`} variant="secondary" className={`mx-1 ${c.bg} ${c.text} ${c.border} ${isEveryone ? 'font-bold' : ''}`}>
          @{display}
        </Badge>
      );
    } else if (m[4]) {
      parts.push(<EmailChip key={`${keyPrefix}-em-${key++}`} email={m[4]} />);
    } else if (m[5]) {
      let url = m[5];
      while (/[.,;:!?)\]]$/.test(url)) url = url.slice(0, -1);
      if (url.length > 0) {
        parts.push(
          <a
            key={`${keyPrefix}-url-${key++}`}
            href={ensureHref(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:text-sky-700 underline decoration-sky-600/40 hover:decoration-sky-700 inline-flex items-baseline gap-0.5 break-all"
          >
            {url}
            <ExternalLink size={11} className="inline -mb-0.5 opacity-70" />
          </a>
        );
      }
    } else if (m[6] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b-${key++}`} className="font-bold">{m[6]}</strong>);
    } else if (m[7] !== undefined) {
      parts.push(<em key={`${keyPrefix}-i-${key++}`} className="italic">{m[7]}</em>);
    }

    last = idx + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Renderiza texto com menções, links, markdown básico e quebras de linha. */
export function renderFormattedText(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) nodes.push(<br key={`br-${lineIdx}`} />);
    const segments = parseSegments(line, `${lineIdx}`);
    segments.forEach((seg, segIdx) => {
      nodes.push(<span key={`${lineIdx}-${segIdx}`}>{seg}</span>);
    });
  });

  return nodes;
}
