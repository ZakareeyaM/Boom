import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import type { User, Meeting, Participant, ChatMessage, MeetingHistoryItem } from '@boom/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseAdapter {
  init(): Promise<void>;
  // Users
  createUser(user: { id: string; name: string; email: string; passwordHash: string; avatarUrl?: string }): Promise<User>;
  getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null>;
  getUserById(id: string): Promise<User | null>;
  
  // Meetings
  createMeeting(meeting: { id: string; meetingCode: string; hostId: string; title?: string }): Promise<Meeting>;
  getMeetingByCode(code: string): Promise<Meeting | null>;
  getMeetingById(id: string): Promise<Meeting | null>;
  endMeeting(id: string): Promise<void>;
  getUserMeetingHistory(userId: string): Promise<MeetingHistoryItem[]>;
  
  // Participants
  addParticipant(participant: { id: string; meetingId: string; userId?: string | null; displayName: string; isHost: boolean }): Promise<void>;
  markParticipantLeft(id: string): Promise<void>;
  
  // Messages
  saveMessage(msg: { id: string; meetingId: string; senderId: string; senderName: string; isHost: boolean; message: string; createdAt: string }): Promise<ChatMessage>;
  getMeetingMessages(meetingId: string): Promise<ChatMessage[]>;
}

// In-Memory / File-backed Store for zero-setup execution
class FileStoreDatabase implements DatabaseAdapter {
  private dataFilePath = path.resolve(__dirname, '../../.data_store.json');
  private users: Map<string, User & { passwordHash: string }> = new Map();
  private meetings: Map<string, Meeting> = new Map();
  private participants: Map<string, any> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users) {
          for (const u of parsed.users) this.users.set(u.id, u);
        }
        if (parsed.meetings) {
          for (const m of parsed.meetings) this.meetings.set(m.id, m);
        }
        if (parsed.participants) {
          for (const p of parsed.participants) this.participants.set(p.id, p);
        }
        if (parsed.messages) {
          for (const [mid, msgs] of Object.entries(parsed.messages)) {
            this.messages.set(mid, msgs as ChatMessage[]);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read existing data file, initializing fresh store', e);
    }
  }

  private saveToDisk() {
    try {
      const data = {
        users: Array.from(this.users.values()),
        meetings: Array.from(this.meetings.values()),
        participants: Array.from(this.participants.values()),
        messages: Object.fromEntries(this.messages.entries()),
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist database state to disk', e);
    }
  }

  async init(): Promise<void> {
    console.log('✅ FileStore / In-Memory relational database initialized.');
  }

  async createUser(user: { id: string; name: string; email: string; passwordHash: string; avatarUrl?: string }): Promise<User> {
    const now = new Date().toISOString();
    const newUser: User & { passwordHash: string } = {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(newUser.id, newUser);
    this.saveToDisk();
    const { passwordHash, ...safeUser } = newUser;
    return safeUser;
  }

  async getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email === normalized) return u;
    }
    return null;
  }

  async getUserById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    if (!u) return null;
    const { passwordHash, ...safeUser } = u;
    return safeUser;
  }

  async createMeeting(meeting: { id: string; meetingCode: string; hostId: string; title?: string }): Promise<Meeting> {
    const now = new Date().toISOString();
    const newMeeting: Meeting = {
      id: meeting.id,
      meetingCode: meeting.meetingCode,
      hostId: meeting.hostId,
      title: meeting.title || 'Boom Meeting',
      status: 'ACTIVE',
      createdAt: now,
    };
    this.meetings.set(newMeeting.id, newMeeting);
    this.saveToDisk();
    return newMeeting;
  }

  async getMeetingByCode(code: string): Promise<Meeting | null> {
    const normalized = code.toUpperCase().trim();
    for (const m of this.meetings.values()) {
      if (m.meetingCode === normalized) return m;
    }
    return null;
  }

  async getMeetingById(id: string): Promise<Meeting | null> {
    return this.meetings.get(id) || null;
  }

  async endMeeting(id: string): Promise<void> {
    const m = this.meetings.get(id);
    if (m) {
      m.status = 'ENDED';
      m.endedAt = new Date().toISOString();
      this.saveToDisk();
    }
  }

  async getUserMeetingHistory(userId: string): Promise<MeetingHistoryItem[]> {
    const userMeetings: MeetingHistoryItem[] = [];
    for (const m of this.meetings.values()) {
      if (m.hostId === userId) {
        const start = new Date(m.createdAt).getTime();
        const end = m.endedAt ? new Date(m.endedAt).getTime() : Date.now();
        const durationMinutes = Math.max(1, Math.round((end - start) / (1000 * 60)));
        
        let pCount = 0;
        for (const p of this.participants.values()) {
          if (p.meetingId === m.id) pCount++;
        }

        userMeetings.push({
          id: m.id,
          meetingCode: m.meetingCode,
          title: m.title || 'Boom Meeting',
          createdAt: m.createdAt,
          endedAt: m.endedAt,
          durationMinutes,
          participantCount: Math.max(1, pCount),
          isHost: true,
        });
      }
    }
    return userMeetings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async addParticipant(participant: { id: string; meetingId: string; userId?: string | null; displayName: string; isHost: boolean }): Promise<void> {
    const record = {
      id: participant.id,
      meetingId: participant.meetingId,
      userId: participant.userId || null,
      displayName: participant.displayName,
      isHost: participant.isHost,
      joinedAt: new Date().toISOString(),
    };
    this.participants.set(record.id, record);
    this.saveToDisk();
  }

  async markParticipantLeft(id: string): Promise<void> {
    const p = this.participants.get(id);
    if (p) {
      p.leftAt = new Date().toISOString();
      this.saveToDisk();
    }
  }

  async saveMessage(msg: { id: string; meetingId: string; senderId: string; senderName: string; isHost: boolean; message: string; createdAt: string }): Promise<ChatMessage> {
    const chatMsg: ChatMessage = {
      id: msg.id,
      meetingId: msg.meetingId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      isHost: msg.isHost,
      message: msg.message,
      createdAt: msg.createdAt,
    };
    const list = this.messages.get(msg.meetingId) || [];
    list.push(chatMsg);
    this.messages.set(msg.meetingId, list);
    this.saveToDisk();
    return chatMsg;
  }

  async getMeetingMessages(meetingId: string): Promise<ChatMessage[]> {
    return this.messages.get(meetingId) || [];
  }
}

