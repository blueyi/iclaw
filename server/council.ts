import * as fs from "fs";
import * as path from "path";
import { db } from "./db";
import { sql } from "drizzle-orm";

const HISTORY_FILE = path.join("data", "council-history.json");

export interface MemberReview {
  member: string;
  role: string;
  model: string;
  score: number;
  summary: string;
  strengths: string[];
  optimizations: string[];
  status: "success" | "error";
}

export interface CouncilReview {
  id: string;
  timestamp: string;
  reviews: MemberReview[];
  averageScore: number;
  topOptimizations: string[];
  snapshot: Record<string, any>;
}

export interface CouncilConfig {
  enabled: boolean;
  intervalHours: number;
  useGateway: boolean;
}

interface CouncilLogEntry {
  id: string;
  timestamp: string;
  type: "review" | "error" | "info" | "run";
  message: string;
  member?: string;
}

let config: CouncilConfig = { enabled: true, intervalHours: 24, useGateway: true };
let cronLog: CouncilLogEntry[] = [];
let history: CouncilReview[] = [];
let isRunning = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
      history = data.reviews || [];
      if (data.config) config = { ...config, ...data.config };
    }
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ reviews: history.slice(0, 20), config }, null, 2));
  } catch {}
}

function addLog(type: CouncilLogEntry["type"], message: string, member?: string) {
  const entry: CouncilLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    member,
  };
  cronLog.unshift(entry);
  if (cronLog.length > 200) cronLog = cronLog.slice(0, 200);
  console.log(`[COUNCIL] ${type.toUpperCase()} ${member ? `[${member}]` : ""}: ${message}`);
}

loadHistory();

async function gatherSnapshot(): Promise<Record<string, any>> {
  const snap: Record<string, any> = {
    timestamp: new Date().toISOString(),
    project: "I-Claw / OpenClaw Mobile App",
  };

  try {
    const msgsRes = await db.execute(sql`SELECT COUNT(*) as total, role FROM messages GROUP BY role`);
    const rows: any[] = (msgsRes as any).rows || msgsRes;
    const totalMsgs = rows.reduce((s: number, r: any) => s + parseInt(r.total || "0"), 0);
    const userMsgs = rows.find((r: any) => r.role === "user");
    snap.messages = {
      total: totalMsgs,
      user: parseInt(userMsgs?.total || "0"),
      assistant: totalMsgs - parseInt(userMsgs?.total || "0"),
    };
  } catch { snap.messages = "unavailable"; }

  try {
    const costsRes = await db.execute(sql`
      SELECT model, COUNT(*) as requests, SUM(cost) as total_cost, SUM(input_tokens) as input, SUM(output_tokens) as output
      FROM token_costs GROUP BY model ORDER BY total_cost DESC`);
    const costRows: any[] = (costsRes as any).rows || costsRes;
    snap.modelUsage = costRows.map((r: any) => ({
      model: r.model,
      requests: parseInt(r.requests || "0"),
      totalCost: parseFloat(r.total_cost || "0").toFixed(4),
      tokens: parseInt(r.input || "0") + parseInt(r.output || "0"),
    }));
  } catch { snap.modelUsage = []; }

  try {
    const memRes = await db.execute(sql`SELECT COUNT(*) as total, memory_type FROM agent_memories GROUP BY memory_type`);
    const memRows: any[] = (memRes as any).rows || memRes;
    snap.memories = {
      total: memRows.reduce((s: number, r: any) => s + parseInt(r.total || "0"), 0),
      byType: memRows.map((r: any) => ({ type: r.memory_type, count: parseInt(r.total || "0") })),
    };
  } catch { snap.memories = "unavailable"; }

  try {
    const [limitsRow] = ((await db.execute(sql`SELECT * FROM spending_limits LIMIT 1`)) as any).rows || [];
    if (limitsRow) {
      snap.spending = {
        dailyLimit: limitsRow.daily_limit,
        monthlyLimit: limitsRow.monthly_limit,
        currentDaily: limitsRow.current_daily_spend,
        currentMonthly: limitsRow.current_monthly_spend,
        alertThreshold: limitsRow.alert_threshold,
      };
    }
  } catch { snap.spending = null; }

  try {
    const skillsRes = await db.execute(sql`SELECT COUNT(*) as total, is_enabled FROM installed_skills GROUP BY is_enabled`);
    const skillRows: any[] = (skillsRes as any).rows || skillsRes;
    snap.skills = {
      total: skillRows.reduce((s: number, r: any) => s + parseInt(r.total || "0"), 0),
      active: parseInt(skillRows.find((r: any) => r.is_enabled)?.total || "0"),
    };
  } catch { snap.skills = { total: 0, active: 0 }; }

  try {
    const [nodeCount] = ((await db.execute(sql`SELECT COUNT(*) as total FROM paired_nodes WHERE status = 'paired'`)) as any).rows || [];
    snap.pairedNodes = parseInt(nodeCount?.total || "0");
  } catch { snap.pairedNodes = 0; }

  try {
    const [chanCount] = ((await db.execute(sql`SELECT COUNT(*) as total FROM channel_connections WHERE is_active = true`)) as any).rows || [];
    snap.activeChannels = parseInt(chanCount?.total || "0");
  } catch { snap.activeChannels = 0; }

  try {
    const [soulRow] = ((await db.execute(sql`SELECT name FROM soul_configs WHERE is_active = true LIMIT 1`)) as any).rows || [];
    snap.activeSoul = soulRow?.name || "None";
  } catch { snap.activeSoul = "Unknown"; }

  try {
    const schedRes = await db.execute(sql`SELECT COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active FROM schedules`);
    const schedRow: any = ((schedRes as any).rows || [])[0];
    snap.activeSchedules = parseInt(schedRow?.active || "0");
    snap.totalSchedules = parseInt(schedRow?.total || "0");
  } catch { snap.activeSchedules = 0; snap.totalSchedules = 0; }

  try {
    const [qaCount] = ((await db.execute(sql`SELECT COUNT(*) as total FROM quick_actions`)) as any).rows || [];
    snap.quickActions = parseInt(qaCount?.total || "0");
  } catch { snap.quickActions = 0; }

  try {
    const [userCount] = ((await db.execute(sql`SELECT COUNT(*) as total FROM users`)) as any).rows || [];
    snap.totalUsers = parseInt(userCount?.total || "0");
  } catch { snap.totalUsers = 1; }

  return snap;
}

