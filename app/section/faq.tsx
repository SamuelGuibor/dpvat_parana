/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../_components/ui/avatar";
import { Button } from "../_components/ui/button";
import { Input } from "../_components/ui/input";
import { Label } from "../_components/ui/label";
import { Textarea } from "../_components/ui/textarea";
import { FiMessageCircle } from "react-icons/fi";
import { FaInstagram } from "react-icons/fa";
import { SlSocialFacebook } from "react-icons/sl";
import { LuLinkedin } from "react-icons/lu";
import { FaGoogle } from "react-icons/fa";
import { LuGlobe } from "react-icons/lu";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface Faq3Props {
  heading: string;
  description: string;
  items?: FaqItem[];
  supportHeading: string;
  supportDescription: string;
  supportButtonText: string;
  supportButtonUrl: string;
}

const Faq = ({
  supportHeading = "Need more support?",
  supportDescription = "Our dedicated support team is here to help you with any questions or concerns. Get in touch with us for personalized assistance.",
  supportButtonText = "Contact Support",
  supportButtonUrl = "https://wa.me/5541997862323",
}: Faq3Props) => {
  // State to manage form inputs
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    message: "",
  });

  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const whatsappMessage = `Olá! Meu nome é ${formData.name}\n` +
      `Telefone: ${formData.phone}\n` +
      `Mensagem: ${formData.message}`;

    const encodedMessage = encodeURIComponent(whatsappMessage);
    const whatsappUrl = `https://wa.me/5541997862323?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  };

  return (
    <section className="py-3">
      <div className="container mx-auto flex flex-col items-center space-y-10">
        {/* Seção de Suporte */}
        <div className="mx-auto flex flex-col items-center justify-center max-w-6xl w-[350px] lg:w-[825px] rounded-lg bg-accent p-4 text-center md:rounded-xl md:p-6 lg:p-8">
          <div className="relative mb-6 flex justify-center">
            <Avatar className="absolute mb-4 size-16 origin-bottom -translate-x-[60%] scale-[80%] border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-2.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
            <Avatar className="absolute mb-4 size-16 origin-bottom translate-x-[60%] scale-[80%] border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-3.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
            <Avatar className="mb-4 size-16 border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-1.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
          </div>
          <h3 className="mb-2 max-w-3xl font-semibold lg:text-lg">
            {supportHeading}
          </h3>
          <p className="mb-8 max-w-3xl text-muted-foreground lg:text-lg">
            {supportDescription}
          </p>
          <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                type="text"
                name="name"
                placeholder="Digite seu nome"
                className="w-full"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                type="tel"
                name="phone"
                placeholder="Digite seu telefone"
                className="w-full"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>
            <div className="w-full max-w-lg mx-auto">
              <Label>Deixe sua Mensagem</Label>
              <Textarea
                name="message"
                className="w-full"
                value={formData.message}
                onChange={handleChange}
                required
              />
            </div>
            <div className="flex w-full flex-col justify-center gap-2 sm:flex-row mt-6">
              <Button type="submit" className="w-full sm:w-auto">
                {supportButtonText}
              </Button>
            </div>
          </form>
        </div>
        <span>Ou</span>
        <div className="w-full max-w-6xl mx-auto">
          <section id="fale-conosco">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4">

            {/* WHATSAPP */}
            <a
              href="https://wa.me/41997862323"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><FiMessageCircle /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">WhatsApp Oficial</span>
                <span className="text-muted-foreground font-bold">(41) 99786-2323</span>
              </div>
            </a>

            {/* INSTAGRAM */}
            <a
              href="https://www.instagram.com/paranasegurospr"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><FaInstagram /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">Instagram</span>
                <span className="text-muted-foreground font-bold">@paranasegurospr</span>
              </div>
            </a>

            {/* FACEBOOK */}
            <a
              href="https://www.facebook.com/paranadpvat"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><SlSocialFacebook /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">Facebook</span>
                <span className="text-muted-foreground font-bold">Seguros Parana</span>
              </div>
            </a>

            {/* LINKEDIN */}
            <a
              href="https://www.linkedin.com/company/paran%C3%A1-seguros-e-previd%C3%AAncia/?trk=public_profile_topcard-current-company&originalSubdomain=br"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><LuLinkedin /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">LinkedIn</span>
                <span className="text-muted-foreground font-bold">Seguros Parana</span>
              </div>
            </a>

            {/* EMAIL */}
            <a
              href="https://www.google.com/search?rlz=1C1RXQR_pt-PTBR1157BR1157&sca_esv=a66b742956e23bc7&cs=1&sxsrf=AE3TifOKGXZKMk5fLsCzSO4XCETRPUaT-w:1764948466223&kgmid=/g/11bv30kx9_&q=PARAN%C3%81+SEGUROS+%7C+Resgate+DPVAT+%7C+INSS+%7C+RCF+%7C+Seguros&shndl=30&shem=damc,lcuae,uaasie,shrtsdl&source=sh/x/loc/uni/m1/1&kgs=fce4174fd12de9de&utm_source=damc,lcuae,uaasie,shrtsdl,sh/x/loc/uni/m1/1#lrd=0x94dce3b97d8af1ed:0x31b528852e233c24,1,,,,"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><FaGoogle /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">Avaliações Google</span>
                <span className="text-muted-foreground font-bold">5,0 ✮✮✮✮✮</span>
              </div>
            </a>

            {/* SITE */}
            <a
              href="https://segurosparana.com.br"
              target="_blank"
              className="flex items-center gap-4 bg-accent p-4 rounded-xl hover:bg-accent/80 transition"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-orange-500 text-2xl"><LuGlobe /></span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold">Site</span>
                <span className="text-muted-foreground font-bold">segurosparana.com.br</span>
              </div>
            </a>

          </div>
          </section>
        </div>

      </div>
    </section>
  );
};

export { Faq };