'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Textarea } from '@/app/_shared/ui/textarea';
import { Loader2, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_shared/ui/select';
import { sugerirConhecimento } from '@/app/_actions/dev-tickets/ticket-actions';
import { DESTINOS, type Destino } from '@/app/_shared/utils/cerebro';
import { DESTINO_META } from './constants';

// "Sugerir conhecimento" do Cérebro APP: o operador descreve o que mudou (ex.:
// e-mail novo do hospital, uma skill que devia fazer outra coisa, uma resposta
// do bot) e escolhe o destino. No vault com hospital, o servidor compara com a
// automação viva e o card nasce com o conflito "hoje × proposta".

const SEM_SETOR = '__sem__';

export function SuggestKnowledgeDialog({ onCreated, setores }: { onCreated: () => void; setores: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [destino, setDestino] = useState<Destino>('vault');
  const [skill, setSkill] = useState('');
  const [setor, setSetor] = useState(SEM_SETOR);
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
      await sugerirConhecimento({
        title,
        destino,
        hospital: destino === 'vault' ? hospital : undefined,
        skill: destino === 'skill' ? skill : undefined,
        proposta,
        evidencia,
        sectorId: setor === SEM_SETOR ? null : setor,
      });
      toast.success('Sugestão enviada. Ela aparece em Sugestões.');
      setOpen(false);
      setTitle('');
      setHospital('');
      setSkill('');
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
              Ex.: o hospital mudou o e-mail, a skill /meu-dia devia mostrar outra coisa, o bot respondeu errado. Quem tem permissão implementa com a IA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sk-dest" className="text-xs font-bold">O que muda</Label>
                <Select value={destino} onValueChange={(v) => setDestino(v as Destino)}>
                  <SelectTrigger id="sk-dest" className="mt-1 h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINOS.map((d) => (
                      <SelectItem key={d} value={d}>{DESTINO_META[d].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sk-setor" className="text-xs font-bold">Setor (opcional)</Label>
                <Select value={setor} onValueChange={setSetor}>
                  <SelectTrigger id="sk-setor" className="mt-1 h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_SETOR}>Sem setor</SelectItem>
                    {setores.map((st) => (
                      <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="-mt-1.5 text-xs text-gray-600">{DESTINO_META[destino].hint}</p>
            <div>
              <Label htmlFor="sk-title" className="text-xs font-bold">Assunto</Label>
              <Input id="sk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cruz Vermelha Curitiba: e-mail de pedido mudou" className="mt-1 h-11 rounded-xl" />
            </div>
            {destino === 'vault' && (
              <div>
                <Label htmlFor="sk-hosp" className="text-xs font-bold">Hospital (opcional)</Label>
                <Input id="sk-hosp" value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder="Nome como aparece no card" className="mt-1 h-11 rounded-xl" />
              </div>
            )}
            {destino === 'skill' && (
              <div>
                <Label htmlFor="sk-skill" className="text-xs font-bold">Skill (opcional)</Label>
                <Input id="sk-skill" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="meu-dia, prontuario, pendencias…" className="mt-1 h-11 rounded-xl" />
              </div>
            )}
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
