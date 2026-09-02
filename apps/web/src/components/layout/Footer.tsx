import React from 'react';
import { Video } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-dark-border bg-dark-bg/60 py-8 px-4 sm:px-6 lg:px-8 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <div className="w-6 h-6 rounded-lg bg-brand-600 flex items-center justify-center text-white">
            <Video className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-slate-200">Boom</span>
          <span>— Meet. Talk. Connect.</span>
        </div>
        <p className="text-xs text-slate-500">
          Browser-native WebRTC video conferencing. Zero installation required.
        </p>
      </div>
    </footer>
  );
};
