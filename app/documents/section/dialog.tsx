"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/_components/ui/dialog" // Ajuste o caminho conforme sua estrutura
import { Button } from "@/app/_components/ui/button"

interface DocumentDialogProps {
  title: string
  description: string
  onEmit: () => void // Função para emitir o documento
}

export function DocumentDialog({ title, description, onEmit }: DocumentDialogProps) {
  const [open, setOpen] = React.useState(false)

  const handleEmit = () => {
    onEmit()
    setOpen(false) // Fecha o dialog após emitir
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">Verificar o documento e emitir</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <p>Prévia do documento: {title}</p>
          {/* Simulação de conteúdo do documento */}
          <p className="text-sm">Conteúdo fictício para visualização...</p>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleEmit}>Emitir Documento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}