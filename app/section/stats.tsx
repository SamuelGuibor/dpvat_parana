import Image from "next/image";

const Stats = () => {
  return (
    <section className="py-12 md:py-20 bg-white">
      <div className="mx-auto max-w-7xl space-y-12 px-6">
          <div className="flex justify-center relative bottom-5">
            <Image src="/paranaseguros.png" width={250} height={250} alt="" />
          </div>
        <div className="relative z-10 mx-auto text-center">
          
          <h2 className="text-4xl font-semibold lg:text-5xl">
            Aqui Nós Resgatamos Seus Direitos 
          </h2>
        </div>

        <div className="grid gap-8 text-center md:grid-cols-3 md:gap-4">
          <div className="space-y-4">
            <div className="text-5xl font-bold text-blue-600">+ 30 mil</div>
            <p className="text-gray-700">Pessoas Indenizadas</p>
          </div>
          <div className="space-y-4">
            <div className="text-5xl font-bold text-blue-600">17 anos</div>
            <p className="text-gray-700">De Experiência</p>
          </div>
          <div className="space-y-4">
            <div className="text-5xl font-bold text-blue-600">100%</div>
            <p className="text-gray-700">De Satisfação</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Stats;
