import React from 'react';

// Formatação de texto no padrão do WhatsApp:
//   *negrito*   _itálico_   ~tachado~   ```monoespaçado```
// Aplicada por linha (os marcadores não atravessam quebra de linha, igual ao app).

const INLINE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`\n]+```)/g;

function renderLine(line: string, keyBase: string): React.ReactNode[] {
  return line.split(INLINE).filter((part) => part !== '').map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <strong key={key} className="font-bold">{part.slice(1, -1)}</strong>;
    }
    if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith('~') && part.endsWith('~')) {
      return <s key={key}>{part.slice(1, -1)}</s>;
    }
    if (part.length > 6 && part.startsWith('```') && part.endsWith('```')) {
      return <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">{part.slice(3, -3)}</code>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function formatWaText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {renderLine(line, `l${i}`)}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}
