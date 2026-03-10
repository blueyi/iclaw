# OpenClaw Mobile App

## Overview

OpenClaw is a mobile AI assistant application built with Expo/React Native that enables users to have natural conversations with an AI backend. The app features a chat interface for communicating with an OpenClaw AI server, with settings to configure the server connection and message persistence preferences.

The project uses a monorepo structure with:
- **Client**: Expo/React Native mobile app (iOS, Android, Web)
- **Server**: Express.js API backend
- **Shared**: Common schemas and types using Drizzle ORM

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web platforms.

**Navigation**: React Navigation with tabs + stack architecture:
- Bottom tabs: Chat (HomeTab), Gateway (GatewayTab), Rewards (RewardsTab), Profile (ProfileTab)
- Stack screens: Chat, Settings (modal), CommandCenter, Canvas (WebView), Camera (full-screen)
- ClawBridge stack screens (accessed from Gateway tab): LiveThoughts, TokenCosts, SystemMetrics, MissionControl, MemoryFeed

**State Management**: 
- TanStack React Query for server state and caching
- Local component state for UI interactions
- AsyncStorage available for local persistence

**UI/Styling Approach**:
- Dark-optimized theme with gradient accents for AI messages
- Custom design system in `client/constants/theme.ts` with consistent spacing, colors, and typography
- Reanimated for animations and gestures
- Platform-specific adaptations (blur effects on iOS, solid backgrounds on Android)

**Key UI Components**:
- MessageBubble: Gradient styling for AI responses, solid for user messages, TTS voice readback button on AI messages (expo-speech)
- MessageInput: Bottom-fixed input with keyboard handling
- TypingIndicator: Animated dots during AI response generation

**Advanced Features**:
- Canvas/A2UI screen: WebView loading Gateway's `/__openclaw__/canvas/` endpoint for rich AI interactions
- Gateway Status Dashboard: Real-time health monitoring, response latency, device node status (battery, network, platform)
- Camera Integration: Photo capture and visual analysis requests sent to AI
- Biometric Authentication: Face ID/Touch ID quick login via expo-local-authentication with secure token storage (expo-secure-store)
- Text-to-Speech: Voice readback of AI responses with per-message speaker toggle

### Backend Architecture

**Server**: Express.js running on Node.js with TypeScript (compiled via tsx in development, esbuild for production).

**API Design**: RESTful JSON API with endpoints:
- `GET/POST /api/messages` - Message CRUD operations
- `GET/PUT /api/settings` - App configuration
- `GET/POST/DELETE /api/quick-actions` - Quick action CRUD and execution
- `GET/POST/PUT/DELETE /api/schedules` - Schedule/automation CRUD
- `GET /api/action-logs` - Action execution history
- `GET /api/gateway/status` - Gateway health check with latency measurement
- `POST /api/gateway/node-report` - Device node capability reporting
- `GET/POST /api/agent-thoughts/:profileId` - Agent chain-of-thought feed
- `GET/POST /api/token-costs/:profileId` - API token cost tracking
- `GET /api/token-costs/:profileId/summary` - Cost summary by model
- `GET/POST /api/system-metrics` - System resource monitoring
- `GET /api/system-metrics/history` - Historical metrics
- `GET/POST/DELETE /api/memories/:profileId` - Agent memory journal
- `GET /api/emergency-stops/:profileId` - Emergency stop history
- `POST /api/emergency-stop` - Trigger emergency stop
- `PUT /api/emergency-stop/:id/resolve` - Resolve an emergency stop
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Token validation for biometric login

**OpenClaw Integration**: The server proxies chat messages to a configurable external OpenClaw AI server URL, falling back to a simulated response when unavailable.

### Data Storage

**Database**: PostgreSQL with Drizzle ORM for schema management and queries.

**Schema** (defined in `shared/schema.ts`):
- `users`: Basic user accounts (id, username, password)
- `messages`: Chat messages (id, content, role, createdAt, conversationId)
- `settings`: App configuration (openclawUrl, saveMessagesLocally)
- `quick_actions`: User quick actions (title, description, icon, command)
- `schedules`: Automated task schedules (title, command, interval, active state)
- `action_logs`: Execution history for actions and schedules
- `agent_thoughts`: Agent chain-of-thought entries (type, content, metadata, sessionId)
- `token_costs`: API token cost tracking (model, inputTokens, outputTokens, cost, requestType)
- `system_metrics`: System resource snapshots (cpuPercent, memoryPercent, diskPercent, uptime)
- `agent_memories`: Agent memory journal (title, content, memoryType, tags, importance)
- `emergency_stops`: Emergency stop records (reason, stoppedProcesses, status, triggeredAt, resolvedAt)

**Migrations**: Managed via `drizzle-kit push` command.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable

### Build & Runtime
- **Expo**: Mobile app framework and build tooling
- **Metro Bundler**: JavaScript bundler for React Native
- **esbuild**: Server-side production bundling

### Third-Party Services
- **OpenClaw AI Server**: External AI service for chat responses (user-configurable URL in settings)

### Key Runtime Libraries
- `react-native-keyboard-controller`: Enhanced keyboard handling
- `react-native-reanimated`: Animation engine
- `expo-haptics`: Haptic feedback on interactions
- `expo-blur` / `expo-glass-effect`: Platform-specific visual effects
- `@tanstack/react-query`: Data fetching and caching
- `expo-speech`: Text-to-speech for AI message readback
- `expo-camera`: Camera integration for visual AI analysis
- `expo-local-authentication`: Biometric login (Face ID/Touch ID)
- `expo-secure-store`: Secure token storage for biometric auth
- `expo-device`: Device information for node reporting
- `expo-battery`: Battery level monitoring for Gateway dashboard
- `@react-native-community/netinfo`: Network type detection
- `react-native-webview`: Canvas/A2UI WebView for Gateway interactions