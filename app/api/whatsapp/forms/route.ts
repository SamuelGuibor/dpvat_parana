import { NextRequest } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { getCreds } from '@/app/_shared/lib/whatsapp/numbers';
import {
  credsForWaba, ensureFlowJson, fetchMetaFlowPreview, loadFamilyVersions, loadFormCatalog,
  syncFormCatalog, toFormVersionDTO,
} from '@/app/_shared/lib/whatsapp/forms';
import { fetchTemplateComponents } from '@/app/_shared/lib/whatsapp/client';
import {
  entryScreen, entryScreenData, findTemplateFlowButton, flowButtonOf, normalizeTemplateButtons, readTemplateButtons,
  suggestEntryValues, templateFormWarning,
  type FormCatalogResponse, type FormDetailResponse, type TemplateFormResponse,
} from '@/app/_shared/utils/wa-forms';
import type { Prisma } from '@prisma/client';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Formulários do WhatsApp (Meta Flows, T-7ZQH6) — leitura do modal do composer.
//   GET ?contactId=<id>                 → catálogo da WABA do contato (sincroniza
//                                         com a Meta no máx. 1x/min por instância)
//   GET ?versionId=<id>[&contactId=<id>] → JSON, prévia da Meta, dados da tela de
//                                         entrada (com sugestão pelo contato/card)
//                                         e as versões da família
//   GET ?templateId=<id>[&contactId=<id>] → formulário que o botão FLOW do
//                                         template abre (aba de Template e
//                                         gerenciador), com aviso de versão
// Leitura por GET (fora da fila serial de server actions), como o resto do
// inbox. Escrita em app/_actions/whatsapp/forms.ts. `canEdit` só esconde o
// editor: o guard de edição é o requirePermission('manage_wa_forms') das actions.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await teamRoute('view_whatsapp');
  if ('res' in auth) return auth.res;
  const canEdit = !!auth.ctx.permissions.manage_wa_forms;

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contactId');
  const versionId = searchParams.get('versionId');
  const templateId = searchParams.get('templateId');

  try {
    const contact = contactId
      ? await db.whatsAppContact.findUnique({ where: { id: contactId }, select: { id: true, name: true, phone: true, numberId: true, userId: true } })
      : null;
    if (contactId && !contact) return noStoreJson({ error: 'Contato não encontrado.' }, { status: 404 });

    if (templateId) {
      const t = await db.whatsAppTemplate.findUnique({ where: { id: templateId } });
      if (!t) return noStoreJson({ error: 'Template não encontrado.' }, { status: 404 });
      if (contact) {
        // Mesma regra do envio (sendTemplateMessageOrThrow): template de outra WABA a Meta recusa.
        const def = (await db.whatsAppNumber.findFirst({
          where: { active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true },
        }))?.id ?? null;
        if ((t.numberId ?? def) !== (contact.numberId ?? def)) {
          return noStoreJson({ error: 'Este template pertence a outro número — use um template do número que atende este contato.' }, { status: 400 });
        }
      }
      const empty: TemplateFormResponse = {
        button: null, version: null, activeVersion: null, flowJson: null, jsonError: null, previewUrl: null,
        openScreen: null, entryData: [], suggested: {}, warning: null, canEdit,
      };
      let buttons = readTemplateButtons(t.buttons);
      let button = flowButtonOf(buttons);
      if (!buttons) {
        // Coluna ainda não sincronizada: lê da Meta e grava (best effort).
        const components = await fetchTemplateComponents(t.name, t.language, t.numberId);
        button = findTemplateFlowButton(components);
        if (components) {
          buttons = normalizeTemplateButtons(components);
          await db.whatsAppTemplate.update({ where: { id: t.id }, data: { buttons: buttons as unknown as Prisma.InputJsonValue } }).catch(() => {});
        }
      }
      if (!button) return noStoreJson(empty);

      const c = await getCreds(t.numberId);
      let v = await db.whatsAppFormVersion.findUnique({ where: { metaFlowId: button.flowId } });
      if (!v && c) {
        // Sem `force`: a tela abre isso a cada seleção; o limite de 1x/min por
        // WABA evita martelar a Meta quando o formulário não existe lá.
        await syncFormCatalog(c);
        v = await db.whatsAppFormVersion.findUnique({ where: { metaFlowId: button.flowId } });
      }
      const btn = { index: button.index, flowId: button.flowId, screen: button.screen, text: button.text };
      if (!v) {
        return noStoreJson({ ...empty, button: btn, warning: templateFormWarning({ version: null, activeVersion: null, jsonError: null }) });
      }
      const [jsonR, previewUrl, versions] = await Promise.all([
        c ? ensureFlowJson(v, c) : Promise.resolve({ ok: false as const, error: 'Nenhuma linha ativa desta conta.' }),
        c ? fetchMetaFlowPreview(c, v.metaFlowId) : Promise.resolve(null),
        loadFamilyVersions(v.familyId),
      ]);
      const json = jsonR.ok ? jsonR.data : null;
      const jsonError = jsonR.ok ? null : jsonR.error;
      const entryData = json ? entryScreenData(json, button.screen) : [];
      let suggested: Record<string, string> = {};
      if (contact && entryData.length) {
        const card = contact.userId
          ? await db.user.findUnique({ where: { id: contact.userId }, select: { name: true, cpf: true } })
          : null;
        suggested = suggestEntryValues(entryData, { name: card?.name ?? contact.name, cpf: card?.cpf ?? null, phone: contact.phone });
      }
      const version = toFormVersionDTO(v, new Map());
      const activeVersion = versions.find((x) => x.active) ?? null;
      const body: TemplateFormResponse = {
        button: btn,
        version,
        activeVersion,
        flowJson: json,
        jsonError,
        previewUrl,
        openScreen: json ? (button.screen && json.screens.some((s) => s.id === button!.screen) ? button.screen : entryScreen(json).id) : button.screen,
        entryData,
        suggested,
        warning: templateFormWarning({ version, activeVersion, jsonError }),
        canEdit,
      };
      return noStoreJson(body);
    }

    if (versionId) {
      const v = await db.whatsAppFormVersion.findUnique({ where: { id: versionId } });
      if (!v) return noStoreJson({ error: 'Formulário não encontrado.' }, { status: 404 });
      const c = await credsForWaba(v.wabaId);
      const [jsonR, previewUrl, versions] = await Promise.all([
        c ? ensureFlowJson(v, c) : Promise.resolve({ ok: false as const, error: 'Nenhuma linha ativa desta conta.' }),
        c ? fetchMetaFlowPreview(c, v.metaFlowId) : Promise.resolve(null),
        loadFamilyVersions(v.familyId),
      ]);
      const json = jsonR.ok ? jsonR.data : null;
      const entryData = json ? entryScreenData(json) : [];
      let suggested: Record<string, string> = {};
      if (contact && entryData.length) {
        const card = contact.userId
          ? await db.user.findUnique({ where: { id: contact.userId }, select: { name: true, cpf: true } })
          : null;
        suggested = suggestEntryValues(entryData, { name: card?.name ?? contact.name, cpf: card?.cpf ?? null, phone: contact.phone });
      }
      const body: FormDetailResponse = {
        version: toFormVersionDTO(v, new Map()),
        flowJson: json,
        jsonError: jsonR.ok ? null : jsonR.error,
        previewUrl,
        entryScreen: json ? entryScreen(json).id : null,
        entryData,
        suggested,
        versions,
        canEdit,
      };
      return noStoreJson(body);
    }

    if (!contact) return noStoreJson({ error: 'contactId, versionId ou templateId obrigatório' }, { status: 400 });
    const c = await getCreds(contact.numberId);
    if (!c?.wabaId) {
      const empty: FormCatalogResponse = { wabaId: null, families: [], syncError: 'A linha deste contato está desativada ou sem a conta (WABA) cadastrada.', canEdit };
      return noStoreJson(empty);
    }
    const force = searchParams.get('refresh') === '1';
    const { error } = await syncFormCatalog(c, { force });
    const body: FormCatalogResponse = { wabaId: c.wabaId, families: await loadFormCatalog(c.wabaId), syncError: error, canEdit };
    return noStoreJson(body);
  } catch (err) {
    console.error('[WA forms] falha ao carregar formulários:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}
