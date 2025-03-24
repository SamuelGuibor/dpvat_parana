import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent } from "./ui/sheet";
import { FaFacebook } from "react-icons/fa";
import { FaInstagram } from "react-icons/fa";
import Link from "next/link";
import Image from "next/image";

const Header = () => {
  return (
    <Card>
      <CardContent className="flex flex-row items-center justify-between p-5 pl-20">
        <Link href="/">
        <Image src="/logo.png" height={20} width={110} alt="DPVAT Paraná" />
        </Link>

        <div className="flex items-center gap-4">
            <div className="relative flex gap-4 right-24">
          <FaFacebook size={35} className="text-blue-600 cursor-pointer" />
          <FaInstagram size={35} className="text-pink-500 cursor-pointer" />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="outline">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <p>Conteúdo do Menu</p>
            </SheetContent>
          </Sheet>
        </div>
      </CardContent>
    </Card>
  );
};

export default Header;
