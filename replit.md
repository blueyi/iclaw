# OpenClaw Mobile App (I-Claw)

## Overview

I-Claw is a mobile AI assistant application built with Expo/React Native that provides a comprehensive control plane for OpenClaw, the open-source autonomous AI agent. The app enables users to chat with AI, manage agent personality and memory, browse and install skills, pair devices, monitor system health, control spending, and connect to 20+ messaging channels — all from a single mobile interface.

The project uses a monorepo structure with:
- **Client**: Expo/React Native mobile app (iOS, Android, Web)
- **Server**: Express.js API backend with WebSocket support
- **Shared**: Common schemas and types using Drizzle ORM

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web platforms.

**Navigation**: React Navigation with tabs + stack architecture:
- Bottom tabs: Chat (HomeTab), Gateway (GatewayTab), Rewards (RewardsTab), Profile (ProfileTab)
- Stack screens: Chat, Settings (modal), CommandCenter, Canvas (WebView), Camera (full-screen)
- ClawBridge stack screens (accessed from Gateway tab, organized in 3 sub-sections):
  - Agent Identity: SoulEditor, MemoryFeed, LiveThoughts, SkillsBrowser
  - Device Network: NodePairing, ChannelDashboard
  - Operations: SystemMetrics, TokenCosts, SpendingLimits, MissionControl

**State Management**: 
- TanStack React Query for server state and caching
- WebSocket context for real-time updates (agent status, live thoughts, metrics)
- Local component state for UI interactions
- AsyncStorage available for local persistence

**UI/Styling Approach**:
- Dark-optimized theme with gradient accents for AI messages
- Custom design system in `client/constants/theme.ts` with consistent spacing, colors, and typography
- Reanimated for animations and gestures
- Platform-specific adaptations (blur effects on iOS, solid backgrounds on Android)

**Key UI Components**:
- MessageBubble: Gradient styling for AI responses, solid for user messages
- MessageInput: Bottom-fixed input with voice button and keyboard handling
- AgentStatusWidget: Animated pulse indicator showing agent state (idle/thinking/executing/waiting/listening)
- TypingIndicator: Animated dots during AI response generation

**Advanced Features**:
- Model Selector: Choose between Claude Sonnet 4, GPT-4o, Gemini 2.5 Pro, DeepSeek V3, Ollama (local) per conversation
- SOUL.md Editor: Create, edit, import/export agent personality configurations with preset templates
- Skills Browser: Browse 5400+ community skills, install/uninstall, enable/disable, view security status
- Device Node Pairing: QR code and manual IP pairing flow, approve/reject, invoke device capabilities
- Channel Dashboard: Connect/disconnect WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Email, SMS
- Canvas/A2UI: WebView with 3 view modes (Canvas/Scaffold/A2UI), JS evaluation, screenshot, render history
- Command Center: Visual cron builder, timezone selector, session types, heartbeat configuration, job history
- Memory Feed: MEMORY.md/USER.md/Daily Logs sync with gateway, importance ratings, edit mode
- Spending Limits: Daily/monthly budget controls, alert thresholds, progress bars, spending history
- Gateway TLS Configuration: TLS toggle, certificate/key path inputs, peer verification, connection testing
- Voice Support: TTS readback toggle in chat, microphone button for voice input
- WebSocket live updates: Real-time agent thoughts, status changes, metric updates
- Camera Integration: Photo capture and visual analysis requests sent to AI
- Biometric Authentication: Face ID/Touch ID quick login via expo-local-authentication

### Backend Architecture

**Server**: Express.js running on Node.js with TypeScript (compiled via tsx in development, esbuild for production).

**WebSocket**: Real-time `/ws` endpoint for streaming agent thoughts, status changes, metric updates, cost updates, channel messages, and node status events.

**API Design**: RESTful JSON API with endpoints:

Auth & User:
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Token validation for biometric login
- `GET/POST /api/profile` - Profile CRUD
- `PUT /api/profile/:id/wallet` - Wallet update

Messaging & AI:
- `GET/POST/DELETE /api/messages` - Message CRUD operations
- `GET /api/models` - List available AI models
- `PUT /api/settings/model` - Set preferred model

Configuration:
- `GET/PUT /api/settings` - App configuration
- `GET/PUT /api/gateway-tls/:profileId` - TLS configuration

SOUL.md (Agent Personality):
- `GET /api/soul-configs/templates` - Preset personality templates
- `GET /api/soul-configs/:profileId` - List configs
- `POST /api/soul-configs` - Create config
- `PUT /api/soul-configs/:id` - Update config
- `DELETE /api/soul-configs/:id` - Delete config
- `POST /api/soul-configs/:id/activate` - Set as active
- `POST /api/soul-configs/import` - Import from URL/text

