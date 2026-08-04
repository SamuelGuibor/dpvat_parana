/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/_shared/ui/select';
import {
  createProjectCost, updateProjectCost, type ProjectCostDTO,
} from '@/app/_actions/costs';
import { COST_SERVICES, formatMoney, parseMoneyToCents } from '@/app/_shared/lib/costs';

// Formulário de lançamento de custo. Serve para criar e para editar — quando
// `editing` vem preenchido, os campos nascem com os valores dele.
//
// O campo "valor em real" só aparece quando a moeda é dólar: é o que caiu na
// fatura do cartão, e é ele que soma nos totais.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProjectCostDTO | null;
  onSaved: () => Promise<void>;
}

/** "YYYY-MM-DD" de hoje, no fuso local. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Centavos -> "1234,56" para preencher o input ao editar. */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function CostFormDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [service, setService] = useState<string>('vercel');
  const [description, setDescription] = useState('');
  const [chargedAt, setChargedAt] = useState(today());
  const [currency, setCurrency] = useState('BRL');
  const [amount, setAmount] = useState('');
  const [amountBrl, setAmountBrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Reidrata a cada abertura: sem isso, reabrir depois de editar mostraria os
  // campos do lançamento anterior.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setService(editing.service);
      setDescription(editing.description ?? '');
      setChargedAt(editing.chargedAt.slice(0, 10));
      setCurrency(editing.currency);
      setAmount(centsToInput(editing.amountCents));
      setAmountBrl(editing.currency === 'BRL' ? '' : centsToInput(editing.amountBrlCents));
    } else {
      setService('vercel');
      setDescription('');
      setChargedAt(today());
      setCurrency('BRL');
      setAmount('');
      setAmountBrl('');
    }
  }, [open, editing]);

  const isUsd = currency !== 'BRL';
  const amountCents = parseMoneyToCents(amount);
  const amountBrlCents = isUsd ? parseMoneyToCents(amountBrl) : amountCents;
  const canSave = !saving
    && !!amountCents && amountCents > 0
    && !!amountBrlCents && amountBrlCents > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(chargedAt);

  async function handleSave() {
    if (!amountCents || !amountBrlCents) return;
    setSaving(true);
    try {
      const payload = {
        service,
        description: description.trim() || null,
        chargedAt,
        amountCents,
        currency,
        amountBrlCents,
      };
      if (editing) {
        await updateProjectCost(editing.id, payload);
        toast.success('Lançamento atualizado.');
      } else {
        await createProjectCost(payload);
        toast.success('Custo lançado.');
      }
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
          <DialogDescription>
            Registre o que o serviço cobrou e em que dia a cobrança caiu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Serviço</label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_SERVICES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">
              Descrição <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Plano Pro, créditos de API, S3 + SES"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Data da cobrança</label>
              <Input type="date" value={chargedAt} onChange={(e) => setChargedAt(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Moeda</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">Real (R$)</SelectItem>
                  <SelectItem value="USD">Dólar (US$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">
                Valor {isUsd ? 'em dólar' : ''}
              </label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={isUsd ? '20,00' : '109,90'}
                inputMode="decimal"
              />
            </div>
            {isUsd && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">
                  Deu em real
                </label>
                <Input
                  value={amountBrl}
                  onChange={(e) => setAmountBrl(e.target.value)}
                  placeholder="118,40"
                  inputMode="decimal"
                />
              </div>
            )}
          </div>

          {isUsd && (
            <p className="text-xs text-gray-400">
              O valor em real é o que apareceu na fatura do cartão — é ele que entra nos totais.
            </p>
          )}

          {!!amountBrlCents && amountBrlCents > 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
              Vai somar <span className="font-black text-gray-900 dark:text-zinc-100">{formatMoney(amountBrlCents)}</span> aos custos.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {editing ? 'Salvar' : 'Lançar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
