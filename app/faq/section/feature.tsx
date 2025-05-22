'use client'

import { Badge } from "@/app/_components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/_components/ui/accordion";

function Feature() {
  return (
    <div className="w-full py-5 lg:py-8">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-10">
          <div className="flex gap-10 flex-col">
            <div className="flex gap-4 flex-col">
              <div>
                <Badge className="bg-green-400 text-green-800 border-green-500" variant="outline">Perguntas Frequentes</Badge>
              </div>
              <div className="flex gap-2 flex-col">
                <h4 className="text-3xl md:text-5xl tracking-tighter max-w-xl text-left font-regular">
                  This is the start of something new
                </h4>
                <p className="text-lg max-w-xl lg:max-w-lg leading-relaxed tracking-tight text-muted-foreground  text-left">
                  Managing a small business today is already tough. Avoid further
                  complications by ditching outdated, tedious trade methods. Our
                  goal is to streamline SMB trade, making it easier and faster
                  than ever.
                </p>
              </div>
            </div>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {Array.from({ length: 8 }).map((_, index) => (
              <AccordionItem key={index} value={"index-" + index}>
                <AccordionTrigger>
                  This is the start of something new
                </AccordionTrigger>
                <AccordionContent>
                  Managing a small business today is already tough. Avoid further
                  complications by ditching outdated, tedious trade methods. Our
                  goal is to streamline SMB trade, making it easier and faster
                  than ever.
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

export { Feature };
