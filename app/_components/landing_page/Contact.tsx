'use client'
import { useState } from 'react';
import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { FaGoogle, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { LuLinkedin } from 'react-icons/lu';
import { SlSocialFacebook } from 'react-icons/sl';
import { cn } from '@/app/_shared/lib/utils';
import {
  ENDERECOS,
  HORARIO_ATENDIMENTO,
  PHONE_DISPLAY,
  PHONE_TEL,
  WHATSAPP_ANALISE_URL,
  mapaEmbedUrl,
  mapaLinkUrl,
} from './site-info';

const redes = [
  {
    href: 'https://www.facebook.com/brasilbeneficiosbr',
    label: 'Facebook',
    detail: 'Brasil Benefícios e Indenizações',
    icon: SlSocialFacebook,
  },
  {
    href: 'https://www.instagram.com/brasilbeneficiosbr',
    label: 'Instagram',
    detail: '@brasilbeneficiosbr',
    icon: FaInstagram,
  },
  {
    href: 'https://www.linkedin.com/company/paran%C3%A1-seguros-e-previd%C3%AAncia/',
    label: 'LinkedIn',
    detail: 'Brasil Benefícios e Indenizações',
    icon: LuLinkedin,
  },
  {
    href: 'https://www.google.com/maps?cid=3581813631112920100',
    label: 'Avaliações Google',
    detail: '5,0 ★★★★★',
    icon: FaGoogle,
  },
];

// O formulário "Envie uma Mensagem" saiu: gravava na tabela Contact, que
// ninguém acompanhava na dash. O contato agora é direto pelo WhatsApp.
export function Contact() {
  const [selecionadoId, setSelecionadoId] = useState(ENDERECOS[0].id);
  const selecionado = ENDERECOS.find((e) => e.id === selecionadoId) ?? ENDERECOS[0];

  return (
    <section id="contato" className="py-20 bg-gray-50 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-4xl text-gray-900 mb-4">
            Entre em Contato
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Fale com a nossa equipe pelo WhatsApp ou visite um dos nossos escritórios
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* WHATSAPP */}
          <a
            href={WHATSAPP_ANALISE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col justify-between gap-6 rounded-2xl bg-green-500 p-8 text-white shadow-md transition-colors hover:bg-green-600"
          >
            <div>
              <FaWhatsapp className="w-10 h-10 mb-4" />
              <h3 className="text-2xl font-semibold mb-2">Análise gratuita</h3>
              <p className="text-green-50">
                Conte o que aconteceu e descubra, sem custo, se você tem direito à indenização.
              </p>
            </div>
            <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-green-700">
              Conversar no WhatsApp
            </span>
          </a>

          {/* TELEFONE + HORÁRIO */}
          <div className="flex flex-col gap-6">
            <a href={PHONE_TEL} className="block">
              <div className="bg-white p-6 rounded-2xl shadow-md flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Phone className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg text-gray-900 mb-1">Telefone e WhatsApp</h4>
                  <p className="text-gray-600 font-bold">{PHONE_DISPLAY}</p>
                </div>
              </div>
            </a>
            <div className="flex-1 bg-blue-900 text-white p-6 rounded-2xl flex items-start gap-4">
              <div className="bg-white/10 p-3 rounded-lg">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg mb-1">Horário de Atendimento</h4>
                <p className="text-blue-100">{HORARIO_ATENDIMENTO}</p>
              </div>
            </div>
          </div>

          {/* REDES SOCIAIS */}
          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h4 className="text-lg text-gray-900 mb-4">Redes sociais</h4>
            <ul className="space-y-1">
              {redes.map(({ href, label, detail, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl p-2 hover:bg-gray-50 transition"
                  >
                    <span className="bg-blue-100 p-2.5 rounded-lg">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-gray-900">{label}</span>
                      <span className="block text-sm text-gray-600 font-semibold truncate">{detail}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ENDEREÇOS + MAPA */}
        <div className="mt-10 bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <MapPin className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-2xl text-gray-900">Nossos endereços</h3>
              </div>
              <p className="text-sm text-gray-500 mb-5">Toque em um endereço para ver no mapa.</p>

              <ul className="space-y-2">
                {ENDERECOS.map((e) => {
                  const ativo = e.id === selecionado.id;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelecionadoId(e.id)}
                        aria-pressed={ativo}
                        className={cn(
                          'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                          ativo
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50',
                        )}
                      >
                        <span className={cn('block text-xs font-semibold uppercase tracking-wide', ativo ? 'text-blue-700' : 'text-gray-500')}>
                          {e.cidade} - {e.uf}
                        </span>
                        <span className="block font-semibold text-gray-900">{e.rua}</span>
                        <span className="block text-sm text-gray-600">
                          {e.bairro} · CEP {e.cep}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="relative min-h-[360px] lg:min-h-full bg-gray-100">
              <iframe
                key={selecionado.id}
                title={`Mapa: ${selecionado.rua}, ${selecionado.cidade} - ${selecionado.uf}`}
                src={mapaEmbedUrl(selecionado)}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
              <a
                href={mapaLinkUrl(selecionado)}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-md hover:bg-blue-50"
              >
                <Navigation className="w-4 h-4" />
                Como chegar
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
