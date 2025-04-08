"use client"
import Sidebar from "../area-do-cliente/section/sidebar";
import Configuracao from "./section/config";

const Config = () => {

    return (
        <div className="flex flex-row h-screen">
            <Sidebar />
            <div className="m-8 mt-20 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8">
                <h2 className="text-2xl font-semibold">Configurações</h2>
                <p className="text-sm font-semibold text-slate-500">Verifique as suas configurações</p>
                <Configuracao />
             </div>
        </div>
    );
};

export default Config;