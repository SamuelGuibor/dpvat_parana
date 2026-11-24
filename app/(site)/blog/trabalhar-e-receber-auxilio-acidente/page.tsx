import type { Metadata } from 'next';
import { ArticleShell, Callout } from '../_components/ArticleShell';

export const metadata: Metadata = {
  title: 'Posso trabalhar e receber o Auxílio-Acidente?',
  description:
    'O Auxílio-Acidente é pago junto com o salário: você continua trabalhando, pode trocar de emprego e só deixa de receber quando se aposenta. Entenda.',
  alternates: { canonical: '/blog/trabalhar-e-receber-auxilio-acidente' },
};

export default function TrabalharEReceberPage() {
  return (
    <ArticleShell slug="trabalhar-e-receber-auxilio-acidente" readTime="4 min">
      <p className="text-xl">
        Essa é uma das dúvidas que mais ouvimos: “se eu pedir o Auxílio-Acidente, vou ter que parar
        de trabalhar?”. A resposta é não. O benefício foi feito justamente para quem continua
        trabalhando depois de um acidente, mas com alguma limitação.
      </p>

      <h2>Por que dá para trabalhar e receber</h2>
      <p>
        O Auxílio-Acidente é uma indenização pela sequela que o acidente deixou, não um substituto
        do salário. Por isso a lei permite receber os dois juntos: você continua no seu emprego, com
        o mesmo salário, e o benefício é pago todo mês pelo INSS.
      </p>

      <h2>Posso continuar na mesma empresa? E trocar de emprego?</h2>
      <p>Pode as duas coisas. O benefício continua se você:</p>
      <ul>
        <li>seguir na mesma função ou mudar de função na empresa;</li>
        <li>trocar de emprego ou ficar desempregado;</li>
        <li>receber aumento de salário.</li>
      </ul>

      <h2>Quanto vale</h2>
      <p>
        O Auxílio-Acidente corresponde a 50% do salário de benefício, que é calculado a partir da
        média das suas contribuições ao INSS. Por exemplo: se essa média for de R$ 3.000, o
        benefício fica em torno de R$ 1.500 por mês. O valor exato depende do seu histórico de
        contribuições.
      </p>

      <h2>Quando o benefício termina</h2>
      <p>
        O Auxílio-Acidente é pago até você se aposentar, em qualquer tipo de aposentadoria. Ele não
        é pago junto com a aposentadoria: quando ela começa, o Auxílio-Acidente para.
      </p>

      <Callout title="Ele também ajuda na sua aposentadoria">
        Enquanto você recebe, o valor do Auxílio-Acidente entra no cálculo da sua futura
        aposentadoria, somado aos seus salários.
      </Callout>

      <h2>Quem pode pedir</h2>
      <p>
        Tem direito quem, na data do acidente, tinha carteira assinada (inclusive empregada
        doméstica), era trabalhador avulso ou segurado especial, e ficou com uma sequela permanente
        que reduz a capacidade para o trabalho. Autônomos e MEIs que contribuem como contribuinte
        individual, e quem contribui como facultativo, não têm direito a este benefício.
      </p>
      <p>
        Veja os detalhes no <a href="/blog/inss">guia completo do Auxílio-Acidente</a> e a{' '}
        <a href="/blog/documentacao">lista de documentos para o pedido</a>.
      </p>
    </ArticleShell>
  );
}
