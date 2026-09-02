import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Crown, MessageSquare } from 'lucide-react';
import { Button } from '../common/Button';
import type { ChatMessage } from '@boom/types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (text: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  currentUserId,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  if (!isOpen) return null;

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-dark-surface border-l border-dark-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-400" />
          <h3 className="font-semibold text-slate-100">Meeting Chat</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-dark-card transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <MessageSquare className="w-10 h-10 stroke-1" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs">Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">
                    {msg.senderName} {isMe && '(You)'}
                  </span>
                  {msg.isHost && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded font-semibold">
                      <Crown className="w-2.5 h-2.5" /> Host
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? 'bg-brand-600 text-white rounded-tr-xs'
                      : 'bg-dark-card border border-dark-border text-slate-100 rounded-tl-xs'
                  }`}
                >
                  <p className="break-words whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-dark-border bg-dark-bg/60 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message to everyone..."
          className="flex-1 bg-dark-card border border-dark-border text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          maxLength={2000}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!inputText.trim()}
          aria-label="Send message"
          className="p-2.5 aspect-square rounded-xl"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
};
