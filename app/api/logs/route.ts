import { NextResponse } from 'next/server'
import { db } from '@/app/_shared/lib/prisma'

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

  const logs = await db.log.findMany({
    where: {
      userId: userId ?? undefined,
      processId: processId ?? undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(logs)
}
