/* eslint-disable @next/next/no-img-element */
const members = [
  {
    name: "Thomaz Martinez",
    role: "Creator",
    avatar: "/thomaz.jpg",
  },
];

const enginer = [
  {
    name: "Eduardo Martinez",
    role: "Creator",
    avatar: "/thomaz.jpg",
  },
];

const marketing = [
  {
    name: "Nikolas",
    role: "Creator",
    avatar: "/thomaz.jpg",
  },
];

export default function TeamSection() {
  return (
    <section className="py-10 bg-gray-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 className="flex justify-center mb-10 text-3xl font-bold tracking-tight text-gray-900 md:mb-16 lg:text-4xl">
          Nossa Equipe
        </h2>

        {/* Leadership Section */}
        <div className="mb-12">
          <h3 className="flex justify-center mb-6 text-xl font-semibold text-gray-800">Leadership</h3>
          <div className="flex justify-center border-t border-gray-200 pt-8">
            <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-${Math.min(members.length, 4)} max-w-3xl w-full`}>
              {members.map((member, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="bg-white size-24 rounded-full border-2 border-gray-200 p-1 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={member.avatar}
                      alt={member.name}
                      height="96"
                      width="96"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-3 block text-sm font-medium text-gray-900">{member.name}</span>
                  <span className="text-gray-500 block text-xs">{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Engineering Section */}
        <div className="mb-12">
          <h3 className="flex justify-center mb-6 text-xl font-semibold text-gray-800">Engineering</h3>
          <div className="flex justify-center border-t border-gray-200 pt-8">
            <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-${Math.min(enginer.length, 4)} max-w-3xl w-full`}>
              {enginer.map((engineer, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="bg-white size-24 rounded-full border-2 border-gray-200 p-1 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={engineer.avatar}
                      alt={engineer.name}
                      height="96"
                      width="96"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-3 block text-sm font-medium text-gray-900">{engineer.name}</span>
                  <span className="text-gray-500 block text-xs">{engineer.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Marketing Section */}
        <div>
          <h3 className="flex justify-center mb-6 text-xl font-semibold text-gray-800">Marketing</h3>
          <div className="flex justify-center border-t border-gray-200 pt-8">
            <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-${Math.min(marketing.length, 4)} max-w-3xl w-full`}>
              {marketing.map((market, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="bg-white size-24 rounded-full border-2 border-gray-200 p-1 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={market.avatar}
                      alt={market.name}
                      height="96"
                      width="96"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-3 block text-sm font-medium text-gray-900">{market.name}</span>
                  <span className="text-gray-500 block text-xs">{market.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}