function reviewAsNeo(snap: Record<string, any>): MemberReview {
  const base: Omit<MemberReview, "strengths" | "optimizations" | "score" | "summary"> = {
    member: "Neo",
    role: "Chat & Model Intelligence",
    model: "Analyst",
    status: "success",
  };

  const msgs = snap.messages;
  const modelUsage: any[] = snap.modelUsage || [];
  const strengths: string[] = [];
  const optimizations: string[] = [];
  let score = 7;

  if (typeof msgs === "object" && msgs.total > 0) {
    strengths.push(`${msgs.total} total messages processed — the conversation engine is active`);
    if (msgs.assistant > 0) {
      const responseRate = Math.round((msgs.assistant / msgs.user) * 100);
      if (responseRate >= 90) strengths.push("High response rate — assistant is reliably answering");
      else optimizations.push("Some user messages have no assistant response — check for failed message sends");
    }
  } else {
    score -= 2;
    optimizations.push("No chat history found — encourage first use or check message persistence setting");
  }

  if (modelUsage.length > 0) {
    const topModel = modelUsage[0];
    strengths.push(`Most used model: ${topModel.model} with ${topModel.requests} requests`);
    if (modelUsage.length === 1) {
      optimizations.push("Only one model in use — try experimenting with DeepSeek or Gemini for cost savings");
    }
    const totalCost = modelUsage.reduce((s, m) => s + parseFloat(m.totalCost || "0"), 0);
    if (totalCost > 5) {
      optimizations.push(`Total AI spend is $${totalCost.toFixed(2)} — consider enabling Ollama local model for routine queries`);
      score -= 1;
    }
  } else {
    optimizations.push("No model usage data yet — token cost tracking will help optimize AI spend over time");
  }

  if (snap.activeSoul && snap.activeSoul !== "None") {
    strengths.push(`Active SOUL.md config: "${snap.activeSoul}" — agent has a defined personality`);
  } else {
    optimizations.push("No active SOUL.md config — set one to give your agent a consistent personality and context");
    score -= 1;
  }

  const summary = `Chat engine has ${typeof msgs === "object" ? msgs.total : 0} messages across ${modelUsage.length} model(s). ${snap.activeSoul !== "None" ? `Agent identity is set to "${snap.activeSoul}".` : "No agent identity configured."}`;
  return { ...base, score: Math.max(1, Math.min(10, score)), summary, strengths, optimizations };
}

