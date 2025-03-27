import Head from "next/head";
import Footer from "../section/footer";
import Cards from "./cards";
import Header from "./header";

const Blog = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Head>
        <title>Blog - DPVAT Paraná</title>
        <meta
          name="description"
          content="Aqui, você encontra todas as informações sobre a plataforma DPVAT Paraná e como utilizar todos os seus recursos."
        />
        <link rel="canonical" href="https://dpvat-parana.vercel.app/blog" />
      </Head>
      <Header />
      <div className="flex-grow">
        <div className="mt-8 lg:mt-12 w-full mx-auto px-4 sm:px-6 lg:px-0 pt-7 lg:max-w-7xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl">Blog</h1>
          <p className="font-light md:text-2xl pt-4 text-center lg:text-left">
            Aqui, vamos trazer todas as informações necessárias para usar a
            nossa plataforma em todo seu potencial.
          </p>
        </div>
        <div className="mt-8">
          <Cards />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Blog;
