/* eslint-disable @next/next/no-img-element */
import Script from "next/script";

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
            name: "Paraná Seguros",
            url: "https://www.segurosparana.com.br/",
            logo: "https://www.segurosparana.com.br/paranaseguros.png",
            description:
              "Especialistas em indenizações de acidentes de trânsito e benefícios do INSS no Paraná.",
            areaServed: "Paraná, Brasil",
            telephone: "+5541997862323",
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "Customer Service",
              telephone: "+5541997862323",
              areaServed: "BR",
              availableLanguage: "Portuguese",
            },
            sameAs: [
              "https://www.facebook.com/paranadpvat/",
              "https://www.instagram.com/paranadpvat/",
            ],
          }),
        }}
      />

      {children}

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
