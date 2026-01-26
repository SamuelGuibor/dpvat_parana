import type { Metadata } from "next";
import "./globals.css";
import { Mulish } from "next/font/google";
import AuthProvider from "./_providers/auth";
import { Toaster } from "./_components/ui/sonner";
import Script from "next/script";
import { MixpanelProvider } from "./_providers/mixpanel-provider";
import { NotificationsProvider } from "./store/provider";

const mulish = Mulish({
  subsets: ["latin-ext"],
});

export const metadata: Metadata = {
  title: "Paraná Seguros",
  description:
    "Paraná Seguros - Soluções de seguros para proteção e tranquilidade.",
  authors: [{ name: "Paraná Seguros" }],
  keywords:
    "seguros, seguro de vida, seguros para empresas, proteção, Paraná Seguros, seguros automotivos, seguros residenciais, seguros empresariais, seguro saúde, consultoria em seguros, planos de seguros, seguros no Paraná, seguros personalizados, proteção de bens, seguros acessíveis, consultoria de riscos, seguros de viagens, seguro de imóvel, seguros de responsabilidade civil, previdência privada, seguro de carro, seguro empresarial, melhores seguros de vida, seguro mais barato, proteção financeira, gestão de riscos",
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <html lang="pt-BR">
      <head>
        <Script id="mixpanel-init" strategy="afterInteractive" type="text/javascript">
          {`(function(e,c){if(!c.__SV){var l,h;window.mixpanel=c;c._i=[];c.init=function(q,r,f){
            function t(d,a){var g=a.split(".");2==g.length&&(d=d[g[0]],a=g[1]);
            d[a]=function(){d.push([a].concat(Array.prototype.slice.call(arguments,0)))}}
            var b=c;"undefined"!==typeof f?b=c[f]=[]:f="mixpanel";b.people=b.people||[];
            b.toString=function(d){var a="mixpanel";"mixpanel"!==f&&(a+="."+f);
            d||(a+=" (stub)");return a};b.people.toString=function(){
            return b.toString(1)+".people (stub)"};
            l="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders start_session_recording stop_session_recording people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" ");
            for(h=0;h<l.length;h++)t(b,l[h]);
            c._i.push([q,r,f])};c.__SV=1.2;
            var k=e.createElement("script");k.type="text/javascript";k.async=!0;
            k.src="https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";
            e=e.getElementsByTagName("script")[0];e.parentNode.insertBefore(k,e)}
          })(document,window.mixpanel||[]);

          mixpanel.init('3a16647810beddeb9b99612b7af13120', {
            autocapture: true,
            record_sessions_percent: 100,
          });
          `}
        </Script>

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

        <title>Paraná Seguros - Indenização Rápida e Segura</title>
        <meta name="facebook-domain-verification" content="1rkpryx50xubl50ps6z82tb2is9887" />
        <meta
          name="description"
          content="Especialistas em indenizações de acidentes de trânsito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná."
        />
        <meta
          name="keywords"
          content="DPVAT Paraná,seguro DPVAT,indenização DPVAT,Paraná Seguros,Curitiba DPVAT,Ponta Grossa DPVAT,Maringá DPVAT"
        />
        <link rel="canonical" href="https://www.segurosparana.com.br/" />
        <meta
          property="og:title"
          content="Paraná Seguros - Indenização Rápida e Segura com DPVAT"
        />
        <meta
          property="og:description"
          content="Especialistas em indenizações de Acidentes de Transito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná."
        />
        <meta property="og:url" content="https://www.segurosparana.com.br/" />
        <meta property="og:site_name" content="Paraná Seguros" />
        <meta
          property="og:image"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta
          property="og:image:secure_url"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="Paraná Seguros - Indenização de Acidentes de Transito"
        />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Paraná Seguros - Indenização Rápida de Acidentes de Transito"
        />
        <meta
          name="twitter:description"
          content="Garantimos sua indenização de Acidentes de Transito com rapidez e transparência no Paraná. Entre em contato hoje!"
        />
        <meta
          name="twitter:image"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta
          name="robots"
          content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1"
        />
      </head>
      <body className={`${mulish.className} antialiased`}>
        <AuthProvider><NotificationsProvider>{children}</NotificationsProvider></AuthProvider>
        <Toaster />
        <MixpanelProvider />
        <script type="text/javascript" async
          src="https://d335luupugsy2.cloudfront.net/js/loader-scripts/549d8d30-be36-4f81-860f-9377b7717532-loader.js" >
        </script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Paraná Seguros",
              url: "https://www.segurosparana.com.br/",
              logo: "https://www.segurosparana.com.br/paranaseguros.png",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "Customer Service",
                telephone: "+55 41 0000-0000",
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
      </body>
    </html>
  );
}