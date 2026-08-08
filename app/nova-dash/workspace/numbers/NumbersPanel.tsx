'use client';

import { useCallback, useEffect, useState } from 'react';
import { Phone, Plus, RefreshCw, Star, Power, KeyRound, Download } from 'lucide-react';
import {
  listWaNumbers,
  createWaNumber,
  updateWaNumber,
  setDefaultWaNumber,
  importEnvNumber,
  type WaNumberDTO,
} from '@/app/_actions/whatsapp/numbers';

// Tela de NÚMEROS do WhatsApp (multi-tenant): cadastra as API keys da Meta
// direto no site — sem redeploy. O token é validado na Meta antes de salvar e
// guardado criptografado; aqui só aparece um sufixo mascarado.

const emptyForm = { label: '', phoneNumberId: '', wabaId: '', accessToken: '', apiVersion: 'v21.0' };

export function NumbersPanel() {
  const [numbers, setNumbers] = useState<WaNumberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tokenEditId, setTokenEditId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    listWaNumbers()
      .then(setNumbers)
      .catch(() => setError('Falha ao carregar os números.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Falha na operação.');
      else { setNotice(okMsg); reload(); }
      return res.ok;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const ok = await run(() => createWaNumber(form), 'Número cadastrado e validado na Meta. ✅');
    if (ok) { setForm(emptyForm); setShowForm(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-zinc-100">
            <Phone className="h-5 w-5 text-emerald-600" /> Números do WhatsApp
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Cada número tem suas próprias credenciais da Meta. O webhook identifica o número automaticamente pelo phone_number_id.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => run(async () => importEnvNumber(), 'Número principal importado e histórico adotado. ✅')}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Cria o registro do número atual (das envs) e vincula todo o histórico existente a ele"
          >
            <Download className="h-4 w-4" /> Importar nº principal
          </button>
          <button
            onClick={() => { setShowForm((v) => !v); setError(null); setNotice(null); }}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Adicionar número
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{notice}</div>}

      {showForm && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">Novo número</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              Rótulo (como aparece nos painéis)
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex.: Leads Meta Ads" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </label>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              Phone number ID (painel da Meta)
              <input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                placeholder="Ex.: 123456789012345" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </label>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              WABA ID (conta WhatsApp Business — p/ templates)
              <input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
                placeholder="Opcional" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </label>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              Token permanente (System User)
              <input value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                type="password" placeholder="EAAG..." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Cancelar</button>
            <button onClick={submitCreate} disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? 'Validando na Meta…' : 'Validar e salvar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-400"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : numbers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-zinc-700">
          Nenhum número cadastrado — o sistema está rodando no número das variáveis de ambiente.
          Use “Importar nº principal” para trazê-lo pro cadastro antes de adicionar novos.
        </div>
      ) : (
        <div className="space-y-2">
          {numbers.map((n) => (
            <div key={n.id} className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${n.active ? 'border-gray-200 dark:border-zinc-800' : 'border-gray-200 opacity-60 dark:border-zinc-800'}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-zinc-100">
                  {n.label}
                  {n.isDefault && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300"><Star className="h-3 w-3" /> Padrão</span>}
                  {!n.active && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">Inativo</span>}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {n.displayPhone ? `+${n.displayPhone} · ` : ''}phone_number_id {n.phoneNumberId}
                  {n.wabaId ? ` · WABA ${n.wabaId}` : ''} · token {n.tokenHint}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {tokenEditId === n.id ? (
                  <>
                    <input value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} type="password" placeholder="Novo token"
                      className="w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                    <button
                      onClick={async () => {
                        const ok = await run(() => updateWaNumber({ id: n.id, accessToken: tokenDraft }), 'Token rotacionado. ✅');
                        if (ok) { setTokenEditId(null); setTokenDraft(''); }
                      }}
                      disabled={busy || !tokenDraft.trim()}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">Salvar</button>
                    <button onClick={() => { setTokenEditId(null); setTokenDraft(''); }} className="rounded-lg px-2 py-1.5 text-[11px] text-gray-500">✕</button>
                  </>
                ) : (
                  <>
                    {!n.isDefault && n.active && (
                      <button onClick={() => run(() => setDefaultWaNumber(n.id), 'Número padrão atualizado. ✅')} disabled={busy}
                        title="Tornar padrão (envios sem número definido saem por ele)"
                        className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"><Star className="h-4 w-4" /></button>
                    )}
                    <button onClick={() => { setTokenEditId(n.id); setTokenDraft(''); }} disabled={busy}
                      title="Rotacionar o token (valida na Meta antes de salvar)"
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"><KeyRound className="h-4 w-4" /></button>
                    <button onClick={() => run(() => updateWaNumber({ id: n.id, active: !n.active }), n.active ? 'Número desativado.' : 'Número reativado. ✅')} disabled={busy || n.isDefault}
                      title={n.isDefault ? 'O número padrão não pode ser desativado' : n.active ? 'Desativar (webhook passa a ignorar)' : 'Reativar'}
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"><Power className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
