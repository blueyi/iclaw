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

export const sessions = pgTable("sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: varchar("token", { length: 64 }).unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").unique(),
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

export const quickActions = pgTable("quick_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  iconColor: varchar("icon_color", { length: 20 }).default("#9b5cff").notNull(),
  command: text("command").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  command: text("command").notNull(),
  cronExpression: varchar("cron_expression", { length: 100 }),
  intervalMinutes: integer("interval_minutes"),
  isActive: boolean("is_active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const actionLogs = pgTable("action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  actionId: varchar("action_id"),
  title: text("title").notNull(),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  result: text("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuickAction = typeof quickActions.$inferSelect;
export type InsertQuickAction = typeof quickActions.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;
export type ActionLog = typeof actionLogs.$inferSelect;

export const messageUsage = pgTable("message_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  usageDate: date("usage_date").notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MessageUsage = typeof messageUsage.$inferSelect;

export const agentThoughts = pgTable("agent_thoughts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  sessionId: varchar("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tokenCosts = pgTable("token_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  cost: text("cost").notNull(),
  requestType: varchar("request_type", { length: 30 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cpuPercent: integer("cpu_percent").default(0).notNull(),
  memoryPercent: integer("memory_percent").default(0).notNull(),
  diskPercent: integer("disk_percent").default(0).notNull(),
  cpuModel: text("cpu_model"),
  totalMemoryMb: integer("total_memory_mb"),
  totalDiskMb: integer("total_disk_mb"),
  uptime: integer("uptime"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentMemories = pgTable("agent_memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  memoryType: varchar("memory_type", { length: 30 }).notNull(),
  tags: text("tags"),
  importance: integer("importance").default(3).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emergencyStops = pgTable("emergency_stops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  reason: text("reason").notNull(),
  stoppedProcesses: text("stopped_processes"),
  status: varchar("status", { length: 20 }).default("triggered").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentThought = typeof agentThoughts.$inferSelect;
export type InsertAgentThought = typeof agentThoughts.$inferInsert;
export type TokenCost = typeof tokenCosts.$inferSelect;
export type InsertTokenCost = typeof tokenCosts.$inferInsert;
export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = typeof systemMetrics.$inferInsert;
export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = typeof agentMemories.$inferInsert;
export type EmergencyStop = typeof emergencyStops.$inferSelect;
export type InsertEmergencyStop = typeof emergencyStops.$inferInsert;

export const soulConfigs = pgTable("soul_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const installedSkills = pgTable("installed_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  skillName: varchar("skill_name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  source: varchar("source", { length: 30 }).notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  securityStatus: varchar("security_status", { length: 20 }).default("unreviewed").notNull(),
  config: text("config"),
  installedAt: timestamp("installed_at").defaultNow().notNull(),
});

export const spendingLimits = pgTable("spending_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").unique().notNull(),
  dailyLimit: integer("daily_limit").default(500).notNull(),
  monthlyLimit: integer("monthly_limit").default(10000).notNull(),
  alertThreshold: integer("alert_threshold").default(80).notNull(),
  alertEnabled: boolean("alert_enabled").default(true).notNull(),
  currentDailySpend: integer("current_daily_spend").default(0).notNull(),
  currentMonthlySpend: integer("current_monthly_spend").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pairedNodes = pgTable("paired_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  nodeId: varchar("node_id", { length: 100 }).notNull(),
  nodeName: varchar("node_name", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 30 }).notNull(),
  capabilities: text("capabilities"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  pairedAt: timestamp("paired_at"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelConnections = pgTable("channel_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull(),
  channelType: varchar("channel_type", { length: 30 }).notNull(),
  channelName: varchar("channel_name", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  lastMessageAt: timestamp("last_message_at"),
  connectedAt: timestamp("connected_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  config: text("config"),
});

export const gatewayTlsConfig = pgTable("gateway_tls_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").unique().notNull(),
  tlsEnabled: boolean("tls_enabled").default(false).notNull(),
  certPath: text("cert_path"),
  keyPath: text("key_path"),
  verifyPeer: boolean("verify_peer").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SoulConfig = typeof soulConfigs.$inferSelect;
export type InsertSoulConfig = typeof soulConfigs.$inferInsert;
export type InstalledSkill = typeof installedSkills.$inferSelect;
export type InsertInstalledSkill = typeof installedSkills.$inferInsert;
export type SpendingLimit = typeof spendingLimits.$inferSelect;
export type InsertSpendingLimit = typeof spendingLimits.$inferInsert;
export type PairedNode = typeof pairedNodes.$inferSelect;
export type InsertPairedNode = typeof pairedNodes.$inferInsert;
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = typeof channelConnections.$inferInsert;
export type GatewayTlsConfig = typeof gatewayTlsConfig.$inferSelect;
export type InsertGatewayTlsConfig = typeof gatewayTlsConfig.$inferInsert;
