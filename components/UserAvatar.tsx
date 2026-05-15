import React from 'react';
import Image from 'next/image';

interface UserAvatarProps {
  name?: string;
  image?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  status?: 'online' | 'offline';
}

export default function UserAvatar({ name, image, size = 'md', className = '', status }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm font-semibold',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-16 h-16 text-xl font-extrabold',
  };

  const statusSizeClasses = {
    sm: 'w-2.5 h-2.5 border-2',
    md: 'w-3 h-3 border-2',
    lg: 'w-3.5 h-3.5 border-2.5',
    xl: 'w-4 h-4 border-3',
  };

  const getInitials = (nameStr?: string) => {
    if (!nameStr) return '?';
    const parts = nameStr.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const bgColors = [
    'bg-indigo-600',
    'bg-violet-600',
    'bg-purple-600',
    'bg-fuchsia-600',
    'bg-rose-600',
    'bg-pink-600',
    'bg-teal-600',
    'bg-emerald-600',
  ];

  // Generate deterministic background index based on name
  const getBgColor = (nameStr?: string) => {
    if (!nameStr) return bgColors[0];
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) {
      hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    return bgColors[Math.abs(hash) % bgColors.length];
  };

  return (
    <div className="relative inline-block flex-shrink-0 select-none">
      {/* Main Masked Circle Wrapper */}
      <div className={`rounded-full overflow-hidden flex items-center justify-center ${sizeClasses[size]} ${className}`}>
        {image ? (
          <Image
            src={image}
            alt={name || 'Avatar'}
            fill
            sizes="(max-width: 768px) 64px, 128px"
            className="object-cover"
            unoptimized={true} // NextAuth google images are external, simplify to unoptimized
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center text-white ${getBgColor(name)}`}>
            {getInitials(name)}
          </div>
        )}
      </div>

      {/* Global Presence Status Indicator Overlay */}
      {status && (
        <span 
          className={`absolute bottom-0 right-0 rounded-full border-white dark:border-zinc-900 z-10 ${statusSizeClasses[size]} ${
            status === 'online' 
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
              : 'bg-slate-300 dark:bg-zinc-600'
          }`}
          title={status === 'online' ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
