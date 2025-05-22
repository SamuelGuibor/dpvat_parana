import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../_components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "../_components/ui/avatar";
import { Button } from "../_components/ui/button";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface Faq3Props {
  heading: string;
  description: string;
  items?: FaqItem[];
  supportHeading: string;
  supportDescription: string;
  supportButtonText: string;
  supportButtonUrl: string;
}

const faqItems: [] = [];
const phoneNumber = "5541997862323"; 
const message = "Olá! Quero saber mais sobre as indenizações que tenho direito a receber!"; 
const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
const Faq = ({
  heading = "Frequently asked questions",
  description = "Find answers to common questions about our products. Can't find what you're looking for? Contact our support team.",
  items = faqItems,
  supportHeading = "Need more support?",
  supportDescription = "Our dedicated support team is here to help you with any questions or concerns. Get in touch with us for personalized assistance.",
  supportButtonText = "Contact Support",
  supportButtonUrl = "https://wa.me/5541997862323",
}: Faq3Props) => {
  return (
    <section className="py-3">
      <div className="container mx-auto flex flex-col items-center space-y-16">
        {/* Título e Descrição */}
        <div className="flex  flex-col items-center text-center max-w-3xl px-4">
          <h2 className="mb-3 text-4xl md:text-5xl font-bold tracking-tight md:mb-4 lg:mb-6 lg:text-4xl">
            {heading}
          </h2>
          <p className=" lg:text-lg">{description}</p>
        </div>

        {/* Accordion */}
        <div className="flex justify-center w-full">
          <Accordion
            type="single"
            collapsible
            className="lg:w-full w-[350px] max-w-3xl "
          >
            {items.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="transition-opacity duration-200 hover:no-underline hover:text-blue-400">
                  <div className="font-medium text-left sm:py-1 lg:py-2 lg:text-lg">
                    {item.question}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="sm:mb-1 lg:mb-2">
                  <div className=" lg:text-lg">{item.answer}</div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Seção de Suporte */}
        <div className="mx-auto flex flex-col items-center justify-center max-w-4xl w-[350px] lg:w-[825px] rounded-lg bg-accent p-4 text-center md:rounded-xl md:p-6 lg:p-8">
          <div className="relative mb-6 flex justify-center">
            <Avatar className="absolute mb-4 size-16 origin-bottom -translate-x-[60%] scale-[80%] border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-2.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
            <Avatar className="absolute mb-4 size-16 origin-bottom translate-x-[60%] scale-[80%] border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-3.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
            <Avatar className="mb-4 size-16 border md:mb-5">
              <AvatarImage
                src="https://shadcnblocks.com/images/block/avatar-1.webp"
                alt="Suporte"
              />
              <AvatarFallback>SU</AvatarFallback>
            </Avatar>
          </div>
          <h3 className="mb-2 max-w-3xl font-semibold lg:text-lg">
            {supportHeading}
          </h3>
          <p className="mb-8 max-w-3xl text-muted-foreground lg:text-lg">
            {supportDescription}
          </p>
          <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" asChild>
              <a href={supportButtonUrl} target="_blank">
                {supportButtonText}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export { Faq };
