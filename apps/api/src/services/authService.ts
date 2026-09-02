import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { getDatabase } from '../db/index.js';
import type { User, AuthSession } from '@boom/types';

export class AuthService {
  private db = getDatabase();

  async register(params: { name: string; email: string; password: string }): Promise<AuthSession> {
    const existing = await this.db.getUserByEmail(params.email);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(params.password, salt);
    const id = `user_${crypto.randomUUID()}`;

    // Generate nice avatar fallback URL based on user initial
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(params.name)}`;

    const user = await this.db.createUser({
      id,
      name: params.name.trim(),
      email: params.email.toLowerCase().trim(),
      passwordHash,
      avatarUrl,
    });

    const token = this.generateToken(user);
    return { user, token };
  }

  async login(params: { email: string; password: string }): Promise<AuthSession> {
    const userRecord = await this.db.getUserByEmail(params.email);
    if (!userRecord) {
      throw new Error('Invalid email or password.');
    }

    const match = await bcrypt.compare(params.password, userRecord.passwordHash);
    if (!match) {
      throw new Error('Invalid email or password.');
    }

    const { passwordHash, ...user } = userRecord;
    const token = this.generateToken(user);
    return { user, token };
  }

  async verifyToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      if (!decoded?.userId) return null;
      return await this.db.getUserById(decoded.userId);
    } catch {
      return null;
    }
  }

  generateToken(user: User): string {
    return jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
  }
}

export const authService = new AuthService();
