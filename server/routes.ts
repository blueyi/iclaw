import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";

const DEFAULT_CONVERSATION_ID = "default";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const { content } = req.body;
      const conversationId =
        (req.body.conversationId as string) || DEFAULT_CONVERSATION_ID;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Message content is required" });
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

  const httpServer = createServer(app);
  return httpServer;
}

function generateLocalResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
    return "Hello! I'm OpenClaw, your personal AI assistant. To connect me to your full capabilities, add your OpenClaw Gateway URL in Settings. How can I help you today?";
  }

  if (lowerMessage.includes("help")) {
    return "I'm here to help! To unlock my full potential, please configure your OpenClaw Gateway server URL in Settings. Once connected, I can help you with tasks, answer questions, control your computer, and much more.";
  }

  if (lowerMessage.includes("settings") || lowerMessage.includes("connect")) {
    return "To connect to your OpenClaw Gateway, tap the settings icon in the top right corner and enter your server URL (usually something like http://your-server:3000). Once connected, I'll have access to all my capabilities!";
  }

  if (lowerMessage.includes("what can you do") || lowerMessage.includes("capabilities")) {
    return "When connected to your OpenClaw Gateway, I can: manage your emails, control your calendar, run terminal commands, browse the web, manage files, send messages through WhatsApp/Telegram/Discord, and much more. Configure your server URL in Settings to get started!";
  }

  return "I received your message! To respond with my full capabilities, please connect me to your OpenClaw Gateway server. Go to Settings and enter your server URL to unlock AI-powered assistance for emails, calendar, file management, web browsing, and more.";
}
