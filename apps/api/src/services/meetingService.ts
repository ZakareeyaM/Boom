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
