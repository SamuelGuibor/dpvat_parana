import { Star, Quote } from 'lucide-react';

interface Testimonial {
  id: number;
  name: string;
  rating: number;
  date: string;
  text: string;
  platform: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "Jose Junior",
    rating: 5,
    date: "20/11/2025",
    text: "Ótimo atendimento, excelência no trabalho.",
    platform: "Google"
  },
  {
    id: 2,
    name: "Wilson Trovao",
    rating: 5,
    date: "01/06/2025",
    text: "Serviço sério com respeito. 5 estrelas bem merecido, graças a Deus e ao trabalho da equipe. Obrigado.",
    platform: "Google"
  },
  {
    id: 3,
    name: "Gelson Lima",
    rating: 5,
    date: "01/12/2024",
    text: "Foi muito bom contar com o apoio desta equipe pois me ajudou muito e facilitou para receber o seguro. O processo é demorado e precisa de tempo para fazer. Eu recomendo para quem precise deste tipo de trabalho.",
    platform: "Google"
  },
  {
    id: 4,
    name: "Alfeu Alves",
    rating: 5,
    date: "01/05/2025",
    text: "Empresa séria, com profissionais bem qualificados, me ajudaram muito. Obrigado.",
    platform: "Google"
  },
  {
    id: 5,
    name: "Patricia Cavalin",
    rating: 5,
    date: "25/11/2025",
    text: "São profissionais ágeis, sérios, realmente vale a pena. Resolvem mesmo sem que a gente precise se incomodar ou se preocupar! Parabéns a esse escritório e essa equipe top.",
    platform: "Google"
  },
  {
    id: 6,
    name: "Isadora Bittencourt",
    rating: 5,
    date: "01/07/2025",
    text: "Empresa abençoada. Graças a eles resgatei depois de 3 anos, após um acidente, meu seguro DPVAT. Nem tinha mais esperanças. Empresa confiável e atendentes muito atenciosos. Nota 10.",
    platform: "Google"
  }
];

export function Testimonials() {
  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, index) => (
          <Star
            key={index}
            className={`w-5 h-5 ${
              index < rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="py-20 bg-gradient-to-b from-blue-100 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-blue-600 mb-4 text-xl font-bold">Depoimentos</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Veja o que nossos clientes dizem sobre nossos serviços. Avaliações reais de pessoas que confiaram em nosso trabalho.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300 relative"
            >
              {/* Quote Icon */}
              <div className="absolute -top-4 -left-4 bg-blue-600 rounded-full p-3">
                <Quote className="w-6 h-6 text-white" />
              </div>

              {/* Header with Platform */}
              <div className="flex items-center justify-between mb-4 pt-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-gray-900">{testimonial.name}</h4>
                    <p className="text-gray-500 text-sm">{testimonial.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Google</span>
                </div>
              </div>

              {/* Rating */}
              <div className="mb-4">
                {renderStars(testimonial.rating)}
              </div>

              {/* Testimonial Text */}
              <p className="text-gray-700 leading-relaxed">
                {testimonial.text}
              </p>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <p className="text-gray-600 mb-4">
            Junte-se aos nossos clientes satisfeitos
          </p>
          <a
            href="#contato"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors duration-300"
          >
            Entre em Contato
          </a>
        </div>
      </div>
    </section>
  );
}