// Gera as variantes *_ASSINATURA.docx das procurações específicas, inserindo a
// âncora invisível <<assinatura_cliente>> (branca, 6pt) em cada linha de
// assinatura — mesmo padrão do _KIT_PREV_CSS_ASSINATURA.docx — e garante o
// [[name]] impresso embaixo das linhas do KIT.
//
// Os templates desenham a "linha de assinatura" de 3 jeitos diferentes, e cada
// um recebe a âncora do seu jeito, SEM criar parágrafo novo (parágrafo novo
// mudava a paginação e duplicava linha):
//   a) régua de "_" (30+)            → âncora anexada no fim do parágrafo
//   b) tabs sublinhados (u single)   → tabs viram uma régua de "_" + âncora
//   c) borda de parágrafo (<w:pBdr>) → régua BRANCA (invisível) + âncora dentro
//      do próprio parágrafo da borda (o pdfjs precisa de "_" pra centralizar)
//
// Uso:  node scripts/add-signature-anchors.mjs
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

const TEMPLATES = [
  "-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx",
  "-PROCURAÇÃO-ESPECÍFICA-TAYNARA.docx",
];

const ANCHOR_RUN =
  '<w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr>' +
  '<w:t xml:space="preserve">&lt;&lt;assinatura_cliente&gt;&gt;</w:t></w:r>';

const RULE = "_".repeat(50);
const RULE_RUN = `<w:r><w:t xml:space="preserve">${RULE}</w:t></w:r>`;
const WHITE_RULE_RUN =
  '<w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
  `<w:t xml:space="preserve">${RULE}</w:t></w:r>`;

const PARA_RE = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

function paragraphText(xml) {
  const texts = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  return texts
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function classify(xml) {
  const text = paragraphText(xml);
  return {
    text,
    isRule: /^_{30,}$/.test(text.replace(/\s+/g, "")),
    isTabLine:
      !text &&
      (xml.match(/<w:tab\/>/g) || []).length >= 2 &&
      xml.includes('w:u w:val="single"'),
    isBorderLine: !text && xml.includes("<w:pBdr>"),
    // "[[name]]" sozinho, ou seguido só da instrução de reconhecimento de firma
    // (no Taynara elas dividem o mesmo parágrafo).
    isNameOnly: /^\[\[name\]\]\s*(\(RECONHECER[^)]*\))?$/.test(text),
  };
}

function addAnchors(documentXml, label) {
  const paragraphs = [...documentXml.matchAll(PARA_RE)].map((m) => ({
    xml: m[0],
    index: m.index,
    ...classify(m[0]),
  }));

  // edits[i] = função que transforma o XML do parágrafo i.
  const edits = new Map();
  const appendAnchor = (xml) => xml.replace(/<\/w:p>$/, `${ANCHOR_RUN}</w:p>`);

  let spots = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // Só ancoramos linhas LIGADAS a um [[name]] — régua solta é separador de
    // seção (o Curitiba tem uma dessas logo depois do corpo do texto).
    if (!p.isNameOnly) continue;

    // Linha de assinatura mais próxima ACIMA do [[name]] (até 3 parágrafos).
    let done = false;
    for (let j = i - 1; j >= Math.max(0, i - 3) && !done; j--) {
      const prev = paragraphs[j];
      if (prev.isRule) {
        edits.set(j, appendAnchor);
        spots++;
        done = true;
      } else if (prev.isTabLine) {
        // Troca os tabs sublinhados por uma régua visível + âncora.
        edits.set(j, (xml) =>
          appendAnchor(xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*<w:tab\/>[\s\S]*?<\/w:r>/g, RULE_RUN)),
        );
        spots++;
        done = true;
      } else if (prev.isBorderLine) {
        // A linha é a borda do parágrafo: régua branca só pro pdfjs enxergar.
        edits.set(j, (xml) =>
          xml.replace(/<\/w:p>$/, `${WHITE_RULE_RUN}${ANCHOR_RUN}</w:p>`),
        );
        spots++;
        done = true;
      }
    }
    if (!done) {
      // Último recurso: a "linha" é um desenho (v:line/pict), que o pdfjs não
      // enxerga. Se o parágrafo logo acima do nome for vazio, ele recebe uma
      // régua BRANCA + âncora — a assinatura centraliza ali, em cima do nome.
      const above = paragraphs[i - 1];
      if (above && !above.text && !above.isBorderLine && !above.isTabLine) {
        edits.set(i - 1, (xml) =>
          xml.replace(/<\/w:p>$/, `${WHITE_RULE_RUN}${ANCHOR_RUN}</w:p>`),
        );
        spots++;
      } else {
        console.warn(`${label}: [[name]] sem linha de assinatura por perto (parágrafo ${i}) — âncora NÃO inserida.`);
      }
    }
  }

  let out = "";
  let cursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    out += documentXml.slice(cursor, p.index);
    out += edits.has(i) ? edits.get(i)(p.xml) : p.xml;
    cursor = p.index + p.xml.length;
  }
  out += documentXml.slice(cursor);

  console.log(`${label}: ${spots} âncora(s)`);
  return { xml: out, anchored: spots };
}

// ---------------------------------------------------------------------------
// KIT: garante o [[name]] impresso embaixo de cada linha de assinatura do
// cliente (o carimbo fica: assinatura em cima da linha, nome em baixo dela).
// Idempotente — roda de novo sem duplicar.
// ---------------------------------------------------------------------------
const NAME_PARAGRAPH =
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
  '<w:r><w:rPr><w:rFonts w:ascii="Bookman Old Style" w:cs="Bookman Old Style" w:eastAsia="Bookman Old Style" w:hAnsi="Bookman Old Style"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
  "<w:t>[[name]]</w:t></w:r></w:p>";

function addNameUnderAnchoredLines(documentXml, label) {
  const paragraphs = [...documentXml.matchAll(PARA_RE)];
  let out = "";
  let cursor = 0;
  let added = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const m = paragraphs[i];
    out += documentXml.slice(cursor, m.index) + m[0];
    cursor = m.index + m[0].length;
    if (!m[0].includes("assinatura_cliente")) continue;
    const nextText = i + 1 < paragraphs.length ? paragraphText(paragraphs[i + 1][0]) : "";
    if (nextText.startsWith("[[name]]")) continue;
    out += NAME_PARAGRAPH;
    added++;
  }
  out += documentXml.slice(cursor);
  console.log(`${label}: [[name]] inserido embaixo de ${added} linha(s)`);
  return out;
}

const KIT = "_KIT_PREV_CSS_ASSINATURA.docx";
{
  const kitPath = path.join("templates-assinatura", KIT);
  const zip = new PizZip(fs.readFileSync(kitPath));
  const xml = addNameUnderAnchoredLines(zip.file("word/document.xml").asText(), KIT);
  zip.file("word/document.xml", xml);
  fs.writeFileSync(kitPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
}

for (const name of TEMPLATES) {
  const src = path.join("templates", name);
  const dst = path.join("templates-assinatura", name.replace(/\.docx$/, "_ASSINATURA.docx"));
  const zip = new PizZip(fs.readFileSync(src));
  const doc = zip.file("word/document.xml").asText();
  const { xml, anchored } = addAnchors(doc, name);
  if (!anchored) {
    console.error(`ERRO: nenhuma âncora inserida em ${name} — conferir o template.`);
    process.exitCode = 1;
    continue;
  }
  zip.file("word/document.xml", xml);
  fs.writeFileSync(dst, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`  → ${dst}`);
}
