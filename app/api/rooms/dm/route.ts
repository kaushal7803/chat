import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { targetUserId } = await req.json();
  if (!targetUserId) {
    return NextResponse.json({ error: 'Target user required' }, { status: 400 });
  }

  await connectDB();

  const currentUserId = (session.user as any).id;

  if (currentUserId === targetUserId) {
    return NextResponse.json({ error: 'Cannot start a DM with yourself' }, { status: 400 });
  }

  try {
    // Create a deterministic name for the DM room so it is unique for any two users
    const sortedIds = [currentUserId, targetUserId].sort();
    const dmRoomName = `dm:${sortedIds[0]}_${sortedIds[1]}`;

    // 1. Try to find an existing DM Room with this deterministic name
    let existingRoom = await Room.findOne({ name: dmRoomName });

    if (existingRoom) {
      return NextResponse.json(existingRoom);
    }

    // 2. If not found, provision a fresh one
    const newRoom = await Room.create({
      name: dmRoomName,
      isDM: true,
      createdBy: currentUserId,
      members: [currentUserId, targetUserId],
    });

    return NextResponse.json(newRoom, { status: 201 });
  } catch (error) {
    console.error('Error creating or fetching DM room:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
