/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Button } from "../_components/ui/button";

export function Cards() {
    const cards = [
        {
            id: 1,
            title: "Seguro de Vida",
            image: "dpvat.jpg",
            link: "/seguro-vida",
        },
        {
            id: 2,
            title: "Seguro de Terceiros",
            image: "car.jpg",
            link: "/seguro-terceiros",
        },
        {
            id: 3,
            title: "Seguro de Aplicativos",
            image: "homem.png",
            link: "/exclusivos",
        },
        {
            id: 4,
            title: "Seguro DPVAT",
            image: "imagemm.jpg",
            link: "/seguro-dpvat",
        },
        {
            id: 5,
            title: "INSS",
            image: "imagemm.jpg",
            link: "/inss",
        },
    ];

    return (
        <section className="w-full py-14 px-6 flex justify-center bg-gradient-to-r from-indigo-900 via-purple-900 to-blue-900 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
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