import React, { useState } from 'react';
// import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from '@/app/_components/ui/badge';
import { Calendar, Phone, User, Clock } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../_components/ui/dialog';
import { Button } from '../_components/ui/button';

interface KanbanItem {
    id: string;
    nome: string;
    evento: string;
    telefone: string;
    createdAt: string;
    updatedAt: string;
}

const STAGES = [
    'iniciado',
    'em_conversa',
    'em_honorario',
    'enviou_documentos',
    'aguardando',
    'nao_contratado',
    'nao_qualificado',
    'contratado'
];


export const MiniKanban: React.FC = () => {
    const [items, setItems] = useState<KanbanItem[]>([]);
    const [openDelete, setOpenDelete] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);


    async function fetchData() {
        try {
            const res = await fetch('/api/botconversa/get-kanban', {
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error('Erro no GET');
            }

            const data = await res.json();
            setItems(data);

        } catch (err) {
            console.error('Erro Kanban:', err);
        }
    }

    useEffect(() => {
        fetchData();
    }, []);


    async function moveItem(id: string, newStatus: string) {
        await fetch(`/api/botconversa/changes/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                evento: newStatus,
            }),
            cache: 'no-store',
        });

        fetchData();
    }

    async function deleteItem(id: string) {
        try {
            const res = await fetch(`/api/botconversa/changes/${id}`, {
                method: "DELETE",
                cache: "no-store",
            });

            if (!res.ok) {
                throw new Error("Erro ao deletar");
            }

            toast.success("Item removido com sucesso 🗑️");

            fetchData(); // Recarrega lista
        } catch (err) {
            console.error(err);
            toast.error("Erro ao remover ❌");
        }
    }

    function formatDate(date: string) {
        return new Date(date).toLocaleDateString('pt-BR');
    }


    return (
        <div className="w-full py-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-xl font-bold">Fluxo de Eventos Rápidos</h3>
                    <p className="text-sm text-gray-500">Acompanhamento de 7 etapas</p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    7 Colunas
                </Badge>
            </div>

            <div className="w-full h-[700px] overflow-x-auto rounded-xl border bg-gray-50/50 p-4">

                <div className="flex gap-4 h-full min-h-0">
                    {STAGES.map((stage) => (
                        <div
                            key={stage}
                            className="w-80 flex-shrink-0 flex flex-col h-full min-h-0"
                        >

                            <div className="flex items-center justify-between px-2 py-1 bg-white/50 rounded-t-lg border-b border-gray-200">
                                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-tight flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]"></div>
                                    {stage}
                                </h3>
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                    {items.filter(i => i.evento === stage).length}
                                </Badge>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">

                                {items.filter(item => item.evento === stage).map((item) => (
                                    <div
                                        key={item.id}
                                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 group transition-all hover:shadow-lg hover:border-blue-300 relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                        <div className="flex flex-col gap-1 ">
                                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{item.evento}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-bold text-gray-900 truncate">{item.nome}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2 border-t border-gray-50 pt-3">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>Criado: {formatDate(item.createdAt)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{formatDate(item.updatedAt)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between bg-green-50/50 p-2 rounded-lg border border-green-100/50">
                                                <div className="flex items-center gap-2 text-[11px] text-green-700 font-bold">
                                                    <Phone className="w-3 h-3" />
                                                    <span>{item.telefone}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(item.telefone);

                                                        toast.success("Copiado para a área de transferência ✅");
                                                    }}
                                                    className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded-full hover:bg-green-700 transition-colors"
                                                >
                                                    Copiar
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                            <button
                                                onClick={() => {
                                                    setSelectedId(item.id);
                                                    setOpenDelete(true);
                                                }}
                                                className="py-1.5 px-2 text-[10px] font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all"
                                            >
                                                🗑 Excluir
                                            </button>

                                            {STAGES.indexOf(stage) > 0 && (
                                                <button
                                                    onClick={() => moveItem(item.id, STAGES[STAGES.indexOf(stage) - 1])}
                                                    className="flex-1 py-1.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all"
                                                >
                                                    ← Recuar
                                                </button>
                                            )}
                                            {STAGES.indexOf(stage) < STAGES.length - 1 && (
                                                <button
                                                    onClick={() => moveItem(item.id, STAGES[STAGES.indexOf(stage) + 1])}
                                                    className="flex-1 py-1.5 text-[10px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 active:scale-95 transition-all"
                                                >
                                                    Avançar →
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {items.filter(i => i.evento === stage).length === 0 && (
                                    <div className="flex-1 flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/30">
                                        <p className="text-xs text-gray-400 font-medium">Vazio</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <Dialog open={openDelete} onOpenChange={setOpenDelete}>
                <DialogContent className="w-[60%] h-auto rounded-xl">
                    <DialogHeader>
                        <DialogTitle>Confirmar exclusão</DialogTitle>

                        <DialogDescription>
                            Tem certeza que deseja deletar? Essa ação é irreversível.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="flex flex-row gap-3">
                        <DialogClose asChild>
                            <Button variant="secondary" className="w-full">
                                Voltar
                            </Button>
                        </DialogClose>

                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={async () => {
                                if (selectedId) {
                                    await deleteItem(selectedId);
                                }

                                setOpenDelete(false);
                                setSelectedId(null);
                            }}
                        >
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>

    );
};
