import { ExternalLinkIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const Cards = () => {
  return (
    <div className="flex flex-wrap justify-center items-center gap-6 px-6 pt-10 mb-5">
      {/* Card 1 */}
      <Link href="/blog/solicitar-dpvat">
        <div className="rounded-3xl p-[2px] bg-gradient-to-b from-blue-200 to-emerald-300 w-full sm:w-[350px]">
          <div className="rounded-[calc(1.5rem-1px)] p-5 bg-white h-[250px]">
            <Image src="/paranaseguros.png" alt="logo" width={70} height={70} />
            <h2 className="pt-24 text-2xl font-semibold">
              Como Solicitar o DPVAT
            </h2>
            <div className="mt-2 flex gap-4 items-center">
              <p className="text-sm">
                Aprenda o passo a passo simples para pedir o seguro DPVAT no
                Paraná.
              </p>
              <ExternalLinkIcon />
            </div>
          </div>
        </div>
      </Link>

      {/* Card 2 */}
      <div className="rounded-3xl p-[2px] bg-gradient-to-b from-blue-200 to-emerald-300 w-full sm:w-[350px]">
        <div className="rounded-[calc(1.5rem-1px)] p-5 bg-white h-[250px]">
          <Image src="/paranaseguros.png" alt="logo" width={70} height={70} />
          <h2 className="pt-24 text-2xl font-semibold">Benefícios do DPVAT</h2>
          <div className="mt-2 flex gap-4 items-center">
            <p className="text-sm">
              Descubra como o DPVAT cobre despesas médicas e indenizações
              importantes.
            </p>
            <ExternalLinkIcon />
          </div>
        </div>
      </div>

      {/* Card 3 */}
      <div className="rounded-3xl p-[2px] bg-gradient-to-b from-blue-200 to-emerald-300 w-full sm:w-[350px]">
        <div className="rounded-[calc(1.5rem-1px)] p-5 bg-white h-[250px]">
          <Image src="/paranaseguros.png" alt="logo" width={70} height={70} />
          <h2 className="pt-24 text-2xl font-semibold">Coberturas do DPVAT</h2>
          <div className="mt-2 flex gap-4 items-center">
            <p className="text-sm">
              Conheça os tipos de indenizações que você pode solicitar pelo
              seguro.
            </p>
            <ExternalLinkIcon />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cards;
