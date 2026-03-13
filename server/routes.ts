import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import {
  runCouncilReview,
  getCouncilHistory,
  getCouncilLog,
  getCouncilConfig,
  updateCouncilConfig,
  isCouncilRunning,
  getLastReview,
} from "./council";
import {
  validateBotToken,
  setupWebhook,
  deleteWebhook,
  sendTelegramMessage,
  sendTypingAction,
  parseTelegramConfig,
  type TelegramUpdate,
} from "./telegram";
import bcrypt from "bcryptjs";
import { URL } from "node:url";
import * as dns from "node:dns/promises";
import * as net from "node:net";

const DEFAULT_CONVERSATION_ID = "default";
const PRO_TOKEN_THRESHOLD = 1000;
const PRO_USD_VALUE = 100;
const FREE_DAILY_MESSAGE_LIMIT = 5;

const SALT_ROUNDS = 12;

async function getAuthUser(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const session = await storage.getSessionByToken(token);
  if (!session) return null;
  const user = await storage.getUser(session.userId);
  return user || null;
}

async function requireAuthWithProfile(req: Request, res: Response): Promise<{ userId: string; profileId: string } | null> {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const profile = await storage.getProfileByUserId(user.id);
  if (!profile) {
    res.status(403).json({ error: "No profile associated with this account" });
    return null;
  }
  return { userId: user.id, profileId: profile.id };
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  }
  return false;
}

