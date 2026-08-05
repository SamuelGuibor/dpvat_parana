// Integração leve com Google Sheets (sem dependência nova): autentica com uma
// SERVICE ACCOUNT via JWT assinado localmente (RS256) e usa a REST API v4.
//
// Env vars necessárias (criar a service account no Google Cloud Console,
// habilitar a API do Sheets e COMPARTILHAR a planilha com o e-mail dela):
//   GOOGLE_SHEETS_CLIENT_EMAIL  → ex.: crm@projeto.iam.gserviceaccount.com
//   GOOGLE_SHEETS_PRIVATE_KEY   → chave privada PEM (com \n escapados)

import crypto from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function sheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Google Sheets não configurado (GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY).");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Falha na autenticação do Google Sheets: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Aceita o ID puro ou a URL completa da planilha. */
export function extractSpreadsheetId(idOrUrl: string): string {
  const m = idOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : idOrUrl.trim();
}

/**
 * Acrescenta uma linha ao final da aba indicada (cria valores como o usuário
 * digitaria — datas/números são interpretados pela planilha).
 */
export async function appendSheetRow(
  spreadsheetIdOrUrl: string,
  tabName: string | null | undefined,
  values: (string | number)[]
): Promise<void> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const token = await getAccessToken();
  const range = encodeURIComponent(tabName?.trim() ? `${tabName.trim()}!A1` : "A1");
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    }
  );
  if (!res.ok) {
    throw new Error(`Falha ao gravar na planilha: ${res.status} ${await res.text()}`);
  }
}
