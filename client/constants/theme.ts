import { Platform } from "react-native";

export const Colors = {
  light: {
    // Text Colors
    text: "#F8FAFC",
    textBase: "#e8e8f0",
    textSecondary: "#A6B0C3",
    textTertiary: "#8C97AD",
    textPlaceholder: "#5a5a6a",
    buttonText: "#FFFFFF",
    
    // Tab/Navigation
    tabIconDefault: "#8C97AD",
    tabIconSelected: "#9b5cff",
    
    // Links & Accents
    link: "#9b5cff",
    linkDark: "#6366f1",
    primary: "#9b5cff",
    indigo: "#6366f1",
    violet: "#7c3aed",
    cyan: "#22d3ee",
    purple300: "#c4b5fd",
    blue400: "#60a5fa",
    
    // Backgrounds
    backgroundRoot: "#070812",
    backgroundPage: "#0a0a12",
    backgroundDefault: "#0d0d15",
    backgroundSecondary: "#0E1022",
    backgroundTertiary: "#1a1a24",
    backgroundSurface: "#0d0d15",
    
    // Status Colors
    success: "#10b981",
    error: "#EF4444",
    warning: "#F59E0B",
    gold: "#FFD700",
    
    // Borders
    border: "rgba(255,255,255,0.08)",
    borderSubtle: "rgba(255,255,255,0.06)",
    borderMedium: "rgba(255,255,255,0.10)",
    borderAccent: "rgba(155,92,255,0.25)",
  },
  dark: {
    // Text Colors
    text: "#F8FAFC",
    textBase: "#e8e8f0",
    textSecondary: "#A6B0C3",
    textTertiary: "#8C97AD",
    textPlaceholder: "#5a5a6a",
    buttonText: "#FFFFFF",
    
    // Tab/Navigation
    tabIconDefault: "#8C97AD",
    tabIconSelected: "#9b5cff",
    
    // Links & Accents
    link: "#9b5cff",
    linkDark: "#6366f1",
    primary: "#9b5cff",
    indigo: "#6366f1",
    violet: "#7c3aed",
    cyan: "#22d3ee",
    purple300: "#c4b5fd",
    blue400: "#60a5fa",
    
    // Backgrounds
    backgroundRoot: "#070812",
    backgroundPage: "#0a0a12",
    backgroundDefault: "#0d0d15",
    backgroundSecondary: "#0E1022",
    backgroundTertiary: "#1a1a24",
    backgroundSurface: "#0d0d15",
    
    // Status Colors
    success: "#10b981",
    error: "#EF4444",
    warning: "#F59E0B",
    gold: "#FFD700",
    
    // Borders
    border: "rgba(255,255,255,0.08)",
    borderSubtle: "rgba(255,255,255,0.06)",
    borderMedium: "rgba(255,255,255,0.10)",
    borderAccent: "rgba(155,92,255,0.25)",
  },
};

export const Gradients = {
  primary: ["#9b5cff", "#6366f1"],
  pageBackground: ["#0a0a12", "#0d0d18", "#0a0a12"],
  phoneFrame: ["#1a1a24", "#12121a"],
  aiBubble: ["rgba(155,92,255,0.35)", "rgba(99,102,241,0.3)"],
  activeNav: ["rgba(155,92,255,0.18)", "rgba(99,102,241,0.12)"],
  wordmarkUnderline: ["rgba(34,211,238,0.0)", "rgba(34,211,238,0.65)", "rgba(124,58,237,0.65)", "rgba(34,211,238,0.0)"],
  gold: ["#FFD700", "#FFA500"],
};

export const Glass = {
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  userBubble: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.9)",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
  messageBubbleMaxWidth: "75%",
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 40,
  "3xl": 48,
  full: 9999,
  message: 20,
  card: 24,
  innerCard: 16,
  button: 9999,
  badge: 12,
};

export const Typography = {
  wordmark: {
    fontWeight: "800" as const,
    letterSpacing: -0.03 * 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "800" as const,
    letterSpacing: -0.03 * 32,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
    letterSpacing: -0.02 * 28,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  button: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700" as const,
    letterSpacing: -0.01 * 16,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Shadows = {
  inputBar: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 3,
  },
  buttonGlow: {
    shadowColor: "#9b5cff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  modal: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
    elevation: 24,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "Inter",
    serif: "ui-serif",
    rounded: "SF Pro Rounded",
    mono: "JetBrains Mono",
  },
  default: {
    sans: "Inter",
    serif: "serif",
    rounded: "Inter",
    mono: "JetBrains Mono",
  },
  web: {
    sans: "'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
  },
});
