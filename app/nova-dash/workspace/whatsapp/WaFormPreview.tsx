'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Image as ImageIcon, Link2, Phone, Reply, X } from 'lucide-react';
import { summarizeFlow, type FlowJson, type PreviewItem, type PreviewScreen, type TemplateButtonDTO } from '@/app/_shared/utils/wa-forms';

// Prévia LEGÍVEL do formulário (Meta Flow): o que o cliente vê, na ordem, com
// os campos desenhados como campos. Não é o render da Meta (não há API para
// isso) — o visual exato fica no link da prévia da Meta, no rodapé.
// Modo escuro é o Dark Reader: as cores ficam nas famílias gray/emerald/cyan,
// que ele inverte bem; classes `dark:` não teriam efeito.

export interface WaFormPreviewMessage {
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButtonDTO[];
}

interface Props {
  json: FlowJson;
  /** Tela que o cliente abre (selo "abre aqui"; o celular começa nela). */
  openScreen?: string | null;
  /** Dados da tela: trocam o «campo» pelo valor digitado. */
  values?: Record<string, string> | null;
  layout?: 'phone' | 'stacked';
  /** Bolha da mensagem que leva o formulário (template ou interativa). */
  message?: WaFormPreviewMessage | null;
  previewUrl?: string | null;
}

function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const clean = text.replace(/\*\*/g, '');
  const long = clean.length > 320 || clean.split('\n').length > 6;
  return (
    <div>
      <p className={`whitespace-pre-wrap ${long && !open ? 'max-h-32 overflow-hidden' : ''}`}>{clean}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-semibold text-emerald-700 hover:underline">
          {open ? 'Ver menos' : 'Ver tudo'}
        </button>
      )}
    </div>
  );
}

