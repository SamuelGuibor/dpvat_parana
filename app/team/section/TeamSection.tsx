const members = [
    {
      name: "Thomaz Martinez",
      role: "Creator",
      avatar: "/thomaz.jpg",
    },
  ]

  const enginer = [
    {
      name: "Eduardo Martinez",
      role: "Creator",
      avatar: "/thomaz.jpg",
    }
  ]

  const marketing = [
    {
      name: "Nikolas",
      role: "Creator",
      avatar: "/thomaz.jpg",
    }
  ]
  
  export default function TeamSection() {
    return (
      <section className="py-4 md:py-4">
        <div className="mx-auto max-w-3xl px-8 lg:px-0">
          <h2 className="mb-8 text-4xl font-bold md:mb-16 lg:text-5xl">Our team</h2>
          <div>
            <h3 className="mb-6 text-lg font-medium">Leadership</h3>
            <div className="grid grid-cols-2 gap-4 border-t py-6 md:grid-cols-4">
              {members.map((member, index) => (
                <div key={index}>
                  <div className="bg-background size-20 rounded-full border p-0.5 shadow shadow-zinc-950/5">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={member.avatar}
                      alt={member.name}
                      height="460"
                      width="460"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-2 block text-sm">{member.name}</span>
                  <span className="text-muted-foreground block text-xs">{member.role}</span>
                </div>
              ))}
            </div>
          </div>
  
          <div className="mt-6">
            <h3 className="mb-6 text-lg font-medium">Engineering</h3>
            <div data-rounded="full" className="grid grid-cols-2 gap-4 border-t py-6 md:grid-cols-4">
              {enginer.map((enginers, index) => (
                <div key={index}>
                  <div className="bg-background size-20 rounded-full border p-0.5 shadow shadow-zinc-950/5">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={enginers.avatar}
                      alt={enginers.name}
                      height="460"
                      width="460"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-2 block text-sm">{enginers.name}</span>
                  <span className="text-muted-foreground block text-xs">{enginers.role}</span>
                </div>
              ))}
            </div>
          </div>
  
          <div className="mt-6">
            <h3 className="mb-6 text-lg font-medium">Marketing</h3>
            <div data-rounded="full" className="grid grid-cols-2 gap-4 border-t py-6 md:grid-cols-4">
              {marketing.map((market, index) => (
                <div key={index}>
                  <div className="bg-background size-20 rounded-full border p-0.5 shadow shadow-zinc-950/5">
                    <img
                      className="aspect-square rounded-full object-cover"
                      src={market.avatar}
                      alt={market.name}
                      height="460"
                      width="460"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-2 block text-sm">{market.name}</span>
                  <span className="text-muted-foreground block text-xs">{market.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    )
  }
  
  