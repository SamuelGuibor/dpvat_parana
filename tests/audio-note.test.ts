import { describe, expect, it } from "vitest";
import {
  AUDIO_NOTE_MAX_CHARS,
  buildAudioTranscriptNote,
} from "@/app/_shared/utils/audio-note";

// Nota interna da transferência do bot com a transcrição dos áudios do cliente
// (D11): quem faz a triagem lê o que o cliente disse sem precisar ouvir.

const PREFIX = "🎙️ Áudio do cliente (transcrição):";

describe("buildAudioTranscriptNote", () => {
  it("sem áudio transcrito devolve null (a nota sai como antes)", () => {
    expect(buildAudioTranscriptNote([])).toBeNull();
    expect(buildAudioTranscriptNote([{ transcript: null }, { transcript: "   " }, { transcript: undefined }])).toBeNull();
  });

  it("uma transcrição curta vira uma linha entre aspas", () => {
    expect(buildAudioTranscriptNote([{ transcript: "Quero saber do meu processo" }])).toBe(
      `${PREFIX} "Quero saber do meu processo"`,
    );
  });

  it("transcrição longa é cortada em 600 caracteres com reticências", () => {
    const note = buildAudioTranscriptNote([{ transcript: "a".repeat(2000) }]);
    const quoted = note!.slice(PREFIX.length + 2, -1);
    expect(quoted).toHaveLength(AUDIO_NOTE_MAX_CHARS);
    expect(quoted.endsWith("…")).toBe(true);
    expect(note!.endsWith('…"')).toBe(true);
  });

  it("ignora itens sem transcrição e mantém a ordem do lote", () => {
    const note = buildAudioTranscriptNote([
      { transcript: "primeiro" },
      { transcript: null },
      { transcript: "segundo" },
    ]);
    expect(note).toBe(`${PREFIX} "primeiro"\n${PREFIX} "segundo"`);
  });

  it("quebra de linha da transcrição vira espaço", () => {
    expect(buildAudioTranscriptNote([{ transcript: "linha um\n\nlinha  dois " }])).toBe(
      `${PREFIX} "linha um linha dois"`,
    );
  });

  it("não parte emoji ao cortar", () => {
    const note = buildAudioTranscriptNote([{ transcript: "😀".repeat(10) }], 5)!;
    expect(note).toBe(`${PREFIX} "😀😀😀😀…"`);
  });

  it("acima do teto de itens fica com os mais recentes e avisa quantos ficaram de fora", () => {
    const items = ["um", "dois", "três", "quatro"].map((t) => ({ transcript: t }));
    expect(buildAudioTranscriptNote(items, 600, 2)).toBe(
      `(+2 áudios anteriores só na conversa)\n${PREFIX} "três"\n${PREFIX} "quatro"`,
    );
    expect(buildAudioTranscriptNote(items.slice(0, 3), 600, 2)).toBe(
      `(+1 áudio anterior só na conversa)\n${PREFIX} "dois"\n${PREFIX} "três"`,
    );
  });
});
