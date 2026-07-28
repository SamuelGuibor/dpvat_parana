import { redirect } from "next/navigation";

// A listagem de documentos foi REMOVIDA da área do cliente (28/07/2026):
// os anexos do processo são material de trabalho interno da equipe. Quem
// tinha o link salvo cai na área do cliente.
export default function Documents() {
  redirect("/area-do-cliente");
}
