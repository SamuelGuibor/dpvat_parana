import {
    BellIcon,
    CalendarIcon,
    FileTextIcon,
    InputIcon,
  } from "@radix-ui/react-icons";
  import { PiHouseBold } from "react-icons/pi";
  import { FaRegQuestionCircle } from "react-icons/fa";
  import { GoGear } from "react-icons/go";
  import { AiOutlineCar } from "react-icons/ai";

  import { BentoCard, BentoGrid } from "./bento-grid";
  
  const features = [
    {
      Icon: FileTextIcon,
      name: "Verifique os arquivos",
      description: "Verifique os seus arquivos do processo.",
      href: "/documents",
      cta: "Veja mais",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
    },
    {
      Icon: AiOutlineCar,
      name: "Status",
      description: "Verifique os status do seu processo",
      href: "/status",
      cta: "Veja mais",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
    },
    {
      Icon: PiHouseBold,
      name: "Inicio",
      description: "Volte para a página inicial.",
      href: "/",
      cta: "Veja mais",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
    },
    {
      Icon: FaRegQuestionCircle,
      name: "FAQ do Chat",
      description: "Verifique o que o nosso chat faz.",
      href: "/",
      cta: "Veja mais",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2",
    },
    {
      Icon: GoGear,
      name: "Configurações",
      description:
        "Verifique as suas configurações de usuario",
      href: "/config",
      cta: "Veja mais",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4",
    },
  ];
  
  function BentoDemo() {
    return (
      <div className="container pt-10">
      <BentoGrid className="lg:grid-rows-3">
        {features.map((feature) => (
          <BentoCard key={feature.name} {...feature} />
        ))}
      </BentoGrid>
      </div>
    );
  }
  
  export { BentoDemo };