async function validateGatewayUrl(urlString: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsed = new URL(urlString);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: "Only HTTP and HTTPS protocols are allowed" };
    }

    if (['localhost', '0.0.0.0'].includes(parsed.hostname)) {
      return { valid: false, error: "Localhost and 0.0.0.0 addresses are not allowed" };
    }

    if (net.isIP(parsed.hostname)) {
      if (isPrivateIp(parsed.hostname)) {
        return { valid: false, error: "Private/internal IP addresses are not allowed" };
      }
    } else {
      try {
        const addresses = await dns.resolve4(parsed.hostname);
        for (const addr of addresses) {
          if (isPrivateIp(addr)) {
            return { valid: false, error: "Domain resolves to a private/internal IP address" };
          }
        }
      } catch {
        return { valid: false, error: "Unable to resolve domain name" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

async function safeFetchGateway(gatewayUrl: string, path: string, options?: RequestInit): Promise<Response | null> {
  const validation = await validateGatewayUrl(gatewayUrl);
  if (!validation.valid) {
    console.warn(`Blocked gateway fetch to ${gatewayUrl}: ${validation.error}`);
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${gatewayUrl}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch {
    return null;
  }
}

async function seedNewProfile(profileId: string): Promise<void> {
  try {
    // Default SOUL.md — I-Claw Personal Assistant identity
    await storage.createSoulConfig({
      profileId,
      name: "I-Claw Assistant",
      content: `# SOUL.md — I-Claw Personal Assistant

## Identity
You are I-Claw, a powerful personal AI assistant built for autonomous operation. You are direct, capable, and resourceful. You act with purpose and keep responses focused.

## Personality
- Concise and clear — no unnecessary filler or padding
- Proactive — anticipate what the user needs next
- Honest — flag uncertainty instead of guessing
- Efficient — prefer doing over explaining

## Behavioral Boundaries
- Always confirm before taking irreversible actions
- Never fabricate information or make up facts
- Respect privacy — do not store or share sensitive data unnecessarily
- Escalate to the user when a task exceeds your confidence level

## Communication Style
- Use plain language; avoid jargon unless the user uses it first
- Keep responses as short as the task allows
- Use bullet points for multi-step information
- Sign off with a clear "done" or "ready" when a task is complete

## Core Directives
1. Complete tasks fully before reporting back
2. Remember context from earlier in the conversation
3. Ask clarifying questions only when truly necessary
4. Optimize for the user's time, not your own verbosity`,
      isActive: true,
    });

    // Spending limits — safe defaults
    await storage.upsertSpendingLimits(profileId, {
      dailyLimit: "50",
      monthlyLimit: "500",
      alertThreshold: 75,
      currentDailySpend: "0",
      currentMonthlySpend: "0",
    });

    // Default heartbeat schedule
    await storage.createSchedule({
      profileId,
      title: "Hourly Heartbeat",
      description: "Periodic agent self-check to confirm systems are running",
      command: "Perform a quick self-check. Report current status, any pending tasks, and confirm systems are nominal. Be brief.",
      cronExpression: "0 * * * *",
      isActive: false,
    });

    // Starter quick actions
    const starterActions = [
      { title: "Morning Brief", description: "Get a focused start to the day", icon: "sun", iconColor: "#F59E0B", command: "Give me a concise morning briefing: what should I focus on today, any reminders I have set, and a motivational thought to start." },
      { title: "Summarize Context", description: "What does the agent know about you", icon: "user", iconColor: "#9b5cff", command: "Summarize everything you know about me and our recent conversations. What are my current goals and active tasks?" },
      { title: "System Check", description: "Agent self-diagnostic", icon: "activity", iconColor: "#22d3ee", command: "Run a quick system check. Report your current capabilities, active skills, connected channels, and any issues you are aware of." },
      { title: "Clear & Reset", description: "Fresh start signal", icon: "refresh-cw", iconColor: "#10b981", command: "Acknowledge we are starting fresh. Confirm you are ready for new instructions and briefly state your current configuration." },
    ];
    for (const action of starterActions) {
      await storage.createQuickAction({
        profileId,
        title: action.title,
        description: action.description,
        icon: action.icon,
        iconColor: action.iconColor,
        command: action.command,
      });
    }

    // Welcome memory entry
    await storage.createMemory({
      profileId,
      title: "MEMORY.md — Personal Context",
      content: `# MEMORY.md

## About Me
[Fill this in — your name, location, timezone, preferences, and anything else you want the agent to always remember]

## Current Goals
[Add your active goals or projects here]

## Preferences
- Communication style: direct and concise
- Preferred model: configured in Settings
- Working hours: [add yours]

## Important Context
- This is a personal I-Claw installation
- All data is stored locally and privately
- Gateway is configured in the Gateway tab`,
      memoryType: "memory_md",
      importance: 5,
    });

    const starterSkills = [
      { skillName: "Web Search", description: "Search the web for real-time information, news, and answers", source: "clawhub", category: "research", securityStatus: "vetted" },
      { skillName: "Summarizer", description: "Condense long text, articles, or conversations into key points", source: "clawhub", category: "productivity", securityStatus: "vetted" },
      { skillName: "Code Assistant", description: "Write, review, and debug code across multiple languages", source: "clawhub", category: "development", securityStatus: "vetted" },
    ];
    for (const skill of starterSkills) {
      await storage.createInstalledSkill({
        profileId,
        skillName: skill.skillName,
        description: skill.description,
        source: skill.source,
        category: skill.category,
        securityStatus: skill.securityStatus,
        isEnabled: true,
      });
    }

    console.log(`[SEED] New profile ${profileId} seeded with defaults`);
  } catch (err: any) {
    console.error(`[SEED] Failed to seed profile ${profileId}:`, err.message);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;

      const allUsers = await storage.getAllUsers();
      if (allUsers.length >= 1) {
        return res.status(403).json({ error: "Registration is closed. This is a single-owner instance." });
      }

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: "Username must be 3-30 characters" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({ username, password: hashedPassword });

      const profile = await storage.getOrCreateProfile();
      if (profile) {
        await storage.updateProfile(profile.id, { userId: user.id } as any);
        await seedNewProfile(profile.id);
      }

      const session = await storage.createSession(user.id);

      res.status(201).json({
        user: { id: user.id, username: user.username },
        token: session.token,
      });
    } catch (error) {
      console.error("Error registering:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      let profile = await storage.getProfileByUserId(user.id);
      if (!profile) {
        profile = await storage.getOrCreateProfile();
        await storage.updateProfile(profile.id, { userId: user.id } as any);
      }

      const session = await storage.createSession(user.id);

      res.json({
        user: { id: user.id, username: user.username },
        token: session.token,
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        await storage.deleteSession(authHeader.slice(7));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error logging out:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const profile = await storage.getProfileByUserId(user.id);

      res.json({
        user: { id: user.id, username: user.username },
        profileId: profile?.id || null,
      });
    } catch (error) {
      console.error("Error fetching auth user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/messages", async (req, res) => {
    try {
      const conversationId =
        (req.query.conversationId as string) || DEFAULT_CONVERSATION_ID;
      const messages = await storage.getMessages(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { content, profileId, model } = req.body;
      const conversationId =
        (req.body.conversationId as string) || DEFAULT_CONVERSATION_ID;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Message content is required" });
      }

      if (profileId) {
        const profile = await storage.getProfileById(profileId);
        if (profile) {
          const isPro = profile.currentTokenBalance >= PRO_TOKEN_THRESHOLD || profile.isPro;
          if (!isPro) {
            const today = new Date().toISOString().split('T')[0];
            const usage = await storage.getMessageUsage(profileId, today);
            const messagesUsed = usage?.messageCount || 0;
            if (messagesUsed >= FREE_DAILY_MESSAGE_LIMIT) {
              return res.status(429).json({
                error: "Daily message limit reached",
                messagesUsed,
                messageLimit: FREE_DAILY_MESSAGE_LIMIT,
                upgrade: true,
              });
            }
          }
          await storage.incrementMessageUsage(profileId);
        }
      }

      const userMessage = await storage.createMessage({
        content,
        role: "user",
        conversationId,
      });

      const settings = await storage.getSettings();
      let assistantResponse: string;

      if (settings?.openclawUrl) {
        const chatResponse = await safeFetchGateway(settings.openclawUrl, '/api/chat', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, ...(model ? { model } : {}) }),
        });

        if (chatResponse?.ok) {
          try {
            const data = await chatResponse.json();
            assistantResponse =
              data.response || data.message || "OpenClaw processed your request.";

            const usedModel = data.model || model || "unknown";
            const inputTokens = data.usage?.prompt_tokens || Math.ceil(content.length / 4);
            const outputTokens = data.usage?.completion_tokens || Math.ceil(assistantResponse.length / 4);
            const cost = data.usage?.cost || ((inputTokens * 0.003 + outputTokens * 0.006) / 1000);
            if (profileId) {
              storage.createTokenCost({
                profileId,
                model: usedModel,
                inputTokens,
                outputTokens,
                cost: String(cost),
                requestType: "chat",
              }).catch(() => {});
            }
          } catch {
            assistantResponse = "OpenClaw processed your request.";
          }
        } else if (!chatResponse) {
          assistantResponse =
            "Unable to reach your OpenClaw server. The URL may be invalid or unreachable.";
        } else {
          assistantResponse =
            "I couldn't connect to your OpenClaw server. Please check your server URL in Settings.";
        }
      } else {
        assistantResponse = generateLocalResponse(content);
      }

      const assistantMessage = await storage.createMessage({
        content: assistantResponse,
        role: "assistant",
        conversationId,
      });

      res.json({ userMessage, assistantMessage });
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.delete("/api/messages", async (req, res) => {
    try {
      const conversationId =
        (req.query.conversationId as string) || DEFAULT_CONVERSATION_ID;
      await storage.deleteMessages(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting messages:", error);
      res.status(500).json({ error: "Failed to delete messages" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      let settings = await storage.getSettings();
      if (!settings) {
        settings = await storage.updateSettings({
          openclawUrl: "",
          saveMessagesLocally: true,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const { openclawUrl, saveMessagesLocally } = req.body;

      if (openclawUrl && openclawUrl.trim() !== '') {
        const urlValidation = await validateGatewayUrl(openclawUrl);
        if (!urlValidation.valid) {
          return res.status(400).json({ error: `Invalid Gateway URL: ${urlValidation.error}` });
        }
      }

      const settings = await storage.updateSettings({
        openclawUrl,
        saveMessagesLocally,
      });
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/usage/:profileId", async (req, res) => {
    try {
      const profile = await storage.getProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const isPro = profile.currentTokenBalance >= PRO_TOKEN_THRESHOLD || profile.isPro;
      const today = new Date().toISOString().split('T')[0];
      const usage = await storage.getMessageUsage(req.params.profileId, today);
      const messagesUsed = usage?.messageCount || 0;
      const messageLimit = isPro ? -1 : FREE_DAILY_MESSAGE_LIMIT;
      const remaining = isPro ? -1 : Math.max(0, FREE_DAILY_MESSAGE_LIMIT - messagesUsed);

      res.json({
        messagesUsed,
        messageLimit,
        isPro,
        remaining,
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  app.post("/api/profile", async (req, res) => {
    try {
      const { walletAddress, referralCode } = req.body;

      const authUser = await getAuthUser(req);
      let profile;
      if (authUser) {
        profile = await storage.getProfileByUserId(authUser.id);
        if (!profile) {
          profile = await storage.getOrCreateProfile(walletAddress, referralCode);
          await storage.updateProfile(profile.id, { userId: authUser.id } as any);
        }
      } else {
        profile = await storage.getOrCreateProfile(walletAddress, referralCode);
      }

      const streak = await storage.getStreak(profile.id);
      const canClaim = await storage.canClaimToday(profile.id);
      
      const isPro = profile.currentTokenBalance >= PRO_TOKEN_THRESHOLD || profile.isPro;

      const today = new Date().toISOString().split('T')[0];
      const usage = await storage.getMessageUsage(profile.id, today);
      const messagesUsed = usage?.messageCount || 0;
      const messageLimit = isPro ? -1 : FREE_DAILY_MESSAGE_LIMIT;
      
      res.json({
        profile: {
          ...profile,
          isPro,
        },
        streak,
        canClaimDailyReward: canClaim,
        proThreshold: PRO_TOKEN_THRESHOLD,
        proUsdValue: PRO_USD_VALUE,
        messagesUsed,
        messageLimit,
      });
    } catch (error) {
      console.error("Error creating/fetching profile:", error);
      res.status(500).json({ error: "Failed to create/fetch profile" });
    }
  });

  app.get("/api/profile/:id", async (req, res) => {
    try {
      const profile = await storage.getProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const streak = await storage.getStreak(profile.id);
      const canClaim = await storage.canClaimToday(profile.id);
      const isPro = profile.currentTokenBalance >= PRO_TOKEN_THRESHOLD || profile.isPro;

      const today = new Date().toISOString().split('T')[0];
      const usage = await storage.getMessageUsage(profile.id, today);
      const messagesUsed = usage?.messageCount || 0;
      const messageLimit = isPro ? -1 : FREE_DAILY_MESSAGE_LIMIT;
      
      res.json({
        profile: {
          ...profile,
          isPro,
        },
        streak,
        canClaimDailyReward: canClaim,
        proThreshold: PRO_TOKEN_THRESHOLD,
        proUsdValue: PRO_USD_VALUE,
        messagesUsed,
        messageLimit,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.get("/api/profile/wallet/:address", async (req, res) => {
    try {
      const profile = await storage.getProfileByWallet(req.params.address);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const streak = await storage.getStreak(profile.id);
      const canClaim = await storage.canClaimToday(profile.id);
      const isPro = profile.currentTokenBalance >= PRO_TOKEN_THRESHOLD || profile.isPro;

      const today = new Date().toISOString().split('T')[0];
      const usage = await storage.getMessageUsage(profile.id, today);
      const messagesUsed = usage?.messageCount || 0;
      const messageLimit = isPro ? -1 : FREE_DAILY_MESSAGE_LIMIT;
      
      res.json({
        profile: {
          ...profile,
          isPro,
        },
        streak,
        canClaimDailyReward: canClaim,
        proThreshold: PRO_TOKEN_THRESHOLD,
        proUsdValue: PRO_USD_VALUE,
        messagesUsed,
        messageLimit,
      });
    } catch (error) {
      console.error("Error fetching profile by wallet:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.put("/api/profile/:id/wallet", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address is required" });
      }
      
      const profile = await storage.updateProfile(req.params.id, { walletAddress });
      res.json(profile);
    } catch (error) {
      console.error("Error updating wallet:", error);
      res.status(500).json({ error: "Failed to update wallet" });
    }
  });

  app.post("/api/rewards/claim", async (req, res) => {
    try {
      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "Profile ID is required" });
      }
      
      const result = await storage.claimDailyReward(profileId);
      const profile = await storage.getProfileById(profileId);
      
      res.json({
        success: true,
        tokensEarned: result.tokensEarned,
        streak: result.streak,
        newBalance: profile?.currentTokenBalance || 0,
      });
    } catch (error: any) {
      console.error("Error claiming reward:", error);
      if (error.message === "Already claimed today's reward") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to claim reward" });
    }
  });

  app.get("/api/rewards/status/:profileId", async (req, res) => {
    try {
      const profile = await storage.getProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const streak = await storage.getStreak(profile.id);
      const canClaim = await storage.canClaimToday(profile.id);
      
      const nextMultiplier = streak ? Math.min(Math.floor((streak.currentStreak + 1) / 7) + 1, 5) : 1;
      const nextReward = 10 * nextMultiplier;
      
      res.json({
        canClaim,
        currentStreak: streak?.currentStreak || 0,
        longestStreak: streak?.longestStreak || 0,
        totalDaysClaimed: streak?.totalDaysClaimed || 0,
        lastClaimDate: streak?.lastClaimDate,
        nextReward,
        nextMultiplier,
      });
    } catch (error) {
      console.error("Error fetching reward status:", error);
      res.status(500).json({ error: "Failed to fetch reward status" });
    }
  });

  app.get("/api/referrals/:profileId", async (req, res) => {
    try {
      const profile = await storage.getProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const referrals = await storage.getReferralsByReferrer(profile.id);
      
      res.json({
        referralCode: profile.referralCode,
        totalReferrals: referrals.length,
        completedReferrals: referrals.filter(r => r.status === "completed").length,
        pendingReferrals: referrals.filter(r => r.status === "pending").length,
        totalEarned: referrals.filter(r => r.status === "completed").reduce((sum, r) => sum + r.referrerReward, 0),
        referrals,
      });
    } catch (error) {
      console.error("Error fetching referrals:", error);
      res.status(500).json({ error: "Failed to fetch referrals" });
    }
  });

  app.get("/api/transactions/:profileId", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await storage.getTransactions(req.params.profileId, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/referral/validate/:code", async (req, res) => {
    try {
      const profile = await storage.getProfileByReferralCode(req.params.code.toUpperCase());
      if (!profile) {
        return res.json({ valid: false });
      }
      res.json({ valid: true });
    } catch (error) {
      console.error("Error validating referral code:", error);
      res.status(500).json({ error: "Failed to validate referral code" });
    }
  });

  app.get("/api/quick-actions/:profileId", async (req, res) => {
    try {
      const actions = await storage.seedDefaultActions(req.params.profileId);
      res.json(actions);
    } catch (error) {
      console.error("Error fetching quick actions:", error);
      res.status(500).json({ error: "Failed to fetch quick actions" });
    }
  });

  app.post("/api/quick-actions", async (req, res) => {
    try {
      const { profileId, title, description, icon, iconColor, command } = req.body;
      if (!profileId || !title || !command) {
        return res.status(400).json({ error: "profileId, title, and command are required" });
      }
      const action = await storage.createQuickAction({
        profileId,
        title,
        description: description || "",
        icon: icon || "zap",
        iconColor: iconColor || "#9b5cff",
        command,
        isDefault: false,
        sortOrder: 99,
      });
      res.json(action);
    } catch (error) {
      console.error("Error creating quick action:", error);
      res.status(500).json({ error: "Failed to create quick action" });
    }
  });

  app.delete("/api/quick-actions/:id", async (req, res) => {
    try {
      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }
      await storage.deleteQuickAction(req.params.id, profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting quick action:", error);
      res.status(500).json({ error: "Failed to delete quick action" });
    }
  });

  app.post("/api/quick-actions/:id/run", async (req, res) => {
    try {
      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      const actions = await storage.getQuickActions(profileId);
      const action = actions.find(a => a.id === req.params.id);
      if (!action) {
        return res.status(404).json({ error: "Action not found" });
      }

      const log = await storage.createActionLog(
        profileId,
        "quick_action",
        action.id,
        action.title,
        "running"
      );

      const settings = await storage.getSettings();
      let result = "";

      if (settings?.openclawUrl) {
        const actionResponse = await safeFetchGateway(settings.openclawUrl, '/api/chat', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Execute command: ${action.command}. ${action.description}` }),
        });
        if (actionResponse?.ok) {
          try {
            const data = await actionResponse.json();
            result = data.response || data.message || "Action completed.";
          } catch {
            result = "Action completed.";
          }
        } else if (!actionResponse) {
          result = "Unable to reach OpenClaw server. URL may be invalid or unreachable.";
        } else {
          result = "Could not connect to OpenClaw server.";
        }
      } else {
        result = `Action "${action.title}" queued. Connect to OpenClaw Gateway in Settings to execute commands.`;
      }

      await storage.createActionLog(profileId, "quick_action", action.id, action.title, "completed", result);

      res.json({ success: true, result, log });
    } catch (error) {
      console.error("Error running quick action:", error);
      res.status(500).json({ error: "Failed to run action" });
    }
  });

  app.get("/api/schedules/:profileId", async (req, res) => {
    try {
      const scheduleList = await storage.getSchedules(req.params.profileId);
      res.json(scheduleList);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ error: "Failed to fetch schedules" });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      const { profileId, title, description, command, intervalMinutes, cronExpression, timezone, sessionType } = req.body;
      if (!profileId || !title || !command) {
        return res.status(400).json({ error: "profileId, title, and command are required" });
      }
      const schedule = await storage.createSchedule({
        profileId,
        title,
        description: description || null,
        command,
        intervalMinutes: intervalMinutes || 60,
        isActive: true,
        cronExpression: cronExpression || null,
        ...(timezone ? { timezone } : {}),
        ...(sessionType ? { sessionType } : {}),
      });
      res.json(schedule);
    } catch (error) {
      console.error("Error creating schedule:", error);
      res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  app.put("/api/schedules/:id", async (req, res) => {
    try {
      const { profileId, isActive, title, description, command, intervalMinutes } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }
      const schedule = await storage.updateSchedule(req.params.id, profileId, {
        ...(isActive !== undefined && { isActive }),
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(command && { command }),
        ...(intervalMinutes && { intervalMinutes }),
      });
      res.json(schedule);
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  app.delete("/api/schedules/:id", async (req, res) => {
    try {
      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }
      await storage.deleteSchedule(req.params.id, profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting schedule:", error);
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  app.get("/api/action-logs/:profileId", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getActionLogs(req.params.profileId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching action logs:", error);
      res.status(500).json({ error: "Failed to fetch action logs" });
    }
  });

  app.get("/api/gateway/status", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;

      const settings = await storage.getSettings();
      if (!settings?.openclawUrl) {
        return res.json({
          connected: false,
          error: "No Gateway URL configured",
        });
      }

      const urlValidation = await validateGatewayUrl(settings.openclawUrl);
      if (!urlValidation.valid) {
        return res.json({
          connected: false,
          url: settings.openclawUrl,
          error: `Invalid Gateway URL: ${urlValidation.error}`,
        });
      }

      const startTime = Date.now();
      const healthResponse = await safeFetchGateway(settings.openclawUrl, '/api/health');
      const latency = Date.now() - startTime;

      if (healthResponse?.ok) {
        try {
          const data = await healthResponse.json();
          return res.json({
            connected: true,
            latency,
            url: settings.openclawUrl,
            serverInfo: data,
          });
        } catch {
          return res.json({
            connected: true,
            latency,
            url: settings.openclawUrl,
          });
        }
      }

      return res.json({
        connected: false,
        latency,
        url: settings.openclawUrl,
        error: healthResponse ? `Server returned ${healthResponse.status}` : "Unable to reach server",
      });
    } catch (error) {
      console.error("Error checking gateway status:", error);
      res.status(500).json({ error: "Failed to check gateway status" });
    }
  });

  app.post("/api/gateway/node-report", async (req, res) => {
    try {
      const { deviceName, platform, batteryLevel, networkType, locationAvailable } = req.body;
      res.json({
        acknowledged: true,
        nodeId: `${platform}-${deviceName}`.toLowerCase().replace(/\s+/g, '-'),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error processing node report:", error);
      res.status(500).json({ error: "Failed to process node report" });
    }
  });

  app.get("/api/agent-thoughts/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const sessionId = req.query.sessionId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const thoughts = await storage.getAgentThoughts(auth.profileId, sessionId, limit);
      res.json(thoughts);
    } catch (error) {
      console.error("Error fetching agent thoughts:", error);
      res.status(500).json({ error: "Failed to fetch agent thoughts" });
    }
  });

  app.post("/api/agent-thoughts", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { type, content, metadata, sessionId } = req.body;
      if (!type || !content) {
        return res.status(400).json({ error: "type and content are required" });
      }
      const thought = await storage.createAgentThought({
        profileId: auth.profileId,
        type,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        sessionId: sessionId || null,
      });
      res.json(thought);
    } catch (error) {
      console.error("Error creating agent thought:", error);
      res.status(500).json({ error: "Failed to create agent thought" });
    }
  });

  app.get("/api/token-costs/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const costs = await storage.getTokenCosts(auth.profileId, limit);
      res.json(costs);
    } catch (error) {
      console.error("Error fetching token costs:", error);
      res.status(500).json({ error: "Failed to fetch token costs" });
    }
  });

  app.get("/api/token-costs/:profileId/summary", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const summary = await storage.getTokenCostSummary(auth.profileId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching cost summary:", error);
      res.status(500).json({ error: "Failed to fetch cost summary" });
    }
  });

  app.post("/api/token-costs", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { model, inputTokens, outputTokens, cost, requestType } = req.body;
      if (!model || !cost || !requestType) {
        return res.status(400).json({ error: "model, cost, and requestType are required" });
      }
      const entry = await storage.createTokenCost({
        profileId: auth.profileId,
        model,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cost: String(cost),
        requestType,
      });
      res.json(entry);
    } catch (error) {
      console.error("Error creating token cost:", error);
      res.status(500).json({ error: "Failed to create token cost" });
    }
  });

  app.get("/api/system-metrics", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const metrics = await storage.getLatestMetrics();
      res.json(metrics || { cpuPercent: 0, memoryPercent: 0, diskPercent: 0 });
    } catch (error) {
      console.error("Error fetching system metrics:", error);
      res.status(500).json({ error: "Failed to fetch system metrics" });
    }
  });

  app.get("/api/system-metrics/history", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await storage.getMetricsHistory(limit);
      res.json(history);
    } catch (error) {
      console.error("Error fetching metrics history:", error);
      res.status(500).json({ error: "Failed to fetch metrics history" });
    }
  });

  app.post("/api/system-metrics", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { cpuPercent, memoryPercent, diskPercent, cpuModel, totalMemoryMb, totalDiskMb, uptime } = req.body;
      const metric = await storage.createMetrics({
        cpuPercent: cpuPercent || 0,
        memoryPercent: memoryPercent || 0,
        diskPercent: diskPercent || 0,
        cpuModel: cpuModel || null,
        totalMemoryMb: totalMemoryMb || null,
        totalDiskMb: totalDiskMb || null,
        uptime: uptime || null,
      });
      res.json(metric);
    } catch (error) {
      console.error("Error creating system metrics:", error);
      res.status(500).json({ error: "Failed to create system metrics" });
    }
  });

  app.get("/api/memories/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const memories = await storage.getMemories(auth.profileId, type, limit);
      res.json(memories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { title, content, memoryType, tags, importance } = req.body;
      if (!title || !content || !memoryType) {
        return res.status(400).json({ error: "title, content, and memoryType are required" });
      }
      const memory = await storage.createMemory({
        profileId: auth.profileId,
        title,
        content,
        memoryType,
        tags: tags || null,
        importance: importance || 3,
      });
      res.json(memory);
    } catch (error) {
      console.error("Error creating memory:", error);
      res.status(500).json({ error: "Failed to create memory" });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      await storage.deleteMemory(req.params.id, auth.profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting memory:", error);
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.post("/api/memories/:profileId/sync", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const settings = await storage.getSettings();
      if (settings?.openclawUrl) {
        try {
          const memResponse = await safeFetchGateway(settings.openclawUrl, '/api/memory', { method: "GET" });
          if (memResponse?.ok) {
            const memData = await memResponse.json();
            const syncedMemory = await storage.createMemory({
              profileId: auth.profileId,
              title: "Synced from Gateway",
              content: typeof memData === 'string' ? memData : JSON.stringify(memData),
              memoryType: "memory_md",
              tags: "synced",
              importance: 3,
            });
            return res.json({ success: true, synced: true, memory: syncedMemory });
          }
        } catch {}
      }
      res.json({ success: true, synced: false, message: "No gateway connected, using local data" });
    } catch (error) {
      console.error("Error syncing memories:", error);
      res.status(500).json({ error: "Failed to sync memories" });
    }
  });

  app.get("/api/memories/:profileId/file/:type", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const fileType = req.params.type;
      const memories = await storage.getMemories(auth.profileId);
      const filtered = memories.filter((m: any) => m.memoryType === fileType);
      const content = filtered.length > 0 ? filtered[0].content : "";
      res.json({ type: fileType, content, updatedAt: filtered[0]?.createdAt || null });
    } catch (error) {
      console.error("Error fetching memory file:", error);
      res.status(500).json({ error: "Failed to fetch memory file" });
    }
  });

  app.put("/api/memories/:profileId/file/:type", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const fileType = req.params.type;
      const { content } = req.body;
      const memories = await storage.getMemories(auth.profileId);
      const existing = memories.find((m: any) => m.memoryType === fileType);
      if (existing) {
        await storage.deleteMemory(existing.id, auth.profileId);
      }
      const memory = await storage.createMemory({
        profileId: auth.profileId,
        title: fileType === 'memory_md' ? 'MEMORY.md' : fileType === 'user_md' ? 'USER.md' : 'Daily Log',
        content: content || "",
        memoryType: fileType,
        tags: "",
        importance: 3,
      });
      res.json({ success: true, memory });
    } catch (error) {
      console.error("Error updating memory file:", error);
      res.status(500).json({ error: "Failed to update memory file" });
    }
  });

  app.get("/api/memories/:profileId/daily-logs", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const memories = await storage.getMemories(auth.profileId);
      const logs = memories.filter((m: any) => m.memoryType === 'daily_log');
      res.json(logs);
    } catch (error) {
      console.error("Error fetching daily logs:", error);
      res.status(500).json({ error: "Failed to fetch daily logs" });
    }
  });

  app.put("/api/memories/:memoryId/importance", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { importance } = req.body;
      if (!importance || importance < 1 || importance > 5) {
        return res.status(400).json({ error: "Importance must be between 1 and 5" });
      }
      const memories = await storage.getMemories(auth.profileId);
      const memory = memories.find((m: any) => m.id === req.params.memoryId);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      await storage.deleteMemory(req.params.memoryId, auth.profileId);
      const updated = await storage.createMemory({
        profileId: auth.profileId,
        title: memory.title,
        content: memory.content,
        memoryType: memory.memoryType,
        tags: memory.tags,
        importance,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating memory importance:", error);
      res.status(500).json({ error: "Failed to update memory importance" });
    }
  });

  app.get("/api/emergency-stops/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const limit = parseInt(req.query.limit as string) || 20;
      const stops = await storage.getEmergencyStops(auth.profileId, limit);
      res.json(stops);
    } catch (error) {
      console.error("Error fetching emergency stops:", error);
      res.status(500).json({ error: "Failed to fetch emergency stops" });
    }
  });

  app.post("/api/emergency-stop", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      let stoppedProcesses = "All active processes";
      const settings = await storage.getSettings();
      if (settings?.openclawUrl) {
        const stopResponse = await safeFetchGateway(settings.openclawUrl, '/api/emergency-stop', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (stopResponse?.ok) {
          try {
            const data = await stopResponse.json();
            stoppedProcesses = data.stoppedProcesses || "All processes stopped via Gateway";
          } catch {
            stoppedProcesses = "All processes stopped via Gateway";
          }
        } else if (!stopResponse) {
          stoppedProcesses = "Gateway unreachable or blocked - local stop only";
        }
      }

      const activeSchedules = await storage.getSchedules(auth.profileId);
      for (const schedule of activeSchedules) {
        if (schedule.isActive) {
          await storage.updateSchedule(schedule.id, auth.profileId, { isActive: false });
        }
      }

      const stop = await storage.createEmergencyStop({
        profileId: auth.profileId,
        reason,
        stoppedProcesses,
        status: "triggered",
      });

      await storage.createActionLog(auth.profileId, "emergency_stop", stop.id, "Emergency Stop Triggered", "completed", reason);

      res.json(stop);
    } catch (error) {
      console.error("Error triggering emergency stop:", error);
      res.status(500).json({ error: "Failed to trigger emergency stop" });
    }
  });

  app.put("/api/emergency-stop/:id/resolve", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const stop = await storage.resolveEmergencyStop(req.params.id, auth.profileId);
      await storage.createActionLog(auth.profileId, "emergency_stop", stop.id, "Emergency Stop Resolved", "completed", "Resolved by user");
      res.json(stop);
    } catch (error) {
      console.error("Error resolving emergency stop:", error);
      res.status(500).json({ error: "Failed to resolve emergency stop" });
    }
  });

  app.get("/api/soul-configs/templates", async (_req, res) => {
    try {
      const templates = [
        {
          id: "professional",
          name: "Professional",
          description: "Formal, precise, and business-oriented communication style",
          content: "# SOUL.md - Professional\n\n## Identity\nYou are a professional AI assistant focused on productivity and business tasks.\n\n## Communication Style\n- Formal and precise language\n- Data-driven responses\n- Action-oriented suggestions\n- Clear and concise formatting\n\n## Priorities\n1. Accuracy and reliability\n2. Efficiency in task completion\n3. Professional tone at all times",
        },
        {
          id: "casual",
          name: "Casual",
          description: "Friendly, relaxed, and conversational tone",
          content: "# SOUL.md - Casual\n\n## Identity\nYou are a friendly AI buddy who keeps things relaxed and fun.\n\n## Communication Style\n- Conversational and warm\n- Use everyday language\n- Be encouraging and supportive\n- Keep explanations simple\n\n## Priorities\n1. Being helpful and approachable\n2. Making complex things simple\n3. Keeping interactions enjoyable",
        },
        {
          id: "devops",
          name: "DevOps",
          description: "Technical, infrastructure-focused with terminal expertise",
          content: "# SOUL.md - DevOps\n\n## Identity\nYou are a DevOps specialist AI with deep infrastructure knowledge.\n\n## Communication Style\n- Technical and precise\n- Use code blocks and terminal commands\n- Reference best practices\n- Include monitoring considerations\n\n## Expertise\n- CI/CD pipelines\n- Container orchestration\n- Infrastructure as Code\n- System monitoring and alerting",
        },
        {
          id: "minimalist",
          name: "Minimalist",
          description: "Brief, direct responses with minimal verbosity",
          content: "# SOUL.md - Minimalist\n\n## Identity\nYou are a minimal AI that values brevity above all.\n\n## Communication Style\n- Short, direct responses\n- No unnecessary words\n- Bullet points over paragraphs\n- Code over explanation\n\n## Rules\n1. Keep responses under 3 sentences when possible\n2. Skip pleasantries\n3. Get to the point immediately",
        },
        {
          id: "creative",
          name: "Creative",
          description: "Imaginative, expressive, and thinking outside the box",
          content: "# SOUL.md - Creative\n\n## Identity\nYou are a creative AI that thinks outside the box and brings fresh perspectives.\n\n## Communication Style\n- Expressive and imaginative\n- Use metaphors and analogies\n- Explore multiple angles\n- Encourage brainstorming\n\n## Priorities\n1. Innovation and originality\n2. Exploring possibilities\n3. Inspiring creative thinking",
        },
      ];
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/soul-configs/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const configs = await storage.getSoulConfigs(auth.profileId);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching soul configs:", error);
      res.status(500).json({ error: "Failed to fetch soul configs" });
    }
  });

  app.post("/api/soul-configs", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { name, content } = req.body;
      if (!name || !content) {
        return res.status(400).json({ error: "name and content are required" });
      }
      const config = await storage.createSoulConfig({
        profileId: auth.profileId,
        name,
        content,
        isActive: false,
      });
      res.json(config);
    } catch (error) {
      console.error("Error creating soul config:", error);
      res.status(500).json({ error: "Failed to create soul config" });
    }
  });

  app.put("/api/soul-configs/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const existing = await storage.getSoulConfigById(req.params.id);
      if (!existing || existing.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Config not found" });
      }
      const { name, content } = req.body;
      const updated = await storage.updateSoulConfig(req.params.id, {
        ...(name && { name }),
        ...(content !== undefined && { content }),
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating soul config:", error);
      res.status(500).json({ error: "Failed to update soul config" });
    }
  });

  app.delete("/api/soul-configs/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      await storage.deleteSoulConfig(req.params.id, auth.profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting soul config:", error);
      res.status(500).json({ error: "Failed to delete soul config" });
    }
  });

  app.post("/api/soul-configs/:id/activate", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const existing = await storage.getSoulConfigById(req.params.id);
      if (!existing || existing.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Config not found" });
      }
      const activated = await storage.activateSoulConfig(req.params.id, auth.profileId);
      res.json(activated);
    } catch (error) {
      console.error("Error activating soul config:", error);
      res.status(500).json({ error: "Failed to activate soul config" });
    }
  });

  app.post("/api/soul-configs/import", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { name, content, url } = req.body;

      let soulContent = content || "";
      if (url && !content) {
        try {
          const validation = await validateGatewayUrl(url);
          if (!validation.valid) {
            return res.status(400).json({ error: `Invalid URL: ${validation.error}` });
          }
          const response = await fetch(url);
          if (response.ok) {
            soulContent = await response.text();
          } else {
            return res.status(400).json({ error: "Failed to fetch content from URL" });
          }
        } catch {
          return res.status(400).json({ error: "Failed to fetch content from URL" });
        }
      }

      if (!soulContent) {
        return res.status(400).json({ error: "content or url is required" });
      }

      const config = await storage.createSoulConfig({
        profileId: auth.profileId,
        name: name || "Imported Config",
        content: soulContent,
        isActive: false,
      });
      res.json(config);
    } catch (error) {
      console.error("Error importing soul config:", error);
      res.status(500).json({ error: "Failed to import soul config" });
    }
  });

  app.get("/api/skills/browse", async (_req, res) => {
    try {
      const catalog = [
        { id: "email-manager", name: "Email Manager", description: "Read, compose, and manage emails across providers", source: "clawhub", category: "communication", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "calendar-sync", name: "Calendar Sync", description: "Sync and manage calendar events across platforms", source: "clawhub", category: "productivity", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "file-organizer", name: "File Organizer", description: "Automatically organize and categorize files", source: "clawhub", category: "productivity", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "web-scraper", name: "Web Scraper", description: "Extract structured data from web pages", source: "npm", category: "data", securityStatus: "unreviewed", author: "community" },
        { id: "code-reviewer", name: "Code Reviewer", description: "Automated code review with best practice suggestions", source: "clawhub", category: "development", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "slack-bot", name: "Slack Bot", description: "Interact with Slack workspaces and channels", source: "clawhub", category: "communication", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "discord-bot", name: "Discord Bot", description: "Manage Discord servers and respond to messages", source: "npm", category: "communication", securityStatus: "unreviewed", author: "community" },
        { id: "database-query", name: "Database Query", description: "Run SQL queries against connected databases", source: "clawhub", category: "data", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "image-processor", name: "Image Processor", description: "Resize, convert, and manipulate images", source: "npm", category: "media", securityStatus: "unreviewed", author: "community" },
        { id: "pdf-generator", name: "PDF Generator", description: "Create PDF documents from templates and data", source: "clawhub", category: "productivity", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "webhook-manager", name: "Webhook Manager", description: "Create and manage webhooks for event-driven automation", source: "clawhub", category: "development", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "ssh-tunnel", name: "SSH Tunnel", description: "Establish SSH connections to remote servers", source: "custom", category: "infrastructure", securityStatus: "flagged", author: "unknown" },
        { id: "crypto-tracker", name: "Crypto Tracker", description: "Track cryptocurrency prices and portfolio", source: "npm", category: "finance", securityStatus: "unreviewed", author: "community" },
        { id: "git-manager", name: "Git Manager", description: "Manage git repositories, branches, and pull requests", source: "clawhub", category: "development", securityStatus: "vetted", author: "ClawHub Official" },
        { id: "notification-hub", name: "Notification Hub", description: "Send notifications across multiple platforms", source: "clawhub", category: "communication", securityStatus: "vetted", author: "ClawHub Official" },
      ];
      res.json(catalog);
    } catch (error) {
      console.error("Error browsing skills:", error);
      res.status(500).json({ error: "Failed to browse skills" });
    }
  });

  app.get("/api/skills/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const skills = await storage.getInstalledSkills(auth.profileId);
      res.json(skills);
    } catch (error) {
      console.error("Error fetching installed skills:", error);
      res.status(500).json({ error: "Failed to fetch installed skills" });
    }
  });

  app.post("/api/skills/install", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { skillName, description, source, category, config } = req.body;
      if (!skillName || !description || !source) {
        return res.status(400).json({ error: "skillName, description, and source are required" });
      }
      const skill = await storage.createInstalledSkill({
        profileId: auth.profileId,
        skillName,
        description,
        source,
        category: category || "general",
        isEnabled: true,
        securityStatus: source === "clawhub" ? "vetted" : "unreviewed",
        config: config ? JSON.stringify(config) : null,
      });
      res.json(skill);
    } catch (error) {
      console.error("Error installing skill:", error);
      res.status(500).json({ error: "Failed to install skill" });
    }
  });

  app.put("/api/skills/:id/toggle", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const skill = await storage.getInstalledSkillById(req.params.id);
      if (!skill || skill.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Skill not found" });
      }
      const updated = await storage.updateInstalledSkill(req.params.id, {
        isEnabled: !skill.isEnabled,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling skill:", error);
      res.status(500).json({ error: "Failed to toggle skill" });
    }
  });

  app.delete("/api/skills/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      await storage.deleteInstalledSkill(req.params.id, auth.profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error uninstalling skill:", error);
      res.status(500).json({ error: "Failed to uninstall skill" });
    }
  });

  app.get("/api/skills/:id/security", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const skill = await storage.getInstalledSkillById(req.params.id);
      if (!skill || skill.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Skill not found" });
      }
      const scanResult = {
        skillId: skill.id,
        skillName: skill.skillName,
        securityStatus: skill.securityStatus,
        source: skill.source,
        findings: skill.securityStatus === "flagged"
          ? [
              { severity: "high", description: "Unverified network access patterns detected" },
              { severity: "medium", description: "Excessive filesystem permissions requested" },
            ]
          : skill.securityStatus === "unreviewed"
            ? [{ severity: "info", description: "This skill has not been reviewed by the ClawHub security team" }]
            : [{ severity: "info", description: "This skill has been vetted by the ClawHub security team" }],
        lastScanned: new Date().toISOString(),
      };
      res.json(scanResult);
    } catch (error) {
      console.error("Error fetching security scan:", error);
      res.status(500).json({ error: "Failed to fetch security scan" });
    }
  });

  app.get("/api/spending-limits/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      let limits = await storage.getSpendingLimits(auth.profileId);
      if (!limits) {
        limits = await storage.upsertSpendingLimits(auth.profileId, {});
      }
      res.json(limits);
    } catch (error) {
      console.error("Error fetching spending limits:", error);
      res.status(500).json({ error: "Failed to fetch spending limits" });
    }
  });

  app.put("/api/spending-limits", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { dailyLimit, monthlyLimit, alertThreshold, alertEnabled } = req.body;
      const limits = await storage.upsertSpendingLimits(auth.profileId, {
        ...(dailyLimit !== undefined && { dailyLimit }),
        ...(monthlyLimit !== undefined && { monthlyLimit }),
        ...(alertThreshold !== undefined && { alertThreshold }),
        ...(alertEnabled !== undefined && { alertEnabled }),
      });
      res.json(limits);
    } catch (error) {
      console.error("Error updating spending limits:", error);
      res.status(500).json({ error: "Failed to update spending limits" });
    }
  });

  app.get("/api/spending-alerts/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      let limits = await storage.getSpendingLimits(auth.profileId);
      if (!limits) {
        limits = await storage.upsertSpendingLimits(auth.profileId, {});
      }

      const dailyPercent = limits.dailyLimit > 0 ? Math.round((limits.currentDailySpend / limits.dailyLimit) * 100) : 0;
      const monthlyPercent = limits.monthlyLimit > 0 ? Math.round((limits.currentMonthlySpend / limits.monthlyLimit) * 100) : 0;

      const alerts: { type: string; message: string; severity: string }[] = [];

      if (dailyPercent >= 100) {
        alerts.push({ type: "daily_exceeded", message: "Daily spending limit exceeded", severity: "critical" });
      } else if (dailyPercent >= limits.alertThreshold) {
        alerts.push({ type: "daily_warning", message: `Daily spending at ${dailyPercent}% of limit`, severity: "warning" });
      }

      if (monthlyPercent >= 100) {
        alerts.push({ type: "monthly_exceeded", message: "Monthly spending limit exceeded", severity: "critical" });
      } else if (monthlyPercent >= limits.alertThreshold) {
        alerts.push({ type: "monthly_warning", message: `Monthly spending at ${monthlyPercent}% of limit`, severity: "warning" });
      }

      res.json(alerts);
    } catch (error) {
      console.error("Error checking spending alerts:", error);
      res.status(500).json({ error: "Failed to check spending alerts" });
    }
  });

  // === Node Pairing Routes ===

  app.get("/api/nodes/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const nodes = await storage.getPairedNodes(auth.profileId);
      res.json(nodes);
    } catch (error) {
      console.error("Error fetching paired nodes:", error);
      res.status(500).json({ error: "Failed to fetch paired nodes" });
    }
  });

  app.post("/api/nodes/pair", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { nodeName, platform, capabilities } = req.body;
      if (!nodeName || !platform) {
        return res.status(400).json({ error: "nodeName and platform are required" });
      }
      const nodeId = `${platform}-${nodeName}-${Date.now()}`.toLowerCase().replace(/\s+/g, '-');
      const node = await storage.createPairedNode({
        profileId: auth.profileId,
        nodeId,
        nodeName,
        platform,
        capabilities: capabilities ? JSON.stringify(capabilities) : null,
        status: "pending",
      });
      const pairingData = {
        nodeId: node.id,
        profileId: auth.profileId,
        token: nodeId,
        timestamp: new Date().toISOString(),
      };
      res.json({ node, pairingData, qrCode: Buffer.from(JSON.stringify(pairingData)).toString('base64') });
    } catch (error) {
      console.error("Error pairing node:", error);
      res.status(500).json({ error: "Failed to pair node" });
    }
  });

  app.put("/api/nodes/:id/approve", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const node = await storage.getPairedNodeById(req.params.id);
      if (!node || node.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Node not found" });
      }
      const updated = await storage.updatePairedNode(req.params.id, {
        status: "paired",
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      });
      res.json(updated);
    } catch (error) {
      console.error("Error approving node:", error);
      res.status(500).json({ error: "Failed to approve node" });
    }
  });

  app.delete("/api/nodes/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      await storage.deletePairedNode(req.params.id, auth.profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unpairing node:", error);
      res.status(500).json({ error: "Failed to unpair node" });
    }
  });

  app.post("/api/nodes/:id/invoke", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { capability, params } = req.body;
      if (!capability) {
        return res.status(400).json({ error: "capability is required" });
      }
      const node = await storage.getPairedNodeById(req.params.id);
      if (!node || node.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Node not found" });
      }
      if (node.status !== "paired") {
        return res.status(400).json({ error: "Node is not in paired status" });
      }
      await storage.updatePairedNode(req.params.id, { lastSeenAt: new Date() });
      res.json({
        success: true,
        nodeId: node.nodeId,
        capability,
        result: `Invoked ${capability} on ${node.nodeName}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error invoking node capability:", error);
      res.status(500).json({ error: "Failed to invoke node capability" });
    }
  });

  // === Telegram Webhook Receiver (public — no auth, verified by token in URL) ===

  app.post("/api/telegram/webhook/:token", async (req, res) => {
    res.sendStatus(200);
    try {
      const { token } = req.params;
      const update: TelegramUpdate = req.body;
      const msg = update.message;
      if (!msg?.text || !msg.chat?.id) return;

      const allChannels = await storage.getAllActiveChannelsByType("telegram");
      const channel = allChannels.find(c => {
        const cfg = parseTelegramConfig(c.config);
        return cfg?.botToken === token;
      });
      if (!channel) return;

      const chatId = msg.chat.id;
      const cfg = parseTelegramConfig(channel.config);
      if (!cfg) return;

      if (!cfg.chatIds.includes(chatId)) {
        cfg.chatIds.push(chatId);
        await storage.updateChannelConnection(channel.id, {
          config: JSON.stringify(cfg),
        });
      }

      await sendTypingAction(token, chatId);

      const settings = await storage.getSettings();
      let reply: string;
      if (settings?.openclawUrl) {
        const chatResponse = await safeFetchGateway(settings.openclawUrl, "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg.text }),
        });
        if (chatResponse?.ok) {
          const data = await chatResponse.json();
          reply = data.response || data.message || "Done.";
        } else {
          reply = "Could not reach your OpenClaw gateway. Check your Settings.";
        }
      } else {
        reply = generateLocalResponse(msg.text);
      }

      await storage.updateChannelConnection(channel.id, {
        messageCount: channel.messageCount + 1,
        lastMessageAt: new Date(),
      });

      await sendTelegramMessage(token, chatId, reply);
    } catch (err: any) {
      console.error("[Telegram webhook] error:", err.message);
    }
  });

  // === Telegram Bot Setup ===

  app.post("/api/channels/telegram/setup", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;

      const { botToken } = req.body;
      if (!botToken?.trim()) {
        return res.status(400).json({ error: "botToken is required" });
      }

      const bot = await validateBotToken(botToken.trim());

      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const webhookUrl = `${proto}://${host}/api/telegram/webhook/${botToken.trim()}`;

      await setupWebhook(botToken.trim(), webhookUrl);

      const cfg = {
        botToken: botToken.trim(),
        botUsername: bot.username,
        webhookUrl,
        chatIds: [],
      };

      const existing = (await storage.getChannelConnections(auth.profileId))
        .find(c => c.channelType === "telegram");

      let channel;
      if (existing) {
        channel = await storage.updateChannelConnection(existing.id, {
          channelName: `@${bot.username}`,
          isActive: true,
          config: JSON.stringify(cfg),
        });
      } else {
        channel = await storage.createChannelConnection({
          profileId: auth.profileId,
          channelType: "telegram",
          channelName: `@${bot.username}`,
          isActive: true,
          messageCount: 0,
          connectedAt: new Date(),
          config: JSON.stringify(cfg),
        });
      }

      res.json({ channel, botUsername: bot.username, webhookUrl });
    } catch (err: any) {
      console.error("[Telegram setup] error:", err.message);
      res.status(400).json({ error: err.message || "Failed to set up Telegram bot" });
    }
  });

  // === Channel Connection Routes ===

  app.get("/api/channels/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const channels = await storage.getChannelConnections(auth.profileId);
      res.json(channels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels/connect", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { channelType, channelName } = req.body;
      if (!channelType || !channelName) {
        return res.status(400).json({ error: "channelType and channelName are required" });
      }
      const channel = await storage.createChannelConnection({
        profileId: auth.profileId,
        channelType,
        channelName,
        isActive: true,
        messageCount: 0,
        connectedAt: new Date(),
      });
      res.json(channel);
    } catch (error) {
      console.error("Error connecting channel:", error);
      res.status(500).json({ error: "Failed to connect channel" });
    }
  });

  app.put("/api/channels/:id/toggle", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const channel = await storage.getChannelConnectionById(req.params.id);
      if (!channel || channel.profileId !== auth.profileId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const updated = await storage.updateChannelConnection(req.params.id, {
        isActive: !channel.isActive,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling channel:", error);
      res.status(500).json({ error: "Failed to toggle channel" });
    }
  });

  app.delete("/api/channels/:id", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const channel = await storage.getChannelConnectionById(req.params.id);
      if (channel?.channelType === "telegram") {
        const cfg = parseTelegramConfig(channel.config);
        if (cfg?.botToken) {
          deleteWebhook(cfg.botToken).catch(() => {});
        }
      }
      await storage.deleteChannelConnection(req.params.id, auth.profileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting channel:", error);
      res.status(500).json({ error: "Failed to disconnect channel" });
    }
  });

  app.get("/api/channels/:profileId/stats", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const channels = await storage.getChannelConnections(auth.profileId);
      const totalChannels = channels.length;
      const activeChannels = channels.filter(c => c.isActive).length;
      const totalMessages = channels.reduce((sum, c) => sum + c.messageCount, 0);
      const byChannel = channels.map(c => ({
        id: c.id,
        channelType: c.channelType,
        channelName: c.channelName,
        isActive: c.isActive,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
      }));
      res.json({ totalChannels, activeChannels, totalMessages, byChannel });
    } catch (error) {
      console.error("Error fetching channel stats:", error);
      res.status(500).json({ error: "Failed to fetch channel stats" });
    }
  });

  // === Gateway TLS Config Routes ===

  app.get("/api/gateway-tls/:profileId", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      if (auth.profileId !== req.params.profileId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const config = await storage.getGatewayTlsConfig(auth.profileId);
      res.json(config || { tlsEnabled: false, certPath: null, keyPath: null, verifyPeer: true });
    } catch (error) {
      console.error("Error fetching TLS config:", error);
      res.status(500).json({ error: "Failed to fetch TLS config" });
    }
  });

  app.put("/api/gateway-tls", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { tlsEnabled, certPath, keyPath, verifyPeer } = req.body;
      const config = await storage.upsertGatewayTlsConfig(auth.profileId, {
        tlsEnabled: tlsEnabled ?? false,
        certPath: certPath || null,
        keyPath: keyPath || null,
        verifyPeer: verifyPeer ?? true,
      });
      res.json(config);
    } catch (error) {
      console.error("Error updating TLS config:", error);
      res.status(500).json({ error: "Failed to update TLS config" });
    }
  });

  // === Model Selection Routes ===

  app.get("/api/models", async (_req, res) => {
    try {
      const models = [
        { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", capabilities: ["chat", "code", "analysis"], isDefault: true },
        { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", capabilities: ["chat", "code", "vision", "analysis"], isDefault: false },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", capabilities: ["chat", "code", "vision", "analysis"], isDefault: false },
        { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", capabilities: ["chat", "code", "analysis"], isDefault: false },
        { id: "ollama-local", name: "Ollama (Local)", provider: "Local", capabilities: ["chat", "code"], isDefault: false },
      ];
      res.json(models);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.put("/api/settings/model", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { modelId } = req.body;
      if (!modelId) {
        return res.status(400).json({ error: "modelId is required" });
      }
      const validModels = ["claude-sonnet-4", "gpt-4o", "gemini-2.5-pro", "deepseek-v3", "ollama-local"];
      if (!validModels.includes(modelId)) {
        return res.status(400).json({ error: "Invalid model ID" });
      }
      res.json({ success: true, modelId, message: `Model set to ${modelId}` });
    } catch (error) {
      console.error("Error setting model:", error);
      res.status(500).json({ error: "Failed to set model" });
    }
  });

  // === Heartbeat/Schedule Enhancement ===

  app.post("/api/schedules/heartbeat", async (req, res) => {
    try {
      const auth = await requireAuthWithProfile(req, res);
      if (!auth) return;
      const { intervalMinutes, checklist, isActive } = req.body;
      if (!intervalMinutes) {
        return res.status(400).json({ error: "intervalMinutes is required" });
      }
      const schedule = await storage.createSchedule({
        profileId: auth.profileId,
        title: "Heartbeat Check",
        description: checklist || "System health check",
        command: "heartbeat",
        intervalMinutes,
        isActive: isActive ?? true,
        cronExpression: null,
      });
      res.json(schedule);
    } catch (error) {
      console.error("Error creating heartbeat:", error);
      res.status(500).json({ error: "Failed to create heartbeat schedule" });
    }
  });

  // === Council Routes ===

  app.get("/api/council/status", async (req, res) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      res.json({
        isRunning: isCouncilRunning(),
        config: getCouncilConfig(),
        lastReview: getLastReview(),
        totalReviews: getCouncilHistory().length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get council status" });
    }
  });

  app.get("/api/council/history", async (req, res) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      res.json(getCouncilHistory());
    } catch (error) {
      res.status(500).json({ error: "Failed to get council history" });
    }
  });

  app.get("/api/council/log", async (req, res) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      res.json(getCouncilLog());
    } catch (error) {
      res.status(500).json({ error: "Failed to get council log" });
    }
  });

  app.post("/api/council/run", async (req, res) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      if (isCouncilRunning()) {
        return res.status(409).json({ error: "A review is already in progress" });
      }
      const settings = await storage.getSettings();
      const gatewayUrl = settings?.openclawUrl || undefined;
      const review = await runCouncilReview(gatewayUrl);
      res.json(review);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to run council review" });
    }
  });

  app.put("/api/council/config", async (req, res) => {
    try {
      const auth = await getAuthUser(req);
      if (!auth) return res.status(401).json({ error: "Authentication required" });
      const { enabled, intervalHours, useGateway } = req.body;
      const updated = updateCouncilConfig({
        ...(enabled !== undefined && { enabled }),
        ...(intervalHours !== undefined && { intervalHours }),
        ...(useGateway !== undefined && { useGateway }),
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update council config" });
    }
  });

  const httpServer = createServer(app);

  // === WebSocket Server ===

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const wsClients = new Set<WebSocket>();

  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);

    ws.send(JSON.stringify({
      type: "connected",
      message: "Connected to I-Claw WebSocket",
      timestamp: new Date().toISOString(),
    }));

    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "heartbeat",
          timestamp: new Date().toISOString(),
        }));
      }
    }, 30000);

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "subscribe") {
          ws.send(JSON.stringify({
            type: "subscribed",
            channels: message.channels || ["agent-thought", "status-change", "metric-update", "cost-update"],
            timestamp: new Date().toISOString(),
          }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      clearInterval(heartbeatInterval);
    });

    ws.on("error", () => {
      wsClients.delete(ws);
      clearInterval(heartbeatInterval);
    });
  });

  (httpServer as any).broadcast = (type: string, data: any) => {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  return httpServer;
}

function generateLocalResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
    return "Hello! I'm I-Claw, your mobile gateway to OpenClaw. To connect me to your AI assistant's full capabilities, add your OpenClaw Gateway URL in Settings. How can I help you today?";
  }

  if (lowerMessage.includes("help")) {
    return "I'm here to help! To unlock my full potential, please configure your OpenClaw Gateway server URL in Settings. Once connected, I can help you with tasks, answer questions, control your computer, and much more.";
  }

  if (lowerMessage.includes("settings") || lowerMessage.includes("connect")) {
    return "To connect to your OpenClaw Gateway, tap the settings icon in the top right corner and enter your server URL (usually something like http://your-server:3000). Once connected, you'll have full access to your AI assistant!";
  }

  if (lowerMessage.includes("what can you do") || lowerMessage.includes("capabilities")) {
    return "When connected to your OpenClaw Gateway, I can: manage your emails, control your calendar, run terminal commands, browse the web, manage files, send messages through WhatsApp/Telegram/Discord, and much more. Configure your server URL in Settings to get started!";
  }

  return "I received your message! To respond with full capabilities, please connect I-Claw to your OpenClaw Gateway server. Go to Settings and enter your server URL to unlock AI-powered assistance for emails, calendar, file management, web browsing, and more.";
}
