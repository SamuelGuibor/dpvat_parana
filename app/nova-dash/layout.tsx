import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getSessionPermissions } from "@/app/_shared/lib/permissions-server";
import { checkDashboardIpAccess } from "@/app/_shared/lib/ip-access";

// O CRM tem título próprio e fica fora dos buscadores — antes herdava o
// título/keywords de SEO do site institucional.
export const metadata: Metadata = {
  title: "CRM | Paraná Seguros",
  robots: "noindex, nofollow",
};

// O gate de IP roda a cada request (a lista pode mudar a qualquer momento).
export const dynamic = "force-dynamic";

export default async function NovaDashLayout({ children }: { children: React.ReactNode }) {
  // Trava de IP da dashboard: membro da equipe fora dos IPs do escritório e
  // sem bypass_ip_lock vê a tela de bloqueio. Site público e área do cliente
  // não passam por este layout. Quem não é da equipe segue para a página, que
  // já mostra o próprio "acesso restrito".
  const ctx = await getSessionPermissions();
  if (ctx) {
    const ipCheck = await checkDashboardIpAccess(ctx.permissions.bypass_ip_lock);
    if (!ipCheck.allowed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
          <div className="max-w-md w-full rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <ShieldAlert className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-lg font-black text-gray-900">Acesso restrito ao escritório</h1>
            <p className="mt-2 text-sm text-gray-500">
              A dashboard só pode ser acessada pela internet do escritório. Se você
              precisa trabalhar de fora, peça ao Super Admin a permissão
              {" "}<span className="font-semibold">&quot;Acesso fora do escritório&quot;</span>.
            </p>
            <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-xs font-mono text-gray-400">
              Seu IP: {ipCheck.ip}
            </p>
          </div>
        </div>
      );
    }
  }
  return children;
}
