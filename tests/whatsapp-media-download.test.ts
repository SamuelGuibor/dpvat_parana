import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Download de mídia recebida (downloadMediaToS3): roda dentro do webhook
// (maxDuration 120, bot inline), então cada fetch da Meta tem teto — 10 s na
// metadata e 30 s no binário — e a falha volta null (a mensagem é gravada sem
// anexo) passando pelo reportCriticalError (com o contactId, que liga o Log
// critical_error à conversa). Sem rede, S3 nem banco: tudo
// mockado; o AbortSignal.timeout é interceptado para disparar o "timeout" na
// hora, sem esperar 10/30 s de relógio.

const mocks = vi.hoisted(() => ({
  getCreds: vi.fn(),
  s3Send: vi.fn(),
  reportCriticalError: vi.fn(),
}));

vi.mock("@/app/_shared/lib/whatsapp/numbers", () => ({ getCreds: mocks.getCreds }));
vi.mock("@/app/_shared/lib/report-error", () => ({ reportCriticalError: mocks.reportCriticalError }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.s3Send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { downloadMediaToS3 } from "@/app/_shared/lib/whatsapp/client";

const CREDS = { token: "tok", apiVersion: "v21.0", phoneNumberId: "pn", wabaId: "waba" };

type FetchInit = { signal?: AbortSignal };

/** Fetch que nunca responde sozinho: só rejeita quando o sinal aborta (igual ao fetch real). */
function hangingFetch(_url: string, init?: FetchInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

let timers: { ms: number; ctrl: AbortController }[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
  timers = [];
  mocks.getCreds.mockReset().mockResolvedValue(CREDS);
  mocks.s3Send.mockReset().mockResolvedValue({});
  mocks.reportCriticalError.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const ctrl = new AbortController();
    timers.push({ ms, ctrl });
    return ctrl.signal;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Simula o estouro do teto do fetch de índice `i` (0 = metadata, 1 = binário). */
function fireTimeout(i: number) {
  timers[i].ctrl.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
}

describe("downloadMediaToS3", () => {
  it("caminho feliz: teto de 10 s na metadata e 30 s no binário, sobe pro S3", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://meta/bin", mime_type: "image/jpeg" })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));

    const out = await downloadMediaToS3("m1", "c1", undefined, "num1");

    expect(out?.mimeType).toBe("image/jpeg");
    expect(out?.key).toMatch(/^whatsapp\/c1\/\d+-midia\.jpeg$/);
    expect(timers.map((t) => t.ms)).toEqual([10_000, 30_000]);
    // Cada fetch recebe o SEU sinal (o do binário também aborta o arrayBuffer).
    expect((fetchMock.mock.calls[0][1] as FetchInit).signal).toBe(timers[0].ctrl.signal);
    expect((fetchMock.mock.calls[1][1] as FetchInit).signal).toBe(timers[1].ctrl.signal);
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    expect(mocks.getCreds).toHaveBeenCalledWith("num1");
    expect(mocks.reportCriticalError).not.toHaveBeenCalled();
  });

  it("metadata pendurada: devolve null no timeout, sem baixar o binário", async () => {
    fetchMock.mockImplementation(hangingFetch);

    const pending = downloadMediaToS3("m2", "c1", undefined, "num1");
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    fireTimeout(0);

    await expect(pending).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.reportCriticalError).toHaveBeenCalledTimes(1);
    const [context, err] = mocks.reportCriticalError.mock.calls[0];
    expect(context).toBe("whatsapp.downloadMediaToS3 m2");
    expect((err as DOMException).name).toBe("TimeoutError");
  });

  it("binário pendurado: devolve null no timeout de 30 s, sem subir nada pro S3", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://meta/bin", mime_type: "application/pdf" })))
      .mockImplementationOnce(hangingFetch);

    const pending = downloadMediaToS3("m3", "c1", "laudo.pdf", "num1");
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect(timers[1].ms).toBe(30_000);
    fireTimeout(1);

    await expect(pending).resolves.toBeNull();
    expect(mocks.s3Send).not.toHaveBeenCalled();
    // O contato vai junto: o Log critical_error fica ligado à conversa.
    expect(mocks.reportCriticalError).toHaveBeenCalledWith("whatsapp.downloadMediaToS3 m3", expect.anything(), { contactId: "c1" });
  });

  it("número sem credencial (inativo): null sem chamar a Meta nem cair no default", async () => {
    mocks.getCreds.mockResolvedValue(null);

    await expect(downloadMediaToS3("m4", "c1", undefined, "inativo")).resolves.toBeNull();
    expect(mocks.getCreds).toHaveBeenCalledWith("inativo");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.reportCriticalError).toHaveBeenCalledTimes(1);
  });
});
