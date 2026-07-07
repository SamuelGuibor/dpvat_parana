'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Megaphone } from 'lucide-react';

/** Sugestão de @menção do react-mentions — destaca "@everyone" com um selo. */
export function renderMentionSuggestion(s: any) {
  return s.id === 'everyone' ? (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
        <Megaphone className="w-3.5 h-3.5" />
      </div>
      <div>
        <span className="font-semibold text-sm">@everyone</span>
        <p className="text-[10px] text-gray-400 leading-none mt-0.5">Notifica todo mundo do canal</p>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
        {s.display.charAt(0)}
      </div>
      <span className="font-semibold text-sm">{s.display}</span>
    </div>
  );
}
