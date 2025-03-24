import Hero from "./section/hero-section";
import Objetivos from "./section/objetivos";
import Stats from "./section/stats";

export default function Home() {
  return (
    <div>
      <Hero />
      <Stats />
      <Objetivos />
    </div>
  );
}
