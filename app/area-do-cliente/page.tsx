import { BentoDemo } from "./section/demo";
import Sidebar from "./section/sidebar";

const AreaCliente = () => {
  return (
    <>
    <div className="flex h-screen flex-row bg-gray-50">
      <Sidebar />
      <main className="w-full overflow-auto px-5 pb-12 pt-10 md:px-10 md:pt-10">
        <BentoDemo />
      </main>
    </div>
    </>
  );
};

export default AreaCliente;