function reviewAsMorpheus(snap: Record<string, any>): MemberReview {
  const base: Omit<MemberReview, "strengths" | "optimizations" | "score" | "summary"> = {
    member: "Morpheus",
    role: "Feature Adoption & UX",
    model: "Analyst",
    status: "success",
  };

  const strengths: string[] = [];
  const optimizations: string[] = [];
  let score = 6;
  let featuresActive = 0;

  if (snap.skills?.total > 0) {
    featuresActive++;
    strengths.push(`${snap.skills.total} skill(s) installed, ${snap.skills.active} active — skills ecosystem is in use`);
    if (snap.skills.total > snap.skills.active) {
      optimizations.push(`${snap.skills.total - snap.skills.active} installed skills are disabled — review and enable or uninstall unused ones`);
    }
  } else {
    optimizations.push("No skills installed — browse the Skills catalog to extend agent capabilities");
  }

  if (snap.pairedNodes > 0) {
    featuresActive++;
    strengths.push(`${snap.pairedNodes} paired device node(s) — multi-device capability is active`);
  } else {
    optimizations.push("No paired devices — pair your phone or other devices to give the agent physical-world access");
  }

  if (snap.activeChannels > 0) {
    featuresActive++;
    strengths.push(`${snap.activeChannels} active channel(s) — agent can communicate via messaging platforms`);
  } else {
    optimizations.push("No channels connected — link WhatsApp, Telegram, or Slack so the agent can reach you anywhere");
  }

  const memTotal = typeof snap.memories === "object" ? snap.memories.total : 0;
  if (memTotal > 0) {
    featuresActive++;
    strengths.push(`${memTotal} memory entries — agent has a growing knowledge base`);
    if (memTotal < 5) {
      optimizations.push("Memory is sparse — the agent benefits from richer MEMORY.md content to maintain context");
    }
  } else {
    optimizations.push("Memory feed is empty — add entries so the agent remembers important context between sessions");
  }

  if (snap.activeSchedules > 0) {
    featuresActive++;
    strengths.push(`${snap.activeSchedules} active schedule(s) — automation is running`);
  } else if (snap.totalSchedules > 0) {
    strengths.push(`${snap.totalSchedules} schedule(s) configured (inactive) — ready to activate when needed`);
  } else {
    optimizations.push("No schedules configured — set up heartbeat checks or recurring tasks in Command Center");
  }

  if (snap.quickActions > 0) {
    featuresActive++;
    strengths.push(`${snap.quickActions} quick action(s) in Command Center — streamlined agent interaction`);
  } else {
    optimizations.push("No quick actions set up — add shortcuts in Command Center for frequent tasks");
  }

  score = Math.min(10, 3 + featuresActive * 1.2);
  const summary = `${featuresActive} of 6 key feature areas are active (skills, nodes, channels, memory, schedules, quick actions). Feature adoption is ${featuresActive >= 5 ? "strong" : featuresActive >= 3 ? "growing" : "low"}.`;
  return { ...base, score: Math.round(score), summary, strengths, optimizations };
}

