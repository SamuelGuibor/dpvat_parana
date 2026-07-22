"use client";

// Último recurso: erro no próprio layout raiz. Precisa renderizar <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "1rem",
            background: "#f9fafb",
            color: "#111827",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Algo deu errado</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#6b7280", maxWidth: 420 }}>
            Ocorreu um erro inesperado na Paraná Seguros. Tente novamente em instantes.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "#9ca3af" }}>
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "2rem",
              borderRadius: "0.75rem",
              background: "#2563eb",
              color: "#fff",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
