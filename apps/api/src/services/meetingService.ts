import crypto from 'crypto';
import { getDatabase } from '../db/index.js';
import { generateMeetingCode } from './meetingCode.js';
import type { Meeting, MeetingHistoryItem } from '@boom/types';

export class MeetingService {
  private db = getDatabase();

  async createMeeting(params: { hostId: string; title?: string }): Promise<Meeting> {
    // Generate unique code and check for collisions
    let meetingCode = generateMeetingCode();
    let existing = await this.db.getMeetingByCode(meetingCode);
    let attempts = 0;

    while (existing && attempts < 5) {
      meetingCode = generateMeetingCode();
      existing = await this.db.getMeetingByCode(meetingCode);
      attempts++;
    }

    const meetingId = `meet_${crypto.randomUUID()}`;
    const meeting = await this.db.createMeeting({
      id: meetingId,
      meetingCode,
      hostId: params.hostId,
      title: params.title || 'Boom Meeting',
    });

    return meeting;
  }

  async getOrCreatePersonalMeeting(hostAccessKey: string, title = 'My Boom Room'): Promise<Meeting> {
    const normalizedKey = hostAccessKey.trim();
    if (!normalizedKey || normalizedKey.length < 16 || normalizedKey.length > 128) {
      throw new Error('Invalid personal room key.');
    }

    const existing = await this.db.getMeetingByHostAccessKey(normalizedKey);
    if (existing) return existing;

    const hostId = `personal_${crypto.createHash('sha256').update(normalizedKey).digest('hex').slice(0, 32)}`;
    const existingHost = await this.db.getUserById(hostId);
    if (!existingHost) {
      await this.db.createUser({
        id: hostId,
        name: 'Host',
        email: `${hostId}@boom.local`,
        passwordHash: 'personal_room_nologin',
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=Host`,
      });
    }

    let meetingCode = generateMeetingCode();
    let collision = await this.db.getMeetingByCode(meetingCode);
    let attempts = 0;
    while (collision && attempts < 10) {
      meetingCode = generateMeetingCode();
      collision = await this.db.getMeetingByCode(meetingCode);
      attempts++;
    }
    if (collision) throw new Error('Could not generate a unique personal meeting code.');

    return await this.db.createMeeting({
      id: `meet_${crypto.randomUUID()}`,
      meetingCode,
      hostId,
      title,
      hostAccessKey: normalizedKey,
      isPersistent: true,
    });
  }

  async getMeetingByCode(code: string): Promise<Meeting | null> {
    return await this.db.getMeetingByCode(code);
  }

  async getMeetingById(id: string): Promise<Meeting | null> {
    return await this.db.getMeetingById(id);
  }

  async endMeeting(meetingId: string, requestedByUserId: string): Promise<void> {
    const meeting = await this.db.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found.');
    }

    if (meeting.hostId !== requestedByUserId) {
      throw new Error('Unauthorized: Only the meeting host can end the meeting.');
    }

    await this.db.endMeeting(meetingId);
  }

  async getUserHistory(userId: string): Promise<MeetingHistoryItem[]> {
    return await this.db.getUserMeetingHistory(userId);
  }
}

export const meetingService = new MeetingService();
