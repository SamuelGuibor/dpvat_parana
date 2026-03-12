/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useDeferredValue, useCallback, useEffect } from 'react';
import { Badge } from '@/app/_components/ui/badge';
import { Calendar, Phone, User, Clock, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea, ScrollBar } from '@/app/_components/ui/scroll-area';

interface KanbanItem {
    id: string;
    nome: string;
    telefone: string;
    evento: string;
    createdAt: string;
    updatedAt: string;
    status: string;
}

const STAGES = [
    'iniciado',
    'Em Conversa',
    'Em Honorário',
    'Enviou Documentos',
    'Aguardando',
    'Não Contratado',
    'Não Qualificado',
    'Contratado'
];

const STAGE_KEYS = [
    'iniciado',
    'em_conversa',
    'em_honorario',
    'enviou_documentos',
    'aguardando',
    'nao_contratado',
    'nao_qualificado',
    'contratado'
];

const STAGE_COLORS = [
    'bg-purple-500',
    'bg-blue-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-green-500'
];


function formatDate(date: string) {
    return new Date(date).toLocaleDateString('pt-BR');
}

export const MiniKanban: React.FC = () => {
    const [items, setItems] = useState<KanbanItem[]>([]);
    const [search, setSearch] = useState('');

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

    const deferredSearch = useDeferredValue(search);

    // Filtro otimizado
    const filteredItems = useMemo(() => {
        const term = deferredSearch.toLowerCase();
        if (!term) return items;

        return items.filter(item =>
            item.nome.toLowerCase().includes(term) ||
            item.telefone.includes(term)
        );
    }, [items, deferredSearch]);

    // Agrupamento por coluna
    const groupedItems = useMemo(() => {
        const groups: Record<string, KanbanItem[]> = {};

        STAGE_KEYS.forEach(stage => {
            groups[stage] = [];
        });

        filteredItems.forEach(item => {
            if (groups[item.evento]) {
                groups[item.evento].push(item);
            }
        });

        return groups;
    }, [filteredItems]);

    const moveItem = useCallback(async (id: string, newStatus: string) => {
        try {

            const res = await fetch(`/api/botconversa/changes/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    evento: newStatus,
                }),
                cache: 'no-store',
            });

            if (!res.ok) {
                throw new Error('Erro ao atualizar');
            }

            const stageName = STAGES[STAGE_KEYS.indexOf(newStatus)];
            toast.success(`Movido para ${stageName}`);

            fetchData();

        } catch (err) {
            console.error(err);
            toast.error('Erro ao mover item');
        }
    }, []);

    const deleteItem = useCallback(async (id: string) => {
        try {

            const res = await fetch(`/api/botconversa/changes/${id}`, {
                method: "DELETE",
                cache: "no-store",
            });

            if (!res.ok) {
                throw new Error("Erro ao deletar");
            }

            toast.success("Item removido com sucesso 🗑️");

            fetchData();

        } catch (err) {
            console.error(err);
            toast.error("Erro ao remover ❌");
        }
    }, []);

    const copyPhone = useCallback((phone: string) => {
        navigator.clipboard.writeText(phone);
        toast.success('Telefone copiado');
    }, []);

    return (
        <div className="w-full py-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-xl font-bold">Fluxo de Eventos Rápidos</h3>
                    <p className="text-sm text-gray-500">Acompanhamento de 8 etapas</p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    8 Colunas
                </Badge>
            </div>

            <div className="mb-4">
                <input
                    placeholder="Buscar por nome ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-gray-300 px-4 py-2.5 rounded-lg w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
            </div>

            <ScrollArea className="w-full whitespace-nowrap rounded-xl border bg-gradient-to-br from-gray-50 to-gray-100/50 p-4 shadow-inner">
                <div className="flex gap-4">
                    {STAGE_KEYS.map((stageKey, index) => {
                        const stageItems = groupedItems[stageKey] || [];
                        const stageName = STAGES[index];
                        const stageColor = STAGE_COLORS[index];

                        return (
                            <div key={stageKey} className="w-80 flex-shrink-0 flex flex-col gap-3">
                                <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border-b-2 border-gray-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-tight flex items-center gap-2">
                                        <div className={`w-2.5 h-2.5 rounded-full ${stageColor} shadow-[0_0_8px_rgba(0,0,0,0.3)]`}></div>
                                        {stageName}
                                    </h3>
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-gray-100">
                                        {stageItems.length}
                                    </Badge>
                                </div>

                                <VirtualColumn
                                    items={stageItems}
                                    stageKey={stageKey}
                                    stageIndex={index}
                                    moveItem={moveItem}
                                    deleteItem={deleteItem}
                                    copyPhone={copyPhone}
                                />
                            </div>
                        );
                    })}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
};

// Componente de coluna virtual
interface VirtualColumnProps {
    items: KanbanItem[];
    stageKey: string;
    stageIndex: number;
    moveItem: (id: string, status: string) => void;
    deleteItem: (id: string) => void;
    copyPhone: (phone: string) => void;
}

function VirtualColumn({ items, stageIndex, moveItem, deleteItem, copyPhone }: VirtualColumnProps) {
    if (items.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-white/30">
                <p className="text-xs text-gray-400 font-medium">Vazio</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {items.map((item) => (
                <KanbanCard
                    key={item.id}
                    item={item}
                    stageIndex={stageIndex}
                    moveItem={moveItem}
                    deleteItem={deleteItem}
                    copyPhone={copyPhone}
                />
            ))}
        </div>
    );
}

// Card individual
interface KanbanCardProps {
    item: KanbanItem;
    stageIndex: number;
    moveItem: (id: string, status: string) => void;
    deleteItem: (id: string) => void;
    copyPhone: (phone: string) => void;
}

const KanbanCard = React.memo(function KanbanCard({
    item,
    stageIndex,
    moveItem,
    deleteItem,
    copyPhone
}: KanbanCardProps) {
    const stageColor = STAGE_COLORS[stageIndex];

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 group transition-all hover:shadow-xl hover:border-blue-300 relative">
            <div className={`absolute top-0 left-0 w-1 h-full ${stageColor} opacity-0 group-hover:opacity-100 transition-opacity`}></div>

            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest truncate">
                    {item.evento}
                </span>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 shrink-0 shadow-sm">
                        <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-gray-900 truncate">{item.nome}</span>
                </div>
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(item.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(item.updatedAt)}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 p-2 rounded-lg border border-green-200/50 shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] text-green-700 font-bold">
                        <Phone className="w-3 h-3" />
                        <span>{item.telefone}</span>
                    </div>
                    <button
                        onClick={() => copyPhone(item.telefone)}
                        className="text-[9px] bg-green-600 text-white px-2 py-1 rounded-full hover:bg-green-700 transition-all active:scale-95 flex items-center gap-1 shadow-sm"
                    >
                        <Copy className="w-2.5 h-2.5" />
                        Copiar
                    </button>
                </div>
            </div>

            <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                <button
                    onClick={() => deleteItem(item.id)}
                    className="px-2 py-1.5 text-[10px] font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all shadow-sm flex items-center gap-1"
                >
                    <Trash2 className="w-3 h-3" />
                    Excluir
                </button>

                {stageIndex > 0 && (
                    <button
                        onClick={() => moveItem(item.id, STAGE_KEYS[stageIndex - 1])}
                        className="flex-1 py-1.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all"
                    >
                        ← Recuar
                    </button>
                )}

                {stageIndex < STAGE_KEYS.length - 1 && (
                    <button
                        onClick={() => moveItem(item.id, STAGE_KEYS[stageIndex + 1])}
                        className="flex-1 py-1.5 text-[10px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 active:scale-95 transition-all"
                    >
                        Avançar →
                    </button>
                )}
            </div>
        </div>
    );
});