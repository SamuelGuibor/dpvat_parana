/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import type { ReactNode } from 'react';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Calendar } from 'lucide-react';
import type { ExtendedKanbanCard } from './types';
import {
  SERVICE_OPTIONS, ESTADOS, ESTADO_CIVIL,
  NACIONALIDADES,
} from './constants';
import { HospitalCombobox } from './HospitalCombobox';

interface Props {
  editedCard: ExtendedKanbanCard;
  onChange: (field: string, value: string) => void;
  labels: any[];
  cardId?: string;
  isProcess?: boolean;
}

const labelClass = 'text-xs font-medium text-gray-600 dark:text-zinc-400';
const inputClass =
  'h-9 text-sm focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50 dark:bg-zinc-950 dark:text-zinc-100 dark:border-zinc-800 dark:placeholder:text-zinc-500';
const selectClass =
  'w-full h-9 px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

// Seção visual: agrupa campos relacionados num cartão com título discreto,
// deixando o formulário mais fácil de escanear.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 shadow-sm">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}

function Field({ id, label, value, onChange, type = 'text' }: {
  id: string;
  label: string;
  value?: string;
  onChange: (field: string, value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        value={value || ''}
        onChange={(e) => onChange(id, e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function DateFlexField({ id, label, value, onChange }: {
  id: string;
  label: string;
  value?: string;
  onChange: (field: string, value: string) => void;
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(id, e.target.value);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type="text"
        value={value || ''}
        onChange={handleChange}
        placeholder="Ex.: 12/05/1999, 05/1999, 1999 ou 1999 - 2000"
        maxLength={32}
        className={inputClass}
      />
    </div>
  );
}

function TextAreaField({ id, label, value, onChange, placeholder, rows = 4 }: {
  id: string;
  label: string;
  value?: string;
  onChange: (field: string, value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      <textarea
        id={id}
        name={id}
        value={value || ''}
        onChange={(e) => onChange(id, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full rounded-md border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 px-3 py-2 text-sm leading-relaxed resize-y shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
      />
    </div>
  );
}

function SelectField({ id, label, value, options, onChange, placeholder }: {
  id: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (field: string, value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange(id, e.target.value)}
        className={selectClass}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

const toOptions = (arr: string[]) => arr.map((s) => ({ value: s, label: s }));

export function DetailsTab({ editedCard, onChange, labels, cardId, isProcess }: Props) {
  return (
    <div className="space-y-4 px-1 pb-2">
      {/* Dados Pessoais */}
      <Section title="Dados Pessoais">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <Field id="title" label="Nome" value={editedCard.title} onChange={onChange} />
          <Field id="rg" label="RG" value={editedCard.rg} onChange={onChange} />

          <DateFlexField id="data_nasc" label="Data de Nascimento" value={editedCard.data_nasc} onChange={onChange} />
          <Field id="cpf" label="CPF" value={editedCard.cpf} onChange={onChange} />

          <Field id="nome_mae" label="Nome da Mãe" value={editedCard.nome_mae} onChange={onChange} />
          <Field id="telefone" label="Telefone" value={editedCard.telefone} onChange={onChange} />

          <SelectField id="nacionalidade" label="Nacionalidade" value={editedCard.nacionalidade}
            options={toOptions(NACIONALIDADES)} onChange={onChange} placeholder="Selecione a nacionalidade" />
          <SelectField id="estado_civil" label="Estado Civil" value={editedCard.estado_civil}
            options={toOptions(ESTADO_CIVIL)} onChange={onChange} placeholder="Selecione o estado civil" />

          <Field id="profissao" label="Profissão" value={editedCard.profissao} onChange={onChange} />
          <Field id="senha_inss" label="Senha INSS" value={editedCard.senha_inss} onChange={onChange} />

          <SelectField id="service" label="Serviço" value={editedCard.service}
            options={toOptions(SERVICE_OPTIONS)} onChange={onChange} placeholder="Selecione um serviço" />
          <div className="space-y-1">
            <Label htmlFor="labelId" className={labelClass}>Coluna</Label>
            <select
              id="labelId"
              value={editedCard.labelId || ''}
              onChange={(e) => {
                const selected = labels.find((l: any) => l.id === e.target.value);
                onChange('labelId', e.target.value);
                if (selected) onChange('role', selected.name);
              }}
              className={selectClass}
            >
              <option value="">Selecione uma Coluna</option>
              {labels.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* Endereço */}
      <Section title="Endereço">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <Field id="cep" label="CEP" value={editedCard.cep} onChange={onChange} />
          <Field id="bairro" label="Bairro" value={editedCard.bairro} onChange={onChange} />

          <Field id="rua" label="Rua" value={editedCard.rua} onChange={onChange} />
          <Field id="cidade" label="Cidade" value={editedCard.cidade} onChange={onChange} />

          <Field id="numero" label="Número" value={editedCard.numero} onChange={onChange} />
          <SelectField id="estado" label="Estado" value={editedCard.estado}
            options={toOptions(ESTADOS)} onChange={onChange} placeholder="Selecione o estado" />
        </div>
      </Section>

      {/* Contato */}
      <Section title="Contato">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
          <Field id="telefone_secundario" label="Telefone Secundário" value={editedCard.telefone_secundario} onChange={onChange} />
          <Field id="email" label="E-mail" type="email" value={editedCard.email} onChange={onChange} />
          <Field id="rede_social" label="Rede Social" value={editedCard.rede_social} onChange={onChange} />
        </div>
      </Section>

      {/* Observação */}
      <Section title="Observação">
        <TextAreaField
          id="obs"
          label="Observação geral"
          value={editedCard.obs}
          onChange={onChange}
          placeholder="Anotações gerais sobre o card..."
          rows={2}
        />
      </Section>

      {/* Dados do Acidente */}
      <Section title="Dados do Acidente">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <DateFlexField id="data_acidente" label="Data do Acidente" value={editedCard.data_acidente} onChange={onChange} />
          {/* <SelectField id="atendimento_via" label="Atendimento Via" value={editedCard.atendimento_via}
            options={ATENDIMENTO_VIA} onChange={onChange} placeholder="Selecione o atendimento via" /> */}
          <HospitalCombobox id="hospital" label="Hospital" value={editedCard.hospital} onChange={onChange} />
          <Field id="outro_hospital" label="Outro Hospital" value={editedCard.outro_hospital} onChange={onChange} />
          <div className="sm:col-span-2">
            <Field id="lesoes" label="Lesões" value={editedCard.lesoes} onChange={onChange} />
          </div>
          <div className="sm:col-span-2">
            <TextAreaField
              id="otherObs"
              label="Descrição do Acidente"
              value={editedCard.otherObs}
              onChange={onChange}
              placeholder="Descreva como o acidente ocorreu, circunstâncias, detalhes relevantes..."
              rows={5}
            />
          </div>
        </div>
      </Section>

      {/* Controle do Card */}
      <Section title="Controle do Card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
          <div className="space-y-1">
            <Label htmlFor="status" className={labelClass}>Status Atual</Label>
            <Input id="status" value={editedCard.status || ''} disabled className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cardNumber" className={labelClass}>Nº do Card</Label>
            <Input id="cardNumber" value={editedCard.cardNumber ? `#${editedCard.cardNumber}` : '—'} disabled className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="afastadoAte" className={labelClass}>Vencimento do Card</Label>
            <Input
              id="afastadoAte"
              type="date"
              value={editedCard.afastadoAte ? editedCard.afastadoAte.slice(0, 10) : ''}
              onChange={(e) => onChange('afastadoAte', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-500 dark:text-zinc-400">
          Vencimento: data em que o card termina. A notificação avisa quando se aproxima/vence.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Criado: {new Date(editedCard.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Atualizado: {new Date(editedCard.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </Section>

    </div>
  );
}
