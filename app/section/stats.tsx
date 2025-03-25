const Stats = () => {
  return (
    <section className="py-12 md:py-20 bg-white">
      <div className="mx-auto max-w-5xl space-y-12 px-6">
        <div className="relative z-10 mx-auto max-w-xl text-center">
          <h2 className="text-4xl font-semibold lg:text-5xl">
            Paraná Seguros em Números
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            No Paraná, o DPVAT é mais do que um seguro obrigatório – é um
            suporte essencial. Com milhares de indenizações concedidas todos os
            anos, estamos comprometidos em proteger as famílias paranaenses e
            promover segurança no trânsito.
          </p>
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
