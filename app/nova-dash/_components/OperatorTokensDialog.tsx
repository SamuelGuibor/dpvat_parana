"use client";

// Tokens do app (Claude Code) de um membro: gerar (o texto aparece UMA vez),
// listar e revogar. Só o Super Admin (manage_team) abre — ver
// app/_actions/team/operator-tokens.ts.

import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Loader2, Plus, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import {
    createOperatorToken,
    listOperatorTokens,
    revokeOperatorToken,
    type OperatorTokenDTO,
} from "@/app/_actions/team/operator-tokens";

function fmt(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default function OperatorTokensDialog({
    member,
    onClose,
}: {
    member: { id: string; name: string | null };
    onClose: () => void;
}) {
    const [tokens, setTokens] = useState<OperatorTokenDTO[] | null>(null);
    const [label, setLabel] = useState("Claude Code");
    const [busy, setBusy] = useState(false);
    const [fresh, setFresh] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const all = await listOperatorTokens();
            setTokens(all.filter((t) => t.userId === member.id));
        } catch {
            // Erro de server action chega mascarado em produção: mensagem própria.
            toast.error("Não foi possível carregar os tokens.");
            setTokens([]);
        }
    }, [member.id]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCreate() {
        setBusy(true);
        try {
            const res = await createOperatorToken(member.id, label);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setFresh(res.token);
            await load();
        } catch {
            toast.error("Falha ao gerar o token.");
        } finally {
            setBusy(false);
        }
    }

    async function handleRevoke(id: string) {
        setBusy(true);
        try {
            const res = await revokeOperatorToken(id);
            if (!res.ok) toast.error(res.error ?? "Falha ao revogar.");
            else toast.success("Token revogado.");
            await load();
        } catch {
            toast.error("Falha ao revogar o token.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-violet-600" />
                        Token do app — {member.name}
                    </DialogTitle>
                    <DialogDescription>
                        Liga o Claude Code desta pessoa à IA de operação do CRM. O que ela consegue fazer segue o cargo e as
                        permissões dela; o token dispensa a trava de IP. Guarde-o na variável de ambiente <b>CRM_OP_TOKEN</b> do
                        computador dela — nunca no repositório nem no .env do projeto.
                    </DialogDescription>
                </DialogHeader>

                {fresh && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-800">Copie agora: este token não aparece de novo.</p>
                        <div className="flex gap-2">
                            <code className="flex-1 text-[11px] break-all bg-white rounded-lg border px-2 py-1.5">{fresh}</code>
                            <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg"
                                onClick={() => {
                                    navigator.clipboard.writeText(fresh).then(
                                        () => toast.success("Token copiado."),
                                        () => toast.error("Não foi possível copiar."),
                                    );
                                }}
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        maxLength={80}
                        placeholder="Nome do token (ex.: notebook)"
                        className="flex-1 h-9 rounded-xl border border-gray-200 px-3 text-sm"
                    />
                    <Button size="sm" className="rounded-xl h-9" onClick={handleCreate} disabled={busy}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                        Gerar token
                    </Button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tokens === null ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                    ) : tokens.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-3">Nenhum token gerado.</p>
                    ) : (
                        tokens.map((t) => (
                            <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">
                                        {t.label}
                                        {t.revokedAt && <span className="ml-2 text-[11px] font-bold text-red-600">REVOGADO</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                        Criado {fmt(t.createdAt)} · Último uso {fmt(t.lastUsedAt)}
                                        {t.revokedAt ? ` · Revogado ${fmt(t.revokedAt)}` : ""}
                                    </p>
                                </div>
                                {!t.revokedAt && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-xl h-8 text-xs text-red-600 hover:bg-red-50"
                                        onClick={() => handleRevoke(t.id)}
                                        disabled={busy}
                                    >
                                        <ShieldOff className="w-3.5 h-3.5 mr-1" />
                                        Revogar
                                    </Button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
