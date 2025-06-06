# ISO Tracker Change Log

## [1.3.5] - 2024-04-18

### Added
- Backup & Restore functionality for Tasks, Technicians, and Groups.
- UI for creating backups and restoring data from JSON files.
- Detailed progress tracking with percentage and operation log for backup/restore.
- Collapsible operation log for better UI management.

### Changed
- Refined restore progress updates to improve performance and UI responsiveness (batching every 5 items).
- Improved module resolution for backup utilities using barrel file pattern.

## [1.3.4] - 2024-04-16

### Added
- Task Analyzer feature: Uses OpenAI to analyze selected tasks, provides summaries, identifies potential issues, and suggests improvements.

## April 18, 2024 - v1.2.11

### Feature Improvements
- Added bulk selection capability for tasks in Kanban view
- New 'Select All' button in each group header to quickly select all tasks in a group
- Implemented toggle functionality to select or deselect all tasks in a group with one click
- Enhanced bulk operations workflow for more efficient task management

## April 18, 2024 - v1.2.10

### UI Improvements
- Fixed Add Task modal overflow issue ensuring action buttons are always visible
- Improved modal scrolling behavior for better user experience
- Enhanced form layout with sticky action buttons
- Reduced rich text editor height for better form layout

## April 18, 2024 - v1.2.9

### Bug Fixes
- Fixed unescaped quote in BulkAddTaskFromOpenAI component for Vercel compatibility
- Improved dropdown menu in main task list for better usability
- Enhanced UI elements with additional descriptions and clearer labels

## April 18, 2024 - v1.2.8

### Major Features
- Added support for OpenAI o3 and o4-mini models for bulk task extraction
- Implemented model selection toggle for choosing between standard (o4-mini) and higher precision (o3) models
- Added auto-selection of o3 model for meeting transcripts
- Enhanced text extraction from PDFs, Word documents, and plain text files
- Improved streaming response handling for real-time feedback during AI processing

### UI Improvements
- Enhanced progress indicators for document processing stages
- Added clear model information display during processing
- Improved error handling with more descriptive messages
- Updated file upload interface with clearer file type indicators

## April 17, 2024 - v1.1.3

### UI Improvements
- Enhanced BatchOperationsToolbar with draggable functionality
- Added ability to position toolbar anywhere on the screen
- Implemented vertical orientation when dragged to screen edges
- Added persistent positioning between sessions using localStorage
- Improved visual styling with more distinct background and border
- Added double-click to center functionality for easy reset

## April 07, 2025

### Added Features
- Added ability to search controls by technician name
- Updated search placeholder to indicate technician search capability

### Fixed Drag and Drop Issues
- Fixed instability in drag and drop functionality
- Improved state management during drag operations
- Simplified drag handlers to be more reliable
- Fixed the "Invalid time value" error during undo operations
- Added better error handling for drag and drop API calls

### Fixed Rich Text Editor Issues
- Replaced ReactQuill with direct Quill implementation to fix findDOMNode errors
- Fixed multiple toolbar issue by using a dedicated toolbar container
- Fixed format configuration in Quill by removing invalid 'bullet' format
- Added proper cleanup for Quill instances to prevent memory leaks
- Improved client-side only rendering for the editor

### Fixed Date Display Issues
- Fixed timezone conversion issue that caused dates to display one day earlier
- Implemented proper UTC date handling for consistent date display
- Enhanced date formatting functions with better error handling

### Improved Error Handling
- Added robust error handling for empty API responses
- Improved JSON parsing safety for API responses
- Added better error recovery mechanisms throughout the application
