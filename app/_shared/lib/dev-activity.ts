// Peso de um log de DESENVOLVIMENTO (dev_commit) no placar de produtividade.
//
// Decisão do dono do sistema: o trabalho de código conta pelo nº de ARQUIVOS
// alterados no commit (metadata.files), e não como 1 ponto por commit. Assim um
// commit de 65 arquivos vale 65 no ranking — dando peso proporcional ao esforço
// de dev. As linhas +/− ficam no detalhe do log; a BASE do placar é arquivos.
//
// Como as métricas contam linhas da tabela Log (1 por registro), este módulo
// centraliza o "delta" a aplicar: para cada dev_commit, somamos (arquivos − 1)
// à contagem crua, transformando o "1 por commit" em "arquivos por commit".

export const DEV_COMMIT_ACTION = "dev_commit";

/** Nº de arquivos de um dev_commit (mínimo 1 se o metadata não trouxer). */
export function devCommitFiles(metadata: unknown): number {
  if (metadata && typeof metadata === "object" && "files" in metadata) {
    const f = Number((metadata as { files?: unknown }).files);
    if (Number.isFinite(f) && f > 0) return Math.floor(f);
  }
  return 1;
}

/**
 * Quanto SOMAR a uma contagem crua de logs para que os dev_commits passem a
 * contar por arquivos em vez de 1 cada: Σ(arquivos − 1).
 * `logs` = os dev_commits (com metadata) já filtrados pela janela desejada.
 */
export function devFilesDelta(logs: { metadata: unknown }[]): number {
  let delta = 0;
  for (const l of logs) delta += devCommitFiles(l.metadata) - 1;
  return delta;
}

/** Peso total (nº de arquivos somados) de um conjunto de dev_commits. */
export function devFilesTotal(logs: { metadata: unknown }[]): number {
  let total = 0;
  for (const l of logs) total += devCommitFiles(l.metadata);
  return total;
}
