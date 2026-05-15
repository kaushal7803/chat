import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import User from '@/models/User'; // Ensure User model is registered for populate

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const rooms = await Room.find().sort({ createdAt: -1 }).populate('createdBy', 'name image');
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Room name required' }, { status: 400 });

  await connectDB();

  const userId = (session.user as any).id;
  
  try {
    const room = await Room.create({
      name: name.trim(),
      description,
      createdBy: userId,
      members: [userId],
    });
    return NextResponse.json(room, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: 'Room name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
