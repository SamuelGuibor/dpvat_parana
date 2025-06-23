import Link from "next/link";
import { Button } from "../_components/ui/button";

export function Cards() {
    const cards = [
        {
            id: 1,
            title: "Proteção completa",
            image: "chatbot.jpg",
            link: "/seguro-vida",
        },
        {
            id: 2,
            title: "Atendimento 24h",
            image: "car.jpg",
            link: "/atendimento",
        },
        {
            id: 3,
            title: "Descontos exclusivos",
            image: "homem.png",
            link: "/descontos",
        },
        {
            id: 4,
            title: "Cobertura nacional",
            image: "imagemm.jpg",
            link: "/cobertura",
        },
    ];

    return (
        <section className="w-full py-12 px-6 flex justify-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                {cards.map(({ id, title, image, link }) => (
                    <div
                        key={id}
                        className="relative w-[208px] h-[260px] rounded-xl overflow-hidden border border-white/20 bg-white/10 text-white group backdrop-blur-md"
                    >
                        <img
                            src={image}
                            alt={title}
                            className="absolute inset-0 w-full h-full object-cover z-0 transition duration-300 group-hover:brightness-75"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition duration-300 z-10" />
                        <div className="relative z-20 h-full flex flex-col justify-between p-10">
                            <h3 className="text-sm text-center font-semibold">{title}</h3>

                            <Link
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button className="w-full sm:w-auto">
                                    SAIBA MAIS
                                </Button>
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
