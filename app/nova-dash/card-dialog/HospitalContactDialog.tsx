'use client';

// Contato do hospital (T-PMEYS, 09/11/2026): e-mail e telefone de contato do
// hospital do card, para pedir e cobrar o prontuário. Mora no catálogo de
// hospitais (GHOST), não no card: vale para todos os cards do mesmo hospital.
// Quem não tem "Gerenciar hospitais" só consulta.

import { useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Textarea } from '@/app/_shared/ui/textarea';
import { getHospitalContact, updateHospitalContact } from '@/app/_actions/hospitals/contact';
import type { HospitalContactDTO } from '@/app/_actions/hospitals/contact-types';

const VAZIO = { email: '', telefone: '', modo: '', obs: '' };

export function HospitalContactButton({ hospital }: { hospital?: string | null }) {
  const [open, setOpen] = useState(false);
  const nome = (hospital ?? '').trim();
  if (!nome) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
      >
        <Building2 className="h-3 w-3" /> Contato do hospital
      </button>
      {open && <HospitalContactDialog hospital={nome} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function HospitalContactDialog({ hospital, open, onOpenChange }: { hospital: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [dto, setDto] = useState<HospitalContactDTO | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getHospitalContact(hospital)
      .then((d) => {
        if (!vivo) return;
        setDto(d);
        setForm({ email: d.email, telefone: d.telefone, modo: d.modo, obs: d.obs });
      })
      .catch(() => vivo && setErro('Não foi possível carregar o contato do hospital.'));
    return () => { vivo = false; };
  }, [hospital]);

  async function salvar() {
    setSaving(true);
    try {
      const d = await updateHospitalContact(hospital, form);
      setDto(d);
      toast.success('Contato do hospital salvo.');
      onOpenChange(false);
    } catch (err) {
      // Em produção a mensagem da action chega mascarada: texto próprio.
      const msg = err instanceof Error && /inválido|Informe/.test(err.message) ? err.message : 'Não foi possível salvar. Confira o e-mail e o telefone (DDD + número).';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const leitura = !dto?.podeEditar;
  const set = (k: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contato do hospital</DialogTitle>
          <DialogDescription>
            {hospital}. Vale para todos os cards deste hospital e é usado no pedido de prontuário e nas automações
            ([[hospital_email]], [[hospital_telefone]]).
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-red-600">{erro}</p>
        ) : !dto ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="hc-email">E-mail de contato</Label>
              <Input id="hc-email" type="email" value={form.email} onChange={set('email')} disabled={leitura} placeholder="prontuario@hospital.com.br" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hc-tel">Telefone de contato</Label>
              <Input id="hc-tel" value={form.telefone} onChange={set('telefone')} disabled={leitura} placeholder="41 99999-9999" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hc-modo">Como pedir</Label>
              <Input id="hc-modo" value={form.modo} onChange={set('modo')} disabled={leitura} placeholder="e-mail, presencial, portal…" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="hc-obs">Observação</Label>
              <Textarea id="hc-obs" value={form.obs} onChange={set('obs')} disabled={leitura} rows={3} />
            </div>
            {leitura && <p className="text-xs text-gray-500">Só quem tem a permissão &quot;Gerenciar hospitais&quot; edita.</p>}
            {!dto.noCatalogo && !leitura && <p className="text-xs text-gray-500">Este hospital ainda não está no catálogo: salvar o cadastra.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {!leitura && dto && (
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
