// import { Button } from "../_components/ui/button";
import Sidebar from "../../area-do-cliente/section/sidebar";
import ProgressIndicator from "./status-progress";

const StatusPage = () => {
  return (
    <div className="flex flex-row h-screen">
      <Sidebar />
      <div className="m-8 mt-20 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8 relative">
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