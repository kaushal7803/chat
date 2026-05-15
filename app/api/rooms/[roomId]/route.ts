import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import User from '@/models/User'; // Force model registration for populate

interface RouteParams {
  params: Promise<{
    roomId: string;
  }>;
}

// ── GET /api/rooms/[roomId] ───────────────────────────────────────────
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { roomId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    
    const room = await Room.findById(roomId)
      .populate('createdBy', 'name image')
      .lean();

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch (err) {
    console.error('GET room error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── DELETE /api/rooms/[roomId] ────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { roomId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;

  try {
    await connectDB();
    
    const room = await Room.findById(roomId);

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Force strict creator verification for security
    if (room.createdBy.toString() !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: Only the creator can delete this room' },
        { status: 403 }
      );
    }

    await Room.findByIdAndDelete(roomId);
    
    // NOTE: Optional - You could also delete all Messages inside this room
    // await Message.deleteMany({ roomId });

    return NextResponse.json({ success: true, message: 'Room deleted successfully' });
  } catch (err) {
    console.error('DELETE room error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
