import Sidebar from "../area-do-cliente/section/sidebar";
import { Feature } from "./section/feature";

const AreaCliente = () => {
  return (
    <div className="flex flex-row h-screen">
      <Sidebar />
      <div className="m-8 mt-20 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8 block">
        <h2 className="text-2xl font-semibold">FAQ da Nossa Aréa do Cliente</h2>
        <p className="text-sm font-semibold text-slate-500">Verifique o que você pode fazer por aqui.</p>
        <Feature />
      </div>
    </div>
  );
};

export default AreaCliente;
