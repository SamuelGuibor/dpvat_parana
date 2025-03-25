import Image from "next/image";

const Footer = () => {
  return (
    <footer className="overflow-x-clip bg-black py-10 text-center text-sm text-[#BCBCBC]">
        <div className="absolute left-[20px] lg:pt-5 pt-3">
          © 2025 [Samuel Henrique Guibor, Otto Engelhardt Cabral Santos] Developers
        </div>
      <div className="container justify-center md:mx-auto md:pl-[10px]">
        <div className="relative bottom-[30px] lg:bottom-0 inline-flex before:absolute before:bottom-0 before:top-2 before:w-full before:bg-[linear-gradient(to_right,#CCFFCC,#8BC462,#008000)] before:blur before:content-['']">
          <Image
            src="/logo_text_white.png"
            alt="logo"
            height={70}
            width={70}
            className="relative"
          />
        </div>
        <nav className="mt-6 flex gap-6 md:flex-row justify-center">
          <a href="#home">Início</a>
          <a href="#about">Sobre</a>
          <a href="#ask">Duvidas Frequentes</a>
        </nav>
        <p className="mt-6">
          Bluelife Seg Corretora e Consultoria. Paraná consultoria em seguros –
          Inscrição SUSEP 221140431 CNPJ: 48.270.397/0001-68
        </p>
      </div>
    </footer>
  );
};

export default Footer;
