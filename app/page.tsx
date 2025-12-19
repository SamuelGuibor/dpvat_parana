import { Header } from '../app/_components/landing_page/Header';
import { Hero } from '../app/_components/landing_page/Hero';
import { Services } from '../app/_components/landing_page/Services';
import { BlogSection } from '../app/_components/landing_page/BlogSection';
import { Contact } from '../app/_components/landing_page/Contact';
import { Footer } from '../app/_components/landing_page/Footer';
import Stats from './section/stats';
import Video from './_components/landing_page/video';
import { Testimonials } from './_components/landing_page/feedback';

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Hero />
      <Services />
      <Video />
      <Stats />
      <BlogSection />
      <Testimonials />
      <Contact />
      <Footer />
    </div>
  );
}