import { BentoDemo } from "./section/demo";
import Sidebar from "./section/sidebar";

const AreaCliente = () => {
  return (
    <div className="flex flex-row h-screen">
      <Sidebar />
      <div className="m-8 mt-20 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8 ">
        <h2 className="text-2xl font-semibold">Aréa do Cliente</h2>
        <p className="text-sm font-semibold text-slate-500">Verifique o que você pode fazer na area do cliente </p>
        <BentoDemo />
      </div>
    </div>
  );
};

export default AreaCliente;
