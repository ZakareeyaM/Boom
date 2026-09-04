import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export const ThemeToggle: React.FC<{className?: string}> = ({className=''}) => {
  const {setTheme,isDark}=useTheme();
  return <button onClick={()=>setTheme(isDark?'light':'dark')} aria-label={isDark?'Switch to light mode':'Switch to dark mode'} title={isDark?'Light mode':'Dark mode'} className={`p-2.5 rounded-xl border border-dark-border bg-dark-card text-slate-300 hover:text-white hover:bg-dark-hover transition-colors ${className}`}>{isDark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>;
};
