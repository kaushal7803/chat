'use client';

import React, { useEffect } from 'react';
import UserAvatar from './UserAvatar';

interface IncomingCallProps {
  callerName: string;
  callerImage?: string;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCall({
  callerName,
  callerImage,
  onAccept,
  onReject,
}: IncomingCallProps) {
  // We could play a ringing audio element here!
  useEffect(() => {
    console.log('Incoming call ringing...');
    // We can optionally add a ringtone audio here if we had an asset.
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-[100] p-4 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        
        {/* Ringing Animation Wave Container */}
        <div className="relative h-48 bg-slate-50 dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
          
          {/* CSS Animation Pulse rings */}
          <div className="absolute w-32 h-32 bg-emerald-400/20 dark:bg-emerald-500/10 rounded-full animate-ping duration-[2000ms]"></div>
          <div className="absolute w-44 h-44 bg-emerald-400/10 dark:bg-emerald-500/5 rounded-full animate-ping duration-[2500ms] delay-300"></div>
          
          <div className="relative z-10 scale-110">
            <UserAvatar name={callerName} image={callerImage} size="xl" className="border-4 border-white dark:border-zinc-900 shadow-xl" />
          </div>
        </div>

        {/* Call Info Text */}
        <div className="p-6 text-center space-y-2 bg-white dark:bg-zinc-900">
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            {callerName}
          </h3>
          <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold tracking-widest uppercase animate-pulse flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            Incoming Voice Call...
          </p>
        </div>

        {/* Call Actions */}
        <div className="px-6 pb-8 pt-2 flex justify-center gap-6 bg-white dark:bg-zinc-900">
          
          {/* Reject Button */}
          <button
            onClick={onReject}
            className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 dark:shadow-none transition flex items-center justify-center transform hover:scale-105 active:scale-95 cursor-pointer"
            title="Decline"
          >
            <svg className="w-8 h-8 transform rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.72l.54 2.21a1 1 0 01-.24.97l-2.41 2.41a15.58 15.58 0 006.77 6.77l2.41-2.41a1 1 0 01.97-.24l2.21.54a1 1 0 01.72.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>

          {/* Accept Button */}
          <button
            onClick={onAccept}
            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 dark:shadow-none transition flex items-center justify-center transform hover:scale-105 active:scale-95 cursor-pointer animate-bounce"
            title="Accept"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.72l.54 2.21a1 1 0 01-.24.97l-2.41 2.41a15.58 15.58 0 006.77 6.77l2.41-2.41a1 1 0 01.97-.24l2.21.54a1 1 0 01.72.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          
        </div>
      </div>
    </div>
  );
}
