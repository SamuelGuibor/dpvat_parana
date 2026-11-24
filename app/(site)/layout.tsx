/* eslint-disable @next/next/no-img-element */
import Script from "next/script";
import { WhatsAppFloat } from "@/app/_components/landing_page/WhatsAppFloat";
import {
  ENDERECOS,
  HORARIO_SCHEMA,
  WHATSAPP_NUMBER,
} from "@/app/_components/landing_page/site-info";

// Layout do site institucional: é AQUI (e só aqui) que os scripts de
// marketing carregam — Google Analytics, Facebook Pixel e RD Station.
// Antes eles ficavam no layout raiz e disparavam também dentro do CRM e da
// área do cliente, poluindo as métricas com tráfego interno da equipe.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-4ETETM1CP7"
      />
      <Script id="gtag-init">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-4ETETM1CP7');
        `}
      </Script>

      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');

          fbq('init', '874771071591185');
          fbq('track', 'PageView');
        `}
      </Script>

      <Script
        id="rd-station"
        strategy="afterInteractive"
        src="https://d335luupugsy2.cloudfront.net/js/loader-scripts/549d8d30-be36-4f81-860f-9377b7717532-loader.js"
      />

      {/* Dados estruturados: LegalService com o telefone REAL (antes era um
          placeholder +55 41 0000-0000 que o Google podia exibir). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LegalService",
            name: "Brasil Benefícios e Indenizações",
            url: "https://www.brasilbeneficiosbr.com/",
            logo: "https://www.brasilbeneficiosbr.com/logo-brasil-beneficios.png",
            description:
              "Especialistas em indenizações de acidentes de trânsito e benefícios do INSS no Paraná.",
            areaServed: "Paraná, Brasil",
            telephone: `+${WHATSAPP_NUMBER}`,
            openingHours: HORARIO_SCHEMA,
            address: ENDERECOS.map((e) => ({
              "@type": "PostalAddress",
              streetAddress: e.rua,
              addressLocality: e.cidade,
              addressRegion: e.uf,
              postalCode: e.cep,
              addressCountry: "BR",
            })),
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "Customer Service",
              telephone: `+${WHATSAPP_NUMBER}`,
              areaServed: "BR",
              availableLanguage: "Portuguese",
            },
            sameAs: [
              "https://www.facebook.com/brasilbeneficiosbr/",
              "https://www.instagram.com/brasilbeneficiosbr/",
            ],
          }),
        }}
      />

      {children}

      <WhatsAppFloat />

      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src="https://www.facebook.com/tr?id=874771071591185&ev=PageView&noscript=1"
        />
      </noscript>
    </>
  );
}
