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
import { getAdmins } from "@/app/_actions/get-team";
import { UpdateRole } from "@/app/_actions/update_team";


interface CardDialogProps {
    open: boolean;
    onClose: () => void;
}

type Member = {
    id: string;
    name: string;
    role: string;
};

export default function Team({ open, onClose }: CardDialogProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function loadUsers() {
            const data = await getAdmins();
            setMembers(data);
        }

        if (open) {
            loadUsers();
        }
    }, [open]);


    function handleRoleChange(id: string, newRole: string) {
        setMembers((prev) =>
            prev.map((m) =>
                m.id === id ? { ...m, role: newRole } : m
            )
        );
    }

    async function handleSave() {
        try {
            setLoading(true);

            await Promise.all(
                members.map((member) =>
                    UpdateRole({
                        id: member.id,
                        role: member.role,
                    })
                )
            );

            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }


    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Equipe</DialogTitle>
                    <DialogDescription>
                        Gerencie os cargos da equipe
                    </DialogDescription>
                </DialogHeader>

                {/* Tabela */}
                <div className="flex-1 overflow-auto mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Cargo</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {members.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell className="font-medium">
                                        {member.name}
                                    </TableCell>

                                    <TableCell>
                                        <Select
                                            
                                            value={member.role}
                                            onValueChange={(value) =>
                                                handleRoleChange(member.id, value)
                                            }
                                        >
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Selecione o cargo" />
                                            </SelectTrigger>

                                            <SelectContent>
                                                <SelectItem className="hover:bg-gray-50" value="ADMIN">Administrador</SelectItem>
                                                <SelectItem className="hover:bg-gray-50" value="ADMIN+">Administrador+</SelectItem>
                                                <SelectItem className="hover:bg-gray-50" value="ADMIN++">Administrador++</SelectItem>
                                                <SelectItem className="hover:bg-gray-50" value="USER">Usuario</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Botão salvar */}
                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={loading }>
                        {loading ? "Salvando..." : "Salvar"}
                    </Button>

                </div>
            </DialogContent>
        </Dialog>
    );
}
