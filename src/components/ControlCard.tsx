"use client";

import React, { useState, ChangeEvent, FocusEvent, useEffect } from 'react';
import { Control, ControlStatus, Technician, ViewDensity, PriorityLevel, Company } from '@/lib/types'; // Add Company to imports
import { Timestamp } from 'firebase/firestore';
import Image from 'next/image';
import { useNotification } from '@/lib/contexts/NotificationContext';
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
import dynamic from 'next/dynamic';

// Import ReactQuill dynamically to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css'; // Import Quill styles

interface ControlCardProps {
  control: Control;
  technicians: Technician[];
  onUpdateControl: (id: string, updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
  onDeleteControl: (id: string) => Promise<void>;
  viewDensity?: ViewDensity; // Add view density prop with default value
}

// Helper to format Firestore Timestamp to YYYY-MM-DD for date input
function formatDateForInput(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  try {
    // Check if timestamp is a Firestore Timestamp or has seconds property
    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      // Handle case where it might be a raw Firestore timestamp object
      date = new Date((timestamp as any).seconds * 1000);
    } else if (typeof timestamp === 'string') {
      // Handle case where it might be a date string
      date = new Date(timestamp);
    } else {
      return '';
    }

    if (isNaN(date.getTime())) { return ''; }
    
    // Use UTC methods to prevent timezone shifts
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) { 
    console.error("Error formatting date:", error, timestamp);
    return ''; 
  }
}

