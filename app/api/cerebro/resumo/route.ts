import { getCerebroResumo } from "@/app/_shared/lib/cerebro";
import { noStoreJson, teamRoute } from "@/app/_shared/lib/route-auth";

// Indicadores do quadro Cérebro APP: notas publicadas (S3), desatualizadas
// (hash da automação viva × nota), lacunas (cards ativos sem procedimento),
// tickets abertos e lotes de publicação. Só leitura.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await teamRoute();
  if ("res" in auth) return auth.res;
  const { permissions } = auth.ctx;
  if (!permissions.view_tickets && !permissions.op_use) {
    return noStoreJson({ error: "Sem acesso ao quadro." }, { status: 403 });
  }
  try {
    return noStoreJson(await getCerebroResumo());
  } catch (err) {
    console.error("[cerebro] falha ao montar o resumo:", err);
    return noStoreJson({ error: "Falha ao ler o vault (S3) ou as automações." }, { status: 500 });
  }
}
