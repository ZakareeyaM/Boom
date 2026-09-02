import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { UserX, AlertTriangle, PhoneOff } from 'lucide-react';
import type { Participant } from '@boom/types';

interface RemoveParticipantModalProps {
  isOpen: boolean;
  participant: Participant | null;
  onClose: () => void;
  onConfirmRemove: (participantId: string) => void;
}

export const RemoveParticipantModal: React.FC<RemoveParticipantModalProps> = ({
  isOpen,
  participant,
  onClose,
  onConfirmRemove,
}) => {
  if (!participant) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remove Participant" maxWidth="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
          <UserX className="w-6 h-6 shrink-0" />
          <p className="text-sm font-medium">
            Remove <strong className="text-white">{participant.displayName}</strong> from this meeting?
          </p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The participant will be immediately disconnected from the call.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirmRemove(participant.id);
              onClose();
            }}
          >
            Remove
          </Button>
        </div>
      </div>
    </Modal>
  );
};

interface EndMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmEnd: () => void;
}

export const EndMeetingModal: React.FC<EndMeetingModalProps> = ({
  isOpen,
  onClose,
  onConfirmEnd,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="End Meeting for Everyone" maxWidth="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <p className="text-sm font-medium">
            End this meeting for all participants?
          </p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          All participants will be disconnected and the meeting session will be closed.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirmEnd();
              onClose();
            }}
          >
            End Meeting
          </Button>
        </div>
      </div>
    </Modal>
  );
};

interface LeaveMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLeave: () => void;
}

export const LeaveMeetingModal: React.FC<LeaveMeetingModalProps> = ({
  isOpen,
  onClose,
  onConfirmLeave,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Leave Meeting" maxWidth="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          Are you sure you want to leave this meeting?
        </p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Stay
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirmLeave();
              onClose();
            }}
            leftIcon={<PhoneOff className="w-4 h-4" />}
          >
            Leave
          </Button>
        </div>
      </div>
    </Modal>
  );
};
