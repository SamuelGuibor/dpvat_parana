import { Cpu, Fingerprint, Zap } from 'lucide-react'
import Image from 'next/image'

export default function Recurses() {
    return (
        <section className="py-12 md:py-20">
            <div className="mx-auto max-w-6xl space-y-6 px-6 md:space-y-12">
                <div className="relative z-10 mx-auto max-w-xl space-y-6 text-center md:space-y-12">
                    <h2 className="text-balance text-4xl font-medium lg:text-5xl">Recursos</h2>
                    <p>Algumas das funcionalidades do nosso sistema disponíveis</p>
                </div>

                <div className="relative mx-auto grid max-w-6xl divide-x divide-y border *:p-12 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-3 bg-slate-100">
                        <div className="flex items-center gap-2">
                            <Zap className="size-4" />
                            <h3 className="text-sm font-bold">Digitalização de Documentos</h3>
                        </div>
                        <p className="text-sm">Armazenado com segurança todos os documentos do seu processo em nosso banco de dados.</p>
                    </div>
                    <div className="space-y-2 bg-slate-100">
                        <div className="flex items-center gap-2">
                            <Cpu className="size-4" />
                            <h3 className="text-sm font-bold">Acompanhamento Online</h3>
                        </div>
                        <p className="text-sm">Oferecemos às vítimas acesso online para acompanhar em tempo real cada etapa do processo, com uma linha do tempo clara e atualizada.</p>
                    </div>
                    <div className="space-y-2 bg-slate-100">
                        <div className="flex items-center gap-2">
                            <Fingerprint className="size-4" />
                            <h3 className="text-sm font-bold">Notificações via WhatsApp</h3>
                        </div>
                        <p className="text-sm">Receba atualizações instantâneas sobre o andamento do seu processo diretamente no WhatsApp, com praticidade e agilidade.</p>
                    </div>
   
                </div>
                <div>
                        <Image src="/statss.png" width={1200} height={1200} alt="a" />
                </div>
            </div>
        </section>
    )
}