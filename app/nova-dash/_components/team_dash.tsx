/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/app/_shared/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/app/_shared/ui/select";
import { Badge } from "@/app/_shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/_shared/ui/tabs";
import {
    UserPlus,
    Users,
    Shield,
    Crown,
    Mail,
    Trash2,
    Search,
    Star,
    Check,
    X,
    User,
    KeyRound,
    Loader2
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
    diffFromDefaults,
    parseOverrides,
    resolvePermissions,
    isTeamRole,
    type PermissionMap,
    type TeamRole,
} from "@/app/_shared/lib/permissions";
import { usePermissions } from "@/app/nova-dash/_components/PermissionsProvider";
import { Checkbox } from "@/app/_shared/ui/checkbox";

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
    { value: "ADMIN++", label: "Super Admin", color: "bg-purple-100 text-purple-700 border-purple-300", icon: Crown },
    { value: "ADMIN+", label: "Admin Plus", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Shield },
    { value: "ADMIN", label: "Administrador", color: "bg-cyan-100 text-cyan-700 border-cyan-300", icon: Star },
];

export default function TeamDialog({ open, onClose }: CardDialogProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    // Só o ADMIN++ gerencia cargos/permissões; os demais só visualizam a equipe.
    const { perms: myPerms } = usePermissions();
    const canManage = myPerms.manage_team;
    const [permTarget, setPermTarget] = useState<Member | null>(null);

    const [newMember, setNewMember] = useState({
        name: "",
        cpf: "",
        email: "",
        password: "",
        role: "ADMIN"
    });

    // 🔥 LOAD ADMINS
    useEffect(() => {
        async function loadAdmins() {
            try {
                const data = await getAdmins();

                const formatted = data.map((item: any) => ({
                    id: item.id,
                    name: item.name || "Sem nome",
                    cpf: item.cpf || "",
                    email: item.email || "",
                    role: item.role,
                    permissions: item.permissions ?? null,
                    avatar: (item.name || "SN")
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase()
                        .substring(0, 2),
                    joinedAt: item.createdAt,
                }));

                setMembers(formatted);
            } catch (err) {
                console.error(err);
                toast.error("Erro ao carregar administradores");
            }
        }

        if (open) loadAdmins();
    }, [open]);

    const getRoleConfig = (role: string) => {
        return ROLES.find(r => r.value === role) || ROLES[2];
    };

    const filteredMembers = members.filter(member =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatistics = () => {
        return {
            total: members.length,
            admins: members.filter(m => m.role === "ADMIN").length,
            adminPlus: members.filter(m => m.role === "ADMIN+").length,
            superAdmins: members.filter(m => m.role === "ADMIN++").length,
        };
    };

    const stats = getStatistics();

    function handleRoleChange(id: string, newRole: string) {
        setMembers((prev) =>
            prev.map((m) =>
                m.id === id ? { ...m, role: newRole } : m
            )
        );
        toast.success("Cargo atualizado!");
    }

    // ✅ CREATE ADMIN
    async function handleAddMember() {
        if (!newMember.name || !newMember.email || !newMember.password) {
            toast.error("Preencha todos os campos!");
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
                avatar: (created.name || "SN")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .substring(0, 2),

            };

            setMembers(prev => [...prev, member]);

            setNewMember({ name: "", email: "", password: "", role: "ADMIN", cpf: "" });
            setShowAddForm(false);

            toast.success("Administrador criado!");
        } catch (err) {
            console.error(err);
            toast.error("Erro ao criar admin");
        }
    }

    async function handleDeleteMember(id: string) {
        const member = members.find(m => m.id === id);

        try {
            await deleteAdmin(id);

            setMembers(prev => prev.filter(m => m.id !== id));

            toast.success(`${member?.name} removido`);
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Erro ao remover");
        }
    }

    // ✅ SAVE ROLES
    async function handleSave() {
        try {
            setLoading(true);

            await Promise.all(
                members.map((m) =>
                    UpdateRole({
                        id: m.id,
                        role: m.role,
                    })
                )
            );

            toast.success("Alterações salvas!");
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar");
        } finally {
            setLoading(false);
        }
    }

    const formatDate = (date?: string) => {
        if (!date) return "-";
        return new Date(date).toLocaleDateString("pt-BR");
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[1400px] max-h-[90vh] overflow-hidden flex flex-col max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                                <Users className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl">Administradores</DialogTitle>
                                <DialogDescription>
                                    Gerencie cargos e permissões
                                </DialogDescription>
                            </div>
                        </div>
                        {canManage && (
                            <Button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="bg-gradient-to-r from-blue-600 to-purple-600"
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Adicionar Admin
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                {/* STATS */}
                <div className="grid grid-cols-4 gap-4 mt-4">

                    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Total</p>
                                    <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                                </div>
                                <Users className="w-8 h-8 text-blue-500 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Admin</p>
                                    <p className="text-2xl font-bold text-purple-600">{stats.admins}</p>
                                </div>
                                <Crown className="w-8 h-8 text-purple-500 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Admin+</p>
                                    <p className="text-2xl font-bold text-cyan-600">{stats.adminPlus}</p>
                                </div>
                                <Shield className="w-8 h-8 text-cyan-500 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Admin++</p>
                                    <p className="text-2xl font-bold text-cyan-600">{stats.superAdmins}</p>
                                </div>
                                <User className="w-8 h-8 text-gray-500 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>


                </div>

                {/* FORM */}
                <AnimatePresence>
                    {showAddForm && (
                        <motion.div initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white mt-4">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <UserPlus className="w-5 h-5 text-blue-600" />
                                        Adicionar Novo Membro
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                            Nome Completo
                                        </label>
                                        <input placeholder="Nome" value={newMember.name}
                                            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                            Email
                                        </label>
                                        <input placeholder="Email" value={newMember.email}
                                            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                            CPF
                                        </label>
                                        <input placeholder="CPF" value={newMember.cpf}
                                            onChange={(e) => setNewMember({ ...newMember, cpf: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                            Senha
                                        </label>
                                        <input type="password" placeholder="Senha"
                                            value={newMember.password}
                                            onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                            Cargo
                                        </label>
                                        <Select value={newMember.role}
                                            onValueChange={(value) => setNewMember({ ...newMember, role: value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {ROLES.map(r => (
                                                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <Button onClick={handleAddMember} className="bg-green-600 hover:bg-green-700">
                                            <Check className="w-4 h-4 mr-2" />
                                            Confirmar
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setShowAddForm(false);
                                                setNewMember({ name: "", email: "", password: "", role: "", cpf: "" });
                                            }}
                                        >
                                            <X className="w-4 h-4 mr-2" />
                                            Cancelar
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* SEARCH */}
                <input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mt-4 border p-2 rounded"
                />

                {/* TABLE */}
                <div className="flex-1 overflow-auto mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Cargo</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {filteredMembers.map((member) => {
                                const roleConfig = getRoleConfig(member.role);
                                const Icon = roleConfig.icon;

                                return (
                                    <TableRow key={member.id}>
                                        <TableCell>{member.name}</TableCell>
                                        <TableCell>{member.email}</TableCell>
                                        <TableCell>
                                            <Select value={member.role}
                                                disabled={!canManage}
                                                onValueChange={(value) => handleRoleChange(member.id, value)}>
                                                <SelectTrigger>
                                                    <SelectValue>
                                                        <div className="flex gap-2">
                                                            <Icon className="w-4 h-4" />
                                                            <Badge>{roleConfig.label}</Badge>
                                                        </div>
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROLES.map(r => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                {canManage && (
                                                    member.role === "ADMIN++" ? (
                                                        <Badge className="bg-purple-100 text-purple-700 border border-purple-300">Acesso total</Badge>
                                                    ) : (
                                                        <button
                                                            title="Editar permissões"
                                                            onClick={() => setPermTarget(member)}
                                                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                                        >
                                                            <KeyRound className="w-4 h-4" />
                                                            Permissões
                                                        </button>
                                                    )
                                                )}
                                                {canManage && (
                                                    <button onClick={() => handleDeleteMember(member.id)} title="Remover da equipe">
                                                        <Trash2 className="text-red-500 w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* ACTIONS */}
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={onClose}>
                        {canManage ? "Cancelar" : "Fechar"}
                    </Button>
                    {canManage && (
                        <Button onClick={handleSave} disabled={loading}>
                            {loading ? "Salvando..." : "Salvar"}
                        </Button>
                    )}
                </div>

                {permTarget && (
                    <PermissionsEditorDialog
                        member={permTarget}
                        onClose={() => setPermTarget(null)}
                        onSaved={(id, overrides) =>
                            setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, permissions: overrides } : m)))
                        }
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

// Editor de permissões individuais: mostra o mapa resolvido (padrão do cargo
// + overrides) e grava só o que difere do padrão. ADMIN++ não passa por aqui
// (tem acesso total sempre).
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
    const [edited, setEdited] = useState<PermissionMap>(() =>
        resolvePermissions(role, parseOverrides(member.permissions)),
    );
    const [saving, setSaving] = useState(false);

    const editableDefs = PERMISSION_DEFS.filter((d) => d.key !== "manage_team");

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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-blue-600" />
                        Permissões — {member.name}
                    </DialogTitle>
                    <DialogDescription>
                        Cargo {role}. Marque o que este membro pode ver e fazer; o padrão do
                        cargo é aplicado quando nada é alterado.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2">
                    {editableDefs.map((def) => (
                        <label key={def.key} className="flex items-start gap-3 cursor-pointer rounded-lg border p-3 hover:bg-gray-50">
                            <Checkbox
                                checked={edited[def.key]}
                                onCheckedChange={(v) =>
                                    setEdited((prev) => ({ ...prev, [def.key]: v === true }))
                                }
                                className="mt-0.5"
                            />
                            <span>
                                <span className="block text-sm font-medium">{def.label}</span>
                                <span className="block text-xs text-gray-500">{def.description}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSavePermissions} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar permissões"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}