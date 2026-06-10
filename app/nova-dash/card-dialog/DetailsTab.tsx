/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { Separator } from '@/app/_components/ui/separator';
import { Calendar } from 'lucide-react';
import type { ExtendedKanbanCard } from './types';
import {
  SERVICE_OPTIONS, ESTADOS, ESTADO_CIVIL,
  NACIONALIDADES, ATENDIMENTO_VIA,
} from './constants';

interface Props {
  editedCard: ExtendedKanbanCard;
  onChange: (field: string, value: string) => void;
  labels: any[];
}

const inputClass =
  'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50';
const selectClass =
  'w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function Field({ id, label, value, onChange, type = 'text' }: {
  id: string;
  label: string;
  value?: string;
  onChange: (field: string, value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
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
  function formatDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 2) return digits;

    // 3-6 digits: check if digits after the first 2 form a year (>=1900)
    // If yes → MM/AAAA format. If no → DD/MM/... (more digits expected)
    if (digits.length <= 6) {
      const rest = digits.slice(2);
      const possibleYear = parseInt(rest.padEnd(4, '0'));
      if (rest.length >= 3 && possibleYear >= 1900 && possibleYear <= 2200) {
        // MM/AAAA format
        return digits.slice(0, 2) + '/' + digits.slice(2);
      }
      // DD/MM format (still typing year)
      if (digits.length <= 4) {
        return digits.slice(0, 2) + '/' + digits.slice(2);
      }
      return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    }

    // 7-8 digits: DD/MM/AAAA
    return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatDateInput(e.target.value);
    onChange(id, formatted);
  }

  const clean = (value || '').replace(/\D/g, '');
  const slashCount = (value || '').split('/').length - 1;
  const hint = clean.length >= 5 && slashCount === 1 ? 'MM/AAAA' : 'DD/MM/AAAA';

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        <span className="text-xs text-muted-foreground ml-2">({hint})</span>
      </Label>
      <Input
        id={id}
        name={id}
        type="text"
        value={value || ''}
        onChange={handleChange}
        placeholder="DD/MM/AAAA ou MM/AAAA"
        maxLength={10}
        className={inputClass}
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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
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

export function DetailsTab({ editedCard, onChange, labels }: Props) {
  return (
    <div className="space-y-4 px-1">
      <Separator />
      <div className="grid grid-cols-2 gap-4 font-semibold text-lg">
        <Field id="title" label="Nome" value={editedCard.title} onChange={onChange} />
        <Field id="cpf" label="CPF" value={editedCard.cpf} onChange={onChange} />
        <DateFlexField id="data_nasc" label="Data Nascimento" value={editedCard.data_nasc} onChange={onChange} />
        <Field id="email" label="Email" value={editedCard.email} onChange={onChange} />
        <Field id="cep" label="CEP" value={editedCard.cep} onChange={onChange} />
        <Field id="rua" label="Rua" value={editedCard.rua} onChange={onChange} />
        <Field id="bairro" label="Bairro" value={editedCard.bairro} onChange={onChange} />
        <Field id="numero" label="Número" value={editedCard.numero} onChange={onChange} />
        <Field id="cidade" label="Cidade" value={editedCard.cidade} onChange={onChange} />
        <Field id="rg" label="RG" value={editedCard.rg} onChange={onChange} />
        <Field id="telefone" label="Telefone" value={editedCard.telefone} onChange={onChange} />

        <SelectField id="estado" label="Estado" value={editedCard.estado}
          options={toOptions(ESTADOS)} onChange={onChange} placeholder="Selecione o estado" />
        <SelectField id="estado_civil" label="Estado Civil" value={editedCard.estado_civil}
          options={toOptions(ESTADO_CIVIL)} onChange={onChange} placeholder="Selecione o estado civil" />

        <Field id="profissao" label="Profissão" value={editedCard.profissao} onChange={onChange} />

        <SelectField id="nacionalidade" label="Nacionalidade" value={editedCard.nacionalidade}
          options={toOptions(NACIONALIDADES)} onChange={onChange} placeholder="Selecione a nacionalidade" />
        <div className="space-y-2">
          <Label htmlFor="labelId">Etiqueta</Label>
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
            <option value="">Selecione uma etiqueta</option>
            {labels.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <SelectField id="service" label="Serviços" value={editedCard.service}
          options={toOptions(SERVICE_OPTIONS)} onChange={onChange} placeholder="Selecione um serviço" />

        <div className="col-span-2">
          <Field id="obs" label="Observação" value={editedCard.obs} onChange={onChange} />
        </div>
        <div className="col-span-2">
          <Field id="nome_mae" label="Nome da Mãe" value={editedCard.nome_mae} onChange={onChange} />
        </div>
      </div>

      <Separator />
      <div className="py-2 rounded-xl">
        <h1 className="font-bold">Dados do Acidente</h1>
        <div className="grid grid-cols-2 gap-4">
          <DateFlexField id="data_acidente" label="Data do Acidente" value={editedCard.data_acidente} onChange={onChange} />
          <SelectField id="atendimento_via" label="Atendimento Via" value={editedCard.atendimento_via}
            options={ATENDIMENTO_VIA} onChange={onChange} placeholder="Selecione o atendimento via" />
          <Field id="hospital" label="Hospital" value={editedCard.hospital} onChange={onChange} />
          <Field id="outro_hospital" label="Outro Hospital" value={editedCard.outro_hospital} onChange={onChange} />
          <div className="col-span-2">
            <Field id="lesoes" label="Lesões" value={editedCard.lesoes} onChange={onChange} />
          </div>
        </div>
      </div>

      <Separator />
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status Atual</Label>
          <Input id="status" value={editedCard.status || ''} disabled />
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>Criado: {new Date(editedCard.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>Atualizado: {new Date(editedCard.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}