// Get time remaining until completion date
function getTimeRemaining(timestamp: Timestamp | null | any, status?: ControlStatus): { days: number; urgent: boolean; overdue: boolean; text: string } {
  if (!timestamp) return { days: 0, urgent: false, overdue: false, text: 'No date set' };
  if (status === ControlStatus.Complete) { return { days: 0, urgent: false, overdue: false, text: 'Completed' }; }
  try {
    let date: Date;
    if (timestamp instanceof Timestamp) { date = timestamp.toDate(); }
    else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) { date = new Date(timestamp.seconds * 1000); }
    else if (typeof timestamp === 'string') { date = new Date(timestamp); }
    else { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    if (isNaN(date.getTime())) { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    
    // Use UTC dates for comparison to avoid timezone issues
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const diffTime = dateUTC.getTime() - todayUTC.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) { return { days: Math.abs(diffDays), urgent: false, overdue: true, text: `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue` }; }
    else if (diffDays === 0) { return { days: 0, urgent: true, overdue: false, text: 'Due today' }; }
    else if (diffDays <= 3) { return { days: diffDays, urgent: true, overdue: false, text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left` }; }
    else { return { days: diffDays, urgent: false, overdue: false, text: `${diffDays} days left` }; }
  } catch (error) { return { days: 0, urgent: false, overdue: false, text: 'Error' }; }
}

// Get status color and background (with dark variants)
function getStatusStyles(status: ControlStatus): { color: string; background: string; border: string; darkColor: string; darkBackground: string; darkBorder: string; } {
  switch (status) {
    case ControlStatus.InProgress: return { color: 'text-indigo-700', background: 'bg-gradient-to-r from-indigo-50 to-indigo-100', border: 'border-indigo-200', darkColor: 'dark:text-indigo-300', darkBackground: 'dark:bg-gradient-to-r dark:from-indigo-900/50 dark:to-indigo-800/50', darkBorder: 'dark:border-indigo-700' };
    case ControlStatus.InReview: return { color: 'text-amber-700', background: 'bg-gradient-to-r from-amber-50 to-amber-100', border: 'border-amber-200', darkColor: 'dark:text-amber-300', darkBackground: 'dark:bg-gradient-to-r dark:from-amber-900/50 dark:to-amber-800/50', darkBorder: 'dark:border-amber-700' };
    case ControlStatus.Complete: return { color: 'text-emerald-700', background: 'bg-gradient-to-r from-emerald-50 to-emerald-100', border: 'border-emerald-200', darkColor: 'dark:text-emerald-300', darkBackground: 'dark:bg-gradient-to-r dark:from-emerald-900/50 dark:to-emerald-800/50', darkBorder: 'dark:border-emerald-700' };
    default: return { color: 'text-gray-700', background: 'bg-gradient-to-r from-gray-50 to-gray-100', border: 'border-gray-200', darkColor: 'dark:text-gray-400', darkBackground: 'dark:bg-gradient-to-r dark:from-gray-800/50 dark:to-gray-700/50', darkBorder: 'dark:border-gray-600' };
  }
}

// Get company styles (with dark variants)
function getCompanyStyles(company: Company): { bgColor: string; textColor: string; borderColor: string; darkBgColor: string; darkTextColor: string; darkBorderColor: string; } {
  switch (company) {
    case Company.BGC: return { bgColor: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200', darkBgColor: 'dark:bg-blue-900/50', darkTextColor: 'dark:text-blue-300', darkBorderColor: 'dark:border-blue-700' };
    case Company.Cambio: return { bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-emerald-200', darkBgColor: 'dark:bg-emerald-900/50', darkTextColor: 'dark:text-emerald-300', darkBorderColor: 'dark:border-emerald-700' };
    case Company.Both: return { bgColor: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200', darkBgColor: 'dark:bg-cyan-900/50', darkTextColor: 'dark:text-cyan-300', darkBorderColor: 'dark:border-cyan-700' };
    default: return { bgColor: 'bg-gray-50', textColor: 'text-gray-700', borderColor: 'border-gray-200', darkBgColor: 'dark:bg-gray-800/50', darkTextColor: 'dark:text-gray-400', darkBorderColor: 'dark:border-gray-600' };
  }
}

export function ControlCard({ control, technicians, onUpdateControl, onDeleteControl, viewDensity = 'medium' }: ControlCardProps) {
  // State Variables
  const [isEditingExplanation, setIsEditingExplanation] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState(control.explanation);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(control.title);
  const [isDcfIdEditing, setIsDcfIdEditing] = useState(false);
  const [dcfIdDraft, setDcfIdDraft] = useState(control.dcfId);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(control.externalUrl || '');
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Company>(control.company || Company.Both);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [showExplanationDialog, setShowExplanationDialog] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showAssigneeDialog, setShowAssigneeDialog] = useState(false);
  const [showDateDialog, setShowDateDialog] = useState(false);
  // New state for ticket creation and deletion
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);
  const [showTicketDeleteDialog, setShowTicketDeleteDialog] = useState(false);
  const [deleteRemoteTicket, setDeleteRemoteTicket] = useState(true);
  // New state for deleting ticket with control
  const [deleteTicketWithControl, setDeleteTicketWithControl] = useState(true);
  // New state for AI explanation
  const [isLoadingAIExplanation, setIsLoadingAIExplanation] = useState(false);
  const [aiExplanation, setAIExplanation] = useState<string | null>(null);
  // New state for AI insight evidence
  const [isLoadingAIInsight, setIsLoadingAIInsight] = useState(false);
  const [aiInsight, setAIInsight] = useState<string | null>(null);
  const [showInsightDialog, setShowInsightDialog] = useState(false);
  // Add state for dropdown
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Refs
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const detailsRef = React.useRef<HTMLDetailsElement>(null);

  // Derived State & Styles
  const timeRemaining = getTimeRemaining(control.estimatedCompletionDate, control.status);
  const statusStyles = getStatusStyles(control.status);
  const currentCompany = control.company || Company.Both;
  const companyStyles = getCompanyStyles(currentCompany);
  const assigneeName = control.assigneeId ? technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown' : 'Unassigned';
  const isHighPriority = control.priorityLevel === PriorityLevel.High || control.priorityLevel === PriorityLevel.Critical;

  // Add notification hook
  const { showToast } = useNotification();

  // Effects
  useEffect(() => { /* Initialize state */
    setTitleDraft(control.title);
    setDcfIdDraft(control.dcfId);
    setExplanationDraft(control.explanation);
    setUrlDraft(control.externalUrl || '');
    setCompanyDraft(control.company || Company.Both);
  }, [control]);

  useEffect(() => { /* Close menu on outside click */
    const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setMenuOpen(false); } };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effect to handle outside clicks for company dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Handlers --- 
  const handleFieldUpdate = async (fieldName: keyof Control, value: any) => {
    setUpdateError(null);
    let updateValue = value;
    if (fieldName === 'estimatedCompletionDate') {
        if (!value || value === '') { 
            updateValue = null; 
        }
        else { 
            try { 
                // Parse YYYY-MM-DD string as UTC date to create Timestamp
                const dateParts = value.split('-');
                if (dateParts.length !== 3) throw new Error('Invalid date string format');
                const year = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10) - 1; // JS month is 0-indexed
                const day = parseInt(dateParts[2], 10);

                // Validate parts
                if (isNaN(year) || isNaN(month) || isNaN(day)) throw new Error('Invalid date components');

                // Create date object representing midnight UTC on the selected day
                const utcDate = new Date(Date.UTC(year, month, day));

                if (isNaN(utcDate.getTime())) { // Check if the constructed date is valid
                    throw new Error('Invalid date constructed');
                }
                updateValue = Timestamp.fromDate(utcDate); // Convert to Firestore Timestamp

            } catch (error) { 
                setUpdateError('Invalid date format provided.'); 
                console.error("Error parsing date input:", value, error); 
                return; // Stop the update process 
            } 
        } 
    } 
    else if (fieldName === 'assigneeId') { updateValue = value === "" ? null : value; }
    try { 
        await onUpdateControl(control.id, { [fieldName]: updateValue });
    } catch (error: any) { 
        setUpdateError(`Failed to update ${fieldName}: ${error.message || 'Unknown error'}`); 
        console.error(`Error updating ${fieldName}:`, error); // Log error for debugging
    }
  };

  const handleSaveExplanation = async () => {
    if (explanationDraft === control.explanation) { setIsEditingExplanation(false); return; }
    setUpdateError(null);
    try { await onUpdateControl(control.id, { explanation: explanationDraft }); setIsEditingExplanation(false); }
    catch (error: any) { setUpdateError("Failed to save explanation."); }
  };

  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setIsConfirmingDelete(true); setUpdateError(null); };

  const handleConfirmDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); setIsDeleting(true); setUpdateError(null);
    try { 
      // Delete ticket first if option is selected and ticket exists
      if (deleteTicketWithControl && control.ticketNumber) {
        try {
          console.log("Deleting ticket along with control:", control.id);
          
          // Call the tickets API to delete the ticket
          const response = await fetch(`/api/tickets?controlId=${control.id}&deleteRemoteTicket=${deleteRemoteTicket}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const responseData = await response.json();
            console.error("Error deleting ticket:", responseData);
            // Continue with control deletion even if ticket deletion fails
          }
        } catch (error) {
          console.error("Exception during ticket deletion:", error);
          // Continue with control deletion even if ticket deletion fails
        }
      }
      
      // Delete the control
      await onDeleteControl(control.id); 
    } 
    catch (error: any) { 
      setUpdateError("Failed to delete control."); 
      setIsDeleting(false); 
      setIsConfirmingDelete(false); 
    }
  };

  const handleCancelDelete = (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setIsConfirmingDelete(false); setIsDeleting(false); setUpdateError(null); };

  const handleSaveTitle = async () => {
    if (titleDraft === control.title) { setIsEditingTitle(false); return; }
    setUpdateError(null);
    try { await onUpdateControl(control.id, { title: titleDraft.trim() }); setIsEditingTitle(false); }
    catch (error: any) { setUpdateError("Failed to save title."); }
  };

  const handleSaveDcfId = async () => {
    if (dcfIdDraft === control.dcfId) { setIsDcfIdEditing(false); return; }
    setUpdateError(null);
    try { await onUpdateControl(control.id, { dcfId: dcfIdDraft.trim() }); setIsDcfIdEditing(false); }
    catch (error: any) { setUpdateError("Failed to save DCF ID."); }
  };

  const handleSaveUrl = async () => {
    if (urlDraft === control.externalUrl) { setIsEditingUrl(false); setShowUrlDialog(false); return; }
    setUpdateError(null);
    try {
      let processedUrl = urlDraft.trim();
      if (processedUrl && !processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) { processedUrl = 'https://' + processedUrl; }
      await onUpdateControl(control.id, { externalUrl: processedUrl || null }); setIsEditingUrl(false); setShowUrlDialog(false);
    } catch (error: any) { setUpdateError("Failed to save external URL."); }
  };
  
  const handleSaveCompany = (newCompany: Company) => { 
    if (!Object.values(Company).includes(newCompany)) { return; }
    setCompanyDraft(newCompany);
    try { onUpdateControl(control.id, { company: newCompany }); } 
    catch (error) { setUpdateError("Failed to save company."); }
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const menuHeight = 290; // Approximate height of the menu
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Calculate if there's enough space below
      const spaceBelow = viewportHeight - rect.bottom;
      const showAbove = spaceBelow < menuHeight;
      
      // Calculate left position (don't let it go off-screen)
      let leftPos = rect.right - 180;
      if (leftPos < 10) leftPos = 10;
      if (leftPos + 180 > viewportWidth) leftPos = viewportWidth - 190;
      
      setMenuPosition({ 
        top: showAbove ? rect.top - menuHeight - 5 : rect.bottom + 5, 
        left: leftPos 
      });
    }
    setMenuOpen(!menuOpen);
  };

  const startEditingExplanation = () => {
    if (detailsRef.current) { detailsRef.current.open = true; }
    setIsEditingExplanation(true);
  };

  // --- New Ticket Handlers ---
  const handleCreateTicket = async () => {
    setIsCreatingTicket(true);
    setUpdateError(null);
    try {
      console.log("Creating ticket for control:", control.id);
      
      // Call the tickets API to create a new ticket
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ controlId: control.id }),
      });

      const responseData = await response.json();
      console.log("Ticket creation response:", responseData);

      if (!response.ok) {
        setUpdateError(`Failed to create ticket: ${responseData.message || 'Unknown error'}`);
        showToast(`Failed to create ticket: ${responseData.message || 'Unknown error'}`, 'error');
        console.error("Error details:", responseData.error);
        setIsCreatingTicket(false);
        return;
      }

      if (!responseData.ticketNumber) {
        setUpdateError("Ticket created but no ticket number returned. See console for details.");
        showToast("Ticket created but no ticket number returned", 'warning');
        console.error("API response missing ticket number:", responseData);
        setIsCreatingTicket(false);
        return;
      }
      
      // Update the local control state with the ticket information
      await onUpdateControl(control.id, {
        ticketNumber: responseData.ticketNumber,
        ticketUrl: responseData.ticketUrl
      });
      
      // Show success toast instead of alert
      showToast(`Ticket #${responseData.ticketNumber} created successfully!`, 'success');
      
      setIsCreatingTicket(false);
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      setUpdateError(`Failed to create ticket: ${errorMessage}`);
      showToast(`Failed to create ticket: ${errorMessage}`, 'error');
      console.error("Exception during ticket creation:", error);
      setIsCreatingTicket(false);
    }
  };

  const handleDeleteTicket = async () => {
    setIsDeletingTicket(true);
    setUpdateError(null);
    try {
      console.log("Deleting ticket for control:", control.id, "Delete remote ticket:", deleteRemoteTicket);
      
      // Call the tickets API to delete the ticket
      const response = await fetch(`/api/tickets?controlId=${control.id}&deleteRemoteTicket=${deleteRemoteTicket}`, {
        method: 'DELETE',
      });

      const responseData = await response.json();
      console.log("Ticket deletion response:", responseData);

      if (!response.ok) {
        setUpdateError(`Failed to delete ticket: ${responseData.message || 'Unknown error'}`);
        showToast(`Failed to delete ticket: ${responseData.message || 'Unknown error'}`, 'error');
        console.error("Error details:", responseData.error);
        setIsDeletingTicket(false);
        setShowTicketDeleteDialog(false);
        return;
      }

      const ticketNumber = control.ticketNumber; // Store for the toast message

      // Update the local control state to remove ticket information
      await onUpdateControl(control.id, {
        ticketNumber: null,
        ticketUrl: null
      });
      
      setIsDeletingTicket(false);
      setShowTicketDeleteDialog(false);
      
      // Show toast notification instead of alert
      if (responseData.ticketDeleted) {
        showToast(`Ticket #${ticketNumber} was deleted successfully.`, 'success');
      } else {
        showToast(`Ticket reference was removed from the control.`, 'info');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      setUpdateError(`Failed to delete ticket: ${errorMessage}`);
      showToast(`Failed to delete ticket: ${errorMessage}`, 'error');
      console.error("Exception during ticket deletion:", error);
      setIsDeletingTicket(false);
      setShowTicketDeleteDialog(false);
    }
  };

  // New function to ask AI for an explanation
  const askAIForExplanation = async () => {
    setIsLoadingAIExplanation(true);
    setAIExplanation(null);
    
    try {
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `This is related to ISO 27001 version 2022 controls. The title is "${control.title}". Please provide a concise explanation of what this control is about and why it's important for information security.`
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI explanation');
      }

      // The response is a stream, so we need to read it as it comes in
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let explanation = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Parse the Vercel AI SDK data stream format
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('0:"')) {
            try {
              // Extract the JSON string content (strip prefix and quotes) and parse
              const jsonString = line.substring(2);
              const parsedText = JSON.parse(jsonString); 
              explanation += parsedText;
            } catch (e) {
              console.warn("Failed to parse AI explanation stream chunk:", line, e);
              // Optionally, add a fallback or just ignore malformed chunks
            }
          }
          // Ignore other potential data stream message types (e.g., 1: function_call)
        }
      }

      setAIExplanation(explanation);
    } catch (error) {
      console.error('Error getting AI explanation:', error);
      showToast('Failed to get AI explanation', 'error');
    } finally {
      setIsLoadingAIExplanation(false);
    }
  };

  // New function to ask AI for compliance evidence insights
  const askAIForInsight = async () => {
    setIsLoadingAIInsight(true);
    setAIInsight(null);
    setShowInsightDialog(true);
    
    try {
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `I need to submit evidence for the following control for the ISO 27001 version 2022 certification
the control name is: ${control.title}${control.explanation ? `\nDescription: ${control.explanation}` : ''}

we use office 365 and have microsoft 365 e5 licenses with perview for users. we also have an on-prem active directory with a hybrid setup with Entra ID with a sync. We use Intune and have servers on-prem and in the Azure cloud. we also have file servers on-prem and sharepoint online.

please tell me what evidence do i need to provide to satisfy this control.`
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI insight');
      }

      // The response is a stream, so we need to read it as it comes in
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let insight = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Parse the Vercel AI SDK data stream format
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('0:"')) {
            try {
              // Extract the JSON string content (strip prefix and quotes) and parse
              const jsonString = line.substring(2);
              const parsedText = JSON.parse(jsonString); 
              insight += parsedText;
            } catch (e) {
              console.warn("Failed to parse AI insight stream chunk:", line, e);
              // Optionally, add a fallback or just ignore malformed chunks
            }
          }
          // Ignore other potential data stream message types (e.g., 1: function_call)
        }
      }

      setAIInsight(insight);
    } catch (error) {
      console.error('Error getting AI insight:', error);
      showToast('Failed to get ISO evidence insight', 'error');
    } finally {
      setIsLoadingAIInsight(false);
    }
  };

  // --- Render Functions ---
  const renderDeleteConfirmationModal = () => ( 
      <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Control</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Are you sure you want to delete control DCF-{control.dcfId}: &quot;{control.title}&quot;?</p>
              
              {control.ticketNumber && (
                <div className="mb-4">
                  <label className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={deleteTicketWithControl} 
                      onChange={(e) => setDeleteTicketWithControl(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Also delete associated ticket #{control.ticketNumber}
                    </span>
                  </label>
                  
                  {deleteTicketWithControl && (
                    <label className="flex items-center mt-2 ml-6">
                      <input 
                        type="checkbox" 
                        checked={deleteRemoteTicket} 
                        onChange={(e) => setDeleteRemoteTicket(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-gray-600 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Delete ticket from FreshService
                      </span>
                    </label>
                  )}
                </div>
              )}
              
              <div className="flex justify-end gap-2">
                  <button onClick={handleCancelDelete} className="px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:ring-offset-gray-800" disabled={isDeleting}>Cancel</button>
                  <button onClick={handleConfirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 dark:hover:bg-red-500 flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:ring-offset-gray-800" disabled={isDeleting}> {isDeleting ? <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Deleting...</> : <> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Delete</> }</button>
              </div>
          </div>
      </div>
  );

  const renderTicketSection = () => {
    if (control.ticketNumber && control.ticketUrl) {
      return (
        <div className="flex items-center gap-2 mt-2">
          <a 
            href={control.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
            #{control.ticketNumber}
          </a>
          <button
            onClick={() => setShowTicketDeleteDialog(true)}
            className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 flex items-center"
            title="Delete ticket"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleCreateTicket}
          disabled={isCreatingTicket}
          className="text-sm bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/30 px-3 py-1 rounded-md flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 disabled:opacity-50"
        >
          {isCreatingTicket ? (
            <>
              <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-indigo-700 dark:text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating ticket...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Support Ticket
            </>
          )}
        </button>
      </div>
    );
  };

  // Properly restored renderCompanyBadge function
  const renderCompanyBadge = (isCompact: boolean = false) => {
    const styles = companyStyles; 
    const sizeClass = isCompact ? "w-3.5 h-3.5" : "w-4 h-4";
    const imgSize = isCompact ? 9 : 16;
    const imgSizeSmall = isCompact ? 7 : 9;
    
    if (isEditingCompany && !isCompact) {
      return (
          <div className="flex items-center space-x-1">
          <select 
            value={companyDraft} 
            onChange={(e) => setCompanyDraft(e.target.value as Company)} 
            className="block rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-xs py-0.5 px-1 [color-scheme:dark]" 
            onClick={(e) => e.stopPropagation()}
          >
            {Object.values(Company).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
              </select>
          <button 
            onClick={(e) => { e.stopPropagation(); handleSaveCompany(companyDraft); setIsEditingCompany(false); }} 
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-xs"
          > 
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg> 
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsEditingCompany(false); setCompanyDraft(currentCompany); }} 
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
          > 
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg> 
          </button>
          </div>
      );
    }
    
    return (
      <div 
        className={`flex items-center ${isCompact ? 'gap-0.5' : 'px-2 py-0.5 gap-1'} rounded-full ${styles.bgColor} ${styles.textColor} ${styles.borderColor} ${styles.darkBgColor} ${styles.darkTextColor} ${styles.darkBorderColor} border text-xs ${!isCompact ? 'cursor-pointer' : ''}`}
           onClick={(e) => { if (!isCompact) { e.stopPropagation(); setIsEditingCompany(true); } }}
           title={isCompact ? `Company: ${currentCompany}` : "Click to change company"}
      >
        {currentCompany === Company.BGC && (
          <>
            <div className={`${sizeClass} flex items-center justify-center`}>
              <Image src="/logos/bgc-logo.png" alt="BGC" width={imgSize} height={imgSize} className="object-contain"/>
            </div> 
            {!isCompact && <span>BGC</span>}
          </>
        )}
        
        {currentCompany === Company.Cambio && (
          <>
            <div className={`${sizeClass} flex items-center justify-center`}>
              <Image src="/logos/cambio-logo.png" alt="Cambio" width={imgSize} height={imgSize} className="object-contain"/>
            </div> 
            {!isCompact && <span>Cambio</span>}
          </>
        )}
        
        {currentCompany === Company.Both && (
          <>
            <div className={`${sizeClass} relative overflow-hidden flex items-center justify-center`}>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`w-full h-1/2 flex items-center justify-center ${isCompact ? 'pt-0.5' : 'pt-0.5'} pb-0.5`}>
                  <Image src="/logos/bgc-logo.png" alt="BGC" width={imgSizeSmall} height={imgSizeSmall} className="object-contain"/>
                </div>
                <div className="h-0.5"></div>
                <div className={`w-full h-1/2 flex items-center justify-center ${isCompact ? 'pb-0.5' : 'pb-0.5'} pt-0.5`}>
                  <Image src="/logos/cambio-logo.png" alt="Cambio" width={imgSizeSmall} height={imgSizeSmall} className="object-contain"/>
                </div>
              </div>
            </div> 
            {!isCompact && <span>Both</span>}
          </>
        )}
      </div>
    );
  };

  // Render the ticket delete confirmation dialog
  const renderTicketDeleteDialog = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Delete Ticket</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Are you sure you want to delete ticket #{control.ticketNumber} from this control?
        </p>
        
        <div className="mb-4">
          <label className="flex items-center">
            <input 
              type="checkbox" 
              checked={deleteRemoteTicket} 
              onChange={(e) => setDeleteRemoteTicket(e.target.checked)}
              className="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Also delete the ticket from FreshService
            </span>
          </label>
        </div>
        
        <div className="flex justify-end gap-2">
          <button 
            onClick={() => setShowTicketDeleteDialog(false)} 
            className="px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:ring-offset-gray-800" 
            disabled={isDeletingTicket}
          >
            Cancel
          </button>
          <button 
            onClick={handleDeleteTicket} 
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 dark:hover:bg-red-500 flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:ring-offset-gray-800" 
            disabled={isDeletingTicket}
          >
            {isDeletingTicket ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Ticket
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Render insight dialog
  const renderInsightDialog = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">ISO 27001 Evidence Requirements</h3>
          <div className="flex items-center">
            {isLoadingAIInsight && (
              <div className="flex items-center mr-2 text-sm text-purple-700 dark:text-purple-300">
                <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </div>
            )}
            <button 
              onClick={() => setShowInsightDialog(false)} 
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto mb-4 flex-grow">
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
            <h4 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Control: {control.title}</h4>
            {control.explanation && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{control.explanation}</p>
            )}
          </div>
          
          {aiInsight ? (
            <div className="mt-4 p-4 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700">
              <h4 className="text-sm font-semibold mb-2 text-purple-800 dark:text-purple-300 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Required Evidence
              </h4>
              <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{aiInsight.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              {!isLoadingAIInsight && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <p>Ask AI for evidence requirements for this control.</p>
                  <button
                    onClick={askAIForInsight}
                    className="mt-2 px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                  >
                    Generate Evidence Requirements
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 mt-auto flex-shrink-0">
          <button 
            onClick={() => setShowInsightDialog(false)} 
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Function to render the company dropdown - reduce gap between logos
  const renderCompanyDropdown = () => {
    const getCompanyBgColor = (company: Company) => {
      switch (company) {
        // Use slightly stronger base colors for non-selected states
        case Company.BGC: return currentCompany === Company.BGC ? 'bg-blue-100 dark:bg-blue-800/60' : 'bg-blue-100/80 dark:bg-blue-900/50';
        case Company.Cambio: return currentCompany === Company.Cambio ? 'bg-emerald-100 dark:bg-emerald-800/60' : 'bg-emerald-100/80 dark:bg-emerald-900/50';
        case Company.Both: return currentCompany === Company.Both ? 'bg-purple-100 dark:bg-cyan-800/60' : 'bg-purple-100/80 dark:bg-cyan-900/50';
        default: return 'bg-white dark:bg-gray-700';
      }
    };

    return (
      <div className="relative" ref={companyDropdownRef}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
            // Increase size: w-20 -> w-24, h-8 -> h-9
            className={`relative rounded-full w-24 h-9 flex items-center justify-center border border-gray-300 dark:border-gray-600 ${getCompanyBgColor(currentCompany)} hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors`}
            title="Select company"
          >
            {currentCompany === Company.BGC && (
              <Image src="/logos/bgc-logo.png" alt="BGC Logo" width={32} height={28} className="object-contain" />
            )}
            {currentCompany === Company.Cambio && (
              <Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={32} height={28} className="object-contain" />
            )}
            {currentCompany === Company.Both && (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <div className="w-12 h-2.5 flex items-center justify-center">
                  <Image src="/logos/bgc-logo.png" alt="BGC Logo" width={28} height={14} className="object-contain" />
                </div>
                <div className="h-1.5"></div>
                <div className="w-12 h-2.5 flex items-center justify-center">
                  <Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={28} height={14} className="object-contain" />
                </div>
              </div>
            )}
            {/* Adjust arrow position slightly for new size: right-1.5 bottom-0.5 */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 dark:text-gray-400 absolute right-1.5 bottom-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {companyDropdownOpen && (
          <div className="absolute z-10 bottom-full mb-1 w-40 rounded-md shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 py-1">
            <button
              type="button"
              onClick={() => { handleSaveCompany(Company.BGC); setCompanyDropdownOpen(false); }}
              className={`flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${currentCompany === Company.BGC ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}
            >
              <div className={`relative rounded-full w-12 h-6 flex items-center justify-center ${getCompanyBgColor(Company.BGC)} border border-gray-300 dark:border-gray-600`}>
                <Image src="/logos/bgc-logo.png" alt="BGC Logo" width={24} height={20} className="object-contain" />
              </div>
              <span>BGC</span>
            </button>
            <button
              type="button"
              onClick={() => { handleSaveCompany(Company.Cambio); setCompanyDropdownOpen(false); }}
              className={`flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${currentCompany === Company.Cambio ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-300'}`}
            >
              <div className={`relative rounded-full w-12 h-6 flex items-center justify-center ${getCompanyBgColor(Company.Cambio)} border border-gray-300 dark:border-gray-600`}>
                <Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={24} height={20} className="object-contain" />
              </div>
              <span>Cambio</span>
            </button>
            <button
              type="button"
              onClick={() => { handleSaveCompany(Company.Both); setCompanyDropdownOpen(false); }}
              className={`flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${currentCompany === Company.Both ? 'bg-purple-50 dark:bg-cyan-900/20 text-purple-700 dark:text-cyan-300' : 'text-gray-700 dark:text-gray-300'}`}
            >
              <div className={`relative rounded-full w-12 h-6 flex items-center justify-center overflow-hidden ${getCompanyBgColor(Company.Both)} border border-gray-300 dark:border-gray-600`}>
                <div className="flex flex-col items-center justify-center w-full h-full">
                  <div className="w-10 h-2 flex items-center justify-center">
                    <Image src="/logos/bgc-logo.png" alt="BGC Logo" width={20} height={10} className="object-contain" />
                  </div>
                  <div className="h-1.5"></div>
                  <div className="w-10 h-2 flex items-center justify-center">
                    <Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={20} height={10} className="object-contain" />
                  </div>
                </div>
              </div>
              <span>Both</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Compact View
  if (viewDensity === 'compact') {
    return (
      <>
        <div className={`rounded-lg shadow-sm hover:shadow-md mb-1.5 overflow-hidden transition-all duration-200 ${statusStyles.background} ${statusStyles.darkBackground}`}>
          <div className="flex items-center justify-between p-2 gap-1.5">
            <div className="flex items-center min-w-0 flex-grow">
              <span className={`h-2 w-2 rounded-full mr-1.5 flex-shrink-0 ${
                  control.status === ControlStatus.Complete ? 'bg-emerald-500 dark:bg-emerald-400' : 
                  control.status === ControlStatus.InProgress ? 'bg-indigo-500 dark:bg-indigo-400' : 
                  control.status === ControlStatus.InReview ? 'bg-amber-500 dark:bg-amber-400' : 'bg-gray-500 dark:bg-gray-400'
              }`} />
              <span className="text-xs font-mono bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1 py-0.5 rounded-sm mr-1 flex-shrink-0">DCF-{control.dcfId}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowInsightDialog(true); if (!aiInsight) askAIForInsight(); }}
                  className="inline-flex ml-1 text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                  title="Get evidence requirements"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                </button>
              </span>
              <span className="font-medium text-xs truncate text-gray-900 dark:text-gray-100">{control.title}</span>
              {isHighPriority && <span className="ml-1 text-red-500 dark:text-red-400" title={`${control.priorityLevel} Priority`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg></span>}
              <div className="flex items-center gap-0.5 ml-1">
                {control.ticketNumber ? (
                  <a href={control.ticketUrl || "#"} target="_blank" rel="noopener noreferrer" className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300" onClick={(e) => e.stopPropagation()} title={`Ticket #${control.ticketNumber}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM6 13.25V3.5h8v9.75a.75.75 0 01-1.5 0V6.25a.75.75 0 00-.75-.75h-5.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                    </svg>
                  </a>
                ) : control.externalUrl ? (
                  <a href={control.externalUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400" onClick={(e) => e.stopPropagation()} title="Open Link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" /></svg></a>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleCreateTicket(); }} 
                    disabled={isCreatingTicket}
                    className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300" 
                    title="Create Support Ticket"
                  >
                    {isCreatingTicket ? (
                      <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM6 13.25V3.5h8v9.75a.75.75 0 01-1.5 0V6.25a.75.75 0 00-.75-.75h-5.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
              {renderCompanyBadge(true)}
              {control.priorityLevel && <span className={`rounded-full h-1.5 w-1.5 flex-shrink-0 ${
                  control.priorityLevel === PriorityLevel.Critical ? 'bg-red-500 dark:bg-red-400' : 
                  control.priorityLevel === PriorityLevel.High ? 'bg-orange-500 dark:bg-orange-400' : 
                  control.priorityLevel === PriorityLevel.Medium ? 'bg-yellow-500 dark:bg-yellow-400' : 
                  'bg-gray-400 dark:bg-gray-500' 
              }`} title={`${control.priorityLevel} Priority`} />} 
              {control.estimatedCompletionDate && <div className={`flex items-center gap-0.5 ${timeRemaining.overdue ? 'text-red-600 dark:text-red-400' : timeRemaining.urgent ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`} title={timeRemaining.text}> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M8 4.75a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z" /><path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-1.5A5.5 5.5 0 1 0 8 2.5a5.5 5.5 0 0 0 0 11Z" clipRule="evenodd" /></svg> <span className="tabular-nums">{timeRemaining.overdue ? `-${timeRemaining.days}d` : timeRemaining.days > 0 ? `${timeRemaining.days}d` : timeRemaining.text === 'Completed' ? 'Done' : 'Today'}</span></div>}
              {control.assigneeId && <span className="text-gray-500 dark:text-gray-400" title={`Assignee: ${assigneeName}`}>{assigneeName.split(' ').map(n=>n[0]).join('')}</span>}
            </div>
          </div>
        </div>
        {isConfirmingDelete && renderDeleteConfirmationModal()}
        {showTicketDeleteDialog && renderTicketDeleteDialog()}
        {showInsightDialog && renderInsightDialog()}
      </>
    );
  }

  // Medium View
  if (viewDensity === 'medium') {
    return (
      <>
        <div className={`rounded-lg shadow-sm hover:shadow-md mb-2 overflow-hidden transition-all duration-200 ${statusStyles.background} ${statusStyles.darkBackground}`}>
          <div className="p-3">
            <div className="flex justify-between items-start mb-2">
              {/* Left side: Title, DCF ID, Priority */}
            <div className="flex items-center gap-2 min-w-0 flex-grow">
              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                  control.status === ControlStatus.Complete ? 'bg-emerald-500 dark:bg-emerald-400' : 
                  control.status === ControlStatus.InProgress ? 'bg-indigo-500 dark:bg-indigo-400' : 
                  control.status === ControlStatus.InReview ? 'bg-amber-500 dark:bg-amber-400' : 'bg-gray-500 dark:bg-gray-400'
              }`} title={control.status} />
              <div className="flex flex-wrap gap-1.5">
                 
                {timeRemaining.text && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${timeRemaining.overdue ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : timeRemaining.urgent ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'}`}> <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {timeRemaining.text}</span>}
                {control.priorityLevel && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ 
                    control.priorityLevel === PriorityLevel.Critical ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : 
                    control.priorityLevel === PriorityLevel.High ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' : 
                    control.priorityLevel === PriorityLevel.Medium ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300' : 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300'
                 }`}> <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> {control.priorityLevel}</span>}
              </div>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-shrink-0 flex items-center gap-1"> <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> {assigneeName}</span>
          </div>
            <div className="flex justify-between items-start">
              <div className="flex-grow min-w-0">
                <div className="flex items-center mb-0.5">
                  <span className="text-xs font-mono bg-black/10 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded-sm mr-1.5 flex-shrink-0">DCF-{control.dcfId}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowInsightDialog(true); if (!aiInsight) askAIForInsight(); }}
                      className="inline-flex ml-1 text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                      title="Get evidence requirements"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                      </svg>
                    </button>
                  </span>
                  <h4 className={`text-sm font-semibold truncate ${statusStyles.color} ${statusStyles.darkColor}`}>{control.title}</h4>
                  {isHighPriority && <span className="ml-1 text-red-500 dark:text-red-400" title={`${control.priorityLevel} Priority`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg></span>}
                </div>
                <div className="flex items-center">
                  {control.ticketNumber ? (
                    <div className="flex items-center gap-2">
                      <a 
                        href={control.ticketUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-md"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                        </svg>
                        #{control.ticketNumber}
                      </a>
                      <button
                        onClick={() => setShowTicketDeleteDialog(true)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-0.5"
                        title="Delete ticket"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
              </div>
                  ) : (
                    <button
                      onClick={handleCreateTicket}
                      disabled={isCreatingTicket}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center"
                      title="Create Support Ticket"
                    >
                      {isCreatingTicket ? (
                        <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                        </svg>
                      )}
                      <span className="text-xs">Create Ticket</span>
                    </button>
                  )}
                </div>
              </div>
              <button onClick={handleDeleteClick} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md flex-shrink-0" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        {isConfirmingDelete && renderDeleteConfirmationModal()}
        {showTicketDeleteDialog && renderTicketDeleteDialog()}
        {showInsightDialog && renderInsightDialog()}
      </>
    );
  }

  // Full View (default)
  return (
    <>
      <div className={`rounded-lg shadow-sm hover:shadow-md mb-3 overflow-hidden transition-all duration-200 ${statusStyles.background} ${statusStyles.darkBackground}`}>
        {/* Top header */} 
        <div className={`flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50 px-4 py-2`}>
          <div className="flex items-center space-x-3">
            {isDcfIdEditing ? (
              <input type="text" value={dcfIdDraft} onChange={(e) => setDcfIdDraft(e.target.value)} className="text-xs font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 mr-1.5 w-16 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-700 dark:text-gray-300" autoFocus onBlur={handleSaveDcfId} onKeyDown={(e) => e.key === 'Enter' && handleSaveDcfId()} />
            ) : (
              <span className="text-xs font-mono bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1 py-0.5 rounded-sm flex-shrink-0 cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 flex items-center gap-1" onClick={() => setIsDcfIdEditing(true)} title="Click to edit DCF ID">
                DCF-{control.dcfId}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowInsightDialog(true); if (!aiInsight) askAIForInsight(); }}
                  className="text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                  title="Get evidence requirements"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                </button>
              </span>
            )}
            <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-sm border border-gray-200 dark:border-gray-600">
               <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
               <span className="text-xs text-gray-700 dark:text-gray-300">{assigneeName}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setShowExplanationDialog(true)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-gray-600"> <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>Info</span></button>
            <div className="relative" ref={menuRef}>
              <button ref={menuButtonRef} onClick={toggleMenu} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded-md"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" /></svg> </button>
              {menuOpen && (
                <div 
                  className="fixed bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 border border-gray-200 dark:border-gray-700 py-1 w-44" 
                  style={{ 
                    top: `${menuPosition.top}px`, 
                    left: `${menuPosition.left}px`, 
                    maxHeight: '80vh',
                    overflowY: 'auto'
                  }}
                >
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setIsEditingTitle(true); }}>Edit Title</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setIsDcfIdEditing(true); }}>Edit DCF ID</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowStatusDialog(true); }}>Update Status</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowAssigneeDialog(true); }}>Change Assignee</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowDateDialog(true); }}>Set Date</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowUrlDialog(true); }}>{control.externalUrl ? 'Edit Link' : 'Add Link'}</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowExplanationDialog(true); }}>View Explanation</button>
                  {control.ticketNumber && (
                    <button className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center" onClick={() => { setMenuOpen(false); setShowTicketDeleteDialog(true); }} disabled={isDeletingTicket}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Ticket
                    </button>
                  )}
                  <button className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center" onClick={handleDeleteClick} disabled={isDeleting}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Title Section */} 
        <div className={`px-3 py-2 border-b ${statusStyles.border} ${statusStyles.darkBorder} border-opacity-20 dark:border-opacity-50`}>
          <div className="flex items-center justify-between">
            {isEditingTitle ? (
              <input type="text" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" autoFocus onBlur={handleSaveTitle} onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()} />
            ) : (
              <>
                <h4 className={`text-sm font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors ${statusStyles.color} ${statusStyles.darkColor} flex-grow text-gray-900 dark:text-gray-100`} onClick={() => setIsEditingTitle(true)} title="Click to edit title">
                  {control.title}
                  {isHighPriority && <span className="inline-block ml-1.5 text-red-500 dark:text-red-400" title={`${control.priorityLevel} Priority`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg></span>}
                </h4>
                {control.ticketNumber ? (
                  <a 
                    href={control.ticketUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-green-300 dark:border-green-700/60 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors flex items-center gap-1.5 shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                    title="Open Support Ticket"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                    </svg>
                    <span className="text-xs font-bold">#{control.ticketNumber}</span>
                  </a>
                ) : control.externalUrl ? (
                  <a href={control.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400" onClick={(e) => e.stopPropagation()} title="Open Link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.75 2.25H21a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V4.81L8.03 17.03a.75.75 0 01-1.06-1.06L19.19 3.75h-3.44a.75.75 0 010-1.5z" clipRule="evenodd" /><path fillRule="evenodd" d="M5.25 6.75a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3H5.25a3 3 0 01-3-3V8.25a3 3 0 013-3H9a.75.75 0 010 1.5H5.25z" clipRule="evenodd" /></svg> <span className="text-xs">Details</span></a>
                ) : (
                  <button
                    onClick={handleCreateTicket}
                    disabled={isCreatingTicket}
                    className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors p-1"
                    title="Create Support Ticket"
                  >
                    {isCreatingTicket ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                      </svg>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {/* Info Badges & Status Row */} 
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/20">
          <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-gray-600">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                control.status === ControlStatus.Complete ? 'bg-emerald-500 dark:bg-emerald-400' : 
                control.status === ControlStatus.InProgress ? 'bg-indigo-500 dark:bg-indigo-400' : 
                control.status === ControlStatus.InReview ? 'bg-amber-500 dark:bg-amber-400' : 'bg-gray-500 dark:bg-gray-400'
            }`} title={control.status}></span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{control.status}</span>
          </div>
          
          {timeRemaining.text && control.status !== ControlStatus.Complete && <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-gray-600 bg-white dark:bg-gray-700 ${timeRemaining.overdue ? 'text-red-700 dark:text-red-300' : timeRemaining.urgent ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}> <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span className="text-xs">{timeRemaining.text}</span></div>}
        </div>
        {/* Progress bar */}
        {control.progress !== undefined && control.progress > 0 && <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden"><div className={`h-full rounded-full ${ 
          control.progress >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : 
          control.progress >= 75 ? 'bg-indigo-500 dark:bg-indigo-400' : 
          control.progress >= 50 ? 'bg-amber-500 dark:bg-amber-400' : 
          control.progress >= 25 ? 'bg-orange-500 dark:bg-orange-400' : 'bg-red-500 dark:bg-red-400'
         }`} style={{ width: `${control.progress}%` }} /></div>}
        {/* Main Content Section (Company Selection Buttons) */}
        <div className="p-2 grid gap-2">
          {/* Company Selector Dropdown & Due Date */}
          <div className="flex items-center justify-between">
            {/* Company Selector Dropdown */}
            {renderCompanyDropdown()}
            
            {/* Due Date Display */}
            {(control.estimatedCompletionDate !== undefined && control.estimatedCompletionDate !== null) && (
              <div className="flex items-center gap-2">
                <div 
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full shadow-sm cursor-pointer ${
                    control.status === ControlStatus.Complete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700/50' : 
                    timeRemaining.overdue ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/50' : 
                    timeRemaining.urgent ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/50' : 
                    'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => setShowDateDialog(true)}
                  title="Click to change date"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs font-medium">
                    {formatDateForInput(control.estimatedCompletionDate).replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3/$1') || 'Set Date'}
                  </span>
            </div>
              </div>
            )}
          </div>
        </div>
        {updateError && <p className="text-red-600 dark:text-red-400 text-xs p-2 text-center bg-red-50 dark:bg-red-900/30 border-t border-red-200 dark:border-red-500/50">{updateError}</p>}
      </div>
      {isConfirmingDelete && renderDeleteConfirmationModal()}
      {showStatusDialog && ( 
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-xs w-full mx-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Change Status</h3>
                  <select value={control.status} onChange={(e) => { handleFieldUpdate('status', e.target.value as ControlStatus); setShowStatusDialog(false); }} className="block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:focus:ring-indigo-600 focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-200">
                      {Object.values(ControlStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => setShowStatusDialog(false)} className="mt-4 px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">Cancel</button>
              </div>
          </div>
      )} 
      {showAssigneeDialog && ( 
           <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-xs w-full mx-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Change Assignee</h3>
                  <select value={control.assigneeId || ""} onChange={(e) => { handleFieldUpdate('assigneeId', e.target.value); setShowAssigneeDialog(false); }} className="block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:focus:ring-indigo-600 focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-200">
                      <option value="">Unassigned</option>
                      {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                  </select>
                  <button onClick={() => setShowAssigneeDialog(false)} className="mt-4 px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">Cancel</button>
              </div>
          </div>
      )} 
      {showDateDialog && ( 
           <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-xs w-full mx-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Change Due Date</h3>
                  <input 
                      type="date" 
                      value={formatDateForInput(control.estimatedCompletionDate)} 
                      onChange={(e) => { 
                          const value = e.target.value || null;
                          handleFieldUpdate('estimatedCompletionDate', value); 
                          setShowDateDialog(false); 
                      }} 
                      className="block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:focus:ring-indigo-600 focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-200" 
                  />
                  <div className="flex justify-between mt-4">
                      {control.estimatedCompletionDate && (
                          <button 
                              onClick={() => { 
                                  handleFieldUpdate('estimatedCompletionDate', null); 
                                  setShowDateDialog(false); 
                              }} 
                              className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          >
                              Clear Date
                          </button>
                      )}
                      <button 
                          onClick={() => setShowDateDialog(false)} 
                          className="px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )} 
      {showUrlDialog && ( 
           <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{control.externalUrl ? 'Edit External Link' : 'Add External Link'}</h3>
                  <input type="text" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://example.com/ticket/123" className="block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:focus:ring-indigo-600 focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500" />
                  <div className="flex justify-end gap-2 mt-4">
                      <button onClick={() => { setShowUrlDialog(false); setUrlDraft(control.externalUrl || ''); }} className="px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">Cancel</button>
                      <button onClick={handleSaveUrl} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600">Save Link</button>
                  </div>
              </div>
          </div>
      )} 
      {showExplanationDialog && ( 
           <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Explanation</h3>
              <button 
                onClick={askAIForExplanation} 
                disabled={isLoadingAIExplanation}
                className="flex items-center text-sm px-3 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:ring-offset-1 dark:focus:ring-offset-gray-800 disabled:opacity-50"
              >
                {isLoadingAIExplanation ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Ask AI
                  </>
                )}
              </button>
            </div>
                  <div className="overflow-y-auto mb-4 flex-grow">
              {aiExplanation ? (
                <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-md">
                  <h4 className="text-sm font-semibold mb-2 text-purple-800 dark:text-purple-300 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI Explanation
                  </h4>
                  {/* Use ReactMarkdown to render the explanation, replacing multiple newlines with single newlines */}
                  <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{aiExplanation.replace(/\n{2,}/g, '\n')}</ReactMarkdown>
                  </div>
                </div>
              ) : null}
              
              <div>
                <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Manual Explanation</h4>
                      {isEditingExplanation ? (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700">
                    <ReactQuill
                      value={explanationDraft || ''}
                      onChange={setExplanationDraft}
                      theme="snow"
                      className="text-gray-900 dark:text-gray-100"
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['link'],
                          ['clean']
                        ]
                      }}
                      formats={['bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link']}
                      placeholder="Add a detailed explanation of this control..."
                    />
                  </div>
                ) : (
                  <div 
                    className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: control.explanation || '<span class="italic text-gray-400 dark:text-gray-500">No explanation provided.</span>' }}
                  />
                )}
              </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-auto flex-shrink-0">
                      {isEditingExplanation ? (
                          <>
                              <button onClick={() => { setIsEditingExplanation(false); setExplanationDraft(control.explanation); }} className="px-3 py-1.5 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">Cancel</button>
                              <button onClick={handleSaveExplanation} className="px-3 py-1.5 text-sm text-white bg-indigo-600 dark:bg-indigo-500 rounded hover:bg-indigo-700 dark:hover:bg-indigo-600">Save</button>
                          </>
                      ) : (
                          <>
                              <button onClick={() => setIsEditingExplanation(true)} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm flex items-center mr-auto"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                              <button onClick={() => setShowExplanationDialog(false)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-500 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600">Close</button>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )} 
      {showTicketDeleteDialog && renderTicketDeleteDialog()}
      {showInsightDialog && renderInsightDialog()}
    </>
  );
} 
