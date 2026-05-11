// app/_actions/get-labels.ts
'use server'
import { db } from '@/app/_lib/prisma'

export async function getLabels() {
  return db.label.findMany({
    orderBy: { order: 'asc' },
    select: { id: true, name: true, color: true, timeLimitDays: true, order: true },
  })
}