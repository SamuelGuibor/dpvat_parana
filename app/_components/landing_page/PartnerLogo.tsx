import Image from "next/image";
import { cn } from "@/app/_shared/lib/utils";

/**
 * Divisor dourado + logo do escritório parceiro Caique Castro, ao lado do
 * nosso logo (header do site e da nova-dash).
 *
 * Os SVGs foram vetorizados do logo original (dourado sobre marrom, 937px):
 * mesmo formato — símbolo em cima, nome embaixo —, sem "Sociedade de
 * Advocacia", fundo transparente, traço do símbolo um pouco reforçado e nome
 * maior para ser lido com ~50px. Em PNG o traço fino serrilhava (fonte pequena
 * com ruído + recompressão do next/image); vetor fica nítido em qualquer tela.
 * - caique-castro-logo.svg: dourado escurecido, para fundo branco;
 * - caique-castro-logo-clara.svg: dourado original, para o modo escuro
 *   (Dark Reader não mexe em imagem).
 */
export function PartnerLogo({
  dark = false,
  className,
  imageClassName = "h-12 sm:h-[60px]",
}: {
  dark?: boolean;
  className?: string;
  /** Altura do logo (a largura acompanha: viewBox 576x400). */
  imageClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-3 sm:gap-4 shrink-0", className)}>
      <span
        aria-hidden="true"
        className="relative h-9 sm:h-11 w-px shrink-0 bg-gradient-to-b from-transparent via-[#a8894f] to-transparent"
      >
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a8894f]" />
      </span>
      <Image
        src={dark ? "/caique-castro-logo-clara.svg" : "/caique-castro-logo.svg"}
        width={86}
        height={60}
        unoptimized
        className={cn("w-auto shrink-0", imageClassName)}
        alt="Caique Castro Sociedade de Advocacia, escritório parceiro"
        title="Em parceria com Caique Castro Sociedade de Advocacia"
      />
    </span>
  );
}