// PostgreSQL Database Adapter
class PostgresDatabase implements DatabaseAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async init(): Promise<void> {
    const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await this.pool.query(sql);
      console.log('✅ PostgreSQL Schema migrated successfully.');
    }
  }

  async createUser(user: { id: string; name: string; email: string; passwordHash: string; avatarUrl?: string }): Promise<User> {
    const res = await this.pool.query(
      `INSERT INTO users (id, name, email, password_hash, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      [user.id, user.name, user.email.toLowerCase().trim(), user.passwordHash, user.avatarUrl || null]
    );
    return res.rows[0];
  }

  async getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const res = await this.pool.query(
      `SELECT id, name, email, password_hash as "passwordHash", avatar_url as "avatarUrl",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    return res.rows[0] || null;
  }

  async getUserById(id: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT id, name, email, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createMeeting(meeting: { id: string; meetingCode: string; hostId: string; title?: string }): Promise<Meeting> {
    const res = await this.pool.query(
      `INSERT INTO meetings (id, meeting_code, host_id, title, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, meeting_code as "meetingCode", host_id as "hostId", title, status, created_at as "createdAt"`,
      [meeting.id, meeting.meetingCode, meeting.hostId, meeting.title || 'Boom Meeting']
    );
    return res.rows[0];
  }

  async getMeetingByCode(code: string): Promise<Meeting | null> {
    const res = await this.pool.query(
      `SELECT id, meeting_code as "meetingCode", host_id as "hostId", title, status,
              created_at as "createdAt", ended_at as "endedAt"
       FROM meetings WHERE meeting_code = $1`,
      [code.toUpperCase().trim()]
    );
    return res.rows[0] || null;
  }

  async getMeetingById(id: string): Promise<Meeting | null> {
    const res = await this.pool.query(
      `SELECT id, meeting_code as "meetingCode", host_id as "hostId", title, status,
              created_at as "createdAt", ended_at as "endedAt"
       FROM meetings WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async endMeeting(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE meetings SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
  }

  async getUserMeetingHistory(userId: string): Promise<MeetingHistoryItem[]> {
    const res = await this.pool.query(
      `SELECT m.id, m.meeting_code as "meetingCode", m.title, m.created_at as "createdAt", m.ended_at as "endedAt",
              COALESCE(EXTRACT(EPOCH FROM (COALESCE(m.ended_at, CURRENT_TIMESTAMP) - m.created_at)) / 60, 1)::int as "durationMinutes",
              COUNT(p.id) as "participantCount",
              (m.host_id = $1) as "isHost"
       FROM meetings m
       LEFT JOIN participants p ON p.meeting_id = m.id
       WHERE m.host_id = $1
       GROUP BY m.id, m.meeting_code, m.title, m.created_at, m.ended_at, m.host_id
       ORDER BY m.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async addParticipant(participant: { id: string; meetingId: string; userId?: string | null; displayName: string; isHost: boolean }): Promise<void> {
    await this.pool.query(
      `INSERT INTO participants (id, meeting_id, user_id, display_name, is_host)
       VALUES ($1, $2, $3, $4, $5)`,
      [participant.id, participant.meetingId, participant.userId || null, participant.displayName, participant.isHost]
    );
  }

  async markParticipantLeft(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE participants SET left_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
  }

  async saveMessage(msg: { id: string; meetingId: string; senderId: string; senderName: string; isHost: boolean; message: string; createdAt: string }): Promise<ChatMessage> {
    const res = await this.pool.query(
      `INSERT INTO messages (id, meeting_id, participant_id, sender_name, is_host, message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, meeting_id as "meetingId", participant_id as "senderId", sender_name as "senderName",
                 is_host as "isHost", message, created_at as "createdAt"`,
      [msg.id, msg.meetingId, msg.senderId, msg.senderName, msg.isHost, msg.message, msg.createdAt]
    );
    return res.rows[0];
  }

  async getMeetingMessages(meetingId: string): Promise<ChatMessage[]> {
    const res = await this.pool.query(
      `SELECT id, meeting_id as "meetingId", participant_id as "senderId", sender_name as "senderName",
              is_host as "isHost", message, created_at as "createdAt"
       FROM messages WHERE meeting_id = $1 ORDER BY created_at ASC`,
      [meetingId]
    );
    return res.rows;
  }
}

// Select appropriate adapter based on configuration
let dbInstance: DatabaseAdapter;

export function getDatabase(): DatabaseAdapter {
  if (!dbInstance) {
    if (config.databaseUrl && config.databaseUrl.startsWith('postgres')) {
      try {
        console.log('Connecting to PostgreSQL database...');
        dbInstance = new PostgresDatabase(config.databaseUrl);
      } catch (err) {
        console.warn('PostgreSQL connection failed, falling back to FileStore relational adapter', err);
        dbInstance = new FileStoreDatabase();
      }
    } else {
      dbInstance = new FileStoreDatabase();
    }
  }
  return dbInstance;
}
