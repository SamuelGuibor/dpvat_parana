import { gerarProcuracaoById } from "@/app/_utils/gerarProcuracaoById";
import mammoth from "mammoth";
import PDFDocument from "pdfkit";

interface TextRun {
    text: string;
    bold: boolean;
    italic: boolean;
}

interface Block {
    type: "paragraph" | "heading" | "image";
    runs?: TextRun[];
    level?: number;
    src?: string;
    align?: string;
}

function parseHtmlToBlocks(html: string): Block[] {
    const blocks: Block[] = [];

    // extract block-level elements
    const blockPattern = /<(p|h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi;
    const imgPattern = /<img[^>]+src="(data:[^"]+)"[^>]*>/i;

    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(html)) !== null) {
        const tag = match[1].toLowerCase();
        const attrs = match[2];
        const inner = match[3];

        // check for embedded image inside this block
        const imgMatch = imgPattern.exec(inner);
        if (imgMatch) {
            blocks.push({ type: "image", src: imgMatch[1] });
            continue;
        }

        const alignMatch = /text-align:\s*(\w+)/i.exec(attrs);
        const align = alignMatch ? alignMatch[1] : "left";

        const runs = parseInlineRuns(inner);
        if (runs.length === 0) continue;

        if (tag === "p") {
            blocks.push({ type: "paragraph", runs, align });
        } else {
            const level = parseInt(tag[1]);
            blocks.push({ type: "heading", runs, level, align });
        }
    }

    // also pick up standalone images not inside p/h tags
    const standaloneImg = /<img[^>]+src="(data:[^"]+)"[^>]*>/gi;
    let imgMatch2: RegExpExecArray | null;
    while ((imgMatch2 = standaloneImg.exec(html)) !== null) {
        // avoid duplicates already captured above
        const alreadyAdded = blocks.some(b => b.type === "image" && b.src === imgMatch2![1]);
        if (!alreadyAdded) {
            blocks.push({ type: "image", src: imgMatch2[1] });
        }
    }

    return blocks;
}

function parseInlineRuns(html: string): TextRun[] {
    const runs: TextRun[] = [];
    const stripped = html.replace(/<br\s*\/?>/gi, "\n");

    // tokenise into text and tags
    const tokens = stripped.split(/(<[^>]+>)/);
    let bold = false;
    let italic = false;
    let buf = "";

    function flush() {
        const text = buf.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        if (text) runs.push({ text, bold, italic });
        buf = "";
    }

    for (const token of tokens) {
        if (!token.startsWith("<")) {
            buf += token;
            continue;
        }
        const tag = token.replace(/<\/?/, "").replace(/>.*/, "").trim().toLowerCase();
        flush();
        if (tag === "strong" || tag === "b") bold = true;
        else if (tag === "/strong" || tag === "/b") bold = false;
        else if (tag === "em" || tag === "i") italic = true;
        else if (tag === "/em" || tag === "/i") italic = false;
    }
    flush();
    return runs;
}

async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });
    const blocks = parseHtmlToBlocks(html);

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ margin: 72, size: "A4" });
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const pageWidth = doc.page.width - 144; // margin both sides

        for (const block of blocks) {
            if (block.type === "image" && block.src) {
                try {
                    const base64Data = block.src.split(",")[1];
                    const imgBuf = Buffer.from(base64Data, "base64");
                    doc.image(imgBuf, { fit: [pageWidth, 120], align: "center" });
                    doc.moveDown(0.5);
                } catch {
                    // skip unrenderable images
                }
                continue;
            }

            const runs = block.runs ?? [];
            const rawText = runs.map(r => r.text).join("");
            if (!rawText.trim()) {
                doc.moveDown(0.3);
                continue;
            }

            if (block.type === "heading") {
                const fontSize = block.level === 1 ? 16 : block.level === 2 ? 14 : 12;
                doc.fontSize(fontSize).font("Helvetica-Bold");
                doc.text(rawText, { align: (block.align as "left" | "center" | "right" | "justify") ?? "left" });
                doc.fontSize(11).font("Helvetica");
                doc.moveDown(0.5);
                continue;
            }

            // paragraph — render run by run to preserve bold/italic
            const align = (block.align as "left" | "center" | "right" | "justify") ?? "justify";

            // pdfkit doesn't do mixed fonts per line easily; detect dominant style
            const hasBold = runs.some(r => r.bold);
            const hasItalic = runs.some(r => r.italic);
            const font = hasBold
                ? (hasItalic ? "Helvetica-BoldOblique" : "Helvetica-Bold")
                : (hasItalic ? "Helvetica-Oblique" : "Helvetica");

            doc.font(font).fontSize(11).text(rawText, { align });
            doc.moveDown(0.3);
        }

        doc.end();
    });
}

export async function POST(req: Request) {
    try {
        const { id, type, template } = await req.json();
        const docxBuffer = await gerarProcuracaoById(id, type, template);
        const pdfBuffer = await convertDocxToPdf(Buffer.from(docxBuffer));

        return new Response(new Uint8Array(pdfBuffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="procuracao.pdf"',
            },
        });
    } catch (err) {
        console.error("[procuracao] ERRO:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
