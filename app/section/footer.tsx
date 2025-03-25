import Image from "next/image";

const Footer = () => {
  return (
    <footer className="overflow-x-clip bg-black py-10 text-center text-sm text-[#BCBCBC]">
      <div className="container justify-center md:mx-auto md:pl-[10px]">
        <div className="relative inline-flex before:absolute before:bottom-0 before:top-2 before:w-full before:bg-[linear-gradient(to_right,#CCFFCC,#8BC462,#008000)] before:blur before:content-['']">
          <Image
            src="/logo.png"
            alt="logo"
            height={70}
            width={70}
            className="relative"
          />
        </div>
        <nav className="mt-6 flex flex-col gap-6 md:flex-row md:justify-center">
          <a href="#about">Iníciio</a>
          <a href="#features">Sobre</a>
          <a href="#price">Perguntas Frequentes</a>
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
