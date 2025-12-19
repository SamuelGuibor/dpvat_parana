'use client'
import { Mail, Linkedin, Award, GraduationCap, Briefcase } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Footer } from '../_components/landing_page/Footer';
import { Header } from '../_components/landing_page/Header';
import '../_components/landing_page/styles/flip.css';

const teamMembers = [
  {
    id: 1,
    name: 'Thomaz Martinez',
    role: 'Sócio Fundador',
    specialty: 'Especialista em Direito Civil e Indenizações',
    image: '/dr.jpeg',
    email: 'thomaz.martinez@segurosparana.com.br',
    experience: '19 anos de experiência',
    education: 'Bacharelado em Direito - UNIC',
    bio: 'Especialista reconhecido em processos de indenização, com foco em acidentes de trânsito e Indenizações Previdenciário.',
  },
  {
    id: 2,
    name: 'Nikolas Kosien',
    role: 'Sócio',
    specialty: 'Especialista em Direito Previdenciário',
    image: '/nic.jpeg',
    email: 'nikolas.kosien@segurosparana.com.br',
    experience: '10 anos de experiência',
    education: 'Bacharelado em Direito - UP',
    bio: 'Especializada em Auxílio-Acidente e benefícios do INSS.',
  },
  {
    id: 3,
    name: 'Karina dias Camargo',
    role: 'Sócia',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/kari.png',
    email: 'karin@segurosparana.com.br',
    experience: '19 anos de experiência',
    education: 'Bacharelado em Direito - UP',
    bio: 'Especialista em Gestão de Projetos',
  },
  {
    id: 4,
    name: 'André Henrique Gonçalves Martinez',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/andre.jpeg',
    email: 'andre.henrique@segurosparana.com.br',
    experience: '15 anos de experiência',
    education: 'Licenciatura e Mestrado - UFPR',
    bio: 'Gestão de Projetos',
  },
  {
    id: 5,
    name: 'Lincoln Gustavo Marcondes Silva',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/lin.jpeg',
    email: 'lincoln.gustavo@segurosparana.com.br',
    experience: '1 anos de experiência',
    education: 'Estudante de Direito',
    bio: 'Atendimento humanizado e dedicado aos clientes.',
  },
  {
    id: 6,
    name: 'Vittor Augusto Ferraz',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/vittor.png',
    email: 'vittor.ferraz@segurosparana.com.br',
    experience: '1 anos de experiência',
    education: 'Medicina - PUC',
    bio: 'Atendimento humanizado e dedicado aos clientes.',
  },
  {
    id: 7,
    name: 'Kauan De Lima Fernandes',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/kau.jpeg',
    email: 'kauan.lima@segurosparana.com.br',
    experience: '1 anos de experiência',
    education: 'Bacharelado em Direito - GRAN',
    bio: 'Atendimento humanizado e dedicado aos clientes.',
  },
  {
    id: 8,
    name: 'Eduardo Camargo Martinez',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/edu.jpeg',
    email: 'eduardo.martinez@segurosparana.com.br',
    experience: '5 anos de experiência',
    education: 'Bacharelado em Direito - UP',
    bio: 'Gestão de Projetos',
  },
  {
    id: 9,
    name: 'Matheus Kovalski De Lima Correa',
    role: 'Auxiliar Administrativo',
    specialty: 'Especialista na Aréa Administrativa',
    image: '/ko.jpeg',
    email: 'matheus.kovalski@segurosparana.com.br',
    experience: '1 anos de experiência',
    education: 'Bacharel em Relações Internacionais',
    bio: 'Especialista em Gestão de Projetos',
  },
];

interface TeamMemberCardProps {
  member: typeof teamMembers[0];
}

function TeamMemberCard({ member }: TeamMemberCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative h-[640px] cursor-pointer perspective group"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front of Card */}
        <div className="absolute w-full h-full backface-hidden">
          <div className="bg-white rounded-lg overflow-hidden shadow-lg h-full flex flex-col">
            <div className="relative h-[450px] overflow-hidden">
              <Image
                width={500}
                height={500} 
                src={member.image}
                alt={member.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <h3 className="text-2xl mb-1">{member.name}</h3>
                <p className="text-blue-200">{member.role}</p>
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <p className="text-gray-600 mb-4">{member.specialty}</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  {member.experience}
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-gray-200">
                <p className="text-sm text-blue-600 text-center">Passe o mouse para mais informações</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back of Card */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180">
          <div className="bg-gradient-to-br from-gray-900 to-gray-900 rounded-lg shadow-lg h-full p-6 text-white flex flex-col">
            <h3 className="text-2xl mb-2">{member.name}</h3>
            <p className="text-blue-200 mb-4">{member.role}</p>
            
            <div className="space-y-3 mb-4 flex-1">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <GraduationCap className="w-4 h-4" />
                  <span className="text-sm">Formação</span>
                </div>
                <p className="text-sm text-blue-100 ml-6">{member.education}</p>
              </div>
              
              <div>
                <p className="text-sm text-blue-100 leading-relaxed">{member.bio}</p>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-blue-500">
              <a 
                href={`mailto:${member.email}`}
                className="flex items-center gap-2 text-sm hover:text-blue-200 transition-colors"
              >
                <Mail className="w-4 h-4" />
                {member.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  return (
    <>
    <Header />
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-blue-900 to-blue-900 text-white py-14 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl lg:text-5xl mb-4">Nossa Equipe</h1>
          <p className="text-xl text-blue-100 max-w-3xl mx-auto mb-8">
            Profissionais dedicados e experientes, prontos para defender seus direitos
          </p>
        </div>
      </div>

      {/* Team Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {teamMembers.map((member) => (
            <TeamMemberCard key={member.id} member={member} />
          ))}
        </div>
      </div>

      {/* Values Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl text-center text-gray-900 mb-12">Nossos Valores</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl text-gray-900 mb-3">Excelência</h3>
              <p className="text-gray-600">
                Comprometimento com a qualidade e resultados superiores em cada caso
              </p>
            </div>
            <div className="text-center p-6">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl text-gray-900 mb-3">Profissionalismo</h3>
              <p className="text-gray-600">
                Atuação ética e transparente, sempre dentro dos mais altos padrões
              </p>
            </div>
            <div className="text-center p-6">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl text-gray-900 mb-3">Atualização</h3>
              <p className="text-gray-600">
                Estudo constante das mudanças legislativas e jurisprudenciais
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <h2 className="text-3xl mb-4">Precisa de Assistência Jurídica?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Nossa equipe está pronta para analisar seu caso e oferecer a melhor solução
          </p>
          <a 
            href="/#contato"
            className="inline-block bg-white text-blue-900 px-8 py-4 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Agende uma Consulta Gratuita
          </a>
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
}
