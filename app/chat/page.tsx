import React from 'react';

export default function ChatIndexPage() {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-zinc-950 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-40 dark:bg-[radial-gradient(#27272a_1px,transparent_1px)]"></div>
      <div className="max-w-md space-y-6 relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-indigo-50 to-violet-50 dark:from-zinc-900 dark:to-zinc-800 border border-indigo-100 dark:border-zinc-800 shadow-md flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-pulse">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
          Welcome to ChatApp
        </h2>
        <p className="text-slate-500 dark:text-zinc-400">
          Select a room from the sidebar to start messaging, or create a new channel to connect with your friends.
        </p>
      </div>
    </div>
  );
}
