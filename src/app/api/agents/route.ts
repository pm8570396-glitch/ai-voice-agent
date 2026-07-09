import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const agents = await db.voiceAgent.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        scripts: { orderBy: { order: 'asc' } },
        _count: { select: { callLogs: true } },
      },
    });
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, companyName, companyDesc, greeting, voice, speed, tone } = body;

    if (!name || !greeting) {
      return NextResponse.json({ error: 'Name and greeting are required' }, { status: 400 });
    }

    const agent = await db.voiceAgent.create({
      data: {
        name,
        description: description || null,
        companyName: companyName || null,
        companyDesc: companyDesc || null,
        greeting,
        voice: voice || 'tongtong',
        speed: speed || 1.0,
        tone: tone || 'professional',
        isActive: true,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}