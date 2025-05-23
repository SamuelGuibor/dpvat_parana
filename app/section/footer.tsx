import Image from "next/image";

const Footer = () => {
  return (
    <footer className="overflow-x-clip bg-black py-10 text-center text-sm text-[#BCBCBC]">
      <div className="absolute left-[20px] lg:pt-5 pt-3">
        © 2025 [Samuel Henrique Guibor, Otto Engelhardt Cabral Santos] Developers
      </div>
      <div className="container justify-center md:mx-auto md:pl-[10px]">
        <div className="relative bottom-[50px] lg:bottom-0 inline-flex before:absolute before:bottom-0 before:top-2 before:w-full">
          <Image
            src="/logo_sem_fundo.png"
            alt="logo"
            height={90}
            width={130}
            className="relative"
          />
        </div>
        <p className="mt-4">
          Paraná seguros e previdência
          CNPJ:  59.600.345/0001-29
        </p>
        <p>
          Paraná Seguros
          CNPJ: 48.270.397/0001-69
        </p>
        <p>
          Susep 221140431
          @paranasegurospr
        </p>
      </div>
    </footer>
  );
};

export default Footer;