Skills:
- `GET /api/skills/browse` - Browse available skills catalog (15 skills)
- `GET /api/skills/:profileId` - List installed skills
- `POST /api/skills/install` - Install a skill
- `PUT /api/skills/:id/toggle` - Enable/disable toggle
- `DELETE /api/skills/:id` - Uninstall
- `GET /api/skills/:id/security` - Security scan result

Spending Limits:
- `GET /api/spending-limits/:profileId` - Get current limits
- `PUT /api/spending-limits` - Update limits/thresholds
- `GET /api/spending-alerts/:profileId` - Check if approaching limit

Device Nodes:
- `GET /api/nodes/:profileId` - List paired nodes
- `POST /api/nodes/pair` - Initiate pairing
- `PUT /api/nodes/:id/approve` - Approve pending node
- `DELETE /api/nodes/:id` - Unpair node
- `POST /api/nodes/:id/invoke` - Invoke node capability

Channels:
- `GET /api/channels/:profileId` - List channel connections
- `POST /api/channels/connect` - Connect a new channel
- `PUT /api/channels/:id/toggle` - Enable/disable channel
- `DELETE /api/channels/:id` - Disconnect
- `GET /api/channels/:profileId/stats` - Message stats per channel

Monitoring & Control:
- `GET /api/gateway/status` - Gateway health check
- `POST /api/gateway/node-report` - Device node reporting
- `GET/POST /api/agent-thoughts/:profileId` - Agent thought feed
- `GET/POST /api/token-costs/:profileId` - Token cost tracking
- `GET /api/token-costs/:profileId/summary` - Cost summary by model
- `GET/POST /api/system-metrics` - System resource monitoring
- `GET /api/system-metrics/history` - Historical metrics
- `GET/POST/DELETE /api/memories/:profileId` - Agent memory journal
- `POST /api/emergency-stop` - Trigger emergency stop
- `PUT /api/emergency-stop/:id/resolve` - Resolve emergency stop
- `GET /api/emergency-stops/:profileId` - Emergency stop history

Automation:
- `GET/POST/DELETE /api/quick-actions` - Quick action CRUD and execution
- `GET/POST/PUT/DELETE /api/schedules` - Schedule CRUD
- `POST /api/schedules/heartbeat` - Configure heartbeat
- `GET /api/action-logs` - Action execution history

Rewards & Referrals:
- `POST /api/rewards/claim` - Claim daily tokens
- `GET /api/rewards/status/:profileId` - Streak info
- `GET /api/referrals/:profileId` - Referral stats
- `GET /api/transactions/:profileId` - Token transactions

**Security**:
- All endpoints require Bearer token authentication via `requireAuthWithProfile`
- Profile-scoped routes enforce IDOR protection
- SSRF protection via `validateGatewayUrl` and `safeFetchGateway`
- Auth token synced globally via `setAuthToken()` in `client/lib/query-client.ts`

**OpenClaw Integration**: The server proxies chat messages to a configurable external OpenClaw AI server URL (with SSRF protection), falling back to a simulated response when unavailable.

### Data Storage

**Database**: PostgreSQL with Drizzle ORM for schema management and queries.

**Schema** (defined in `shared/schema.ts`):
- `users`: User accounts
- `sessions`: Auth sessions with Bearer tokens
- `messages`: Chat messages with conversation IDs
- `settings`: App configuration (openclawUrl, saveMessagesLocally)
- `user_profiles`: Wallet, referral codes, token balances, Pro status
- `referrals`, `daily_rewards`, `user_streaks`, `token_transactions`: Rewards system
- `quick_actions`, `schedules`, `action_logs`: Automation system
- `message_usage`: Daily message count tracking
- `agent_thoughts`: Agent chain-of-thought entries
- `token_costs`: API token cost tracking by model
- `system_metrics`: System resource snapshots
- `agent_memories`: Agent memory journal entries
- `emergency_stops`: Emergency stop records
- `soul_configs`: SOUL.md personality configurations
- `installed_skills`: Installed skill registry with security status
- `spending_limits`: Daily/monthly spend limits and alerts
- `paired_nodes`: Paired device nodes with capabilities
- `channel_connections`: Multi-channel messaging connections
- `gateway_tls_config`: TLS encryption settings

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
- `expo-clipboard`: Copy/paste for SOUL.md export and Canvas snapshots
- `ws`: WebSocket server for real-time updates
