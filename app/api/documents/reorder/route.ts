import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '../../../_shared/lib/prisma'
import { authOptions } from '../../../_shared/lib/auth'

// Persiste a ordem manual dos arquivos de um card: recebe os ids na nova
// ordem (de cima para baixo) e grava o índice como sortOrder de cada um.
// Feito em UMA query (unnest) — um UPDATE por arquivo deixava cada clique
// nas setas lento com banco remoto.
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { orderedIds } = await request.json()
    if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'orderedIds inválido' }, { status: 400 })
    }
    if (orderedIds.length > 500) {
      return NextResponse.json({ error: 'Lista grande demais' }, { status: 400 })
    }

    const orders = orderedIds.map((_: string, index: number) => index)
    await db.$executeRaw`
      UPDATE "Document" AS d
      SET "sortOrder" = v.ord
      FROM (SELECT unnest(${orderedIds}::text[]) AS id, unnest(${orders}::int[]) AS ord) AS v
      WHERE d.id = v.id
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao reordenar documentos:', error)
    return NextResponse.json({ error: 'Erro ao reordenar documentos' }, { status: 500 })
  }
}
