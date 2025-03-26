import Image from "next/image";
import Link from "next/link";
import { FaFacebook, FaInstagram } from "react-icons/fa";

const Header = () => {
  return (
    <header className="flex justify-between items-center w-full max-w-7xl mx-auto py-4 px-6">
      {/* Logo */}
      <div>
        <Link href="/">
          <Image
            src="/logo.png"
            alt="Logo Paraná Seguros"
            width={120}
            height={100}
          />
        </Link>
      </div>

      {/* Ícones */}
      <div className="flex gap-4">
        <Link
          href="https://www.facebook.com/paranadpvat/"
          aria-label="Veja nosso Facebook"
        >
          <FaFacebook size={30} className="text-black hover:text-blue-600" />
        </Link>
        <Link
          href="https://www.instagram.com/paranadpvat/"
          aria-label="Veja nosso Instagram"
        >
          <FaInstagram size={30} className="text-black hover:text-pink-500" />
        </Link>
      </div>
    </header>
  );
};

export default Header;
