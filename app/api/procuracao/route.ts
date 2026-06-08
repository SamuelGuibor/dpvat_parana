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

    fs.writeFileSync(tmpDocx, docxBuffer);

    const soffice = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;
    await execAsync(`${soffice} --headless --convert-to pdf --outdir "${tmpDir}" "${tmpDocx}"`);

    const pdfBuffer = fs.readFileSync(expectedPdf);

    try { fs.unlinkSync(tmpDocx); } catch { /* ignore */ }
    try { fs.unlinkSync(expectedPdf); } catch { /* ignore */ }

    return pdfBuffer;
}

export async function POST(req: Request) {
    const { id, type, template } = await req.json();

    const docxBuffer = await gerarProcuracaoById(id, type, template);
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
}
