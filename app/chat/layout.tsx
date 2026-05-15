import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import User from '@/models/User'; // Explicit import for mongoose populating
import RoomList from '@/components/RoomList';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');

  await connectDB();
  
  const userIdStr = (session.user as any).id;
  
  let roomsData: any[] = [];
  try {
    const mongoose = await import('mongoose');
    const userId = new mongoose.default.Types.ObjectId(userIdStr);
    
    // Explicitly fetch existing rooms, filtering private DMs robustly:
    // 1. Public channels: isDM is not true AND name does NOT match "dm:" regex prefix
    // 2. Direct Messages: Matches (isDM true OR "dm:" name prefix) AND current user is a member
    roomsData = await Room.find({
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
  } catch (err) {
    console.error("Layout data load error:", err);
  }

  // Parse mongoose documents to plain object so it can be passed to client components
  const rooms = JSON.parse(JSON.stringify(roomsData));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 font-sans">
      {/* Left Sidebar */}
      <RoomList initialRooms={rooms} />

      {/* Main Workspace Area */}
      <main className="flex-1 h-full relative bg-white dark:bg-zinc-950 flex flex-col">
        {children}
      </main>
    </div>
  );
}
