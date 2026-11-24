import type { Metadata } from 'next';
import { ArticleShell, Callout } from '../_components/ArticleShell';

export const metadata: Metadata = {
  title: 'Auxílio-Acidente ou auxílio-doença: qual é a diferença?',
  description:
    'Auxílio-doença é pago durante o afastamento; o Auxílio-Acidente, depois que você volta ao trabalho com uma sequela. Compare valor, duração e requisitos.',
  alternates: { canonical: '/blog/auxilio-acidente-ou-auxilio-doenca' },
};

const comparativo = [
  { item: 'Quando é pago', doenca: 'Durante o afastamento', acidente: 'Depois da recuperação, pela sequela' },
  { item: 'Pode trabalhar?', doenca: 'Não', acidente: 'Sim' },
  { item: 'Valor', doenca: '91% do salário de benefício', acidente: '50% do salário de benefício' },
  { item: 'Até quando', doenca: 'Até a alta da perícia', acidente: 'Até a aposentadoria' },
  { item: 'Carência', doenca: '12 contribuições (dispensada em acidente)', acidente: 'Não exige' },
  { item: 'Para que serve', doenca: 'Substitui o salário', acidente: 'Indeniza a sequela' },
];

export default function AuxilioAcidenteOuDoencaPage() {
  return (
    <ArticleShell slug="auxilio-acidente-ou-auxilio-doenca" readTime="5 min">
      <p className="text-xl">
        Os dois benefícios aparecem depois de um acidente e têm nomes parecidos, por isso é comum
        confundir. Mas eles servem para momentos diferentes da recuperação, e saber a diferença
        pode evitar que você deixe de receber um direito.
      </p>

      <h2>Auxílio-doença: enquanto você não pode trabalhar</h2>
      <p>
        O auxílio-doença, que hoje se chama oficialmente benefício por incapacidade temporária, é
        pago quando você fica mais de 15 dias sem conseguir trabalhar. Ele substitui o salário
        durante o afastamento e termina quando a perícia entende que você pode voltar.
      </p>
      <ul>
        <li>Para quem tem carteira assinada, a empresa paga os primeiros 15 dias e o INSS paga a partir do 16º.</li>
        <li>O valor é de 91% do salário de benefício.</li>
        <li>
          Em regra exige 12 contribuições, mas essa carência não é cobrada quando o afastamento vem
          de um acidente.
        </li>
      </ul>

      <h2>Auxílio-Acidente: depois que você volta, com uma sequela</h2>
      <p>
        O Auxílio-Acidente entra depois: o tratamento acabou, você voltou a trabalhar (ou pode
        voltar), mas ficou uma sequela permanente que reduz a sua capacidade. Ele não substitui o
        salário: é uma indenização mensal paga junto com ele.
      </p>
      <ul>
        <li>O valor é de 50% do salário de benefício.</li>
        <li>É pago até a aposentadoria.</li>
        <li>Não exige carência.</li>
      </ul>

      <h2>Lado a lado</h2>
      <div className="overflow-x-auto my-8">
        <table className="w-full border-collapse bg-white text-base shadow-sm rounded-lg overflow-hidden">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="px-4 py-3 text-left"></th>
              <th className="px-4 py-3 text-left">Auxílio-doença</th>
              <th className="px-4 py-3 text-left">Auxílio-Acidente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {comparativo.map((linha) => (
              <tr key={linha.item}>
                <td className="px-4 py-3 font-semibold text-gray-900">{linha.item}</td>
                <td className="px-4 py-3">{linha.doenca}</td>
                <td className="px-4 py-3">{linha.acidente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Um costuma vir depois do outro</h2>
      <p>
        O caminho mais comum é este: acidente, auxílio-doença durante o tratamento, alta da perícia
        e, por fim, Auxílio-Acidente pela sequela que ficou. Pela lei, o Auxílio-Acidente começa no
        dia seguinte ao fim do auxílio-doença.
      </p>

      <Callout title="Onde muita gente perde o direito">
        Quando a perícia dá alta, nem sempre o INSS avalia a sequela e concede o Auxílio-Acidente.
        O auxílio-doença acaba, a pessoa volta a trabalhar e nunca recebe a indenização. Se isso
        aconteceu com você, ainda é possível pedir, inclusive os valores atrasados dos últimos cinco
        anos.
      </Callout>

      <h2>E se eu nunca recebi auxílio-doença?</h2>
      <p>
        Também é possível pedir o Auxílio-Acidente. Ter recebido auxílio-doença antes não é
        obrigatório: o que importa é a sequela permanente e estar coberto pelo INSS na data do
        acidente.
      </p>

      <h2>E a aposentadoria por invalidez?</h2>
      <p>
        Se a sequela impede qualquer trabalho de forma definitiva, o caminho pode ser a
        aposentadoria por incapacidade permanente (a antiga aposentadoria por invalidez). O
        Auxílio-Acidente é para quem ainda consegue trabalhar, mas com limitação.
      </p>
      <p>
        Quer entender os requisitos em detalhes? Leia o{' '}
        <a href="/blog/inss">guia completo do Auxílio-Acidente</a>.
      </p>
    </ArticleShell>
  );
}
