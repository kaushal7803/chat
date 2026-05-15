import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import User from '@/models/User'; 
import mongoose from 'mongoose';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userIdStr = (session.user as any).id;
  
  await connectDB();
  
  try {
    const userId = new mongoose.Types.ObjectId(userIdStr);
    
    // Fire-and-forget background sync for any legacy DM rooms missing the explicit Boolean flag
    Room.updateMany({ name: /^dm:/, isDM: { $ne: true } }, { $set: { isDM: true } }).exec().catch(() => {});

    // Fetch rooms robustly:
    // 1. Public channels: isDM is not true AND the name does NOT match the "dm:" regex prefix
    // 2. Direct Messages: Matches (isDM true OR "dm:" name prefix) AND user belongs to members array
    const rooms = await Room.find({
      $or: [
        { isDM: { $ne: true }, name: { $not: /^dm:/ } },
        {
          $or: [
            { isDM: true },
            { name: /^dm:/ }
          ],
          members: userId
        }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name image')
      .populate('members', 'name email image')
      .lean();

    return NextResponse.json(rooms);
  } catch (err) {
    console.error('Failed to query rooms:', err);
    return NextResponse.json({ error: 'Query error' }, { status: 500 });
  }
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
