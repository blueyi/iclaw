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
  users,
  messages,
  settings,
  userProfiles,
  referrals,
  dailyRewards,
  userStreaks,
  tokenTransactions,
  messageUsage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, sql, and } from "drizzle-orm";

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
    const [referral] = await db
      .insert(referrals)
      .values({
        referrerProfileId,
        referredProfileId,
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

    const bonusMultiplier = Math.min(Math.floor(newStreak / 7) + 1, 5);
    const baseReward = 10;
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
}

export const storage = new DatabaseStorage();
