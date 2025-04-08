"use client"

import { useState } from "react"
import { Button } from "@/app/_components/ui/button"
import { Card, CardContent} from "@/app/_components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/_components/ui/dialog"
import { Checkbox } from "@/app/_components/ui/checkbox"

// Interface para os conteúdos de uma mensagem
interface SubMensagem {
  id: number
  conteudo: string
}

// Interface para as mensagens
interface Mensagem {
  id: number
  titulo: string
  subMensagens: SubMensagem[]
  cor: string
}

export function Mensagens() {
  const [mensagens] = useState<Mensagem[]>([
    {
      id: 1,
      titulo: "Mensagem 1",
      subMensagens: [
        { id: 1, conteudo: "Conteúdo 1 da Mensagem 1" },
        { id: 2, conteudo: "Conteúdo 2 da Mensagem 1" },
        { id: 3, conteudo: "Conteúdo 3 da Mensagem 1" },
      ],
      cor: "bg-blue-100",
    },
    {
      id: 2,
      titulo: "Mensagem 2",
      subMensagens: [
        { id: 1, conteudo: "Conteúdo 1 da Mensagem 2" },
        { id: 2, conteudo: "Conteúdo 2 da Mensagem 2" },
      ],
      cor: "bg-green-100",
    },
    {
      id: 3,
      titulo: "Mensagem 3",
      subMensagens: [
        { id: 1, conteudo: "Conteúdo 1 da Mensagem 3" },
        { id: 2, conteudo: "Conteúdo 2 da Mensagem 3" },
        { id: 3, conteudo: "Conteúdo 3 da Mensagem 3" },
        { id: 4, conteudo: "Conteúdo 4 da Mensagem 3" },
      ],
      cor: "bg-yellow-100",
    },
  ])

  // Estado para subMensagens selecionadas (usando um objeto com mensagemId e subMensagemId)
  const [selecionadas, setSelecionadas] = useState<{ mensagemId: number; subMensagemId: number }[]>([])

  const toggleSelecao = (mensagemId: number, subMensagemId: number) => {
    const chave = { mensagemId, subMensagemId }
    if (selecionadas.some(sel => sel.mensagemId === mensagemId && sel.subMensagemId === subMensagemId)) {
      setSelecionadas(selecionadas.filter(sel => !(sel.mensagemId === mensagemId && sel.subMensagemId === subMensagemId)))
    } else {
      setSelecionadas([...selecionadas, chave])
    }
  }

  const enviarMensagens = () => {
    const mensagensEnviadas = mensagens.map(mensagem => ({
      ...mensagem,
      subMensagens: mensagem.subMensagens.filter(sub =>
        selecionadas.some(sel => sel.mensagemId === mensagem.id && sel.subMensagemId === sub.id)
      ),
    })).filter(m => m.subMensagens.length > 0)
    console.log("Enviando mensagens:", mensagensEnviadas)
    // Aqui você pode adicionar a lógica de envio real
  }

  return (
    <div className="space-y-4">
      <div className="relative right-0">
        <Button
          onClick={enviarMensagens}
          disabled={selecionadas.length === 0}
          variant="default"
        >
          Enviar Selecionadas ({selecionadas.length})
        </Button>
      </div>

      <Card className="bg-gray-50">
        <CardContent className="py-6">
          <div className="space-y-6">
            {mensagens.map((mensagem) => (
              <div key={mensagem.id} className={`p-3 rounded-md ${mensagem.cor}`}>
                <h3 className="font-semibold mb-2">{mensagem.titulo}</h3>
                <div className="space-y-2">
                  {mensagem.subMensagens.map((subMensagem) => (
                    <div
                      key={subMensagem.id}
                      className="flex items-center justify-between p-2 rounded-md"
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={selecionadas.some(sel =>
                            sel.mensagemId === mensagem.id && sel.subMensagemId === subMensagem.id
                          )}
                          onCheckedChange={() => toggleSelecao(mensagem.id, subMensagem.id)}
                        />
                        <p className="text-sm text-gray-600 line-clamp-1">{subMensagem.conteudo}</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" className="p-0">
                            Ver mais
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{mensagem.titulo} - Conteúdo {subMensagem.id}</DialogTitle>
                          </DialogHeader>
                          <p>{subMensagem.conteudo}</p>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}