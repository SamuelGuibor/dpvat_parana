/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { db } from '../../_lib/prisma'

export async function POST(request: Request) {
  try {
    const { userId, processId, documents } = await request.json()
    console.log(userId, processId, documents)

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
      select: { id: true, key: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Erro ao buscar documentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar documentos' }, { status: 500 });
  }
}