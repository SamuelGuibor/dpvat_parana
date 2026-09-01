/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Gestão da equipe: lista de membros em cards (avatar, cargo, resumo de
// permissões) + editor de permissões agrupado por categoria. Só o ADMIN++
// (manage_team) altera cargos/permissões; os demais visualizam.

import { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/app/_shared/ui/select";
import { Badge } from "@/app/_shared/ui/badge";
import {
    UserPlus,
    Users,
    Shield,
    Crown,
    Trash2,
    Search,
    Star,
    Check,
    X,
    KeyRound,
    Loader2,
    RotateCcw,
    Globe,
    Columns3,
    Archive,
    MessageCircle,
    FileSignature,
    Briefcase,
    Lock,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

import { getAdmins } from "@/app/_actions/team/get-team";
import { UpdateRole } from "@/app/_actions/team/update-team";
import { createUser } from "@/app/_actions/users/create-user";
import { deleteAdmin } from "@/app/_actions/users/delete-user";
import { setUserPermissions } from "@/app/_actions/team/permissions";
import {
    PERMISSION_DEFS,
    PERMISSION_CATEGORIES,
    diffFromDefaults,
    parseOverrides,
    resolvePermissions,
    roleDefaults,
    isTeamRole,
    type PermissionMap,
    type PermissionCategory,
    type TeamRole,
} from "@/app/_shared/lib/permissions";
import { usePermissions } from "@/app/nova-dash/_components/PermissionsProvider";
import { cn } from "@/app/_shared/lib/utils";

interface CardDialogProps {
    open: boolean;
    onClose: () => void;
}

type Member = {
    id: string;
    name: string;
    cpf?: string;
    email?: string;
    role: string;
    avatar?: string;
    joinedAt?: string;
    /** Overrides de permissão gravados no banco (JSON parcial) — null = padrão do cargo. */
    permissions?: unknown;
};

const ROLES = [
    {
        value: "ADMIN++",
        label: "Super Admin",
        icon: Crown,
        chip: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900",
        avatar: "bg-gradient-to-br from-purple-500 to-fuchsia-600",
    },
    {
        value: "ADMIN+",
        label: "Admin Plus",
        icon: Shield,
        chip: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
        avatar: "bg-gradient-to-br from-blue-500 to-indigo-600",
    },
    {
        value: "ADMIN",
        label: "Administrador",
        icon: Star,
        chip: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-900",
        avatar: "bg-gradient-to-br from-cyan-500 to-teal-600",
    },
];

const CATEGORY_ICONS: Record<PermissionCategory, React.ElementType> = {
    "Kanban": Columns3,
    "Arquivados e pagamentos": Archive,
    "WhatsApp e IA": MessageCircle,
    "Documentos e contratos": FileSignature,
    "Gestão e equipe": Briefcase,
    "Segurança": Lock,
};

function roleConfig(role: string) {
    return ROLES.find((r) => r.value === role) || ROLES[2];
}

function initials(name: string) {
    return (name || "SN")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
}

/** Quantas permissões diferem do padrão do cargo (0 = padrão puro). */
function overrideCount(member: Member): number {
    if (!isTeamRole(member.role) || member.role === "ADMIN++") return 0;
    return Object.keys(parseOverrides(member.permissions)).length;
}

export default function TeamDialog({ open, onClose }: CardDialogProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [savedRoles, setSavedRoles] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    const { perms: myPerms } = usePermissions();
    const canManage = myPerms.manage_team;
    const [permTarget, setPermTarget] = useState<Member | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

    const [newMember, setNewMember] = useState({
        name: "",
        cpf: "",
        email: "",
        password: "",
        role: "ADMIN",
    });

    useEffect(() => {
        async function loadAdmins() {
            setFetching(true);
            try {
                const data = await getAdmins();
                const formatted: Member[] = data.map((item: any) => ({
                    id: item.id,
                    name: item.name || "Sem nome",
                    cpf: item.cpf || "",
                    email: item.email || "",
                    role: item.role,
                    permissions: item.permissions ?? null,
                    avatar: initials(item.name),
                    joinedAt: item.createdAt,
                }));
                setMembers(formatted);
                setSavedRoles(Object.fromEntries(formatted.map((m) => [m.id, m.role])));
            } catch (err) {
                console.error(err);
                toast.error("Erro ao carregar a equipe");
            } finally {
                setFetching(false);
            }
        }
        if (open) loadAdmins();
    }, [open]);

    const filteredMembers = members.filter(
        (member) =>
            member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.email?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const stats = {
        total: members.length,
        admins: members.filter((m) => m.role === "ADMIN").length,
        adminPlus: members.filter((m) => m.role === "ADMIN+").length,
        superAdmins: members.filter((m) => m.role === "ADMIN++").length,
    };

    const dirtyRoles = members.filter((m) => savedRoles[m.id] && savedRoles[m.id] !== m.role);

    function handleRoleChange(id: string, newRole: string) {
        setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
    }

    async function handleAddMember() {
        if (!newMember.name || !newMember.email || !newMember.password) {
            toast.error("Preencha nome, email e senha!");
            return;
        }
        try {
            const created = await createUser(newMember);
            const member: Member = {
                id: created.id,
                name: created.name || "Sem nome",
                email: created.email,
                role: created.role,
                cpf: created.cpf || "",
                avatar: initials(created.name || "SN"),
            };
            setMembers((prev) => [...prev, member]);
            setSavedRoles((prev) => ({ ...prev, [member.id]: member.role }));
            setNewMember({ name: "", email: "", password: "", role: "ADMIN", cpf: "" });
            setShowAddForm(false);
            toast.success("Membro criado!");
        } catch (err) {
            console.error(err);
            toast.error("Erro ao criar membro");
        }
    }

    async function handleDeleteMember(member: Member) {
        try {
            await deleteAdmin(member.id);
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
            toast.success(`${member.name} removido`);
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Erro ao remover");
        } finally {
            setDeleteTarget(null);
        }
    }

    // Salva só os cargos que realmente mudaram (antes disparava um update por
    // membro, mesmo intacto).
    async function handleSave() {
        if (!dirtyRoles.length) {
            onClose();
            return;
        }
        try {
            setLoading(true);
            await Promise.all(dirtyRoles.map((m) => UpdateRole({ id: m.id, role: m.role })));
            setSavedRoles(Object.fromEntries(members.map((m) => [m.id, m.role])));
            toast.success(
                dirtyRoles.length === 1
                    ? "1 cargo atualizado!"
                    : `${dirtyRoles.length} cargos atualizados!`,
            );
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[1100px] max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0 max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-zinc-800">
                    <DialogHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
                                    <Users className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-black">Equipe</DialogTitle>
                                    <DialogDescription>
                                        {canManage
                                            ? "Gerencie cargos e permissões de cada membro"
                                            : "Membros da equipe e seus cargos"}
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Stats compactos */}
                                <div className="hidden md:flex items-center gap-1.5 mr-2">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">
                                        {stats.total} membros
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                                        {stats.superAdmins} Super
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                        {stats.adminPlus} Plus
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                                        {stats.admins} Admin
                                    </span>
                                </div>
                                {canManage && (
                                    <Button
                                        onClick={() => setShowAddForm(!showAddForm)}
                                        className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl"
                                    >
                                        <UserPlus className="w-4 h-4 mr-2" />
                                        Adicionar
                                    </Button>
                                )}
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Form de criação */}
                    <AnimatePresence>
                        {showAddForm && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-4 rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                        {[
                                            { key: "name", label: "Nome completo", type: "text" },
                                            { key: "email", label: "Email", type: "text" },
                                            { key: "cpf", label: "CPF", type: "text" },
                                            { key: "password", label: "Senha", type: "password" },
                                        ].map((f) => (
                                            <div key={f.key}>
                                                <label className="text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1 block">
                                                    {f.label}
                                                </label>
                                                <input
                                                    type={f.type}
                                                    value={(newMember as any)[f.key]}
                                                    onChange={(e) =>
                                                        setNewMember({ ...newMember, [f.key]: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        ))}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 dark:text-zinc-400 mb-1 block">
                                                Cargo
                                            </label>
                                            <Select
                                                value={newMember.role}
                                                onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                                            >
                                                <SelectTrigger className="rounded-xl">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROLES.map((r) => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <Button size="sm" onClick={handleAddMember} className="bg-green-600 hover:bg-green-700 rounded-xl">
                                            <Check className="w-4 h-4 mr-1.5" />
                                            Confirmar
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="rounded-xl"
                                            onClick={() => {
                                                setShowAddForm(false);
                                                setNewMember({ name: "", email: "", password: "", role: "ADMIN", cpf: "" });
                                            }}
                                        >
                                            <X className="w-4 h-4 mr-1.5" />
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Busca */}
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            placeholder="Buscar por nome ou email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Lista de membros */}
                <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/60 dark:bg-zinc-950/40">
                    {fetching ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-16">Nenhum membro encontrado.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {filteredMembers.map((member) => {
                                const cfg = roleConfig(member.role);
                                const Icon = cfg.icon;
                                const nOverrides = overrideCount(member);
                                const roleDirty = savedRoles[member.id] && savedRoles[member.id] !== member.role;
                                return (
                                    <div
                                        key={member.id}
                                        className={cn(
                                            "flex flex-wrap items-center gap-3 rounded-2xl border bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm transition-colors",
                                            roleDirty
                                                ? "border-amber-300 dark:border-amber-800"
                                                : "border-gray-100 dark:border-zinc-800",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0",
                                                cfg.avatar,
                                            )}
                                        >
                                            {member.avatar}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 truncate">
                                                {member.name}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                                                {member.email}
                                            </p>
                                        </div>

                                        {/* Resumo de permissões */}
                                        {member.role === "ADMIN++" ? (
                                            <Badge className="bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900 rounded-full">
                                                Acesso total
                                            </Badge>
                                        ) : nOverrides > 0 ? (
                                            <Badge className="bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 rounded-full">
                                                {nOverrides} {nOverrides === 1 ? "ajuste" : "ajustes"}
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-gray-100 text-gray-500 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 rounded-full">
                                                Padrão do cargo
                                            </Badge>
                                        )}

                                        {/* Cargo */}
                                        <div className="w-[170px]">
                                            <Select
                                                value={member.role}
                                                disabled={!canManage}
                                                onValueChange={(value) => handleRoleChange(member.id, value)}
                                            >
                                                <SelectTrigger className={cn("rounded-xl border text-xs font-bold h-9", cfg.chip)}>
                                                    <SelectValue>
                                                        <span className="flex items-center gap-1.5">
                                                            <Icon className="w-3.5 h-3.5" />
                                                            {cfg.label}
                                                        </span>
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROLES.map((r) => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            <span className="flex items-center gap-1.5">
                                                                <r.icon className="w-3.5 h-3.5" />
                                                                {r.label}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Ações */}
                                        {canManage && (
                                            <div className="flex items-center gap-1">
                                                {member.role !== "ADMIN++" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="rounded-xl h-9 text-xs font-bold"
                                                        onClick={() => setPermTarget(member)}
                                                    >
                                                        <KeyRound className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                                                        Permissões
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-xl h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                    title="Remover da equipe"
                                                    onClick={() => setDeleteTarget(member)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                        {canManage && dirtyRoles.length > 0
                            ? `${dirtyRoles.length} ${dirtyRoles.length === 1 ? "cargo alterado" : "cargos alterados"} sem salvar`
                            : ""}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={onClose}>
                            {canManage ? "Cancelar" : "Fechar"}
                        </Button>
                        {canManage && (
                            <Button className="rounded-xl" onClick={handleSave} disabled={loading || dirtyRoles.length === 0}>
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    "Salvar cargos"
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {permTarget && (
                    <PermissionsEditorDialog
                        member={permTarget}
                        onClose={() => setPermTarget(null)}
                        onSaved={(id, overrides) =>
                            setMembers((prev) =>
                                prev.map((m) => (m.id === id ? { ...m, permissions: overrides } : m)),
                            )
                        }
                    />
                )}

                {/* Confirmação de remoção */}
                {deleteTarget && (
                    <Dialog open onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
                        <DialogContent className="max-w-sm">
                            <DialogHeader>
                                <DialogTitle>Remover {deleteTarget.name}?</DialogTitle>
                                <DialogDescription>
                                    O acesso à dashboard é revogado na hora. Esta ação não pode ser desfeita.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" className="rounded-xl" onClick={() => setDeleteTarget(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="rounded-xl bg-red-600 hover:bg-red-700"
                                    onClick={() => handleDeleteMember(deleteTarget)}
                                >
                                    <Trash2 className="w-4 h-4 mr-1.5" />
                                    Remover
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Toggle estilo switch (não existe switch no kit de UI do projeto). */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                checked ? "bg-blue-600" : "bg-gray-200 dark:bg-zinc-700",
            )}
        >
            <span
                className={cn(
                    "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform",
                    checked ? "translate-x-[22px]" : "translate-x-[3px]",
                )}
                style={{ height: 18, width: 18 }}
            />
        </button>
    );
}

// Editor de permissões individuais: mostra o mapa resolvido (padrão do cargo
// + overrides) agrupado por categoria e grava só o que difere do padrão.
// ADMIN++ não passa por aqui (tem acesso total sempre).
function PermissionsEditorDialog({
    member,
    onClose,
    onSaved,
}: {
    member: Member;
    onClose: () => void;
    onSaved: (id: string, overrides: unknown) => void;
}) {
    const role: TeamRole = isTeamRole(member.role) ? member.role : "ADMIN";
    const defaults = useMemo(() => roleDefaults(role), [role]);
    const [edited, setEdited] = useState<PermissionMap>(() =>
        resolvePermissions(role, parseOverrides(member.permissions)),
    );
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState("");

    const cfg = roleConfig(member.role);
    const RoleIcon = cfg.icon;

    const editableDefs = PERMISSION_DEFS.filter((d) => d.key !== "manage_team");
    const q = query.trim().toLowerCase();
    const visibleDefs = q
        ? editableDefs.filter(
              (d) =>
                  d.label.toLowerCase().includes(q) ||
                  d.description.toLowerCase().includes(q) ||
                  d.category.toLowerCase().includes(q),
          )
        : editableDefs;

    const grouped = PERMISSION_CATEGORIES.map((cat) => ({
        category: cat,
        defs: visibleDefs.filter((d) => d.category === cat),
    })).filter((g) => g.defs.length > 0);

    const activeCount = editableDefs.filter((d) => edited[d.key]).length;
    const changedCount = editableDefs.filter((d) => edited[d.key] !== defaults[d.key]).length;

    async function handleSavePermissions() {
        setSaving(true);
        try {
            const overrides = diffFromDefaults(role, edited);
            await setUserPermissions(member.id, overrides);
            onSaved(member.id, overrides);
            toast.success(`Permissões de ${member.name} atualizadas!`);
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || "Erro ao salvar permissões");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-zinc-800">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div
                                className={cn(
                                    "w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0",
                                    cfg.avatar,
                                )}
                            >
                                {initials(member.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <DialogTitle className="text-lg font-black truncate">
                                    Permissões — {member.name}
                                </DialogTitle>
                                <DialogDescription className="flex items-center gap-2">
                                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold", cfg.chip)}>
                                        <RoleIcon className="w-3 h-3" />
                                        {cfg.label}
                                    </span>
                                    <span className="text-xs">
                                        {activeCount} de {editableDefs.length} ativas
                                        {changedCount > 0 && ` · ${changedCount} fora do padrão do cargo`}
                                    </span>
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            placeholder="Buscar permissão..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Grupos */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 bg-gray-50/60 dark:bg-zinc-950/40">
                    {grouped.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-10">Nenhuma permissão bate com a busca.</p>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {grouped.map((group) => {
                                const CatIcon = CATEGORY_ICONS[group.category] ?? Globe;
                                return (
                                    <div key={group.category}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <CatIcon className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                                            <h4 className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                                                {group.category}
                                            </h4>
                                        </div>
                                        <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-gray-50 dark:divide-zinc-800/60 overflow-hidden">
                                            {group.defs.map((def) => {
                                                const changed = edited[def.key] !== defaults[def.key];
                                                return (
                                                    <div
                                                        key={def.key}
                                                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                                                                {def.label}
                                                                {changed && (
                                                                    <span
                                                                        title="Diferente do padrão do cargo"
                                                                        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
                                                                    />
                                                                )}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-zinc-400">
                                                                {def.description}
                                                            </p>
                                                        </div>
                                                        <Toggle
                                                            checked={edited[def.key]}
                                                            onChange={(v) =>
                                                                setEdited((prev) => ({ ...prev, [def.key]: v }))
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-xs text-gray-500"
                        disabled={changedCount === 0 || saving}
                        onClick={() => setEdited({ ...defaults, manage_team: false })}
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Restaurar padrão do cargo
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button className="rounded-xl" onClick={handleSavePermissions} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar permissões"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
