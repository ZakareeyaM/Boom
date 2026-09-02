import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Plus, Clock, Users, ArrowRight, Copy, Check, RotateCw } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../utils/api';
import type { Meeting, MeetingHistoryItem } from '@boom/types';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<MeetingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetchApi<{ history: MeetingHistoryItem[] }>('/api/meetings/history');
        setHistory(res.history || []);
      } catch (err) {
        console.warn('Failed to load history', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, []);

  const handleCreateMeeting = async (title = 'Boom Meeting') => {
    setIsCreating(true);
    try {
      const res = await fetchApi<{ meeting: Meeting }>('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      navigate(`/join/${res.meeting.meetingCode}`);
    } catch (err) {
      alert('Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/join/${joinCode.trim().toUpperCase()}`);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-dark-border">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Welcome back, {user?.name || 'there'} 👋
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Start an instant meeting, schedule a call, or revisit recent sessions.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => handleCreateMeeting()}
            isLoading={isCreating}
            leftIcon={<Plus className="w-5 h-5" />}
          >
            New Meeting
          </Button>
        </div>

        {/* Quick Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Instant Meeting Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-brand-900/30 to-brand-800/10 border border-brand-500/20 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Start an Instant Meeting</h3>
              <p className="text-sm text-slate-300">
                Generate a unique secure meeting link and invite participants instantly.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => handleCreateMeeting()}
              isLoading={isCreating}
              className="w-full sm:w-auto self-start"
            >
              Start Meeting Now
            </Button>
          </div>

          {/* Join with Code Card */}
          <div className="p-6 rounded-2xl bg-dark-card border border-dark-border flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Join with a Code</h3>
              <p className="text-sm text-slate-400">
                Enter an invitation code or paste a Boom meeting link.
              </p>
            </div>
            <form onSubmit={handleJoinByCode} className="flex gap-2">
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. AB7X-K92P"
                className="uppercase tracking-wider font-mono text-center text-sm"
              />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                disabled={!joinCode.trim()}
              >
                Join
              </Button>
            </form>
          </div>
        </div>

        {/* Recent Meetings Section */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-400" />
            Recent Meetings
          </h2>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 rounded-2xl bg-dark-surface border border-dark-border text-center space-y-2">
              <p className="text-sm text-slate-400">No meeting history yet.</p>
              <p className="text-xs text-slate-500">
                When you create or join meetings, they will be listed here.
              </p>
            </div>
          ) : (
            <div className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-dark-card border-b border-dark-border text-xs text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5 font-semibold">Title / Code</th>
                      <th className="px-6 py-3.5 font-semibold">Date</th>
                      <th className="px-6 py-3.5 font-semibold">Duration</th>
                      <th className="px-6 py-3.5 font-semibold">Participants</th>
                      <th className="px-6 py-3.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-dark-hover/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">
                          <div className="flex flex-col">
                            <span>{item.title || 'Boom Meeting'}</span>
                            <span className="text-xs font-mono text-slate-400 tracking-wider">
                              {item.meetingCode}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400">{formatDate(item.createdAt)}</td>
                        <td className="px-6 py-4 text-slate-400">{item.durationMinutes} mins</td>
                        <td className="px-6 py-4 text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {item.participantCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => copyCode(item.meetingCode)}
                            title="Copy Link"
                            aria-label="Copy meeting link"
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-dark-card transition-colors inline-flex items-center"
                          >
                            {copiedCode === item.meetingCode ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCreateMeeting(item.title)}
                            leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                          >
                            Start Similar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
