import type { Metadata } from 'next';
import { ArticleShell, Callout } from '../_components/ArticleShell';

export const metadata: Metadata = {
  title: 'Acidente de trânsito dá direito ao Auxílio-Acidente?',
  description:
    'Batida de carro, queda de moto ou atropelamento que deixou sequela pode dar direito ao Auxílio-Acidente do INSS. Veja quem tem direito, quanto se recebe e como pedir.',
  alternates: { canonical: '/blog/auxilio-acidente-transito' },
};

export default function AuxilioAcidenteTransitoPage() {
  return (
    <ArticleShell slug="auxilio-acidente-transito" readTime="5 min">
      <p className="text-xl">
        Depois de uma batida de carro, de uma queda de moto ou de um atropelamento, muita gente
        volta a trabalhar com alguma limitação: um joelho que não dobra como antes, um braço com
        menos força, dor na coluna para carregar peso. Pouca gente sabe que essa sequela pode dar
        direito a uma indenização mensal do INSS, o Auxílio-Acidente.
      </p>

      <h2>Sim, acidente de trânsito conta</h2>
      <p>
        O Auxílio-Acidente não é só para acidente de trabalho. A lei fala em acidente de qualquer
        natureza, então vale o acidente de trânsito em qualquer situação:
      </p>
      <ul>
        <li>como motorista, passageiro, motociclista, ciclista ou pedestre;</li>
        <li>no caminho do trabalho, num dia de folga ou numa viagem;</li>
        <li>com ou sem culpa sua: para o INSS, não importa quem causou o acidente.</li>
      </ul>

      <h2>Quem tem direito</h2>
      <p>Três condições precisam existir ao mesmo tempo:</p>
      <ol>
        <li>
          <strong>Estar coberto pelo INSS na data do acidente.</strong> Ter carteira assinada
          (inclusive empregada doméstica), ser trabalhador avulso ou segurado especial, como o
          trabalhador rural em regime de economia familiar. Quem tinha acabado de sair do emprego
          pode estar no chamado período de graça, em que continua protegido por alguns meses.
        </li>
        <li>
          <strong>Ficar com uma sequela permanente.</strong> Depois de terminado o tratamento, a
          lesão deixou uma limitação que não vai embora.
        </li>
        <li>
          <strong>A sequela reduzir a capacidade para o trabalho.</strong> Ela não precisa impedir
          você de trabalhar: basta exigir mais esforço ou atrapalhar a atividade que você fazia
          antes do acidente.
        </li>
      </ol>

      <Callout title="Não precisa de tempo mínimo de contribuição">
        Diferente de outros benefícios, o Auxílio-Acidente não exige carência. Basta estar coberto
        pelo INSS no dia do acidente.
      </Callout>

      <h2>Quem fica de fora</h2>
      <p>
        Pela lei, o Auxílio-Acidente não é pago a quem contribui como contribuinte individual
        (autônomo ou MEI) nem como segurado facultativo. Também não é pago a quem já está
        aposentado. Se você estava numa dessas situações no dia do acidente, ainda pode haver
        outros caminhos: vale conversar com um especialista.
      </p>

      <h2>Sequelas comuns em acidentes de trânsito</h2>
      <ul>
        <li>fraturas de perna, braço, bacia ou clavícula que consolidaram com limitação;</li>
        <li>lesões no joelho, tornozelo, ombro ou punho que reduziram o movimento;</li>
        <li>lesões na coluna que limitam esforço, peso ou postura;</li>
        <li>perda de parte de um dedo ou de um membro;</li>
        <li>cicatrizes e queimaduras que limitam os movimentos;</li>
        <li>perda de audição ou de visão.</li>
      </ul>

      <h2>Quanto se recebe e até quando</h2>
      <p>
        O valor é de 50% do salário de benefício, que é calculado a partir da média das suas
        contribuições ao INSS. Ele é pago todo mês, junto com o seu salário, até você se aposentar.
      </p>
      <p>
        Se você recebeu auxílio-doença por causa do acidente, o Auxílio-Acidente deveria começar no
        dia seguinte ao fim dele. Quando o INSS não concede o benefício nesse momento, é possível
        pedir os valores atrasados dos últimos cinco anos.
      </p>

      <h2>E o seguro obrigatório ou a indenização do causador?</h2>
      <p>
        São coisas diferentes. O Auxílio-Acidente é um benefício do INSS; o seguro obrigatório de
        trânsito e a ação contra quem causou o acidente são outras indenizações. Uma não impede a
        outra.
      </p>

      <h2>Como pedir</h2>
      <ol>
        <li>
          Guarde tudo do acidente e do tratamento: boletim de ocorrência, prontuário do hospital,
          exames, laudos e receitas.
        </li>
        <li>Faça o pedido pelo Meu INSS (site ou aplicativo) ou pelo telefone 135.</li>
        <li>Passe pela perícia médica do INSS levando os documentos que mostram a sequela.</li>
        <li>
          Se o pedido for negado, ainda dá para recorrer ou entrar na Justiça, onde é feita uma nova
          perícia.
        </li>
      </ol>
      <p>
        Veja a <a href="/blog/documentacao">lista completa de documentos</a> e o{' '}
        <a href="/blog/inss">guia completo do Auxílio-Acidente</a>.
      </p>
    </ArticleShell>
  );
}
