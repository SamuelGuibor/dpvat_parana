"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { BarChart3, Globe, Layers, Lightbulb, Loader2, Rocket, Shield } from "lucide-react"
import { cn } from "@/app/_lib/utils"

interface Document {
  key: string
  name: string
}

interface FeatureProps {
  icon: React.ElementType
  title: string
  description: string
}

const icons = [Lightbulb, Rocket, Shield, Globe, BarChart3, Layers]

function FeatureCard({ icon: Icon, title, description }: FeatureProps) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-background p-6 transition-all duration-300 ease-in-out h-full",
        isHovered ? "border-primary shadow-lg translate-y-[-4px]" : "border-border shadow-sm"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 pointer-events-none",
          isHovered ? "opacity-5" : "opacity-0",
          "from-primary/20 to-background"
        )}
      />
      <div
        className={cn(
          "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-300",
          isHovered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-xl font-medium">{title}</h3>
      <p className="text-muted-foreground mb-4 flex-1">{description}</p>
    </div>
  )
}

export function FeatureSection() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { data: session, status } = useSession()

  // Get userId from session
  const userId = session?.user?.id

  useEffect(() => {
    async function fetchUserDocuments() {
      if (!userId) {
        setError("Usuário não autenticado.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/documents?userId=${userId}`)
        if (!response.ok) {
          throw new Error("Erro ao buscar documentos")
        }
        const docs = await response.json()
        setDocuments(docs)
      } catch (err) {
        console.error("Erro ao buscar documentos:", err)
        setError("Não foi possível carregar os documentos.")
      } finally {
        setLoading(false)
      }
    }

    if (status === "authenticated" && userId) {
      fetchUserDocuments()
    } else if (status === "unauthenticated") {
      setError("Por favor, faça login para ver seus documentos.")
      setLoading(false)
    }
  }, [userId, status])

  if (loading) {
    return <section className="container py-5"><Loader2 className="h-4 w-4 animate-spin" /></section>
  }

  if (error) {
    return <section className="container py-5 text-red-500">{error}</section>
  }

  const features: FeatureProps[] = documents.length > 0 ? documents.map((doc, index) => ({
    icon: icons[index % icons.length],
    title: doc.name,
    description: "Documento enviado pela administração."
  })) : [{
    icon: Lightbulb,
    title: "Nenhum documento",
    description: "Nenhum documento foi enviado pela administração."
  }]

  return (
    <section className="container py-5">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <FeatureCard key={feature.title + index} {...feature} />
        ))}
      </div>
    </section>
  )
}