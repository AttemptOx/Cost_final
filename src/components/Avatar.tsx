import React from 'react';
import { USERS, UserId } from '../types';

interface AvatarProps {
  id: UserId;
  size?: 'sm' | 'md' | 'lg' | 'custom';
  className?: string;
  grayscale?: boolean;
  opacity?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ id, size = 'md', className = '', grayscale = false, opacity = 1 }) => {
  const user = USERS[id];
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-11 h-11 text-lg', // Adjusted to ~44px
    lg: 'w-16 h-16 text-2xl',
    custom: '',
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold text-white shadow-sm border-2 border-white transition-all duration-300 ${sizeClasses[size]} ${className}`}
      style={{ 
        backgroundColor: user.color,
        filter: grayscale ? 'grayscale(100%)' : 'none',
        opacity: opacity
      }}
    >
      <svg viewBox="0 0 100 100" className="w-2/3 h-2/3 fill-current">
        {id === 'Z' && (
          <path d="M20 20 h60 l-60 60 h60" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {id === 'X' && (
          <path d="M20 20 L80 80 M80 20 L20 80" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {id === 'Y' && (
          <path d="M20 20 L50 50 L80 20 M50 50 L50 80" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
};
