/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'
import { Phone, Send } from 'lucide-react';
import { FaInstagram } from "react-icons/fa";
import { SlSocialFacebook } from "react-icons/sl";
import { LuLinkedin } from "react-icons/lu";
import { FaGoogle } from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ContactUsers } from "@/app/_actions/createContact";
import { toast } from 'sonner'
import { Button } from '../ui/button';
import { FaWhatsapp } from "react-icons/fa";
import Image from 'next/image';
import Link from 'next/link';

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
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else if (state.message) {
      toast.error("Erro ao enviar Contato");
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
              href="tel:+5541997862323"
              className="block"
            >
              <div className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Phone className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Telefone</h4>
                  <p className="text-gray-600 font-bold">41 99786-2323</p>
                </div>
              </div>
            </a>

            {/* FACEBOOK */}
            <a
              href="https://www.facebook.com/paranadpvat"
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
                  <p className="text-gray-600 font-bold">Seguros Paraná</p>
                </div>
              </div>
            </a>

            {/* INSTAGRAM */}
            <a
              href="https://www.instagram.com/paranasegurospr"
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
                  <p className="text-gray-600 font-bold">@paranasegurospr</p>
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
                  <p className="text-gray-600 font-bold">Seguros Paraná</p>
                </div>
              </div>
            </a>

            {/* GOOGLE AVALIAÇÕES */}
            <a
              href="https://www.google.com/maps/place/PARAN%C3%81+SEGUROS+%7C+Resgate+DPVAT+%7C+INSS+%7C+RCF+%7C+Seguros/data=!4m2!3m1!1s0x0:0x31b528852e233c24?sa=X&ved=1t:2428&ictx=111"
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
                <p>Segunda a Sabádo: 9h às 18h</p>
                <p>Sábados: 9h às 18h</p>
              </div>
            </div>

            <div className="p-8 rounded-lg">
              <Link target="_blank" href='https://www.google.com/maps/place/PARAN%C3%81+SEGUROS+%7C+Resgate+DPVAT+%7C+INSS+%7C+RCF+%7C+Seguros/@-25.4499356,-49.3043702,17z/data=!4m6!3m5!1s0x94dce3b97d8af1ed:0x31b528852e233c24!8m2!3d-25.450018!4d-49.3028896!16s%2Fg%2F11bv30kx9_?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoKLDEwMDc5MjA2OUgBUAM%3D'>
                <Image src={'/maps.png'} width={500} height={200} alt='andress' />
              </Link>     
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}

