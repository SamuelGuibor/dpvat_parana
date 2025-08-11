import { NextRequest, NextResponse } from "next/server";
import { getUserStatus, updateUserStatus } from "../../_actions/user-status";

export async function GET() {
  try {
    const { status, role, service } = await getUserStatus();
    return NextResponse.json({ status, role, service });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { newStatus } = await req.json();
    const updatedStatus = await updateUserStatus(newStatus);
    return NextResponse.json(updatedStatus);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}