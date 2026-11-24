import type { Metadata } from 'next';
import { ArticleShell, Callout } from '../_components/ArticleShell';

export const metadata: Metadata = {
  title: 'Documentos para pedir o Auxílio-Acidente',
  description:
    'Lista de documentos para pedir o Auxílio-Acidente do INSS: documentos pessoais, carteira de trabalho, boletim de ocorrência, prontuário, exames e laudos.',
  alternates: { canonical: '/blog/documentacao' },
};

export default function DocumentacaoPage() {
  return (
    <ArticleShell slug="documentacao" readTime="4 min">
      <p className="text-xl">
        Ter os documentos certos em mãos faz o pedido andar mais rápido e ajuda a perícia a
        enxergar a sequela. Veja o que reunir e não se preocupe se faltar algo: boa parte a nossa
        equipe consegue buscar por você.
      </p>

      <h2>Documentos pessoais</h2>
      <ul>
        <li>RG ou CNH;</li>
        <li>CPF;</li>
        <li>comprovante de endereço atualizado.</li>
      </ul>

      <h2>Documentos do trabalho e do INSS</h2>
      <ul>
        <li>
          <strong>Carteira de Trabalho</strong> (pode ser a digital): mostra que você estava
          empregado na data do acidente.
        </li>
        <li>
          <strong>Acesso ao Meu INSS</strong> (login gov.br): com ele conferimos o seu histórico de
          contribuições e os benefícios que você já recebeu.
        </li>
        <li>
          <strong>CAT</strong> (Comunicação de Acidente de Trabalho), se o acidente aconteceu no
          trabalho ou no caminho dele.
        </li>
      </ul>

      <h2>Documentos do acidente</h2>
      <ul>
        <li>boletim de ocorrência, no caso de acidente de trânsito;</li>
        <li>ficha de atendimento do SAMU, do Siate ou do pronto-socorro, se houver;</li>
        <li>fotos do acidente e das lesões (ajudam, mas não são obrigatórias).</li>
      </ul>

      <h2>Documentos do tratamento e da sequela</h2>
      <p>
        Esta é a parte mais importante: é ela que mostra à perícia o que o acidente deixou.
      </p>
      <ul>
        <li>prontuário do hospital onde você foi atendido;</li>
        <li>exames como raio-x, tomografia e ressonância;</li>
        <li>laudos e relatórios médicos, receitas e atestados;</li>
        <li>relatórios de fisioterapia;</li>
        <li>um laudo médico recente que descreva a sequela e as limitações que ficaram.</li>
      </ul>

      <Callout title="Não tem o prontuário do hospital?">
        O prontuário fica guardado no hospital e o pedido costuma ser burocrático. A nossa equipe
        faz esse pedido por você.
      </Callout>

      <h2>Como a nossa equipe ajuda</h2>
      <ul>
        <li>análise do seu caso, sem custo;</li>
        <li>levantamento e organização dos documentos;</li>
        <li>acompanhamento do processo até a concessão do benefício.</li>
      </ul>
      <p>
        Quer entender o benefício antes? Leia o{' '}
        <a href="/blog/inss">guia completo do Auxílio-Acidente</a>.
      </p>
    </ArticleShell>
  );
}
