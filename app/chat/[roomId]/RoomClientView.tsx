'use client';

import React from 'react';
import { useChat } from '@/hooks/useChat';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import ChatWindow from '@/components/ChatWindow';
import IncomingCall from '@/components/IncomingCall';
import VideoCall from '@/components/VideoCall'; 

interface RoomClientViewProps {
  room: {
    id: string;
    name: string;
    description?: string;
  };
}

export default function RoomClientView({ room }: RoomClientViewProps) {
  // Real-time Chat & Presence Hook
  const { 
    messages, 
    typingUsers, 
    onlineMembers, 
    hasMore,
    isLoadingMore,
    fetchMoreMessages,
    sendMessage, 
    editMessage,
    deleteMessage,
    reactToMessage,
    sendTyping 
  } = useChat(room.id);

  // WebRTC Clean Stateful Media Hook
  const {
    callState,
    incomingCall,
    callTarget,
    localStream,
    remoteStream,
    callError,
    isMuted,
    isCamOff,
    toggleMute,
    toggleCamera,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  } = useVoiceCall();

  // Resolve peer display information for Call overlays
  let peerDisplayName = 'Peer';
  let peerDisplayImage = undefined;

  if (callState === 'incoming' && incomingCall) {
    peerDisplayName = incomingCall.callerName;
    peerDisplayImage = incomingCall.callerImage;
  } else if ((callState === 'calling' || callState === 'connected') && callTarget) {
    // Resolve the target socket's user name from the active presence list
    const targetUser = onlineMembers.find((u) => u.socketId === callTarget);
    if (targetUser) {
      peerDisplayName = targetUser.name;
    } else {
      peerDisplayName = 'Connecting User...';
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col relative overflow-hidden">
      
      {/* Chat Workspace */}
      <ChatWindow
        roomId={room.id}
        roomName={room.name}
        messages={messages}
        typingUsers={typingUsers}
        onlineMembers={onlineMembers}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        fetchMoreMessages={fetchMoreMessages}
        sendMessage={sendMessage}
        editMessage={editMessage}
        deleteMessage={deleteMessage}
        reactToMessage={reactToMessage}
        sendTyping={sendTyping}
        onStartCall={startCall}
        isCallActive={callState !== 'idle'}
      />

      {/* Call Ringer Overlay */}
      {callState === 'incoming' && incomingCall && (
        <IncomingCall
          callerName={peerDisplayName}
          callerImage={peerDisplayImage}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Cinematic Full-Screen Video Call Overlay */}
      {(callState === 'calling' || callState === 'connected') && (
        <VideoCall
          callState={callState}
          localStream={localStream}
          remoteStream={remoteStream}
          callError={callError}
          isMuted={isMuted}
          isCamOff={isCamOff}
          toggleMute={toggleMute}
          toggleCamera={toggleCamera}
          onEndCall={endCall}
          peerName={peerDisplayName}
          peerImage={peerDisplayImage}
        />
      )}
    </div>
  );
}
