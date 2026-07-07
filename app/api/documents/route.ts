/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '../../_shared/lib/prisma'
import { authOptions } from '../../_shared/lib/auth'
import { createLog } from '../../_shared/lib/log'

export async function POST(request: Request) {
  try {
    const { userId, processId, documents } = await request.json()

    if (!userId && !processId) {
      return NextResponse.json(
        { error: 'Documento precisa de userId ou processId' },
        { status: 400 }
      )
    }

    const createdDocuments = await Promise.all(
      documents.map((doc: { key: string; name: string }) => {
        const data: any = {
          userId,
          key: doc.key,
          name: doc.name,
        }

        if (processId) {
          data.processId = processId
        }

        return db.document.create({ data })
      })
    )

    // Registra no histórico do card quem anexou os documentos.
    const session = await getServerSession(authOptions)
    if (session?.user?.id && Array.isArray(documents) && documents.length) {
      const names: string[] = documents.map((d: { name: string }) => d.name)
      await createLog({
        action: 'document_add',
        message:
          names.length === 1
            ? `adicionou o documento "${names[0]}"`
            : `adicionou ${names.length} documentos`,
        authorId: session.user.id,
        authorName: session.user.name ?? 'Usuário',
        userId: processId ? null : userId,
        processId: processId ?? null,
        metadata: { documents: names },
      })
    }

    return NextResponse.json(createdDocuments, { status: 201 })
  } catch (error) {
    console.error('Erro ao salvar documentos:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar documentos' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const processId = searchParams.get('processId');

    if (!userId && !processId) {
      return NextResponse.json({ error: 'userId ou processId é obrigatório' }, { status: 400 });
    }

    const where = processId ? { processId } : { userId: userId! };

    const documents = await db.document.findMany({
      where,
      select: {
        id: true,
        key: true,
        name: true,
        processId: true,
        // Info do processo para permitir agrupar os documentos por processo
        // na área do cliente (documentos vindos de processos separados).
        process: {
          select: { id: true, service: true, type: true, cardNumber: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Erro ao buscar documentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar documentos' }, { status: 500 });
  }
}