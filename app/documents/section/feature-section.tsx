"use client"

import type React from "react"
import { useState } from "react"
import { BarChart3, Globe, Layers, Lightbulb, Rocket, Shield } from "lucide-react"

import { cn } from "@/app/_lib/utils"
import { Button } from "@/app/_components/ui/button"

interface FeatureProps {
  icon: React.ElementType
  title: string
  description: string
}

const features: FeatureProps[] = [
  {
    icon: Lightbulb,
    title: "Innovative Ideas",
    description: "Transform your business with cutting-edge solutions designed to meet modern challenges.",
  },
  {
    icon: Rocket,
    title: "Rapid Deployment",
    description: "Launch your projects faster with our streamlined implementation process.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Protect your data with industry-leading security protocols and best practices.",
  },
  {
    icon: Globe,
    title: "Global Reach",
    description: "Connect with customers worldwide through our international infrastructure.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Make data-driven decisions with comprehensive analytics and reporting tools.",
  },
  {
    icon: Layers,
    title: "Scalable Architecture",
    description: "Grow without limits using our flexible and scalable platform architecture.",
  },
]

function FeatureCard({ icon: Icon, title, description }: FeatureProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn(
        // Adicionando flexbox para alinhar o conteúdo e empurrar o botão para baixo
        "relative flex flex-col overflow-hidden rounded-xl border bg-background p-6 transition-all duration-300 ease-in-out h-full",
        isHovered ? "border-primary shadow-lg translate-y-[-4px]" : "border-border shadow-sm"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradiente com pointer-events-none para não bloquear cliques */}
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
      <Button
        className="w-full mt-auto" 
        style={{ zIndex: 1 }}
      >
        Verificar o documento e emitir
      </Button>
    </div>
  )
}

export function FeatureSection() {
  return (
    <section className="container py-5">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  )
}