import React from 'react';
import { Check, X, PenLine, User } from 'lucide-react';
import { Button } from '../common/Button';

interface WhiteboardRequestModalProps {
  requesterName: string;
  onApprove: () => void;
  onDeny: () => void;
}

export const WhiteboardRequestModal: React.FC<WhiteboardRequestModalProps> = ({
  requesterName,
  onApprove,
  onDeny,
}) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDeny} />

      <div className="relative w-full max-w-sm bg-dark-card border border-dark-border rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <PenLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Whiteboard Request</h3>
            <p className="text-xs text-slate-400 mt-0.5">Waiting for your approval</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-surface border border-dark-border">
          <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{requesterName} wants to make changes to the whiteboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            leftIcon={<Check className="w-4 h-4" />}
            className="flex-1"
          >
            Yes, Allow
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onDeny}
            leftIcon={<X className="w-4 h-4" />}
            className="flex-1"
          >
            No
          </Button>
        </div>
      </div>
    </div>
  );
};
