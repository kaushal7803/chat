import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Message from '@/models/Message';
import User from '@/models/User'; // Ensure User model is registered for populate

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before'); // for pagination

  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

  await connectDB();

  const query: any = { roomId };
  if (before) query.createdAt = { $lt: new Date(before) };

  try {
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'name image')
      .lean();

    return NextResponse.json(messages.reverse());
  } catch (error) {
    console.error('Fetch messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