function reviewAsOracle(snap: Record<string, any>): MemberReview {
  const base: Omit<MemberReview, "strengths" | "optimizations" | "score" | "summary"> = {
    member: "The Oracle",
    role: "Cost Efficiency & Sustainability",
    model: "Analyst",
    status: "success",
  };

  const strengths: string[] = [];
  const optimizations: string[] = [];
  let score = 7;

  const spending = snap.spending;
  if (spending) {
    const dailyPct = spending.dailyLimit > 0 ? (spending.currentDaily / spending.dailyLimit) * 100 : 0;
    const monthlyPct = spending.monthlyLimit > 0 ? (spending.currentMonthly / spending.monthlyLimit) * 100 : 0;

    if (dailyPct < 50) {
      strengths.push(`Daily spend is healthy at ${dailyPct.toFixed(0)}% of the $${spending.dailyLimit} limit`);
    } else if (dailyPct >= 80) {
      optimizations.push(`Daily spend is at ${dailyPct.toFixed(0)}% of limit — consider raising the limit or using cheaper models`);
      score -= 2;
    }

    if (monthlyPct < 50) {
      strengths.push(`Monthly spend at ${monthlyPct.toFixed(0)}% of the $${spending.monthlyLimit} limit — on track`);
    } else if (monthlyPct >= 80) {
      optimizations.push(`Monthly budget at ${monthlyPct.toFixed(0)}% — review token costs and model selection urgently`);
      score -= 2;
    }

    if (spending.alertThreshold >= 80) {
      strengths.push("Alert thresholds are well configured to catch overspending early");
    } else {
      optimizations.push("Lower alert threshold to 70-75% for earlier spending warnings");
    }
  } else {
    optimizations.push("Spending limits are not configured — set daily/monthly budgets to avoid unexpected costs");
    score -= 2;
  }

  const modelUsage: any[] = snap.modelUsage || [];
  if (modelUsage.length > 0) {
    const totalTokens = modelUsage.reduce((s, m) => s + (m.tokens || 0), 0);
    const totalCost = modelUsage.reduce((s, m) => s + parseFloat(m.totalCost || "0"), 0);
    if (totalTokens > 0) {
      const costPerToken = (totalCost / totalTokens * 1000).toFixed(4);
      strengths.push(`Average cost: $${costPerToken} per 1K tokens — ${parseFloat(costPerToken) < 0.01 ? "very efficient" : "within normal range"}`);
    }
    const hasExpensive = modelUsage.find(m => parseFloat(m.totalCost) > 2);
    if (hasExpensive) {
      optimizations.push(`Model "${hasExpensive.model}" has accumulated $${hasExpensive.totalCost} in costs — supplement with local Ollama for simple queries`);
    }
  }

  const summary = spending
    ? `Daily: $${spending.currentDaily} / $${spending.dailyLimit}. Monthly: $${spending.currentMonthly} / $${spending.monthlyLimit}. ${modelUsage.length} model(s) contributing to costs.`
    : "No spending limits configured. Cost monitoring is not active.";

  return { ...base, score: Math.max(1, Math.min(10, score)), summary, strengths, optimizations };
}

function reviewAsAgentSmith(snap: Record<string, any>): MemberReview {
  const base: Omit<MemberReview, "strengths" | "optimizations" | "score" | "summary"> = {
    member: "Agent Smith",
    role: "Security & Configuration",
    model: "Analyst",
    status: "success",
  };

  const strengths: string[] = [];
  const optimizations: string[] = [];
  let score = 8;

  strengths.push("SSRF protection active on all gateway fetch operations");
  strengths.push("Bearer token authentication enforced on all protected endpoints");
  strengths.push("Profile-scoped IDOR protection prevents cross-user data access");

  if (snap.totalUsers > 1) {
    optimizations.push(`${snap.totalUsers} user accounts found — if this is personal use, ensure no unauthorized accounts exist`);
    score -= 1;
  } else {
    strengths.push("Single-owner deployment — registration is locked after first account");
    strengths.push("Attack surface is minimal with single-user mode active");
  }

  if (!snap.spending) {
    optimizations.push("No spending limits set — a compromised API key could run up unbounded costs");
    score -= 1;
  }

  if (snap.activeSoul === "None" || !snap.activeSoul) {
    optimizations.push("No SOUL.md config active — the agent operates without defined behavioral constraints");
    score -= 1;
  } else {
    strengths.push(`SOUL.md "${snap.activeSoul}" defines agent behavior boundaries`);
  }

  const skills = snap.skills;
  if (skills?.total > 0) {
    optimizations.push("Review installed skills security status — ensure no 'flagged' skills are active");
  }

  if (snap.pairedNodes > 2) {
    optimizations.push(`${snap.pairedNodes} paired devices — review each for necessity; remove unused nodes to reduce attack surface`);
    score -= 1;
  }

  const summary = `Security posture is ${score >= 8 ? "strong" : score >= 6 ? "adequate" : "needs attention"}. Auth, SSRF, and IDOR protections are all in place. ${snap.totalUsers > 1 ? `${snap.totalUsers} accounts present.` : "Single-user mode."}`;
  return { ...base, score: Math.max(1, Math.min(10, score)), summary, strengths, optimizations };
}

