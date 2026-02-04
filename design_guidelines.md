# OpenClaw Mobile App - Design Guidelines

## 1. Brand Identity

**Purpose**: A personal AI assistant interface that puts OpenClaw's power in your pocket - enabling natural conversation with your local AI from anywhere.

**Aesthetic Direction**: **Refined Tech** - Sophisticated, minimal interface with subtle sci-fi touches. Dark-optimized design that feels intelligent and trustworthy. Think "premium AI assistant" not "generic chatbot."

**Memorable Element**: Gradient message bubbles for AI responses that shimmer subtly, creating a sense of intelligence and activity. This visual signature makes OpenClaw responses instantly recognizable.

## 2. Navigation Architecture

**Root Navigation**: Stack-Only (single conversation flow)

**Screens**:
1. **Chat** (Main) - Primary conversation interface
2. **Settings** (Modal) - Server configuration and app preferences

## 3. Screen Specifications

### Chat Screen
**Purpose**: Primary interface for conversing with OpenClaw

**Layout**:
- Header: Custom transparent header with "OpenClaw" title, Settings button (top-right)
- Main content: Inverted FlatList (messages scroll from bottom up)
- Floating elements: Message input bar fixed to bottom with safe area inset
- Root view insets: top = insets.top + 20, bottom = none (input handles it)

**Components**:
- Message bubbles (user: right-aligned solid, AI: left-aligned gradient)
- Timestamp labels (subtle, above each message)
- Typing indicator (animated dots when AI is responding)
- Message input bar with Send button
- Empty state illustration when no messages

**Empty State**: Centered illustration with "Start a conversation" prompt

### Settings Screen (Modal)
**Purpose**: Configure OpenClaw server connection and preferences

**Layout**:
- Header: Default modal header, "Settings" title, Done button (top-right)
- Main content: Scrollable form
- Submit/cancel: Header buttons only
- Root view insets: top = 20, bottom = insets.bottom + 20

**Components**:
- Text input for server URL
- Toggle for "Save messages locally"
- Button to clear conversation history (destructive style)
- App version display

## 4. Color Palette

**Primary**: `#6366F1` (Indigo) - Bold, intelligent, distinctive
**Primary Dark**: `#4F46E5` (for pressed states)
**Background**: `#0F0F14` (Deep charcoal, not pure black)
**Surface**: `#1A1A24` (Elevated surfaces)
**Surface Elevated**: `#252530` (Cards, inputs)
**Text Primary**: `#FFFFFF`
**Text Secondary**: `#9CA3AF`
**Text Tertiary**: `#6B7280`
**AI Gradient**: Linear gradient from `#6366F1` to `#8B5CF6` (Indigo to Purple)
**Success**: `#10B981`
**Error**: `#EF4444`

## 5. Typography

**Font**: System fonts (San Francisco on iOS)

**Type Scale**:
- Title: 28pt, Bold
- Heading: 20pt, Semibold
- Body: 16pt, Regular
- Caption: 14pt, Regular
- Small: 12pt, Regular

**Message Text**: 16pt Regular for readability in conversation

## 6. Visual Design

**Icons**: Feather icons from @expo/vector-icons
- Settings: `settings`
- Send: `send`
- Clear: `trash-2`

**Shadows**: Floating input bar only
- shadowOffset: {width: 0, height: -2}
- shadowOpacity: 0.10
- shadowRadius: 8

**Message Bubbles**:
- User messages: solid Background.surface with 2px border in Primary
- AI messages: gradient background (AI Gradient colors)
- Border radius: 20px
- Padding: 12px horizontal, 10px vertical
- Max width: 75% screen width

**Input Bar**:
- Background: Surface Elevated
- Border radius: 24px
- Height: 48px
- Includes text input (flex) + Send button (44x44 touchable)

**Touch Feedback**: Opacity 0.6 for all touchable elements

## 7. Assets to Generate

**icon.png** - App icon featuring stylized "claw" mark in gradient indigo-purple
- WHERE USED: Device home screen

**splash-icon.png** - Same claw mark on dark background
- WHERE USED: App launch screen

**empty-chat.png** - Minimalist illustration of a chat bubble with sparkles
- WHERE USED: Chat screen when conversation history is empty

**ai-avatar.png** - Circular gradient avatar (indigo to purple)
- WHERE USED: Left side of AI message bubbles

**user-avatar.png** - Circular solid avatar (neutral gray)
- WHERE USED: Right side of user message bubbles

All illustrations should use the defined color palette with a sophisticated, minimal style. Avoid clipart aesthetics - prefer geometric, modern shapes.