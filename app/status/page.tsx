"use client"
// import { Button } from "../_components/ui/button";
import { useRouter } from "next/navigation";
import { Button } from "../_components/ui/button";
import Sidebar from "../area-do-cliente/section/sidebar";
import ProgressIndicator from "./status-progress";
import { FaChevronLeft } from "react-icons/fa";

const StatusPage = () => {
  const router = useRouter();

  const handleBack = () => {
    router.back(); // Navigates to the previous page
  };
  return (
    <div className="flex flex-row h-screen">
      <Sidebar />
      <div className="m-8 mt-20 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8 relative">
        {/* <div className="lg:absolute lg:left-1/2 transform lg:-translate-x-1/2 flex flex-col md:flex-row gap-2">
          <Button className="bg-blue-950 hover:bg-blue-900">Visualizar INSS</Button>
          <Button className="bg-blue-950 hover:bg-blue-900">Visualizar Seguro de Vida</Button>
          <Button className="bg-blue-950 hover:bg-blue-900">Visualizar RCF</Button>
          1 a 5 
        </div> */}
        <Button
          onClick={handleBack}
          className="flex items-center gap-2 bg-gray-100 text-black hover:bg-gray-200 rounded-md px-4 py-2"
        >
          <FaChevronLeft className="w-4 h-4" />
          Voltar para a Pagina anterior
        </Button>        
        <h2 className="text-2xl font-semibold pt-4 lg:pt-0">Status</h2>
        <p className="text-sm font-semibold text-slate-500">
          Verifique o status do seu processo.
        </p>

        <div className="mx-auto pt-10">
          <ProgressIndicator />
        </div>
      </div>
    </div>
  );
};

export default StatusPage;