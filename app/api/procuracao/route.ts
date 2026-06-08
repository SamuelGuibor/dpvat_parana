import { gerarProcuracaoById } from "@/app/_utils/gerarProcuracaoById";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execAsync = promisify(exec);

async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tmpDocx = path.join(tmpDir, `proc_${uid}.docx`);
    const expectedPdf = path.join(tmpDir, `proc_${uid}.pdf`);

    console.log("[procuracao] tmpDir:", tmpDir);
    console.log("[procuracao] tmpDocx:", tmpDocx);
    console.log("[procuracao] docxBuffer size:", docxBuffer.length);

    fs.writeFileSync(tmpDocx, docxBuffer);
    console.log("[procuracao] DOCX escrito em disco");

    // tenta encontrar soffice no PATH ou no caminho padrão do Windows
    const sofficeCandidates = [
        "soffice",
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    ];

    let sofficeCmd = "soffice";
    for (const candidate of sofficeCandidates) {
        try {
            await execAsync(`"${candidate}" --version`);
            sofficeCmd = `"${candidate}"`;
            console.log("[procuracao] soffice encontrado:", candidate);
            break;
        } catch {
            console.log("[procuracao] soffice não encontrado em:", candidate);
        }
    }

    const cmd = `${sofficeCmd} --headless --convert-to pdf --outdir "${tmpDir}" "${tmpDocx}"`;
    console.log("[procuracao] executando:", cmd);

    const { stdout, stderr } = await execAsync(cmd);
    console.log("[procuracao] stdout:", stdout);
    if (stderr) console.error("[procuracao] stderr:", stderr);

    const pdfExists = fs.existsSync(expectedPdf);
    console.log("[procuracao] PDF existe?", pdfExists, expectedPdf);

    if (!pdfExists) {
        // lista arquivos no tmpDir para diagnóstico
        const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`proc_${uid}`));
        console.error("[procuracao] arquivos gerados:", files);
        throw new Error(`LibreOffice não gerou o PDF. Arquivos: ${files.join(", ")}`);
    }

    const pdfBuffer = fs.readFileSync(expectedPdf);
    console.log("[procuracao] pdfBuffer size:", pdfBuffer.length);

    try { fs.unlinkSync(tmpDocx); } catch { /* ignore */ }
    try { fs.unlinkSync(expectedPdf); } catch { /* ignore */ }

    return pdfBuffer;
}

export async function POST(req: Request) {
    console.log("[procuracao] POST iniciado");
    try {
        const { id, type, template } = await req.json();
        console.log("[procuracao] id:", id, "type:", type, "template:", template);

        const docxBuffer = await gerarProcuracaoById(id, type, template);
        console.log("[procuracao] DOCX gerado, size:", Buffer.from(docxBuffer).length);

        const pdfBuffer = await convertDocxToPdf(Buffer.from(docxBuffer));

        return new Response(
            new Uint8Array(pdfBuffer),
            {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": 'attachment; filename="procuracao.pdf"',
                },
            }
        );
    } catch (err) {
        console.error("[procuracao] ERRO:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
