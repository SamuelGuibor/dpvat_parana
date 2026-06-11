/* eslint-disable no-unused-vars */
"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/app/_components/ui/checkbox";
import { Input } from "@/app/_components/ui/input";
import { Plus, Trash2, Loader2 } from "lucide-react";

type Item = {
  id: string;
  text: string;
  checked: boolean;
  order: number;
};

type Props = {
  cardId: string;
  isProcess: boolean;
  title?: string;
};

export function AdminChecklist({ cardId, isProcess, title = "Checklist Administrativo" }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideChecked, setHideChecked] = useState(false);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const loadedKeyRef = useRef<string | null>(null);

  const param = isProcess ? `processId=${cardId}` : `userId=${cardId}`;

  async function load() {
    if (!cardId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin-checklist?${param}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data: Item[] = await res.json();
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cardId) return;
    const key = `${isProcess ? "p" : "u"}:${cardId}`;
    // Evita dupla execução do effect em React 18 StrictMode (causa principal
    // do seed duplicado).
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isProcess]);

  useEffect(() => {
    if (showAddInput) addInputRef.current?.focus();
  }, [showAddInput]);

  async function addItem() {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    try {
      const payload: Record<string, string> = { text };
      if (isProcess) payload.processId = cardId;
      else payload.userId = cardId;
      const res = await fetch("/api/admin-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Falha");
      const created: Item = await res.json();
      setItems((prev) => [...prev, created]);
      setNewText("");
    } catch (e) {
      console.error(e);
      alert("Não foi possível adicionar o item.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item: Item) {
    const next = !item.checked;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: next } : i)),
    );
    try {
      const res = await fetch(`/api/admin-checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: next }),
      });
      if (!res.ok) throw new Error("Falha");
    } catch (e) {
      console.error(e);
      // rollback
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: !next } : i)),
      );
    }
  }

  async function deleteItem(id: string) {
    const backup = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/admin-checklist/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha");
    } catch (e) {
      console.error(e);
      setItems(backup);
      alert("Não foi possível excluir o item.");
    }
  }

  // async function deleteAll() {
  //   if (items.length === 0) return;
  //   if (!confirm("Excluir todos os itens do checklist?")) return;
  //   const backup = items;
  //   setItems([]);
  //   try {
  //     const res = await fetch(`/api/admin-checklist?${param}`, {
  //       method: "DELETE",
  //     });
  //     if (!res.ok) throw new Error("Falha");
  //   } catch (e) {
  //     console.error(e);
  //     setItems(backup);
  //     alert("Não foi possível excluir os itens.");
  //   }
  // }

  const visible = hideChecked ? items.filter((i) => !i.checked) : items;
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideChecked((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 transition"
          >
            {hideChecked ? "Mostrar marcados" : "Ocultar itens marcados"}
          </button>
          {/* <button
            type="button"
            onClick={deleteAll}
            disabled={items.length === 0}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Excluir
          </button> */}
        </div>
      </div>

      {items.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          {checkedCount} de {items.length} concluído{items.length !== 1 ? "s" : ""}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              {hideChecked && items.length > 0
                ? "Todos os itens estão marcados."
                : "Nenhum item ainda. Adicione abaixo."}
            </p>
          )}
          {visible.map((item) => (
            <div key={item.id} className="flex items-center gap-2 group">
              <Checkbox
                id={`adm-chk-${item.id}`}
                checked={item.checked}
                onCheckedChange={() => toggleItem(item)}
              />
              <label
                htmlFor={`adm-chk-${item.id}`}
                className={`flex-1 text-sm cursor-pointer select-none ${
                  item.checked ? "line-through text-gray-400" : "text-gray-700"
                }`}
              >
                {item.text}
              </label>
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                title="Excluir item"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        {showAddInput ? (
          <div className="flex items-center gap-2">
            <Input
              ref={addInputRef}
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
                if (e.key === "Escape") {
                  setShowAddInput(false);
                  setNewText("");
                }
              }}
              placeholder="Digite o item e pressione Enter"
              className="flex-1 h-9 text-sm bg-gray-50 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={adding || !newText.trim()}
              className="px-3 h-9 rounded-md text-sm bg-blue-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {adding && <Loader2 size={14} className="animate-spin" />}
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddInput(false);
                setNewText("");
              }}
              className="px-3 h-9 rounded-md text-sm border border-gray-300 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddInput(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 transition inline-flex items-center gap-1.5 text-gray-700"
          >
            <Plus size={14} /> Adicionar um item
          </button>
        )}
      </div>
    </div>
  );
}
