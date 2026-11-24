// Contatos e endereços do site público num lugar só. Antes o número ficava
// copiado à mão no Header, no Contact, no FAQ e no JSON-LD, e os endereços só
// no Contact — trocar um deles deixava o resto do site desatualizado.

/** Linha do WhatsApp do site (a mesma do vídeo de apresentação e do FAQ). */
export const WHATSAPP_NUMBER = "5541920077331";
export const PHONE_DISPLAY = "(41) 92007-7331";
export const PHONE_TEL = "tel:+5541920077331";

/** Link "Análise Gratuita": abre a conversa já com a primeira mensagem escrita. */
export const WHATSAPP_ANALISE_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Quero fazer a análise gratuita do meu caso.",
)}`;

export const HORARIO_ATENDIMENTO = "Segunda a sábado, das 8h às 20h";
/** Mesmo horário no formato do schema.org (JSON-LD do layout do site). */
export const HORARIO_SCHEMA = "Mo-Sa 08:00-20:00";

export type Endereco = {
  id: string;
  cidade: string;
  uf: string;
  rua: string;
  bairro: string;
  cep: string;
};

// CEPs conferidos no ViaCEP em 24/11/2026.
export const ENDERECOS: Endereco[] = [
  { id: "curitiba-seminario", cidade: "Curitiba", uf: "PR", rua: "Travessa Jorge Cuquel, 6", bairro: "Seminário", cep: "80440-100" },
  { id: "curitiba-centro", cidade: "Curitiba", uf: "PR", rua: "Rua Visconde do Rio Branco, 1488, conj. 909", bairro: "Centro", cep: "80420-210" },
  { id: "ponta-grossa", cidade: "Ponta Grossa", uf: "PR", rua: "Rua Casemiro de Abreu, 412", bairro: "Uvaranas", cep: "84020-240" },
  { id: "londrina", cidade: "Londrina", uf: "PR", rua: "Avenida Higienópolis, 1601", bairro: "Guanabara", cep: "86015-010" },
  { id: "pontal-do-parana", cidade: "Pontal do Paraná", uf: "PR", rua: "Rua Tibagi, 479", bairro: "Praia de Leste", cep: "83255-000" },
  { id: "sao-paulo", cidade: "São Paulo", uf: "SP", rua: "Rua Domingos Antônio Raiol, 36B", bairro: "Vila Formosa", cep: "03383-010" },
];

function enderecoBusca(e: Endereco): string {
  // Sem o "conj. 909": o Google acha o prédio pela rua e número.
  const rua = e.rua.replace(/,\s*conj\..*$/i, "");
  return `${rua} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`;
}

/** Mapa embutido do Google (sem chave de API). */
export function mapaEmbedUrl(e: Endereco): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(enderecoBusca(e))}&z=16&output=embed`;
}

/** Link "Como chegar" que abre no app/site do Google Maps. */
export function mapaLinkUrl(e: Endereco): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoBusca(e))}`;
}
