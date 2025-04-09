/* eslint-disable @next/next/no-img-element */
"use client";

import { motion } from "framer-motion";

const members = [
  {
    name: "Thomaz Martinez",
    role: "Leadership",
    avatar: "/thomaz.jpg",
  },
  {
    name: "Eduardo Martinez",
    role: "Engineering",
    avatar: "/thomaz.jpg",
  },
  {
    name: "Nikolas",
    role: "Marketing",
    avatar: "/thomaz.jpg",
  },
];

export default function TeamSection() {
  return (
    <section className="relative py-20 bg-gray-50 overflow-hidden rounded-t-[4rem]">
      {/* Blurs no fundo */}
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-300 opacity-30 rounded-full blur-3xl z-0" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-emerald-300 opacity-20 rounded-full blur-2xl z-0" />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-300 opacity-10 rounded-full blur-[200px] z-0" />

      {/* Conteúdo */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-4xl font-extrabold text-gray-900 sm:text-5xl mb-6">
          Nossa <span className="text-indigo-600">Equipe</span>
        </h2>

        <p className="text-center text-gray-600 max-w-2xl mx-auto mb-12">
          Conheça os profissionais por trás das nossas soluções inovadoras. Cada
          membro contribui com talento, experiência e dedicação.
        </p>

        <div className="flex flex-wrap justify-center gap-10">
          {members.map((person, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="relative group"
            >
              <div className="relative z-10 bg-white rounded-2xl shadow-md flex flex-col items-center justify-center gap-3 p-8 w-60 min-h-[280px] transition-transform duration-300 group-hover:-translate-y-2">
                <div className="relative w-24 h-24 mb-4 rounded-full border-4 border-indigo-500 shadow-lg overflow-hidden">
                  <img
                    src={person.avatar}
                    alt={person.name}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 text-center">
                  {person.name}
                </h4>
                <p className="text-sm text-gray-600 text-center mt-1">
                  {person.role}
                </p>
              </div>

              {/* Contorno colorido ao passar o mouse */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-300 blur-md z-0 pointer-events-none bg-gradient-to-br from-blue-200 to-emerald-300" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
