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
  
  // Explicitly fetch existing rooms
  const roomsData = await Room.find()
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name image')
    .lean();

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
