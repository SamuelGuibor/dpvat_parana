'use client';

// Seção Segurança do Espaço de Trabalho: gerencia a lista de IPs que podem
// abrir a dashboard (trava do escritório). Quem entra de fora sem a permissão
// "Acesso fora do escritório" (bypass_ip_lock) vê a tela de bloqueio.
// Exclusivo do manage_team (ADMIN++).

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, ShieldCheck, ShieldOff, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { cn } from '@/app/_shared/lib/utils';
import { getIpLockSettings, setDashboardAllowedIps } from '@/app/_actions/security/ip-lock';

export function SecurityPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ips, setIps] = useState<string[]>([]);
  const [savedIps, setSavedIps] = useState<string[]>([]);
  const [currentIp, setCurrentIp] = useState('');
  const [newIp, setNewIp] = useState('');

  useEffect(() => {
    getIpLockSettings()
      .then((s) => {
        setIps(s.ips);
        setSavedIps(s.ips);
        setCurrentIp(s.currentIp);
      })
      .catch((err) => {
        console.error(err);
        toast.error(err?.message || 'Erro ao carregar as configurações');
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(
    () => ips.join('\n') !== savedIps.join('\n'),
    [ips, savedIps],
  );
  const lockOn = ips.length > 0;
  const currentIpListed = ips.some((e) =>
    e.endsWith('*') ? currentIp.toLowerCase().startsWith(e.slice(0, -1).toLowerCase()) : e.toLowerCase() === currentIp.toLowerCase(),
  );

  // No wifi da empresa todo mundo divide o MESMO IPv4 público (NAT), mas no
  // IPv6 cada máquina tem um endereço próprio — o que identifica a rede é o
  // prefixo (4 primeiros blocos). Liberar o prefixo cobre o escritório inteiro.
  const networkPrefix = useMemo(() => {
    if (!currentIp.includes(':')) return null;
    const parts = currentIp.split(':');
    if (parts.length < 4 || parts.slice(0, 4).some((p) => !p)) return null;
    return `${parts.slice(0, 4).join(':')}:*`;
  }, [currentIp]);

  function addIp(value: string) {
    const v = value.trim();
    if (!v) return;
    if (ips.includes(v)) {
      toast.info('Este IP já está na lista');
      return;
    }
    setIps((prev) => [...prev, v]);
    setNewIp('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await setDashboardAllowedIps(ips.join('\n'));
      setIps(res.ips);
      setSavedIps(res.ips);
      toast.success(
        res.ips.length ? 'IPs liberados atualizados!' : 'Trava de IP desligada (lista vazia)',
      );
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center gap-3">
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-2xl',
          lockOn ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-gray-100 dark:bg-zinc-800',
        )}>
          {lockOn
            ? <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            : <ShieldOff className="h-6 w-6 text-gray-400" />}
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100">Trava de IP da dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {lockOn
              ? 'Ativa — a dashboard só abre pelos IPs abaixo (ou com a permissão "Acesso fora do escritório").'
              : 'Desligada — a dashboard abre de qualquer internet. Adicione um IP para ativar.'}
          </p>
        </div>
      </div>

      {/* Meu IP atual */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <Wifi className="h-4 w-4 text-blue-500" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Seu IP agora</p>
            <p className="font-mono text-sm text-gray-900 dark:text-zinc-100">{currentIp}</p>
          </div>
          {lockOn && (
            <span className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-bold',
              currentIpListed
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
            )}>
              {currentIpListed ? 'liberado' : 'fora da lista'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {networkPrefix && !ips.includes(networkPrefix) && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
              title={`Libera ${networkPrefix} — todos os computadores desta rede wifi de uma vez`}
              onClick={() => addIp(networkPrefix)}
            >
              <Wifi className="mr-1.5 h-3.5 w-3.5" />
              Adicionar prefixo da rede
            </Button>
          )}
          {!ips.includes(currentIp) && (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => addIp(currentIp)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Adicionar meu IP
            </Button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-gray-100 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
          <p className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            IPs liberados ({ips.length})
          </p>
        </div>
        {ips.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhum IP na lista — a trava está desligada.
          </p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
            {ips.map((ip) => (
              <div key={ip} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-mono text-sm text-gray-900 dark:text-zinc-100">
                  {ip}
                  {ip.endsWith('*') && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 font-sans text-[10px] font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                      prefixo
                    </span>
                  )}
                  {ip === currentIp && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-sans text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                      você
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setIps((prev) => prev.filter((x) => x !== ip))}
                  className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Adicionar */}
        <div className="flex gap-2 border-t border-gray-100 p-3 dark:border-zinc-800">
          <input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addIp(newIp); }}
            placeholder='Ex.: 177.1.17.71 ou 2804:d55:830c:2900:* (prefixo)'
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <Button variant="outline" className="rounded-xl" onClick={() => addIp(newIp)} disabled={!newIp.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button className="rounded-xl" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}
