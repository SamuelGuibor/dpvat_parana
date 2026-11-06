/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'
import { MapPin, Phone, Send } from 'lucide-react';
import { FaInstagram } from "react-icons/fa";
import { SlSocialFacebook } from "react-icons/sl";
import { LuLinkedin } from "react-icons/lu";
import { FaGoogle } from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ContactUsers } from "@/app/_actions/contacts/create-contact";
import { toast } from 'sonner'
import { Button } from '@/app/_shared/ui/button';
import { FaWhatsapp } from "react-icons/fa";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button
            type="submit"
            className="w-full h-12 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-md font-semibold mt-2"
            disabled={pending}
        >
            <FaWhatsapp /> {pending ? 'Enviando...' : 'Enviar Mensagem'}
        </Button>
    );
}

export function Contact() {
  const initialState = { success: false, message: 'Erro ao enviar Contato' };
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(ContactUsers, initialState);
  const [value, setValue] = useState("");


  const formatPhone = (raw: string) => {
    // Remove qualquer coisa que não seja número
    raw = raw.replace(/\D/g, "");

    // Limita a 11 dígitos
    raw = raw.slice(0, 11);

    // (99)
    if (raw.length <= 2) return `(${raw}`;

    // (99) 9
    if (raw.length <= 3) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;

    // (99) 9XXXX
    if (raw.length <= 7)
      return `(${raw.slice(0, 2)}) ${raw.slice(2, 3)}${raw.slice(3)}`;

    // (99) 9XXXX-XXXX
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 3)}${raw.slice(3, 7)}-${raw.slice(7)}`;
  };

  const handleChange = (e: any) => {
    const input = e.target.value;
    const formatted = formatPhone(input);
    setValue(formatted);
  };

  useEffect(() => {
    if (state.success) {
      toast.success('Enviado com sucesso', {className: 'bg-green-600 text-white border border-green-700 rounded-xl'});
      // Limpa o formulário no lugar do window.location.reload() — a página
      // inteira piscava e voltava ao topo só para resetar os campos.
      formRef.current?.reset();
      setValue("");
    }
  }, [state]);
  return (
    <section id="contato" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl text-gray-900 mb-4">
            Entre em Contato
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Agende uma consulta gratuita e descubra como podemos ajudá-lo
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div>
            <div className="bg-white p-8 rounded-lg shadow-md mb-8">
              <h3 className="text-2xl text-gray-900 mb-6">Envie uma Mensagem</h3>
              <form className="space-y-6" action={formAction} ref={formRef}>
                <input type="text" name="company" style={{ display: 'none' }} />
                <div>
                  <label htmlFor="name" className="block text-gray-700 mb-2">Nome Completo</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Seu nome"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="number" className="block text-gray-700 mb-2">Telefone</label>
                  <input
                    type="tel"
                    id="number"
                    name="number"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Telefone | WhatsApp"
                    value={value}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="desc" className="block text-gray-700 mb-2">Mensagem</label>
                  <textarea
                    id="desc"
                    name="desc"
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Descreva brevemente seu caso..."
                  ></textarea>
                </div>
                {/* <button
                  type="submit"
                  className="w-full bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  Enviar Mensagem
                  <Send className="w-5 h-5" />
                </button> */}
                <SubmitButton />
              </form>
            </div>
          </div>

          <div className="space-y-6">

            {/* TELEFONE */}
            <a
              href="tel:+5541920077331"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Phone className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Telefone</h4>
                  <p className="text-gray-600 font-bold">41 92007-7331</p>
                </div>
              </div>
            </a>

            {/* FACEBOOK */}
            <a
              href="https://www.facebook.com/brasilbeneficiosbr"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <SlSocialFacebook className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Facebook</h4>
                  <p className="text-gray-600 font-bold">Brasil Benefícios e Indenizações</p>
                </div>
              </div>
            </a>

            {/* INSTAGRAM */}
            <a
              href="https://www.instagram.com/brasilbeneficiosbr"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FaInstagram className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Instagram</h4>
                  <p className="text-gray-600 font-bold">@brasilbeneficiosbr</p>
                </div>
              </div>
            </a>

            {/* LINKEDIN */}
            <a
              href="https://www.linkedin.com/company/paran%C3%A1-seguros-e-previd%C3%AAncia/?trk=public_profile_topcard-current-company&originalSubdomain=br"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <LuLinkedin className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">LinkedIn</h4>
                  <p className="text-gray-600 font-bold">Brasil Benefícios e Indenizações</p>
                </div>
              </div>
            </a>

            {/* GOOGLE AVALIAÇÕES */}
            <a
              href="https://www.google.com/maps?cid=3581813631112920100"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FaGoogle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Avaliações Google</h4>
                  <p className="text-gray-600 font-bold">5,0 ✮✮✮✮✮</p>
                </div>
              </div>
            </a>

            {/* HORÁRIO (sem link) */}
            <div className="bg-blue-900 text-white p-8 rounded-lg">
              <h4 className="text-2xl mb-4">Horário de Atendimento</h4>
              <div className="space-y-2">
                <p>Segunda a Sábado: 9h às 18h</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <MapPin className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-3">
                <h4 className="text-lg text-gray-900">Endereços em Curitiba</h4>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Travessa%20Jorge%20Cuquel%2C%206%2C%20Curitiba%20-%20PR"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-gray-600 font-bold hover:text-blue-700"
                >
                  Travessa Jorge Cuquel, 6 · Seminário
                </a>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Rua%20Visconde%20do%20Rio%20Branco%2C%201488%2C%20Curitiba%20-%20PR"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-gray-600 font-bold hover:text-blue-700"
                >
                  Rua Visconde do Rio Branco, 1488, conj. 909 · Centro
                </a>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}

