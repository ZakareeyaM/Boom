import { describe, it, expect } from 'vitest';
import { authService } from '../services/authService.js';
import { meetingService } from '../services/meetingService.js';

describe('Auth & Meeting Services', () => {
  it('should register a new user and return user object without passwordHash', async () => {
    const email = `zak_${Date.now()}@example.com`;
    const session = await authService.register({
      name: 'Zak Host',
      email,
      password: 'StrongPassword123!',
    });

    expect(session.user).toBeDefined();
    expect(session.user.id).toBeDefined();
    expect(session.user.name).toBe('Zak Host');
    expect(session.user.email).toBe(email);
    expect(session.token).toBeDefined();
    expect((session.user as any).passwordHash).toBeUndefined();
  });

  it('should prevent duplicate registration with same email', async () => {
    const email = `duplicate_${Date.now()}@example.com`;
    await authService.register({
      name: 'User One',
      email,
      password: 'Password123!',
    });

    await expect(
      authService.register({
        name: 'User Two',
        email,
        password: 'Password123!',
      })
    ).rejects.toThrow('already exists');
  });

  it('should login an existing user with correct credentials and verify JWT', async () => {
    const email = `login_test_${Date.now()}@example.com`;
    await authService.register({
      name: 'Test Login',
      email,
      password: 'CorrectPassword123!',
    });

    const loginSession = await authService.login({
      email,
      password: 'CorrectPassword123!',
    });

    expect(loginSession.user.email).toBe(email);
    expect(loginSession.token).toBeDefined();

    // Verify token
    const verified = await authService.verifyToken(loginSession.token);
    expect(verified).toBeDefined();
    expect(verified?.id).toBe(loginSession.user.id);
  });

  it('should reject login with wrong password', async () => {
    const email = `wrong_pass_${Date.now()}@example.com`;
    await authService.register({
      name: 'Test User',
      email,
      password: 'CorrectPassword123!',
    });

    await expect(
      authService.login({
        email,
        password: 'WrongPassword!',
      })
    ).rejects.toThrow('Invalid email or password');
  });

  it('should create a meeting with unique code and retrieve it', async () => {
    const email = `host_${Date.now()}@example.com`;
    const session = await authService.register({
      name: 'Meeting Host',
      email,
      password: 'Password123!',
    });

    const meeting = await meetingService.createMeeting({
      hostId: session.user.id,
      title: 'Sprint Planning',
    });

    expect(meeting).toBeDefined();
    expect(meeting.meetingCode).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(meeting.status).toBe('ACTIVE');

    const fetched = await meetingService.getMeetingByCode(meeting.meetingCode);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(meeting.id);
    expect(fetched?.hostId).toBe(session.user.id);
  });

  it('should enforce host-only permissions when ending a meeting', async () => {
    const host = await authService.register({
      name: 'Real Host',
      email: `real_host_${Date.now()}@example.com`,
      password: 'Password123!',
    });

    const stranger = await authService.register({
      name: 'Stranger',
      email: `stranger_${Date.now()}@example.com`,
      password: 'Password123!',
    });

    const meeting = await meetingService.createMeeting({
      hostId: host.user.id,
      title: 'Secret Meeting',
    });

    // Stranger tries to end meeting -> should fail
    await expect(
      meetingService.endMeeting(meeting.id, stranger.user.id)
    ).rejects.toThrow('Unauthorized');

    // Real host ends meeting -> should succeed
    await meetingService.endMeeting(meeting.id, host.user.id);
    const updated = await meetingService.getMeetingById(meeting.id);
    expect(updated?.status).toBe('ENDED');
  });
});
