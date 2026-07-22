import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/_shared/lib/auth'
import { db } from '@/app/_shared/lib/prisma'

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++']

export async function GET(req: Request) {
  // O middleware global já exige sessão, mas aqui o histórico é de QUALQUER
  // cliente — então restringimos à equipe (um cliente logado não pode
  // consultar logs de outros clientes).
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !TEAM_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

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
