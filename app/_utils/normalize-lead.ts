import { RD_CUSTOM_FIELDS_MAP } from './rd-custom-fields';
import { RDLead } from '@/app/_actions/get-leads';

export function normalizeLead(lead: RDLead) {
  const customFields: Record<string, string> = {};

  for (const key in lead.custom_fields) {
    const mappedKey = RD_CUSTOM_FIELDS_MAP[key];
    if (mappedKey) {
      customFields[mappedKey] = lead.custom_fields[key];
    }
  }

  return {
    id: lead.uuid,
    name: lead.name,
    email: lead.email,
    phone: lead.mobile_phone,
    ...customFields,
  };
}
