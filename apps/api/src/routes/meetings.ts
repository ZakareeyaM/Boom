import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { meetingService } from '../services/meetingService.js';
import { authService } from '../services/authService.js';
import { getDatabase } from '../db/index.js';

export const meetingsRouter = Router();

const createMeetingSchema = z.object({
  title: z.string().max(100).optional(),
});

// Create new meeting
meetingsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    let userId: string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const user = await authService.verifyToken(token);
      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      userId = user.id;
    } else {
      // Create guest host user
      const guestId = `guest_${crypto.randomUUID()}`;
      const db = getDatabase();
      const guestUser = await db.createUser({
        id: guestId,
        name: 'Host',
        email: `guest_${guestId}@boom.local`,
        passwordHash: 'guest_nologin',
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=Host`,
      });
      userId = guestUser.id;
    }

    const parsed = createMeetingSchema.safeParse(req.body);
    const meeting = await meetingService.createMeeting({
      hostId: userId,
      title: parsed.success ? parsed.data.title : 'Boom Meeting',
    });

    res.status(201).json({ meeting });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create meeting' });
  }
});

// Get or create the browser's permanent personal meeting room.
meetingsRouter.post('/personal', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = z.object({ hostAccessKey: z.string().min(16).max(128) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'A valid personal room key is required.' });
      return;
    }

    const meeting = await meetingService.getOrCreatePersonalMeeting(parsed.data.hostAccessKey);
    res.status(200).json({ meeting });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load personal meeting room' });
  }
});

// Get meeting by code
meetingsRouter.get('/code/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const meeting = await meetingService.getMeetingByCode(String(code));

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found. Please check the meeting code.' });
      return;
    }

    if (meeting.status === 'ENDED') {
      res.status(410).json({ error: 'This meeting has already ended.' });
      return;
    }

    res.status(200).json({ meeting });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve meeting' });
  }
});

// Get meeting history for authenticated user
meetingsRouter.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const user = await authService.verifyToken(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    const history = await meetingService.getUserHistory(user.id);
    res.status(200).json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch meeting history' });
  }
});

// End meeting (Host only)
meetingsRouter.post('/:id/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const user = await authService.verifyToken(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await meetingService.endMeeting(String(meetingId), user.id);

    res.status(200).json({ success: true, message: 'Meeting ended successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to end meeting' });
  }
});
