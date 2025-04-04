# ISO Compliance Tracker

A modern web application for managing and tracking ISO compliance controls and technician assignments. Built with Next.js, React, TypeScript, and Firebase.

## Features

- **Control Management**:
  - Create, edit, and delete ISO compliance controls
  - Assign controls to technicians
  - Set completion dates
  - Update control status (Not Started, In Progress, In Review, Complete, On Hold)
  - Add detailed explanations for each control

- **Technician Management**:
  - Add and remove technicians
  - Edit technician information
  - Assign technicians to controls

- **Modern UI Features**:
  - Drag-and-drop for prioritizing controls
  - Advanced filtering by status, assignee, due date, and text search
  - Group controls by status or assignee
  - Inline editing with contextual menus

## Tech Stack

- **Frontend**:
  - Next.js 14 (App Router)
  - React 18
  - TypeScript
  - Tailwind CSS
  - dnd-kit (drag-and-drop functionality)

- **Backend**:
  - Firebase Firestore (database)
  - Firebase Authentication
  - Next.js API Routes

- **Development**:
  - ESLint for code quality
  - Vercel for deployment

## Getting Started

### Prerequisites

- Node.js (v18 or newer)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository:

```bash
git clone https://github.com/ca-vahid/isotracker.git
cd isotracker
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory with your Firebase configuration:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

4. Run the development server:

```bash
npm run dev
# or
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
/src
├── app              # Next.js App Router
│   ├── api          # API routes
│   ├── page.tsx     # Controls page (main view)
│   └── technicians  # Technicians management page
├── components       # React components
│   ├── AddControlForm.tsx
│   ├── ControlCard.tsx
│   ├── ControlFilterBar.tsx
│   ├── ControlGroupView.tsx
│   ├── ControlList.tsx
│   ├── Header.tsx
│   ├── SortableItem.tsx
│   └── TechnicianManager.tsx
└── lib              # Utilities and shared code
    ├── contexts     # React contexts
    │   ├── AuthContext.tsx
    ├── firebase     # Firebase configuration
    │   ├── firebase.ts
    │   └── firebaseUtils.ts
    ├── hooks        # Custom React hooks
    │   └── useAuth.ts
    └── types.ts     # TypeScript types
```

## Key Features Explained

### Control Management

Controls are the main entities in the application. Each control represents a specific ISO compliance requirement and includes:

- DCF ID (reference identifier)
- Title and explanation
- Current status
- Assigned technician
- Estimated completion date

### Filtering and Grouping

The application provides powerful filtering capabilities:
- Text search across control titles, IDs, and explanations
- Filter by status (Not Started, In Progress, etc.)
- Filter by assignee
- Filter by due date (overdue, today, this week, etc.)

Controls can be grouped by:
- Status (with color coding)
- Assignee
- No grouping (flat list)

### Drag-and-Drop Ordering

Controls can be reordered using drag-and-drop, allowing users to prioritize their work. The ordering is persisted to the database.

### Inline Editing

All control fields can be edited inline:
- Click directly on the field to edit (title, DCF ID)
- Use the three-dots menu for additional editing options
- Explanation editing with rich text formatting

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [React](https://reactjs.org/)
- [Firebase](https://firebase.google.com/)
- [dnd-kit](https://dndkit.com/)
- [Tailwind CSS](https://tailwindcss.com/)
