import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '../../../_shared/lib/prisma'
import { authOptions } from '../../../_shared/lib/auth'
import { createLog } from '../../../_shared/lib/log'
import { categoryLabel, isDocumentCategory } from '../../../_shared/lib/document-categories'

// Move um anexo de pasta na aba Arquivos (arrastar entre pastas do Drive).
// A categoria é o dado real da organização — mudar aqui muda a pasta pra todo
// mundo, então fica atrás do mesmo papel de equipe da listagem.
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.role?.startsWith('ADMIN')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { id, category } = await request.json()
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    }
    if (!isDocumentCategory(category)) {
      return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
    }

    const doc = await db.document.findUnique({
      where: { id },
      select: { id: true, name: true, category: true, userId: true, processId: true },
    })
    if (!doc) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
    }

    await db.document.update({ where: { id }, data: { category } })

    if (session.user.id && doc.category !== category) {
      await createLog({
        action: 'document_move',
        message: `moveu "${doc.name}" para a pasta ${categoryLabel(category)}`,
        authorId: session.user.id,
        authorName: session.user.name ?? 'Usuário',
        userId: doc.processId ? null : doc.userId,
        processId: doc.processId,
        metadata: { document: doc.name, from: doc.category, to: category },
      })
    }

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('Erro ao mover documento de pasta:', error)
    return NextResponse.json({ error: 'Erro ao mover documento' }, { status: 500 })
  }
}
