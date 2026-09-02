import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Mic, Video as VideoIcon, Volume2 } from 'lucide-react';
import type { MediaDeviceInfoList } from '../../hooks/useMediaStream';

interface DeviceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: MediaDeviceInfoList;
  selectedAudioId: string;
  selectedVideoId: string;
  onSelectAudioDevice: (id: string) => void;
  onSelectVideoDevice: (id: string) => void;
}

export const DeviceSelectorModal: React.FC<DeviceSelectorModalProps> = ({
  isOpen,
  onClose,
  devices,
  selectedAudioId,
  selectedVideoId,
  onSelectAudioDevice,
  onSelectVideoDevice,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Audio & Video Settings">
      <div className="space-y-5">
        {/* Microphone Select */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Mic className="w-4 h-4 text-brand-400" />
            Microphone
          </label>
          <select
            value={selectedAudioId}
            onChange={(e) => onSelectAudioDevice(e.target.value)}
            className="w-full bg-dark-card border border-dark-border text-slate-200 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {devices.audioInputs.length === 0 ? (
              <option value="">Default Microphone</option>
            ) : (
              devices.audioInputs.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Microphone ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Camera Select */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-brand-400" />
            Camera
          </label>
          <select
            value={selectedVideoId}
            onChange={(e) => onSelectVideoDevice(e.target.value)}
            className="w-full bg-dark-card border border-dark-border text-slate-200 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {devices.videoInputs.length === 0 ? (
              <option value="">Default Camera</option>
            ) : (
              devices.videoInputs.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Speakers / Output info */}
        {devices.audioOutputs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-brand-400" />
              Speakers / Output
            </label>
            <select
              className="w-full bg-dark-card border border-dark-border text-slate-200 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {devices.audioOutputs.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Speaker ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-3 flex justify-end">
          <Button variant="primary" onClick={onClose} size="md">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
