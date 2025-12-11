"use client";

import { useEffect, useState, useTransition } from "react";
import { getContacts } from "@/app/_actions/getContact";
import { DeleteContact } from "@/app/_actions/deletContact";
import { CiTrash } from "react-icons/ci";

type Contact = {
  id: string;
  name: string;
  number: string;
  desc: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isPending, startTransition] = useTransition();

  const loadContacts = () => {
    startTransition(async () => {
      const data = await getContacts();
      setContacts(data);
    });
  };

  useEffect(() => {
    loadContacts(); // primeira carga

    const interval = setInterval(() => {
      loadContacts(); // recarrega a cada 10s
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // 🗑️ Função para deletar
  const handleDelete = async (id: string) => {
    await DeleteContact(id);
    loadContacts(); // atualiza tabela após deletar
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Meus Contatos</h1>

      {isPending && contacts.length === 0 ? (
        <p>Carregando...</p>
      ) : (
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border-b text-left">Nome</th>
              <th className="py-2 px-4 border-b text-left">Número</th>
              <th className="py-2 px-4 border-b text-left">Descrição</th>
              <th className="py-2 px-4 border-b text-left"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                <td className="py-2 px-4 border-b">{contact.name}</td>
                <td className="py-2 px-4 border-b">{contact.number}</td>
                <td className="py-2 px-4 border-b w-64 max-w-xs break-words">{contact.desc}</td>
                <td className="py-2 px-4 border-b">
                  <CiTrash
                    className="cursor-pointer text-red-600 hover:text-red-800"
                    size={22}
                    onClick={() => handleDelete(contact.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isPending && contacts.length === 0 && (
        <p className="mt-4 text-gray-500">Nenhum contato encontrado.</p>
      )}
    </div>
  );
}