function Item({ it }: { it: PreviewItem }) {
  if (it.kind === 'heading') return <p className="text-base font-bold text-gray-900">{it.text}</p>;
  if (it.kind === 'subheading') return <p className="font-semibold text-gray-800">{it.text}</p>;
  if (it.kind === 'caption') return <p className="text-xs text-gray-500">{it.text}</p>;
  if (it.kind === 'text') return <LongText text={it.text} />;
  if (it.kind === 'button') return null; // vai no rodapé da tela
  const req = it.required ? <span className="ml-0.5 text-red-500" aria-label="obrigatório">*</span> : null;
  if (it.kind === 'input') {
    return (
      <div>
        <div className="rounded-lg border border-gray-300 px-2.5 pb-2 pt-1">
          <span className="text-[11px] text-gray-500">{it.text}{req}</span>
          <div className="h-3" />
        </div>
        {it.helper && <p className="mt-0.5 px-1 text-[11px] text-gray-400">{it.helper}</p>}
      </div>
    );
  }
  if (it.kind === 'choice') {
    const multi = it.inputType === 'CheckboxGroup' || it.inputType === 'ChipsSelector';
    return (
      <fieldset disabled>
        <legend className="text-sm text-gray-800">{it.text}{req}</legend>
        {it.options?.length ? (
          <div className="mt-1 space-y-1">
            {it.options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm text-gray-700">
                <input type={multi ? 'checkbox' : 'radio'} disabled className="accent-emerald-600" /> {o}
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-400">Selecione…</div>
        )}
        {it.helper && <p className="mt-0.5 text-[11px] text-gray-400">{it.helper}</p>}
      </fieldset>
    );
  }
  if (it.kind === 'optin') {
    return (
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" disabled className="mt-1 accent-emerald-600" />
        <span className="min-w-0 flex-1">{it.text}{req}</span>
      </label>
    );
  }
  if (it.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    if (it.src) return <img src={`data:image/png;base64,${it.src}`} alt={it.text} className="mx-auto max-h-40 rounded-md object-contain" />;
    return <p className="flex items-center gap-1.5 text-xs text-gray-500"><ImageIcon className="h-3.5 w-3.5" /> {it.text}</p>;
  }
  if (it.kind === 'link') return <p className="flex items-center gap-1.5 text-sm text-cyan-700 underline"><Link2 className="h-3.5 w-3.5" /> {it.text}</p>;
  return <p className="text-sm">{it.text}</p>;
}

function ScreenBody({ s, isOpen, onNext }: { s: PreviewScreen; isOpen: boolean; onNext?: () => void }) {
  const footer = s.items.find((i) => i.kind === 'button');
  return (
    <>
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2">
        <X className="h-4 w-4 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{s.title}</span>
        {isOpen && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">abre aqui</span>}
        {s.terminal && <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">envia a resposta</span>}
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-white px-3 py-3 text-sm text-gray-700">
        {s.items.filter((i) => i.kind !== 'button').length === 0 && <p className="text-xs text-gray-400">Tela sem texto.</p>}
        {s.items.map((it, j) => <Item key={j} it={it} />)}
      </div>
      {footer && (
        <div className="border-t border-gray-100 bg-white p-2.5">
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="w-full rounded-full bg-emerald-600 px-3 py-1.5 text-center text-sm font-semibold text-white disabled:cursor-default"
          >
            {footer.text}
          </button>
        </div>
      )}
    </>
  );
}

function Bubble({ m }: { m: WaFormPreviewMessage }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-xl rounded-tl-none border border-gray-200 bg-white text-sm text-gray-800 shadow-sm">
      <div className="space-y-1 px-3 pb-2 pt-2.5">
        {m.header && <p className="font-bold">{m.header}</p>}
        <p className="whitespace-pre-wrap">{m.body}</p>
        {m.footer && <p className="text-xs text-gray-400">{m.footer}</p>}
      </div>
      {m.buttons?.map((b, i) => {
        const Icon = b.type === 'FLOW' ? ClipboardList : b.type === 'URL' ? ExternalLink : b.type === 'PHONE_NUMBER' ? Phone : Reply;
        return (
          <div key={i} className="flex items-center justify-center gap-1.5 border-t border-gray-100 px-3 py-2 text-sm font-semibold text-cyan-700">
            <Icon className="h-4 w-4" aria-hidden /> {b.text || b.type}
          </div>
        );
      })}
    </div>
  );
}

export function WaFormPreview({ json, openScreen, values, layout = 'phone', message, previewUrl }: Props) {
  const screens = useMemo(() => summarizeFlow(json, values), [json, values]);
  const openIdx = Math.max(0, screens.findIndex((s) => s.id === openScreen));
  const [idx, setIdx] = useState(openIdx);
  useEffect(() => { setIdx(openIdx); }, [openIdx, json]);
  const cur = Math.min(idx, screens.length - 1);

  const footerNote = (
    <p className="text-center text-[11px] text-gray-400">
      Prévia aproximada. O visual exato está na prévia da Meta
      {previewUrl && (
        <>
          {' · '}
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-cyan-700 hover:underline">
            abrir <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </p>
  );

  if (layout === 'stacked') {
    return (
      <div className="space-y-3">
        {message && <Bubble m={message} />}
        {screens.map((s, i) => (
          <div key={s.id} className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <div className="bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-500">Tela {i + 1}</div>
            <div className="flex flex-col"><ScreenBody s={s} isOpen={s.id === openScreen} /></div>
          </div>
        ))}
        {footerNote}
      </div>
    );
  }

  const go = (d: number) => setIdx((i) => Math.min(screens.length - 1, Math.max(0, i + d)));
  return (
    <div className="space-y-3">
      {message && <Bubble m={message} />}
      <div
        tabIndex={0}
        role="group"
        aria-label={`Prévia do formulário, tela ${cur + 1} de ${screens.length}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        }}
        className="mx-auto flex h-[460px] w-[300px] flex-col overflow-hidden rounded-[28px] border-[6px] border-gray-800 bg-gray-100 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <ScreenBody s={screens[cur]} isOpen={screens[cur].id === openScreen} onNext={cur < screens.length - 1 ? () => go(1) : undefined} />
      </div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(-1)} disabled={cur === 0} aria-label="Tela anterior" className="grid h-7 w-7 place-items-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {screens.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setIdx(i)} aria-label={`Ir para a tela ${i + 1}`} className={`h-2 w-2 rounded-full ${i === cur ? 'bg-emerald-600' : 'bg-gray-300'}`} />
          ))}
        </div>
        <span className="text-xs text-gray-500">Tela {cur + 1} de {screens.length}</span>
        <button type="button" onClick={() => go(1)} disabled={cur >= screens.length - 1} aria-label="Próxima tela" className="grid h-7 w-7 place-items-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {footerNote}
    </div>
  );
}
