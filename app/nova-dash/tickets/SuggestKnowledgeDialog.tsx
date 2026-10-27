'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Textarea } from '@/app/_shared/ui/textarea';
import { Loader2, Plus } from 'lucide-react';
import { sugerirConhecimento } from '@/app/_actions/dev-tickets/ticket-actions';

// "Sugerir conhecimento" do Cérebro APP: o operador descreve o que mudou (ex.:
// e-mail novo do hospital); o servidor compara com a automação viva e o card
// nasce com o conflito "hoje × proposta" pronto para quem implementa.

export function SuggestKnowledgeDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [hospital, setHospital] = useState('');
  const [proposta, setProposta] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!title.trim() || !proposta.trim()) {
      toast.error('Preencha o assunto e o que deve mudar.');
      return;
    }
    setSaving(true);
    try {
      await sugerirConhecimento({ title, hospital, proposta, evidencia });
      toast.success('Sugestão enviada. Ela aparece em Sugestões.');
      setOpen(false);
      setTitle('');
      setHospital('');
      setProposta('');
      setEvidencia('');
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg && !/Server Components render/.test(msg) ? msg : 'Não foi possível criar a sugestão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button className="h-9 rounded-md bg-[#1a6649] font-medium text-white hover:bg-[#114a34]" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> Enviar sugestão
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Sugerir conhecimento</DialogTitle>
            <DialogDescription>
              Ex.: o hospital mudou o e-mail, pede outro formulário, passou a aceitar WhatsApp. Com o hospital informado, o sistema já compara com a automação de hoje.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label htmlFor="sk-title" className="text-xs font-bold">Assunto</Label>
              <Input id="sk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cruz Vermelha Curitiba: e-mail de pedido mudou" className="mt-1 h-11 rounded-xl" />
            </div>
            <div>
              <Label htmlFor="sk-hosp" className="text-xs font-bold">Hospital (opcional)</Label>
              <Input id="sk-hosp" value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder="Nome como aparece no card" className="mt-1 h-11 rounded-xl" />
            </div>
            <div>
              <Label htmlFor="sk-prop" className="text-xs font-bold">O que deve mudar ou ser registrado</Label>
              <Textarea
                id="sk-prop"
                value={proposta}
                onChange={(e) => setProposta(e.target.value)}
                rows={5}
                placeholder="Enviar o pedido para prontuario@hospital.com.br. Prazo e retorno sem mudança."
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="sk-evid" className="text-xs font-bold">Evidência (opcional)</Label>
              <Input id="sk-evid" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="E-mail do hospital de 24/10, ligação com a recepção…" className="mt-1 h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="h-11 rounded-xl bg-[#1a6649] font-bold hover:bg-[#114a34]" disabled={saving} onClick={salvar}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar sugestão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
