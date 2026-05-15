'use client';

import React, { useEffect, useRef, useState } from 'react';
import UserAvatar from './UserAvatar';
import { CallState } from '@/types';

interface VideoCallProps {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callError: string | null;
  isMuted: boolean;
  isCamOff: boolean;
  toggleMute: () => void;
  toggleCamera: () => void;
  onEndCall: () => void;
  peerName: string;
  peerImage?: string;
}

export default function VideoCall({
  callState,
  localStream,
  remoteStream,
  callError,
  isMuted,
  isCamOff,
  toggleMute,
  toggleCamera,
  onEndCall,
  peerName,
  peerImage,
}: VideoCallProps) {
  const [duration, setDuration] = useState(0);
  
  // UI manages its own refs to decouple from async calling operations
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // ── SECURE SYNC EFFECT ──────────────────────────────────────────────
  // Binds the reactive state streams to physical DOM nodes seamlessly.
  // This prevents race conditions where getUserMedia completes before React mounts.
  
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        console.log('Attaching local hardware stream to viewport');
        localVideoRef.current.srcObject = localStream;
        // Explicitly trigger hardware playback to satisfy mobile browser security policies
        localVideoRef.current.play().catch((e) => console.warn("Local video playback issue:", e));
      }
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        console.log('Attaching incoming remote stream to viewport');
        remoteVideoRef.current.srcObject = remoteStream;
        // Explicitly trigger remote hardware playback
        remoteVideoRef.current.play().catch((e) => console.warn("Remote video playback issue:", e));
      }
    }
  }, [remoteStream]);

  // Timer Logic for duration tracking
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (callState === 'connected') {
      setDuration(0);
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  if (callState === 'idle' || callState === 'incoming') return null;

  const isConnecting = callState === 'calling';
  const showRemoteStream = !isConnecting && !callError;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col animate-fade-in overflow-hidden text-white select-none font-sans">
      
      {/* Top Overlay - Caller Details & Timer */}
      <div className="absolute top-0 inset-x-0 p-6 z-20 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <UserAvatar name={peerName} image={peerImage} size="md" className="border border-white/10" />
            {callState === 'connected' && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-950 animate-pulse"></span>
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white leading-tight truncate max-w-[180px]">{peerName}</h3>
            <div className="flex items-center gap-2 text-xs mt-1 tracking-wide">
              {callError ? (
                <span className="text-rose-500 font-bold uppercase">Call Blocked</span>
              ) : isConnecting ? (
                <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-ping"></span>
                  Calling...
                </span>
              ) : (
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  Connected • {formatDuration(duration)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Interface Body Container */}
      <div className="flex-1 w-full h-full relative flex items-center justify-center bg-zinc-900/40">
        
        {/* 1. PEER REMOTE STREAM WINDOW (ALWAYS MOUNTED) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover bg-zinc-950 transition-opacity duration-500 ${
            showRemoteStream ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
          }`}
        />

        {/* 2. PULSING AVATAR / CONNECTING CARD */}
        {isConnecting && !callError && (
          <div className="flex flex-col items-center gap-6 z-10 animate-fade-in">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-48 h-48 bg-indigo-500/10 rounded-full animate-ping border border-indigo-500/20" style={{ animationDuration: '3s' }}></div>
              <div className="absolute w-36 h-36 bg-indigo-500/20 rounded-full animate-pulse border border-indigo-500/30"></div>
              <UserAvatar name={peerName} image={peerImage} size="lg" className="w-24 h-24 ring-4 ring-zinc-800 shadow-2xl scale-110" />
            </div>
            <p className="text-zinc-400 text-sm font-medium tracking-wide animate-pulse">Awaiting active response...</p>
          </div>
        )}

        {/* 3. CRITICAL HARDWARE ERROR SHIELD (REPLACES BLINKING) */}
        {callError && (
          <div className="max-w-md w-full mx-4 bg-zinc-900 border border-rose-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center space-y-6 animate-slide-in z-50 ring-4 ring-rose-500/10 bg-opacity-95 backdrop-blur-md">
            <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full animate-bounce">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-black text-white">Security Check Failed</h4>
              <p className="text-sm text-zinc-400 font-medium leading-relaxed px-2">
                {callError}
              </p>
            </div>
            
            <div className="w-full bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800 text-xs text-zinc-500 font-mono leading-relaxed text-left select-text">
              👉 To test on multiple devices, serve over <strong className="text-zinc-300 font-bold">HTTPS</strong> or test via standard <strong className="text-zinc-300 font-bold">http://localhost:3000</strong>!
            </div>

            <button
              onClick={onEndCall}
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-xl hover:shadow-rose-600/20 transition cursor-pointer active:scale-95"
            >
              Close Terminal
            </button>
          </div>
        )}
      </div>

      {/* Picture-in-Picture Floating Preview (ALWAYS MOUNTED to stabilize hardware) */}
      {!callError && (
        <div className="absolute bottom-28 right-6 md:right-10 w-40 h-56 md:w-48 md:h-64 rounded-2xl shadow-2xl border-2 border-zinc-800 overflow-hidden z-30 bg-zinc-900/90 shadow-black/80 transition-all duration-300 hover:scale-[1.02] animate-slide-in group">
          
          {/* Self Video Frame */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted // Prevent loopback
            className={`w-full h-full object-cover scale-x-[-1] ${
              isCamOff ? 'opacity-0 absolute' : 'opacity-100'
            }`}
          />

          {/* Camera Off Overlay placeholder (no dynamic unmounting) */}
          {isCamOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950 animate-fade-in">
              <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
              </svg>
              <span className="text-[10px] font-bold tracking-wider uppercase mt-2 opacity-50">Cam Paused</span>
            </div>
          )}

          <div className="absolute top-2 left-2 z-40 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-zinc-300 select-none pointer-events-none">
            You
          </div>
        </div>
      )}

      {/* Bottom Dock Action Pill (Hidden if experiencing system block) */}
      {!callError && (
        <div className="absolute bottom-0 inset-x-0 p-8 z-40 bg-gradient-to-t from-black to-transparent flex justify-center">
          <div className="bg-zinc-900/90 backdrop-blur-2xl px-6 py-4 rounded-full border border-zinc-800/80 shadow-2xl shadow-black/80 flex items-center gap-5 animate-slide-in">
            
            {/* Microphone Switcher */}
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full cursor-pointer transition-all duration-300 hover:scale-110 flex items-center justify-center ${
                isMuted 
                  ? 'bg-rose-600 text-white hover:bg-rose-700 ring-4 ring-rose-600/20' 
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
              title={isMuted ? "Unmute mic" : "Mute mic"}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            {/* Camera Switcher */}
            <button
              onClick={toggleCamera}
              className={`p-4 rounded-full cursor-pointer transition-all duration-300 hover:scale-110 flex items-center justify-center ${
                isCamOff 
                  ? 'bg-rose-600 text-white hover:bg-rose-700 ring-4 ring-rose-600/20' 
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
              title={isCamOff ? "Turn on camera" : "Turn off camera"}
            >
              {isCamOff ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <div className="w-px h-8 bg-zinc-800 mx-1"></div>

            {/* End Call Trigger */}
            <button
              onClick={onEndCall}
              className="p-5 rounded-full cursor-pointer transition-all duration-300 bg-rose-600 text-white hover:bg-rose-700 hover:scale-110 flex items-center justify-center shadow-lg hover:shadow-rose-600/30 shadow-rose-600/20 active:translate-y-0"
              title="Hang up"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
