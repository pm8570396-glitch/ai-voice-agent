import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const calls = await db.callLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(calls);
  } catch (error) {
    console.error('Error fetching call logs:', error);
    return NextResponse.json({ error: 'Failed to fetch call logs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, duration, status, transcript } = body;

    const callLog = await db.callLog.create({
      data: {
        agentId: agentId || null,
        duration: duration || 0,
        status: status || 'completed',
        transcript: transcript || null,
      },
    });

    return NextResponse.json(callLog, { status: 201 });
  } catch (error) {
    console.error('Error creating call log:', error);
    return NextResponse.json({ error: 'Failed to create call log' }, { status: 500 });
  }
}