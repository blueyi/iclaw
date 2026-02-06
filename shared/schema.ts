import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  conversationId: varchar("conversation_id").notNull(),
});

export const settings = pgTable("settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  openclawUrl: text("openclaw_url").default(""),
  saveMessagesLocally: boolean("save_messages_locally").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").unique(),
  referralCode: varchar("referral_code", { length: 12 }).unique().notNull(),
  referredBy: varchar("referred_by", { length: 12 }),
  totalTokensEarned: integer("total_tokens_earned").default(0).notNull(),
  currentTokenBalance: integer("current_token_balance").default(0).notNull(),
  isPro: boolean("is_pro").default(false).notNull(),
  proExpiresAt: timestamp("pro_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const referrals = pgTable("referrals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  referrerProfileId: varchar("referrer_profile_id").notNull(),
  referredProfileId: varchar("referred_profile_id").notNull(),
  referrerReward: integer("referrer_reward").default(100).notNull(),
  referredReward: integer("referred_reward").default(50).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyRewards = pgTable("daily_rewards", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  rewardDate: date("reward_date").notNull(),
  tokensEarned: integer("tokens_earned").default(10).notNull(),
  streakDay: integer("streak_day").default(1).notNull(),
  bonusMultiplier: integer("bonus_multiplier").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userStreaks = pgTable("user_streaks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").unique().notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastClaimDate: date("last_claim_date"),
  totalDaysClaimed: integer("total_days_claimed").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tokenTransactions = pgTable("token_transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  amount: integer("amount").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ }) => ({}));

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  referrals: many(referrals),
  dailyRewards: many(dailyRewards),
  transactions: many(tokenTransactions),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(userProfiles, {
    fields: [referrals.referrerProfileId],
    references: [userProfiles.id],
  }),
  referred: one(userProfiles, {
    fields: [referrals.referredProfileId],
    references: [userProfiles.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  content: true,
  role: true,
  conversationId: true,
});

export const insertSettingsSchema = createInsertSchema(settings).pick({
  openclawUrl: true,
  saveMessagesLocally: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  walletAddress: true,
  referredBy: true,
});

export const insertReferralSchema = createInsertSchema(referrals).pick({
  referrerProfileId: true,
  referredProfileId: true,
});

export const insertDailyRewardSchema = createInsertSchema(dailyRewards).pick({
  profileId: true,
  rewardDate: true,
  tokensEarned: true,
  streakDay: true,
});

export const insertTokenTransactionSchema = createInsertSchema(tokenTransactions).pick({
  profileId: true,
  amount: true,
  type: true,
  description: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

export type InsertDailyReward = z.infer<typeof insertDailyRewardSchema>;
export type DailyReward = typeof dailyRewards.$inferSelect;

export type UserStreak = typeof userStreaks.$inferSelect;

export type InsertTokenTransaction = z.infer<typeof insertTokenTransactionSchema>;
export type TokenTransaction = typeof tokenTransactions.$inferSelect;

export const messageUsage = pgTable("message_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  usageDate: date("usage_date").notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MessageUsage = typeof messageUsage.$inferSelect;
