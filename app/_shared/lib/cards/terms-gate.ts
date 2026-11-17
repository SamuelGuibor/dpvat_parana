import { db } from "../prisma";
import {
  SIGNATURE_REQUIRED_FROM_COLUMN, ZAPSIGN_TAG_NAME, normalizeColumnName, termsGate, type TermsGateResult,
} from "@/app/_shared/utils/terms";

// Trava aceite × ZapSign do kanban (T-B40K0) — o lado com banco da regra pura
// `termsGate` (app/_shared/utils/terms.ts). Chamada por moveCardToLabel, o
// ponto único de mudança de coluna (UI, automação e IA de operação).

/**
 * Decide se o card pode ir de `fromLabelId` para `to`. Só consulta tag e
 * aceite quando a regra pode travar (a maioria dos movimentos sai sem isso).
 */
export async function checkTermsGate(input: {
  cardId: string;
  isProcess: boolean;
  fromLabelId: string | null;
  to: { id: string; name: string };
}): Promise<TermsGateResult> {
  const labels = await db.label.findMany({ select: { id: true, name: true, order: true } });
  const from = labels.find((l) => l.id === input.fromLabelId) ?? null;
  const to = labels.find((l) => l.id === input.to.id);
  if (!to) return { ok: true };
  const gateCol = labels.find((l) => normalizeColumnName(l.name) === SIGNATURE_REQUIRED_FROM_COLUMN);
  const base = {
    from: { name: from?.name ?? null, order: from?.order ?? null },
    to: { name: to.name, order: to.order },
    signatureFromOrder: gateCol?.order ?? null,
  };

  // Com aceite E tag a regra nunca trava: se passar no pior caso, nem consulta.
  if (termsGate({ ...base, hasAcceptance: false, hasZapsignTag: false }).ok) return { ok: true };

  const [tag, acceptance] = await Promise.all([
    db.cardTag.findFirst({
      where: {
        name: ZAPSIGN_TAG_NAME,
        ...(input.isProcess ? { processes: { some: { id: input.cardId } } } : { users: { some: { id: input.cardId } } }),
      },
      select: { id: true },
    }),
    input.isProcess ? Promise.resolve(false) : hasCardAcceptance(input.cardId),
  ]);
  return termsGate({ ...base, hasAcceptance: !!acceptance, hasZapsignTag: !!tag });
}

/** Aceite do card: pelo próprio card, pelos contatos vinculados ou pelo telefone. */
async function hasCardAcceptance(userId: string): Promise<boolean> {
  const [contacts, user] = await Promise.all([
    db.whatsAppContact.findMany({ where: { userId }, select: { id: true } }),
    db.user.findUnique({ where: { id: userId }, select: { telefone: true } }),
  ]);
  const last8 = (user?.telefone ?? "").replace(/\D/g, "").slice(-8);
  const row = await db.termsAcceptance.findFirst({
    where: {
      OR: [
        { userId },
        ...(contacts.length ? [{ contactId: { in: contacts.map((c) => c.id) } }] : []),
        ...(last8.length === 8 ? [{ phone: { endsWith: last8 } }] : []),
      ],
    },
    select: { id: true },
  });
  return !!row;
}
