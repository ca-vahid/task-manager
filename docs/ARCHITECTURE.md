# Task Manager Application Architecture
**Version: 1.0.1** (Based on APP_VERSION constant)

## Overview
This document provides a comprehensive overview of the Task Manager application architecture, including components, APIs, AI models, and data flow. It serves as a reference for developers working on the application.

## Core Technologies
- **Frontend**: React.js with Next.js 14 App Router
- **Styling**: Tailwind CSS
- **Backend Storage**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **AI Integration**: Gemini, OpenAI, Anthropic models
- **Media Processing**: PDF analysis

## Component Structure

### Main Components
- **TaskList**: The main container component displaying all tasks with filtering and grouping
- **TaskCard**: Individual task card component with contextual actions
- **TaskFilterBar**: Component for filtering and organizing tasks
- **TaskGroupView**: Component for displaying tasks in grouped kanban view
- **BatchOperationsToolbar**: Component for performing operations on multiple selected tasks
- **TaskAnalyzer**: AI-powered component for analyzing and merging similar tasks
- **Modal**: Reusable modal component with configurable sizes

### Task Creation Components
- **AddTaskForm**: Form for adding a single task
- **BulkAddTaskAI**: Component for adding multiple tasks using AI text analysis
- **BulkAddTaskFromPDF**: Component for extracting tasks from PDF documents
- **TaskReviewForm**: Form for reviewing and editing AI-extracted tasks

## API Structure

### Internal APIs
All API routes are located in `src/app/api/`:

1. **Task Management**
   - `tasks/route.ts` - GET (list tasks), POST (create task)
   - `tasks/[id]/route.ts` - GET, PUT, DELETE for individual tasks
   - `tasks/batch/route.ts` - Batch operations on multiple tasks
   - `tasks/bulk/route.ts` - Adding multiple tasks at once
   - `tasks/update/route.ts` - Update task properties

2. **User Management**
   - `technicians/route.ts` - GET (list technicians), POST (create technician)
   - `technicians/[id]/route.ts` - Operations on individual technicians

3. **Group Management**
   - `groups/route.ts` - GET (list groups), POST (create group)
   - `groups/[id]/route.ts` - Operations on individual groups

4. **Category Management**
   - `categories/route.ts` - GET (list categories), POST (create category)
   - `categories/[id]/route.ts` - Operations on individual categories

5. **Ticket Integration**
   - `tickets/route.ts` - Integration with external ticket systems (likely FreshService)

### AI API Endpoints

1. **OpenAI Integration**
   - `openai/chat/route.ts` - Streaming text generation using Vercel AI SDK

2. **Anthropic Integration**
   - `anthropic/chat/route.ts` - Streaming text generation using Vercel AI SDK

3. **Gemini Integration**
   - `gemini/analyze-tasks/route.ts` - Task analysis with duplicate/similarity detection
   
4. **Replicate Integration**
   - `replicate/generate-image/route.ts` - Image generation with Stable Diffusion

5. **Deepgram Integration**
   - `deepgram/transcribe-audio/route.ts` - Audio transcription

## AI Model Usage

### 1. Google Gemini Models
- **Used for**: Task analysis, duplicate detection, and similarity detection
- **Models**:
  - `gemini-2.0-flash` (Standard model) - Fast task analysis
  - `gemini-2.5-pro-preview-03-25` (Thinking model) - More detailed analysis with reasoning steps
- **Implementation**: See `src/app/api/gemini/analyze-tasks/route.ts`
- **Features**:
  - Structured output using JSON schema
  - Streaming responses for real-time updates
  - Two modes: standard (fast) and thinking (detailed)
  - Identifies duplicate and similar tasks
  - Recommends merge operations with detailed rationale

### 2. OpenAI Models
- **Used for**: Text generation and task extraction
- **Implementation**: See `src/app/api/openai/chat/route.ts`
- **Features**:
  - Streaming text responses
  - Likely used for extracting structured task data from text

### 3. Anthropic Models
- **Used for**: Alternative text generation 
- **Implementation**: See `src/app/api/anthropic/chat/route.ts`
- **Features**:
  - Streaming text responses
  - Likely used for extracting structured task data from text

### 4. Replicate Models
- **Used for**: Image generation
- **Model**: Stable Diffusion
- **Implementation**: See `src/app/api/replicate/generate-image/route.ts`

### 5. Deepgram
- **Used for**: Audio transcription
- **Implementation**: 
  - API: `src/app/api/deepgram/transcribe-audio/route.ts`
  - Context: `src/lib/contexts/DeepgramContext.tsx`

## Key Features

### Task Management
- Create, read, update, delete tasks
- Assign tasks to technicians
- Group tasks by various attributes
- Set due dates, priorities, and categories
- Track task status
- View tasks in multiple layouts (kanban, timeline, list)

### Batch Operations
- Select multiple tasks
- Update status, assignee, group, due date in bulk
- Delete multiple tasks
- Analyze multiple tasks for duplicates/similarities

### AI-Powered Task Analysis
- Analyze tasks to identify duplicates and similarities
- Provide recommendations for merging or keeping tasks separate
- Generate merged task content when combining tasks
- Real-time feedback during analysis
- Two analysis modes: standard and thinking

### Document Processing
- Extract tasks from PDF documents
- Review and edit extracted tasks
- Generate meeting summaries
- Download processed documents

### Dark Mode Support
- Complete dark mode implementation throughout application
- Context-aware color schemes
- Proper color contrast in both modes

## Data Models

### Task
```typescript
interface Task {
  id: string;
  title: string;
  explanation: string;
  status: TaskStatus;
  priority: PriorityLevel;
  createdAt: Timestamp;
  assigneeId: string | null;
  groupId: string | null;
  categoryId: string | null;
  estimatedCompletionDate: Timestamp | null;
  ticketNumber?: string;
  ticketUrl?: string;
}
```

### Technician
```typescript
interface Technician {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}
```

### Group
```typescript
interface Group {
  id: string;
  name: string;
  description?: string;
}
```

### Category
```typescript
interface Category {
  id: string;
  value: string;
}
```

## Firebase Integration
- **Database**: Firestore for storing tasks, technicians, groups, categories
- **Authentication**: User authentication with Firebase Auth
- **Storage**: Possibly used for storing files/documents
- **Utilities**: Located in `src/lib/firebase/firebaseUtils.ts`
- **Config**: Located in `src/lib/firebase/firebase.ts`

## Context Providers
- **AuthContext**: User authentication state management
- **ThemeContext**: Dark/light mode management
- **UndoContext**: Manages undo operations for tasks
- **DeepgramContext**: Manages Deepgram API integration

## Hooks
- **useAuth**: Hook for authentication operations
- **useUndo**: Hook for undo operations

## UI Components
- **Modal**: Reusable modal with configurable sizes (sm, md, lg, xl, 2xl)
- **CollapsibleGroup**: Expandable/collapsible container
- **QuillEditor**: Rich text editor for task details

## Document Processing Features
- PDF task extraction
- Meeting transcript analysis
- Thinking vs. Standard model toggle

## Batch and Analysis Features
- Batch selection mechanism via selectedTaskIds
- Task analysis with Gemini AI
- Merge selection UI for similar/duplicate tasks
- Duplicate vs. Similar categorization 