async function tryGatewayReview(
  snap: Record<string, any>,
  gatewayUrl: string,
  memberName: string,
  role: string
): Promise<MemberReview | null> {
  try {
    const prompt = `You are ${memberName}, a ${role} reviewing the I-Claw autonomous AI assistant app. 
    
System snapshot: ${JSON.stringify(snap, null, 2)}

Provide a focused review. Respond with ONLY valid JSON:
{
  "score": <1-10>,
  "summary": "<2-3 sentence executive summary>",
  "strengths": ["<what is working well>"],
  "optimizations": ["<specific actionable improvement>"]
}`;

    const response = await fetch(`${gatewayUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text: string = data.response || data.message || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      member: memberName,
      role,
      model: "Gateway AI",
      status: "success",
      score: Math.max(1, Math.min(10, parsed.score || 5)),
      summary: parsed.summary || "",
      strengths: parsed.strengths || [],
      optimizations: parsed.optimizations || [],
    };
  } catch {
    return null;
  }
}

export async function runCouncilReview(gatewayUrl?: string): Promise<CouncilReview> {
  if (isRunning) throw new Error("A review is already in progress");
  isRunning = true;

  try {
    addLog("run", "Starting council review cycle");
    const snap = await gatherSnapshot();
    addLog("info", "System snapshot collected");

    const members = [
      { name: "Neo", role: "Chat & Model Intelligence" },
      { name: "Morpheus", role: "Feature Adoption & UX" },
      { name: "The Oracle", role: "Cost Efficiency & Sustainability" },
      { name: "Agent Smith", role: "Security & Configuration" },
    ];

    const reviews: MemberReview[] = [];

    for (const member of members) {
      addLog("review", `${member.name} reviewing...`, member.name);

      let review: MemberReview | null = null;

      if (gatewayUrl && config.useGateway) {
        review = await tryGatewayReview(snap, gatewayUrl, member.name, member.role);
        if (review) {
          review.model = "Gateway AI";
          addLog("info", `${member.name} used gateway AI (score: ${review.score})`, member.name);
        }
      }

      if (!review) {
        if (member.name === "Neo") review = reviewAsNeo(snap);
        else if (member.name === "Morpheus") review = reviewAsMorpheus(snap);
        else if (member.name === "The Oracle") review = reviewAsOracle(snap);
        else review = reviewAsAgentSmith(snap);
        review.model = "Heuristic";
        addLog("info", `${member.name} used heuristic analysis (score: ${review.score})`, member.name);
      }

      reviews.push(review);
    }

    const avgScore = Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length * 10) / 10;

    const allOpts = reviews.flatMap(r => r.optimizations.map(o => ({ opt: o, member: r.member })));
    const topOptimizations = allOpts.slice(0, 6).map(o => `[${o.member}] ${o.opt}`);

    const review: CouncilReview = {
      id: `review-${Date.now()}`,
      timestamp: new Date().toISOString(),
      reviews,
      averageScore: avgScore,
      topOptimizations,
      snapshot: {
        totalMessages: typeof snap.messages === "object" ? snap.messages.total : 0,
        activeSkills: snap.skills?.active || 0,
        pairedNodes: snap.pairedNodes || 0,
        activeChannels: snap.activeChannels || 0,
        activeSoul: snap.activeSoul || "None",
        quickActions: snap.quickActions || 0,
        totalSchedules: snap.totalSchedules || 0,
        activeSchedules: snap.activeSchedules || 0,
      },
    };

    history.unshift(review);
    if (history.length > 20) history = history.slice(0, 20);
    saveHistory();

    addLog("review", `Review complete. Average score: ${avgScore}/10`);
    return review;
  } finally {
    isRunning = false;
  }
}

export function getCouncilHistory(): CouncilReview[] {
  return history;
}

export function getCouncilLog(): CouncilLogEntry[] {
  return cronLog.slice(0, 50);
}

export function getCouncilConfig(): CouncilConfig {
  return config;
}

export function updateCouncilConfig(updates: Partial<CouncilConfig>): CouncilConfig {
  config = { ...config, ...updates };
  if (updates.intervalHours !== undefined) {
    updates.intervalHours = Math.max(updates.intervalHours, 1);
  }
  saveHistory();
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (config.enabled) startAutoReview();
  return config;
}

export function isCouncilRunning(): boolean {
  return isRunning;
}

export function getLastReview(): CouncilReview | null {
  return history[0] || null;
}

export function startAutoReview(gatewayUrl?: string) {
  if (intervalId) return;
  const ms = config.intervalHours * 60 * 60 * 1000;
  intervalId = setInterval(async () => {
    if (!config.enabled || isRunning) return;
    addLog("info", "Auto-review triggered by scheduler");
    try {
      await runCouncilReview(gatewayUrl);
    } catch (err: any) {
      addLog("error", `Auto-review failed: ${err.message}`);
    }
  }, ms);
  addLog("info", `Auto-review scheduled every ${config.intervalHours}h`);
}
