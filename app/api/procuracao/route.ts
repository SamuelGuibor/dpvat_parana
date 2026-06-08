import { gerarProcuracaoById } from "@/app/_utils/gerarProcuracaoById";
import mammoth from "mammoth";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image as PDFImage, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
    page: { paddingVertical: 72, paddingHorizontal: 72, fontSize: 11, fontFamily: "Helvetica" },
    heading1: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 10 },
    heading2: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 8 },
    paragraph: { marginBottom: 6, textAlign: "justify", lineHeight: 1.5 },
    bold: { fontFamily: "Helvetica-Bold" },
    image: { width: "100%", marginBottom: 10 },
    spacer: { marginBottom: 4 },
});

interface TextRun { text: string; bold: boolean; }
interface Block {
    type: "paragraph" | "heading" | "image" | "spacer";
    runs?: TextRun[];
    level?: number;
    align?: string;
    src?: string;
}

function parseHtmlToBlocks(html: string): Block[] {
    const blocks: Block[] = [];
    const blockPattern = /<(p|h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi;
    const imgPattern = /<img[^>]+src="(data:[^"]+)"[^>]*>/i;

    let m: RegExpExecArray | null;
    while ((m = blockPattern.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const attrs = m[2];
        const inner = m[3];

        const imgM = imgPattern.exec(inner);
        if (imgM) {
            blocks.push({ type: "image", src: imgM[1] });
            continue;
        }

        const alignM = /text-align:\s*(\w+)/i.exec(attrs);
        const align = alignM ? alignM[1] : "left";
        const runs = parseRuns(inner);

        if (runs.length === 0) {
            blocks.push({ type: "spacer" });
            continue;
        }

        if (tag === "p") {
            blocks.push({ type: "paragraph", runs, align });
        } else {
            blocks.push({ type: "heading", runs, level: parseInt(tag[1]), align });
        }
    }

    return blocks;
}

function parseRuns(html: string): TextRun[] {
    const runs: TextRun[] = [];
    const tokens = html.replace(/<br\s*\/?>/gi, "\n").split(/(<[^>]+>)/);
    let bold = false;
    let buf = "";

    function flush() {
        const text = buf
            .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        if (text) runs.push({ text, bold });
        buf = "";
    }

    for (const tok of tokens) {
        if (!tok.startsWith("<")) { buf += tok; continue; }
        const tag = tok.replace(/<\/?/, "").replace(/>.*/, "").trim().toLowerCase();
        flush();
        if (tag === "strong" || tag === "b") bold = true;
        else if (tag === "/strong" || tag === "/b") bold = false;
    }
    flush();
    return runs;
}

async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });
    const blocks = parseHtmlToBlocks(html);

    const docElement = React.createElement(
        Document,
        null,
        React.createElement(
            Page,
            { size: "A4", style: styles.page },
            ...blocks.map((block, i) => {
                if (block.type === "spacer") {
                    return React.createElement(View, { key: i, style: styles.spacer });
                }

                if (block.type === "image" && block.src) {
                    try {
                        return React.createElement(PDFImage, { key: i, src: block.src, style: styles.image });
                    } catch {
                        return React.createElement(View, { key: i });
                    }
                }

                if (block.type === "heading") {
                    const s = block.level === 1 ? styles.heading1 : styles.heading2;
                    const text = (block.runs ?? []).map(r => r.text).join("");
                    return React.createElement(Text, { key: i, style: s }, text);
                }

                // paragraph with mixed bold/normal runs
                const align = block.align === "center" ? "center"
                    : block.align === "right" ? "right"
                    : "justify";

                return React.createElement(
                    Text,
                    { key: i, style: { ...styles.paragraph, textAlign: align } },
                    ...(block.runs ?? []).map((run, j) =>
                        React.createElement(
                            Text,
                            { key: j, style: run.bold ? styles.bold : undefined },
                            run.text
                        )
                    )
                );
            })
        )
    );

    return await renderToBuffer(docElement);
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
