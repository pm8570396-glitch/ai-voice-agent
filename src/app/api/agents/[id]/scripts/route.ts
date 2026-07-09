import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scripts = await db.agentScript.findMany({
      where: { agentId: id },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json(scripts);
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return NextResponse.json({ error: 'Failed to fetch scripts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, content, order } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // Get the next order if not specified
    let scriptOrder = order;
    if (scriptOrder === undefined || scriptOrder === null) {
      const maxOrder = await db.agentScript.findFirst({
        where: { agentId: id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      scriptOrder = (maxOrder?.order || 0) + 1;
    }

    const script = await db.agentScript.create({
      data: {
        agentId: id,
        title,
        content,
        order: scriptOrder,
      },
    });

    return NextResponse.json(script, { status: 201 });
  } catch (error) {
    console.error('Error creating script:', error);
    return NextResponse.json({ error: 'Failed to create script' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { scripts } = body; // Array of { id, title, content, order, isActive }

    if (scripts && Array.isArray(scripts)) {
      // Bulk update scripts
      const updates = scripts.map((s: { id: string; title?: string; content?: string; order?: number; isActive?: boolean }) =>
        db.agentScript.update({
          where: { id: s.id },
          data: {
            ...(s.title !== undefined && { title: s.title }),
            ...(s.content !== undefined && { content: s.content }),
            ...(s.order !== undefined && { order: s.order }),
            ...(s.isActive !== undefined && { isActive: s.isActive }),
          },
        })
      );
      await Promise.all(updates);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Error updating scripts:', error);
    return NextResponse.json({ error: 'Failed to update scripts' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const { searchParams } = new URL(req.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId query param is required' }, { status: 400 });
    }

    await db.agentScript.delete({
      where: { id: scriptId, agentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting script:', error);
    return NextResponse.json({ error: 'Failed to delete script' }, { status: 500 });
  }
}