import React from 'react';
import Image from 'next/image';

interface UserAvatarProps {
  name?: string;
  image?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function UserAvatar({ name, image, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm font-semibold',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-16 h-16 text-xl font-extrabold',
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
    <div className={`relative rounded-full overflow-hidden flex-shrink-0 select-none flex items-center justify-center ${sizeClasses[size]} ${className}`}>
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
  );
}
