import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, ShieldCheck, Zap, Laptop, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { fetchApi } from '../utils/api';
import type { Meeting } from '@boom/types';

export const LandingPage: React.FC = () => {
  const [meetingCode, setMeetingCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleCreateMeeting = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetchApi<{ meeting: Meeting }>('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ title: 'Quick Meeting' }),
      });
      navigate(`/join/${res.meeting.meetingCode}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = meetingCode.trim().toUpperCase();
    if (!clean) return;
    navigate(`/join/${clean}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-slate-100">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5" />
            Zero Downloads. Zero Hassle. 100% Web-Based.
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-tight">
            Meet. Talk. <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-blue-600">Connect.</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Boom brings frictionless, high-definition video conferencing directly to your browser. No apps to install, no plugins, no friction.
          </p>

          {/* Actions */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateMeeting}
              isLoading={isCreating}
              leftIcon={<Video className="w-5 h-5" />}
              className="w-full sm:w-auto"
            >
              New Meeting
            </Button>

            <form onSubmit={handleJoinByCode} className="w-full sm:w-auto flex items-center gap-2">
              <Input
                type="text"
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                placeholder="Enter Code (e.g. AB7X-K92P)"
                className="w-full sm:w-48 uppercase tracking-wider font-mono text-center"
              />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                disabled={!meetingCode.trim()}
                aria-label="Join meeting"
              >
                Join
              </Button>
            </form>
          </div>

          {error && (
            <p className="text-xs text-rose-400 font-medium">{error}</p>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-dark-card/50 border border-dark-border hover:border-brand-500/30 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              <Laptop className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Browser Native</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Built on WebRTC standards. Runs seamlessly on Google Chrome, Edge, Firefox, and Safari on desktop and mobile.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-dark-card/50 border border-dark-border hover:border-brand-500/30 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Instant Sharing</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Create a meeting with one click, send the link over WhatsApp or email, and talk in seconds without forced accounts.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-dark-card/50 border border-dark-border hover:border-brand-500/30 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Secure & Private</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              End-to-end peer encrypted media streams with cryptographically secure meeting IDs and server-side host controls.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
