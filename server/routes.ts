import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";

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

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;

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
      const { content, profileId } = req.body;
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
        try {
          const openclawResponse = await fetch(
            `${settings.openclawUrl}/api/chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: content }),
            }
          );

          if (openclawResponse.ok) {
            const data = await openclawResponse.json();
            assistantResponse =
              data.response || data.message || "OpenClaw processed your request.";
          } else {
            assistantResponse =
              "I couldn't connect to your OpenClaw server. Please check your server URL in Settings.";
          }
        } catch (error) {
          console.error("OpenClaw connection error:", error);
          assistantResponse =
            "Unable to reach your OpenClaw server. Make sure it's running and the URL is correct.";
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
        try {
          const openclawResponse = await fetch(
            `${settings.openclawUrl}/api/chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: `Execute command: ${action.command}. ${action.description}` }),
            }
          );
          if (openclawResponse.ok) {
            const data = await openclawResponse.json();
            result = data.response || data.message || "Action completed.";
          } else {
            result = "Could not connect to OpenClaw server.";
          }
        } catch {
          result = "Unable to reach OpenClaw server.";
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
      const { profileId, title, description, command, intervalMinutes } = req.body;
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

  const httpServer = createServer(app);
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
