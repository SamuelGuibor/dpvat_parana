"use client"
import Sidebar from "@/app/(cliente)/area-do-cliente/section/sidebar";
import BackButton from "@/app/_shared/components/back-button";
import { FeatureSection } from "./section/feature-section";
import Image from "next/image";
const Documents = () => {
  return (
    <div className="flex h-screen flex-row bg-slate-50">
      <Image src="/paranaseguros.png" alt="Logo" width={150} height={40} className="absolute left-4 top-4" />
      <Sidebar />
      <div className="m-4 mt-20 w-full overflow-auto rounded-2xl bg-white p-5 shadow-sm md:m-6 md:mt-6 md:p-8">
        <BackButton label="Voltar" />

        <div className="mt-3">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Documentos do seu processo
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Visualize os documentos anexados ao longo do seu processo.
          </p>
        </div>

        <FeatureSection />
      </div>
    </div>
  );
};

export default Documents;
