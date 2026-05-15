import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import RoomClientView from './RoomClientView';

interface PageProps {
  params: Promise<{
    roomId: string;
  }>;
}

export default async function RoomPage({ params }: PageProps) {
  // 1. Await params as required by Next.js 15+
  const { roomId } = await params;

  // 2. Guard Session
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');

  // 3. Connect DB and fetch Room
  await connectDB();
  
  let roomData;
  try {
    roomData = await Room.findById(roomId).lean();
  } catch (err) {
    // Handle invalid Mongoose object ID formats
    return notFound();
  }

  if (!roomData) {
    return notFound();
  }

  // 4. Serialize Room Info
  const serializedRoom = {
    id: String(roomData._id),
    name: String(roomData.name),
    description: roomData.description ? String(roomData.description) : undefined,
  };

  return <RoomClientView room={serializedRoom} />;
}
