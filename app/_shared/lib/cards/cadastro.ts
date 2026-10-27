// Editar campos do cadastro do card (IA de operação, decisão 15 do dono).
// Mesmo efeito do updateUser do site para estes campos: grava só o que
// mudou, nome novo propaga para o WhatsAppContact vinculado e o histórico
// ganha o log `update` com de/para (diffFields + CARD_FIELD_LABELS). Não
// mexe em status/coluna/senha: a lista fechada está em
// app/_shared/utils/cadastro-ia.ts e quem chama já normalizou os valores.

import { db } from "../prisma";
import { createLog, diffFields, CARD_FIELD_LABELS, buildUpdateMessage } from "../log";
import { CADASTRO_CAMPO_IDS, type CadastroCampo } from "@/app/_shared/utils/cadastro-ia";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export interface UpdateCardFieldsInput extends WriteCommon {
  campos: Partial<Record<CadastroCampo, string>>;
}

const SELECT = Object.fromEntries(CADASTRO_CAMPO_IDS.map((c) => [c, true])) as Record<CadastroCampo, true>;

export async function updateCardFields(input: UpdateCardFieldsInput): Promise<{ noop: boolean; alterados: string[] }> {
  const { cardId, isProcess, author, source, op } = input;
  if (isProcess) throw new CardWriteError("card_nao_encontrado", "Cadastro de Process não é editável por aqui.");
  const data = Object.fromEntries(Object.entries(input.campos).filter(([k, v]) => CADASTRO_CAMPO_IDS.includes(k as CadastroCampo) && v !== undefined));
  const current = await db.user.findUnique({ where: { id: cardId }, select: { ...SELECT, service: true } });
  if (!current) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");

  const changed = diffFields(data, current, CARD_FIELD_LABELS);
  if (!changed.length) return { noop: true, alterados: [] };
  const patch = Object.fromEntries(changed.map((c) => [c.field, data[c.field]]));
  await db.user.update({ where: { id: cardId }, data: patch });

  // Nome novo acompanha no contato do WhatsApp (o inbox e o bot chamam o
  // cliente por ele). Best-effort, como no updateUser.
  if (typeof patch.name === "string") {
    await db.whatsAppContact.updateMany({ where: { userId: cardId }, data: { name: patch.name } }).catch((err) => {
      console.error("[CARD] Falha ao propagar o nome para o contato do WhatsApp:", cardId, err);
    });
  }

  await createLog({
    action: "update",
    message: buildUpdateMessage(changed),
    authorId: author.id,
    authorName: author.name,
    ...cardRef(false, cardId),
    metadata: {
      fields: changed.map((c) => c.label),
      changes: changed,
      service: current.service ?? null,
      cardName: (patch.name as string | undefined) ?? current.name ?? null,
      ...sourceMeta(source, op),
    },
  });
  return { noop: false, alterados: changed.map((c) => c.field) };
}
