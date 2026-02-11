import {
  type User,
  type InsertUser,
  type Message,
  type InsertMessage,
  type Settings,
  type InsertSettings,
  type UserProfile,
  type InsertUserProfile,
  type Referral,
  type DailyReward,
  type UserStreak,
  type TokenTransaction,
  type MessageUsage,
  type QuickAction,
  type InsertQuickAction,
  type Schedule,
  type InsertSchedule,
  type ActionLog,
  type Session,
  users,
  messages,
  settings,
  userProfiles,
  referrals,
  dailyRewards,
  userStreaks,
  tokenTransactions,
  messageUsage,
  quickActions,
  schedules,
  actionLogs,
  sessions,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, sql, and, gt } from "drizzle-orm";
import crypto from "crypto";

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessages(conversationId: string): Promise<void>;

  getSettings(): Promise<Settings | undefined>;
  updateSettings(data: Partial<InsertSettings>): Promise<Settings>;

  getOrCreateProfile(walletAddress?: string, referredBy?: string): Promise<UserProfile>;
  getProfileById(id: string): Promise<UserProfile | undefined>;
  getProfileByWallet(walletAddress: string): Promise<UserProfile | undefined>;
  getProfileByReferralCode(code: string): Promise<UserProfile | undefined>;
  updateProfile(id: string, data: Partial<UserProfile>): Promise<UserProfile>;

  createReferral(referrerProfileId: string, referredProfileId: string): Promise<Referral>;
  completeReferral(referralId: string): Promise<void>;
  getReferralsByReferrer(profileId: string): Promise<Referral[]>;

  getStreak(profileId: string): Promise<UserStreak | undefined>;
  updateStreak(profileId: string, data: Partial<UserStreak>): Promise<UserStreak>;
  claimDailyReward(profileId: string): Promise<{ reward: DailyReward; streak: UserStreak; tokensEarned: number }>;
  canClaimToday(profileId: string): Promise<boolean>;

  addTokens(profileId: string, amount: number, type: string, description?: string): Promise<TokenTransaction>;
  getTransactions(profileId: string, limit?: number): Promise<TokenTransaction[]>;

  getMessageUsage(profileId: string, date: string): Promise<MessageUsage | undefined>;
  incrementMessageUsage(profileId: string): Promise<MessageUsage>;

  getQuickActions(profileId: string): Promise<QuickAction[]>;
  createQuickAction(data: InsertQuickAction): Promise<QuickAction>;
  deleteQuickAction(id: string, profileId: string): Promise<void>;
  seedDefaultActions(profileId: string): Promise<QuickAction[]>;

  getSchedules(profileId: string): Promise<Schedule[]>;
  createSchedule(data: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, profileId: string, data: Partial<Schedule>): Promise<Schedule>;
  deleteSchedule(id: string, profileId: string): Promise<void>;

  createActionLog(profileId: string, actionType: string, actionId: string | null, title: string, status: string, result?: string): Promise<ActionLog>;
  getActionLogs(profileId: string, limit?: number): Promise<ActionLog[]>;

  createSession(userId: string): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;
  getProfileByUserId(userId: string): Promise<UserProfile | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async deleteMessages(conversationId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  }

  async getSettings(): Promise<Settings | undefined> {
    const [result] = await db.select().from(settings).limit(1);
    return result || undefined;
  }

  async updateSettings(data: Partial<InsertSettings>): Promise<Settings> {
    const existing = await this.getSettings();

    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values({
          openclawUrl: data.openclawUrl || "",
          saveMessagesLocally: data.saveMessagesLocally ?? true,
        })
        .returning();
      return created;
    }
  }

  async getOrCreateProfile(walletAddress?: string, referredBy?: string): Promise<UserProfile> {
    if (walletAddress) {
      const existing = await this.getProfileByWallet(walletAddress);
      if (existing) return existing;
    }

    let referralCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await this.getProfileByReferralCode(referralCode);
      if (!existing) break;
      referralCode = generateReferralCode();
      attempts++;
    }

    const [profile] = await db
      .insert(userProfiles)
      .values({
        walletAddress: walletAddress || null,
        referralCode,
        referredBy: referredBy || null,
      })
      .returning();

    await db.insert(userStreaks).values({
      profileId: profile.id,
    });

    if (referredBy) {
      const referrer = await this.getProfileByReferralCode(referredBy);
      if (referrer) {
        await this.createReferral(referrer.id, profile.id);
      }
    }

    return profile;
  }

  async getProfileById(id: string): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, id));
    return profile || undefined;
  }

  async getProfileByWallet(walletAddress: string): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.walletAddress, walletAddress));
    return profile || undefined;
  }

  async getProfileByReferralCode(code: string): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.referralCode, code));
    return profile || undefined;
  }

  async updateProfile(id: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const [updated] = await db
      .update(userProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userProfiles.id, id))
      .returning();
    return updated;
  }

  async createReferral(referrerProfileId: string, referredProfileId: string): Promise<Referral> {
    const referrerProfile = await this.getProfileById(referrerProfileId);
    const referrerReward = referrerProfile?.isPro ? 200 : 100;
    const referredReward = 50;

    const [referral] = await db
      .insert(referrals)
      .values({
        referrerProfileId,
        referredProfileId,
        referrerReward,
        referredReward,
        status: "pending",
      })
      .returning();
    return referral;
  }

  async completeReferral(referralId: string): Promise<void> {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.id, referralId));

    if (!referral || referral.status === "completed") return;

    await db
      .update(referrals)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(referrals.id, referralId));

    await this.addTokens(referral.referrerProfileId, referral.referrerReward, "referral", "Referral bonus");
    await this.addTokens(referral.referredProfileId, referral.referredReward, "referral_bonus", "Welcome bonus from referral");
  }

  async getReferralsByReferrer(profileId: string): Promise<Referral[]> {
    return db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerProfileId, profileId))
      .orderBy(desc(referrals.createdAt));
  }

  async getStreak(profileId: string): Promise<UserStreak | undefined> {
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.profileId, profileId));
    return streak || undefined;
  }

  async updateStreak(profileId: string, data: Partial<UserStreak>): Promise<UserStreak> {
    const existing = await this.getStreak(profileId);

    if (existing) {
      const [updated] = await db
        .update(userStreaks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userStreaks.profileId, profileId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userStreaks)
        .values({ profileId, ...data })
        .returning();
      return created;
    }
  }

  async canClaimToday(profileId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await db
      .select()
      .from(dailyRewards)
      .where(
        and(
          eq(dailyRewards.profileId, profileId),
          eq(dailyRewards.rewardDate, today)
        )
      );
    return !existing;
  }

  async claimDailyReward(profileId: string): Promise<{ reward: DailyReward; streak: UserStreak; tokensEarned: number }> {
    const canClaim = await this.canClaimToday(profileId);
    if (!canClaim) {
      throw new Error("Already claimed today's reward");
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let streak = await this.getStreak(profileId);
    if (!streak) {
      streak = await this.updateStreak(profileId, { currentStreak: 0, longestStreak: 0, totalDaysClaimed: 0 });
    }

    let newStreak = 1;
    if (streak.lastClaimDate === yesterday) {
      newStreak = streak.currentStreak + 1;
    }

    const profile = await this.getProfileById(profileId);
    const baseReward = profile?.isPro ? 20 : 10;
    const bonusMultiplier = Math.min(Math.floor(newStreak / 7) + 1, 5);
    const tokensEarned = baseReward * bonusMultiplier;

    const [reward] = await db
      .insert(dailyRewards)
      .values({
        profileId,
        rewardDate: today,
        tokensEarned,
        streakDay: newStreak,
        bonusMultiplier,
      })
      .returning();

    const updatedStreak = await this.updateStreak(profileId, {
      currentStreak: newStreak,
      longestStreak: Math.max(streak.longestStreak, newStreak),
      lastClaimDate: today,
      totalDaysClaimed: streak.totalDaysClaimed + 1,
    });

    await this.addTokens(profileId, tokensEarned, "daily_reward", `Day ${newStreak} streak reward`);

    const pendingReferrals = await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referredProfileId, profileId),
          eq(referrals.status, "pending")
        )
      );

    for (const ref of pendingReferrals) {
      await this.completeReferral(ref.id);
    }

    return { reward, streak: updatedStreak, tokensEarned };
  }

  async addTokens(profileId: string, amount: number, type: string, description?: string): Promise<TokenTransaction> {
    const [transaction] = await db
      .insert(tokenTransactions)
      .values({
        profileId,
        amount,
        type,
        description,
      })
      .returning();

    await db
      .update(userProfiles)
      .set({
        currentTokenBalance: sql`${userProfiles.currentTokenBalance} + ${amount}`,
        totalTokensEarned: sql`${userProfiles.totalTokensEarned} + ${Math.max(0, amount)}`,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.id, profileId));

    return transaction;
  }

  async getTransactions(profileId: string, limit = 50): Promise<TokenTransaction[]> {
    return db
      .select()
      .from(tokenTransactions)
      .where(eq(tokenTransactions.profileId, profileId))
      .orderBy(desc(tokenTransactions.createdAt))
      .limit(limit);
  }

  async getMessageUsage(profileId: string, date: string): Promise<MessageUsage | undefined> {
    const [usage] = await db
      .select()
      .from(messageUsage)
      .where(
        and(
          eq(messageUsage.profileId, profileId),
          eq(messageUsage.usageDate, date)
        )
      );
    return usage || undefined;
  }

  async incrementMessageUsage(profileId: string): Promise<MessageUsage> {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.getMessageUsage(profileId, today);

    if (existing) {
      const [updated] = await db
        .update(messageUsage)
        .set({
          messageCount: sql`${messageUsage.messageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(messageUsage.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(messageUsage)
        .values({
          profileId,
          usageDate: today,
          messageCount: 1,
        })
        .returning();
      return created;
    }
  }

  async getQuickActions(profileId: string): Promise<QuickAction[]> {
    return db
      .select()
      .from(quickActions)
      .where(eq(quickActions.profileId, profileId))
      .orderBy(asc(quickActions.sortOrder));
  }

  async createQuickAction(data: InsertQuickAction): Promise<QuickAction> {
    const [action] = await db.insert(quickActions).values(data).returning();
    return action;
  }

  async deleteQuickAction(id: string, profileId: string): Promise<void> {
    await db
      .delete(quickActions)
      .where(and(eq(quickActions.id, id), eq(quickActions.profileId, profileId)));
  }

  async seedDefaultActions(profileId: string): Promise<QuickAction[]> {
    const existing = await this.getQuickActions(profileId);
    if (existing.length > 0) return existing;

    const defaults = [
      { title: "Check Calendar", description: "View upcoming meetings and events", icon: "calendar", iconColor: "#10b981", command: "check_calendar", sortOrder: 0 },
      { title: "Run Backup", description: "Execute system backup script", icon: "terminal", iconColor: "#f59e0b", command: "run_backup", sortOrder: 1 },
      { title: "Summarize Emails", description: "Get a summary of unread emails", icon: "mail", iconColor: "#22d3ee", command: "summarize_emails", sortOrder: 2 },
      { title: "System Status", description: "Check AI system health", icon: "settings", iconColor: "#6366f1", command: "system_status", sortOrder: 3 },
      { title: "Quick Note", description: "Save a thought or reminder", icon: "file-text", iconColor: "#f59e0b", command: "quick_note", sortOrder: 4 },
    ];

    const created: QuickAction[] = [];
    for (const d of defaults) {
      const action = await this.createQuickAction({ ...d, profileId, isDefault: true });
      created.push(action);
    }
    return created;
  }

  async getSchedules(profileId: string): Promise<Schedule[]> {
    return db
      .select()
      .from(schedules)
      .where(eq(schedules.profileId, profileId))
      .orderBy(desc(schedules.createdAt));
  }

  async createSchedule(data: InsertSchedule): Promise<Schedule> {
    const [schedule] = await db.insert(schedules).values(data).returning();
    return schedule;
  }

  async updateSchedule(id: string, profileId: string, data: Partial<Schedule>): Promise<Schedule> {
    const [updated] = await db
      .update(schedules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schedules.id, id), eq(schedules.profileId, profileId)))
      .returning();
    return updated;
  }

  async deleteSchedule(id: string, profileId: string): Promise<void> {
    await db
      .delete(schedules)
      .where(and(eq(schedules.id, id), eq(schedules.profileId, profileId)));
  }

  async createActionLog(profileId: string, actionType: string, actionId: string | null, title: string, status: string, result?: string): Promise<ActionLog> {
    const [log] = await db
      .insert(actionLogs)
      .values({ profileId, actionType, actionId, title, status, result })
      .returning();
    return log;
  }

  async getActionLogs(profileId: string, limit = 20): Promise<ActionLog[]> {
    return db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.profileId, profileId))
      .orderBy(desc(actionLogs.createdAt))
      .limit(limit);
  }

  async createSession(userId: string): Promise<Session> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [session] = await db
      .insert(sessions)
      .values({ userId, token, expiresAt })
      .returning();
    return session;
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, new Date())
        )
      );
    return session || undefined;
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }
}

export const storage = new DatabaseStorage();
