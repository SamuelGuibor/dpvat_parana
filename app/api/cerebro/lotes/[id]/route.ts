import { getLote } from "@/app/_shared/lib/cerebro";
import { noStoreJson, teamRoute } from "@/app/_shared/lib/route-auth";

// Lote de publicação do vault com a amostra para a conferência humana
// (fonte literal × nota do redator). Só quem tem manage_knowledge confere.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await teamRoute("manage_knowledge");
  if ("res" in auth) return auth.res;
  const lote = await getLote(params.id);
  if (!lote) return noStoreJson({ error: "Lote não encontrado." }, { status: 404 });
  return noStoreJson(lote);
}
