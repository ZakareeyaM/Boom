import React from 'react';

interface AvatarProps {
  name: string;
  url?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isSpeaking?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ name, url, size = 'md', isSpeaking = false }) => {
  const getInitials = (n: string) => {
    if (!n) return 'B';
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base font-semibold',
    xl: 'w-20 h-20 text-2xl font-bold',
    '2xl': 'w-28 h-28 text-3xl font-extrabold',
  };

  const initials = getInitials(name);

  // Derive distinct gradient based on name hash
  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-emerald-600 to-teal-700',
    'from-violet-600 to-purple-700',
    'from-amber-600 to-orange-700',
    'from-rose-600 to-pink-700',
    'from-cyan-600 to-blue-700',
  ];
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradient = gradients[hash % gradients.length];

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full select-none shadow-md transition-all duration-200 ${
        sizes[size]
      } ${isSpeaking ? 'ring-4 ring-emerald-500/80 ring-offset-2 ring-offset-dark-surface' : ''}`}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            // Fallback to gradient if image fails
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : null}
      <div
        className={`w-full h-full rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-medium`}
      >
        {initials}
      </div>
    </div>
  );
};
