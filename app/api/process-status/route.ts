import { NextRequest, NextResponse } from "next/server";
import { getProcessStatus, updateProcessStatus } from "../../_actions/user-stats";

export async function GET(req: NextRequest) {
  const processId = req.nextUrl.searchParams.get("processId");

  if (!processId) {
    return NextResponse.json({ error: "processId é obrigatório" }, { status: 400 });
  }

  try {
    const { status, role, service, type } = await getProcessStatus(processId);
    return NextResponse.json({ status, role, service, type });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
    const { processId, newStatus } = await req.json();
    const updated = await updateProcessStatus(processId, newStatus);
    return NextResponse.json(updated);
}