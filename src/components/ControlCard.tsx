"use client";

import React, { useState, ChangeEvent, FocusEvent, useEffect } from 'react';
import { Control, ControlStatus, Technician, ViewDensity, PriorityLevel, Company } from '@/lib/types'; // Add Company to imports
import { Timestamp } from 'firebase/firestore';
import Image from 'next/image';

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
    const date = timestamp.toDate();
    if (isNaN(date.getTime())) { return ''; }
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) { return ''; }
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffTime = date.getTime() - today.getTime();
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

  // --- Handlers --- 
  const handleFieldUpdate = async (fieldName: keyof Control, value: any) => {
    setUpdateError(null);
    let updateValue = value;
    if (fieldName === 'estimatedCompletionDate') {
        if (!value || value === '') { updateValue = null; }
        else { try { const rawDate = new Date(value); if (isNaN(rawDate.getTime())) { throw new Error(); } updateValue = value; } catch (error) { setUpdateError('Invalid date format.'); return; } }
    } 
    else if (fieldName === 'assigneeId') { updateValue = value === "" ? null : value; }
    try { await onUpdateControl(control.id, { [fieldName]: updateValue });
    } catch (error: any) { setUpdateError(`Failed to update ${fieldName}: ${error.message || 'Unknown error'}`); }
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
    try { await onDeleteControl(control.id); } 
    catch (error: any) { setUpdateError("Failed to delete control."); setIsDeleting(false); setIsConfirmingDelete(false); }
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
      setMenuPosition({ top: rect.bottom + 5, left: rect.right - 180 }); // Adjust positioning as needed
    }
    setMenuOpen(!menuOpen);
  };

  const startEditingExplanation = () => {
    if (detailsRef.current) { detailsRef.current.open = true; }
    setIsEditingExplanation(true);
  };

  // --- Render Functions ---
  const renderDeleteConfirmationModal = () => ( 
      <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Control</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Are you sure you want to delete control DCF-{control.dcfId}: "{control.title}"?</p>
              <div className="flex justify-end gap-2">
                  <button onClick={handleCancelDelete} className="px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:ring-offset-gray-800" disabled={isDeleting}>Cancel</button>
                  <button onClick={handleConfirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 dark:hover:bg-red-500 flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:ring-offset-gray-800" disabled={isDeleting}> {isDeleting ? <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Deleting...</> : <> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Delete</> }</button>
              </div>
          </div>
      </div>
  );

  const renderCompanyBadge = (isCompact: boolean = false) => {
    const styles = companyStyles; 
    const sizeClass = isCompact ? "w-3.5 h-3.5" : "w-4 h-4";
    const imgSize = isCompact ? 9 : 16;
    const imgSizeSmall = isCompact ? 7 : 9;
    if (isEditingCompany && !isCompact) {
      return (
          <div className="flex items-center space-x-1">
              <select value={companyDraft} onChange={(e) => setCompanyDraft(e.target.value as Company)} className={`block rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-xs py-0.5 px-1 [color-scheme:dark]`} onClick={(e) => e.stopPropagation()}>
                  {Object.values(Company).map(v => (<option key={v} value={v}>{v}</option>))}
              </select>
              <button onClick={(e) => { e.stopPropagation(); handleSaveCompany(companyDraft); setIsEditingCompany(false); }} className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-xs"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> </button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingCompany(false); setCompanyDraft(currentCompany); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xs"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg> </button>
          </div>
      );
    }
    return (
      <div className={`flex items-center ${isCompact ? 'gap-0.5' : 'px-2 py-0.5 gap-1'} rounded-full ${styles.bgColor} ${styles.textColor} ${styles.borderColor} ${styles.darkBgColor} ${styles.darkTextColor} ${styles.darkBorderColor} border text-xs ${!isCompact ? 'cursor-pointer' : ''}`}
           onClick={(e) => { if (!isCompact) { e.stopPropagation(); setIsEditingCompany(true); } }}
           title={isCompact ? `Company: ${currentCompany}` : "Click to change company"}
      >
          {currentCompany === Company.BGC && (<> <div className={`${sizeClass} flex items-center justify-center`}><Image src="/logos/bgc-logo.png" alt="BGC" width={imgSize} height={imgSize} className="object-contain"/></div> {!isCompact && <span>BGC</span>} </>)}
          {currentCompany === Company.Cambio && (<> <div className={`${sizeClass} flex items-center justify-center`}><Image src="/logos/cambio-logo.png" alt="Cambio" width={imgSize} height={imgSize} className="object-contain"/></div> {!isCompact && <span>Cambio</span>} </>)}
          {currentCompany === Company.Both && (<> <div className={`${sizeClass} relative overflow-hidden flex items-center justify-center`}><div className="absolute inset-0 flex flex-col items-center justify-center"><div className={`w-full h-1/2 flex items-center justify-center ${isCompact ? 'pt-0.5' : 'pt-1' }`}><Image src="/logos/bgc-logo.png" alt="BGC" width={imgSizeSmall} height={imgSizeSmall} className="object-contain"/></div><div className={`w-full h-1/2 flex items-center justify-center ${isCompact ? 'pb-0.5' : 'pb-1' }`}><Image src="/logos/cambio-logo.png" alt="Cambio" width={imgSizeSmall} height={imgSizeSmall} className="object-contain"/></div></div></div> {!isCompact && <span>Both</span>} </>)}
      </div>
    );
  };

  // --- JSX Rendering --- 

  // Render compact view
  if (viewDensity === 'compact') {
    return (
      <>
        <div className={`rounded-lg border shadow-sm mb-1.5 overflow-hidden transition-all duration-200 ${statusStyles.border} ${statusStyles.darkBorder} ${statusStyles.background} ${statusStyles.darkBackground}`}>
          <div className="flex items-center justify-between p-1.5 gap-1.5">
            <div className="flex items-center min-w-0 flex-grow">
              <span className={`h-2 w-2 rounded-full mr-1.5 flex-shrink-0 ${
                  control.status === ControlStatus.Complete ? 'bg-emerald-500 dark:bg-emerald-400' : 
                  control.status === ControlStatus.InProgress ? 'bg-indigo-500 dark:bg-indigo-400' : 
                  control.status === ControlStatus.InReview ? 'bg-amber-500 dark:bg-amber-400' : 'bg-gray-500 dark:bg-gray-400'
              }`} />
              <span className="text-xs font-mono bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1 py-0.5 rounded-sm mr-1.5 flex-shrink-0">DCF-{control.dcfId}</span>
              <span className="font-medium text-xs truncate text-gray-900 dark:text-gray-100">{control.title}</span>
              {isHighPriority && <span className="ml-1 text-red-500 dark:text-red-400" title={`${control.priorityLevel} Priority`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg></span>}
              {control.externalUrl && <a href={control.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400" onClick={(e) => e.stopPropagation()} title="Open Link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" /></svg></a>}
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
      </>
    );
  }

  // Render Medium View
  if (viewDensity === 'medium') {
    return (
      <>
        <div className={`rounded-lg border shadow-md mb-2 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.darkBorder} ${statusStyles.background} ${statusStyles.darkBackground}`}>
          <div className={`flex items-center justify-between px-3 py-1.5 border-b ${statusStyles.border} ${statusStyles.darkBorder} border-opacity-50 dark:border-opacity-50`}>
            <div className="flex items-center gap-2 min-w-0 flex-grow">
              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                  control.status === ControlStatus.Complete ? 'bg-emerald-500 dark:bg-emerald-400' : 
                  control.status === ControlStatus.InProgress ? 'bg-indigo-500 dark:bg-indigo-400' : 
                  control.status === ControlStatus.InReview ? 'bg-amber-500 dark:bg-amber-400' : 'bg-gray-500 dark:bg-gray-400'
              }`} title={control.status} />
              <div className="flex flex-wrap gap-1.5">
                {renderCompanyBadge()} 
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
          <div className="p-2">
            <div className="flex justify-between items-start">
              <div className="flex-grow min-w-0">
                <div className="flex items-center mb-0.5">
                  <span className="text-xs font-mono bg-black/10 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded-sm mr-1.5 flex-shrink-0">DCF-{control.dcfId}</span>
                  <h4 className={`text-sm font-semibold truncate ${statusStyles.color} ${statusStyles.darkColor}`}>{control.title}</h4>
                  {isHighPriority && <span className="ml-1 text-red-500 dark:text-red-400" title={`${control.priorityLevel} Priority`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg></span>}
                  {control.externalUrl && <a href={control.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400" onClick={(e) => e.stopPropagation()} title="Open Link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" /></svg></a>}
                </div>
              </div>
              <button onClick={handleDeleteClick} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md flex-shrink-0" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
            </div>
          </div>
        </div>
        {isConfirmingDelete && renderDeleteConfirmationModal()}
      </>
    );
  }

  // Render Full View (default)
  return (
    <>
      <div className={`rounded-lg border shadow-md mb-3 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.darkBorder} ${statusStyles.background} ${statusStyles.darkBackground}`}>
        {/* Top header */} 
        <div className={`flex items-center justify-between border-b ${statusStyles.border} ${statusStyles.darkBorder} px-3 py-1.5 border-opacity-50 dark:border-opacity-50`}>
          <div className="flex items-center space-x-3">
            {isDcfIdEditing ? (
              <input type="text" value={dcfIdDraft} onChange={(e) => setDcfIdDraft(e.target.value)} className="text-xs font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 mr-1.5 w-16 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-700 dark:text-gray-300" autoFocus onBlur={handleSaveDcfId} onKeyDown={(e) => e.key === 'Enter' && handleSaveDcfId()} />
            ) : (
              <span className="text-xs font-mono bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-400 px-1 py-0.5 rounded-sm flex-shrink-0 cursor-pointer hover:bg-black/10 dark:hover:bg-white/20" onClick={() => setIsDcfIdEditing(true)} title="Click to edit DCF ID">DCF-{control.dcfId}</span>
            )}
            <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-gray-600"> <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> <span className="text-xs text-gray-700 dark:text-gray-300">{assigneeName}</span></div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setShowExplanationDialog(true)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-gray-600"> <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>Info</span></button>
            <div className="relative" ref={menuRef}>
              <button ref={menuButtonRef} onClick={toggleMenu} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded-md"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" /></svg> </button>
              {menuOpen && (
                <div className="fixed bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 border border-gray-200 dark:border-gray-700 py-1 w-44" style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, position: 'fixed' }}>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setIsEditingTitle(true); }}>Edit Title</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setIsDcfIdEditing(true); }}>Edit DCF ID</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowStatusDialog(true); }}>Update Status</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowAssigneeDialog(true); }}>Change Assignee</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowDateDialog(true); }}>Set Date</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowUrlDialog(true); }}>{control.externalUrl ? 'Edit Link' : 'Add Link'}</button>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => { setMenuOpen(false); setShowExplanationDialog(true); }}>View Explanation</button>
                  <button className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center" onClick={handleDeleteClick} disabled={isDeleting}>Delete</button>
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
                {control.externalUrl && <a href={control.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center gap-1" onClick={(e) => e.stopPropagation()} title="Open Link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.75 2.25H21a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V4.81L8.03 17.03a.75.75 0 01-1.06-1.06L19.19 3.75h-3.44a.75.75 0 010-1.5z" clipRule="evenodd" /><path fillRule="evenodd" d="M5.25 6.75a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3H5.25a3 3 0 01-3-3V8.25a3 3 0 013-3H9a.75.75 0 010 1.5H5.25z" clipRule="evenodd" /></svg> <span className="text-xs">Details</span></a>}
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
          {renderCompanyBadge()}
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
          <div className="flex items-center space-x-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Company</label>
            <div className="flex items-center space-x-2 overflow-visible">
              <button type="button" onClick={() => handleSaveCompany(Company.BGC)} className={`relative rounded-full w-16 h-8 flex items-center justify-center ${currentCompany === Company.BGC ? 'bg-blue-100 dark:bg-blue-800/60 ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-1 dark:ring-offset-gray-800' : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`} title="BGC"><Image src="/logos/bgc-logo.png" alt="BGC Logo" width={32} height={28} className="object-contain max-w-full max-h-full"/></button>
              <button type="button" onClick={() => handleSaveCompany(Company.Cambio)} className={`relative rounded-full w-16 h-8 flex items-center justify-center ${currentCompany === Company.Cambio ? 'bg-emerald-100 dark:bg-emerald-800/60 ring-2 ring-emerald-500 dark:ring-emerald-400 ring-offset-1 dark:ring-offset-gray-800' : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`} title="Cambio"><Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={32} height={28} className="object-contain max-w-full max-h-full"/></button>
              <button type="button" onClick={() => handleSaveCompany(Company.Both)} className={`relative rounded-full w-16 h-8 flex items-center justify-center overflow-hidden ${currentCompany === Company.Both ? 'bg-purple-100 dark:bg-cyan-800/60 ring-2 ring-purple-500 dark:ring-cyan-400 ring-offset-1 dark:ring-offset-gray-800' : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`} title="Both"><div className="flex flex-col items-center justify-center w-full h-full"><div className="w-12 h-3 flex items-center justify-center"><Image src="/logos/bgc-logo.png" alt="BGC Logo" width={28} height={14} className="object-contain max-w-full max-h-full"/></div><div className="w-12 h-3 flex items-center justify-center"><Image src="/logos/cambio-logo.png" alt="Cambio Logo" width={28} height={14} className="object-contain max-w-full max-h-full"/></div></div></button>
            </div>
          </div>
        </div>
        {updateError && <p className="text-red-600 dark:text-red-400 text-xs p-2 text-center bg-red-50 dark:bg-red-900/30 border-t border-red-200 dark:border-red-500/50">{updateError}</p>}
      </div>

      {/* Modals with dark styles */} 
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
                  <input type="date" value={formatDateForInput(control.estimatedCompletionDate)} onChange={(e) => { handleFieldUpdate('estimatedCompletionDate', e.target.value); setShowDateDialog(false); }} className="block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:focus:ring-indigo-600 focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-200" />
                  <button onClick={() => setShowDateDialog(false)} className="mt-4 px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">Cancel</button>
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
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex-shrink-0">Explanation</h3>
                  <div className="overflow-y-auto mb-4 flex-grow">
                      {isEditingExplanation ? (
                          <div><textarea value={explanationDraft || ''} onChange={(e) => setExplanationDraft(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-200 min-h-[100px]" rows={5} autoFocus /></div>
                      ) : (
                          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{control.explanation || <span className="italic text-gray-400 dark:text-gray-500">No explanation provided.</span>}</p>
                      )}
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
      {isConfirmingDelete && renderDeleteConfirmationModal()}
    </>
  );
} 