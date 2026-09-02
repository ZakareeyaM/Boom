import React from 'react';
import { ScreenShare, Check, X, User } from 'lucide-react';
import { Button } from '../common/Button';

interface ScreenShareRequestModalProps {
  requesterName: string;
  onApprove: () => void;
  onDeny: () => void;
}

export const ScreenShareRequestModal: React.FC<ScreenShareRequestModalProps> = ({
  requesterName,
  onApprove,
  onDeny,
}) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDeny} />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm bg-dark-card border border-dark-border rounded-2xl shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4 duration-200">
        {/* Icon */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
            <ScreenShare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Screen Share Request</h3>
            <p className="text-xs text-slate-400 mt-0.5">Waiting for your approval</p>
          </div>
        </div>

        {/* Requester info */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-surface border border-dark-border">
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Wants to share their screen</p>
            <p className="text-sm font-semibold text-white">{requesterName}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            leftIcon={<Check className="w-4 h-4" />}
            className="flex-1"
          >
            Allow
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onDeny}
            leftIcon={<X className="w-4 h-4" />}
            className="flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
};
