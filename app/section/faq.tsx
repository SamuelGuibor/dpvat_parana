/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../_components/ui/avatar";
import { Button } from "../_components/ui/button";
import { Input } from "../_components/ui/input";
import { Label } from "../_components/ui/label";
import { Textarea } from "../_components/ui/textarea";

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
      <div className="container mx-auto flex flex-col items-center space-y-16">
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
      </div>
    </section>
  );
};

export { Faq };