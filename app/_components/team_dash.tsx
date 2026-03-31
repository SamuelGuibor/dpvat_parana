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
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
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
    User
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

import { getAdmins } from "@/app/_actions/get-team";
import { UpdateRole } from "@/app/_actions/update_team";
import { createUser } from "@/app/_actions/create-user";
import { deleteAdmin } from "../_actions/delete-user";

interface CardDialogProps {
    open: boolean;
    onClose: () => void;
}

type Member = {
    id: string;
    name: string;
    email?: string;
    role: string;
    avatar?: string;
    joinedAt?: string;
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

    const [newMember, setNewMember] = useState({
        name: "",
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
                    email: item.email || "",
                    role: item.role,
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
                avatar: (created.name || "SN")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .substring(0, 2),

            };

            setMembers(prev => [...prev, member]);

            setNewMember({ name: "", email: "", password: "", role: "ADMIN" });
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
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
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
                        <Button
                            onClick={() => setShowAddForm(!showAddForm)}
                            className="bg-gradient-to-r from-blue-600 to-purple-600"
                        >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Adicionar Admin
                        </Button>
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
                                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                                                setNewMember({ name: "", email: "", password: "", role: "" });
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
                                            <button onClick={() => handleDeleteMember(member.id)}>
                                                <Trash2 className="text-red-500 w-4 h-4" />
                                            </button>
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
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}