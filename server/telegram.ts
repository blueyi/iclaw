const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  webhookUrl: string;
  chatIds: number[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

async function telegramApi(token: string, method: string, body?: object): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram API error on ${method}`);
  return data.result;
}

export async function validateBotToken(token: string): Promise<{ username: string; firstName: string }> {
  const me = await telegramApi(token, "getMe");
  return { username: me.username, firstName: me.first_name };
}

export async function setupWebhook(token: string, webhookUrl: string): Promise<void> {
  await telegramApi(token, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

export async function deleteWebhook(token: string): Promise<void> {
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: true });
}

export async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

export async function sendTypingAction(token: string, chatId: number): Promise<void> {
  try {
    await telegramApi(token, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
  }
}

export function parseTelegramConfig(raw: string | null | undefined): TelegramConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramConfig;
  } catch {
    return null;
  }
}
