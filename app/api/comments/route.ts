import { NextResponse } from 'next/server'
import { db } from "@/app/_lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const userId = searchParams.get('userId')
  const processId = searchParams.get('processId')

  if (!userId && !processId) {
    return NextResponse.json(
      { error: 'Informe userId ou processId' },
      { status: 400 }
    )
  }

  const comments = await db.comment.findMany({
    where: {
      userId: userId ?? undefined,
      processId: processId ?? undefined,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  })

  return NextResponse.json(comments)
}
