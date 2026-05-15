import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SignInButton from '@/components/SignInButton';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/chat');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-black px-4 text-slate-900 dark:text-white">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900/50 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8 space-y-8 text-center transform transition-all">
        <div className="space-y-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
            ChatApp
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-lg">
            Connect in real-time with text & crystal-clear voice calls.
          </p>
        </div>
        
        <div className="flex justify-center">
          <SignInButton />
        </div>
        
        <p className="text-xs text-slate-400 dark:text-zinc-500">
          By signing in, you agree to jump into awesome conversations.
        </p>
      </div>
    </main>
  );
}
