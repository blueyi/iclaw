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

**Navigation**: React Navigation with a stack-only architecture:
- Chat screen (main conversation interface)
- Settings screen (modal presentation for configuration)

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
- MessageBubble: Gradient styling for AI responses, solid for user messages
- MessageInput: Bottom-fixed input with keyboard handling
- TypingIndicator: Animated dots during AI response generation

### Backend Architecture

**Server**: Express.js running on Node.js with TypeScript (compiled via tsx in development, esbuild for production).

**API Design**: RESTful JSON API with endpoints:
- `GET/POST /api/messages` - Message CRUD operations
- `GET/PUT /api/settings` - App configuration

**OpenClaw Integration**: The server proxies chat messages to a configurable external OpenClaw AI server URL, falling back to a simulated response when unavailable.

### Data Storage

**Database**: PostgreSQL with Drizzle ORM for schema management and queries.

**Schema** (defined in `shared/schema.ts`):
- `users`: Basic user accounts (id, username, password)
- `messages`: Chat messages (id, content, role, createdAt, conversationId)
- `settings`: App configuration (openclawUrl, saveMessagesLocally)

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