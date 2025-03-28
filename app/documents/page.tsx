import Sidebar from "../area-do-cliente/section/sidebar";
import { FeatureSection } from "./section/feature-section";

const Documents = () => {
  return (
    <div className="flex flex-row h-screen">
      <Sidebar />
      <div className="m-8 mt-32 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8 ">
        <h2 className="text-2xl font-semibold">Documentos</h2>
        <p className="text-sm font-semibold text-slate-500">Verifique os documentos do seu processo</p>
        <FeatureSection />
      </div>
    </div>
  );
};

export default Documents;
