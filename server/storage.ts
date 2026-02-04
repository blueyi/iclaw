import {
  type User,
  type InsertUser,
  type Message,
  type InsertMessage,
  type Settings,
  type InsertSettings,
  users,
  messages,
  settings,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessages(conversationId: string): Promise<void>;

  getSettings(): Promise<Settings | undefined>;
  updateSettings(data: Partial<InsertSettings>): Promise<Settings>;
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
}

export const storage = new DatabaseStorage();
