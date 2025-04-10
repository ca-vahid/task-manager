"use client";

import React, { useState, useRef } from 'react';
import { Control, Technician, ControlStatus, Company } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { saveAs } from 'file-saver';
import { utils, write } from 'xlsx';

interface ReportGeneratorProps {
  controls: Control[];
  technicians: Technician[];
}

type ReportType = 'compliance' | 'status' | 'assignee' | 'company' | 'timeline' | 'custom';

interface ReportConfig {
  title: string;
  type: ReportType;
  filters: {
    status?: ControlStatus[];
    company?: Company[];
    assignee?: string[];
    dateRange?: {
      start: Date | null;
      end: Date | null;
    };
    tags?: string[];
    searchTerm?: string;
  };
  columns: string[];
  timeframe?: 'week' | 'month' | 'quarter' | 'year';
  groupBy?: 'status' | 'company' | 'assignee' | 'none';
}

const DEFAULT_REPORT_TEMPLATES: Record<ReportType, Omit<ReportConfig, 'title'>> = {
  compliance: {
    type: 'compliance',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    groupBy: 'none'
  },
  status: {
    type: 'status',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    groupBy: 'status'
  },
  assignee: {
    type: 'assignee',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    groupBy: 'assignee'
  },
  company: {
    type: 'company',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    groupBy: 'company'
  },
  timeline: {
    type: 'timeline',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    timeframe: 'month'
  },
  custom: {
    type: 'custom',
    filters: {},
    columns: ['dcfId', 'title', 'status', 'company', 'assignee', 'estimatedCompletionDate', 'progress'],
    groupBy: 'none'
  }
};

const AVAILABLE_COLUMNS = [
  { id: 'dcfId', label: 'Control ID' },
  { id: 'title', label: 'Title' },
  { id: 'explanation', label: 'Description' },
  { id: 'status', label: 'Status' },
  { id: 'company', label: 'Company' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'estimatedCompletionDate', label: 'Due Date' },
  { id: 'progress', label: 'Progress' },
  { id: 'tags', label: 'Tags' },
  { id: 'lastUpdated', label: 'Last Updated' },
  { id: 'externalUrl', label: 'External URL' }
];

// List of companies to ensure we don't rely on the enum directly
const COMPANIES = [
  Company.BGC,
  Company.Cambio,
  Company.None
];

export function ReportGenerator({ controls, technicians }: ReportGeneratorProps) {
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    title: 'Compliance Status Report',
    ...DEFAULT_REPORT_TEMPLATES.compliance
  });
  
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Handle report type change
  const handleReportTypeChange = (type: ReportType) => {
    setReportConfig({
      ...reportConfig,
      ...DEFAULT_REPORT_TEMPLATES[type],
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
      type
    });
  };

  // Handle title change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReportConfig({
      ...reportConfig,
      title: e.target.value
    });
  };

  // Handle column toggle
  const handleColumnToggle = (columnId: string) => {
    const updatedColumns = reportConfig.columns.includes(columnId)
      ? reportConfig.columns.filter(id => id !== columnId)
      : [...reportConfig.columns, columnId];
    
    setReportConfig({
      ...reportConfig,
      columns: updatedColumns
    });
  };

  // Handle status filter change
  const handleStatusFilterChange = (status: ControlStatus) => {
    const currentStatuses = reportConfig.filters.status || [];
    const updatedStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];
    
    setReportConfig({
      ...reportConfig,
      filters: {
        ...reportConfig.filters,
        status: updatedStatuses.length > 0 ? updatedStatuses : undefined
      }
    });
  };

  // Handle company filter change
  const handleCompanyFilterChange = (company: Company) => {
    const currentCompanies = reportConfig.filters.company || [];
    const updatedCompanies = currentCompanies.includes(company)
      ? currentCompanies.filter(c => c !== company)
      : [...currentCompanies, company];
    
    setReportConfig({
      ...reportConfig,
      filters: {
        ...reportConfig.filters,
        company: updatedCompanies.length > 0 ? updatedCompanies : undefined
      }
    });
  };

  // Handle assignee filter change
  const handleAssigneeFilterChange = (assigneeId: string) => {
    const currentAssignees = reportConfig.filters.assignee || [];
    const updatedAssignees = currentAssignees.includes(assigneeId)
      ? currentAssignees.filter(a => a !== assigneeId)
      : [...currentAssignees, assigneeId];
    
    setReportConfig({
      ...reportConfig,
      filters: {
        ...reportConfig.filters,
        assignee: updatedAssignees.length > 0 ? updatedAssignees : undefined
      }
    });
  };

  // Handle group by change
  const handleGroupByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'status' | 'company' | 'assignee' | 'none';
    setReportConfig({
      ...reportConfig,
      groupBy: value
    });
  };

  // Handle timeframe change
  const handleTimeframeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'week' | 'month' | 'quarter' | 'year';
    setReportConfig({
      ...reportConfig,
      timeframe: value
    });
  };

  // Generate report data based on configuration
  const generateReportData = () => {
    try {
      setIsGenerating(true);
      setErrorMessage(null);
      
      console.log("Starting report generation. Controls count:", controls.length);
      
      if (!controls || controls.length === 0) {
        throw new Error("No control data available. Please ensure you have control data loaded.");
      }
      
      // Filter controls based on report config
      let filteredControls = [...controls];
      console.log("Initial controls:", filteredControls);
      
      // Apply status filter
      if (reportConfig.filters.status && reportConfig.filters.status.length > 0) {
        console.log("Applying status filter:", reportConfig.filters.status);
        filteredControls = filteredControls.filter(control => 
          reportConfig.filters.status?.includes(control.status)
        );
      }
      
      // Apply company filter
      if (reportConfig.filters.company && reportConfig.filters.company.length > 0) {
        console.log("Applying company filter:", reportConfig.filters.company);
        filteredControls = filteredControls.filter(control => 
          control.company && reportConfig.filters.company?.includes(control.company)
        );
      }
      
      // Apply assignee filter
      if (reportConfig.filters.assignee && reportConfig.filters.assignee.length > 0) {
        console.log("Applying assignee filter:", reportConfig.filters.assignee);
        filteredControls = filteredControls.filter(control => 
          control.assigneeId && reportConfig.filters.assignee?.includes(control.assigneeId)
        );
      }
      
      // Apply date range filter if specified
      if (reportConfig.filters.dateRange?.start || reportConfig.filters.dateRange?.end) {
        console.log("Applying date range filter:", reportConfig.filters.dateRange);
        filteredControls = filteredControls.filter(control => {
          if (!control.estimatedCompletionDate) return false;
          
          try {
            const controlDate = control.estimatedCompletionDate.toDate();
            
            if (reportConfig.filters.dateRange?.start && controlDate < reportConfig.filters.dateRange.start) {
              return false;
            }
            
            if (reportConfig.filters.dateRange?.end) {
              const endDate = new Date(reportConfig.filters.dateRange.end);
              endDate.setHours(23, 59, 59, 999);
              
              if (controlDate > endDate) {
                return false;
              }
            }
            
            return true;
          } catch (error) {
            console.error("Error processing date for control:", control.id, error);
            return false;
          }
        });
      }
      
      console.log("Filtered controls count:", filteredControls.length);
      
      if (filteredControls.length === 0) {
        throw new Error("No controls match the selected filters. Please try different filter criteria.");
      }
      
      // Transform data based on selected columns
      console.log("Transforming data with columns:", reportConfig.columns);
      const reportData = filteredControls.map(control => {
        const rowData: Record<string, any> = {};
        
        for (const column of reportConfig.columns) {
          switch (column) {
            case 'dcfId':
              rowData['Control ID'] = control.dcfId;
              break;
            case 'title':
              rowData['Title'] = control.title;
              break;
            case 'explanation':
              rowData['Description'] = control.explanation || '';
              break;
            case 'status':
              rowData['Status'] = control.status;
              break;
            case 'company':
              rowData['Company'] = control.company || Company.None;
              break;
            case 'assignee':
              rowData['Assignee'] = control.assigneeId 
                ? technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown'
                : 'Unassigned';
              break;
            case 'estimatedCompletionDate':
              rowData['Due Date'] = control.estimatedCompletionDate 
                ? formatDate(control.estimatedCompletionDate)
                : 'No due date';
              break;
            case 'progress':
              rowData['Progress'] = control.progress ? `${control.progress}%` : '0%';
              break;
            case 'tags':
              rowData['Tags'] = control.tags?.join(', ') || '';
              break;
            case 'lastUpdated':
              rowData['Last Updated'] = control.lastUpdated 
                ? formatDate(control.lastUpdated)
                : 'Never';
              break;
            case 'externalUrl':
              rowData['External URL'] = control.externalUrl || 'None';
              break;
          }
        }
        
        return rowData;
      });
      
      console.log("Generated report data rows:", reportData.length);
      
      // Sort data based on group by
      if (reportConfig.groupBy && reportConfig.groupBy !== 'none') {
        console.log("Sorting by:", reportConfig.groupBy);
        reportData.sort((a, b) => {
          let valueA, valueB;
          
          switch (reportConfig.groupBy) {
            case 'status':
              valueA = a['Status'];
              valueB = b['Status'];
              break;
            case 'company':
              valueA = a['Company'];
              valueB = b['Company'];
              break;
            case 'assignee':
              valueA = a['Assignee'];
              valueB = b['Assignee'];
              break;
            default:
              return 0;
          }
          
          return valueA.localeCompare(valueB);
        });
      }
      
      setPreviewData(reportData);
      console.log("Report generation complete");
    } catch (error) {
      console.error("Error generating report:", error);
      setErrorMessage(error instanceof Error ? error.message : "An unknown error occurred generating the report");
      setPreviewData([]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Export to CSV
  const exportToCsv = () => {
    if (previewData.length === 0) {
      alert('Please generate the report first');
      return;
    }
    
    const worksheet = utils.json_to_sheet(previewData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Report');
    
    const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    
    saveAs(blob, `${reportConfig.title.replace(/\s+/g, '_')}.xlsx`);
  };

  // Export to PDF
  const exportToPdf = () => {
    if (previewData.length === 0) {
      alert('Please generate the report first');
      return;
    }
    
    // You would normally use a library like jsPDF here
    // For now, we'll just alert
    alert('PDF export functionality would be implemented with a library like jsPDF');
  };

  // Print report
  const printReport = () => {
    if (previewData.length === 0) {
      alert('Please generate the report first');
      return;
    }
    
    if (tableRef.current) {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print the report');
        return;
      }
      
      printWindow.document.write(`
        <html>
          <head>
            <title>${reportConfig.title}</title>
            <style>
              body { font-family: Arial, sans-serif; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              h1 { text-align: center; }
            </style>
          </head>
          <body>
            <h1>${reportConfig.title}</h1>
            ${tableRef.current.outerHTML}
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Format date for display
  const formatDate = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Report Generator</h1>
        <p className="text-gray-500 mt-2">Create custom reports from your control data</p>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Report Configuration</h2>
        
        {/* Show error message if present */}
        {errorMessage && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
            <p className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMessage}
            </p>
          </div>
        )}
        
        <div className="space-y-6">
          {/* Report Title */}
          <div>
            <label htmlFor="report-title" className="block text-sm font-medium text-gray-700 mb-1">
              Report Title
            </label>
            <input
              type="text"
              id="report-title"
              value={reportConfig.title}
              onChange={handleTitleChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
          </div>
          
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Type
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(DEFAULT_REPORT_TEMPLATES).map((type) => (
                <button
                  key={type}
                  onClick={() => handleReportTypeChange(type as ReportType)}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    reportConfig.type === type 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Columns Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Columns to Include
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {AVAILABLE_COLUMNS.map((column) => (
                <div key={column.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`column-${column.id}`}
                    checked={reportConfig.columns.includes(column.id)}
                    onChange={() => handleColumnToggle(column.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`column-${column.id}`} className="ml-2 text-sm text-gray-700">
                    {column.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status Filter
              </label>
              <div className="space-y-1">
                {Object.values(ControlStatus).map((status) => (
                  <div key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`status-${status}`}
                      checked={reportConfig.filters.status?.includes(status) || false}
                      onChange={() => handleStatusFilterChange(status)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`status-${status}`} className="ml-2 text-sm text-gray-700">
                      {status}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Company Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Filter
              </label>
              <div className="space-y-1">
                {COMPANIES.map((company) => (
                  <div key={company} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`company-${company}`}
                      checked={reportConfig.filters.company?.includes(company) || false}
                      onChange={() => handleCompanyFilterChange(company)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`company-${company}`} className="ml-2 text-sm text-gray-700">
                      {company}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Assignee Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignee Filter
              </label>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="assignee-unassigned"
                    checked={reportConfig.filters.assignee?.includes('unassigned') || false}
                    onChange={() => handleAssigneeFilterChange('unassigned')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="assignee-unassigned" className="ml-2 text-sm text-gray-700">
                    Unassigned
                  </label>
                </div>
                {technicians.map((tech) => (
                  <div key={tech.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`assignee-${tech.id}`}
                      checked={reportConfig.filters.assignee?.includes(tech.id) || false}
                      onChange={() => handleAssigneeFilterChange(tech.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`assignee-${tech.id}`} className="ml-2 text-sm text-gray-700">
                      {tech.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Group By Option */}
            <div>
              <label htmlFor="group-by" className="block text-sm font-medium text-gray-700 mb-1">
                Group By
              </label>
              <select
                id="group-by"
                value={reportConfig.groupBy || 'none'}
                onChange={handleGroupByChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              >
                <option value="none">No Grouping</option>
                <option value="status">Status</option>
                <option value="company">Company</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>
            
            {/* Timeframe Selection for Timeline Reports */}
            {reportConfig.type === 'timeline' && (
              <div>
                <label htmlFor="timeframe" className="block text-sm font-medium text-gray-700 mb-1">
                  Timeframe
                </label>
                <select
                  id="timeframe"
                  value={reportConfig.timeframe || 'month'}
                  onChange={handleTimeframeChange}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            )}
          </div>
          
          {/* Report Generation Button */}
          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={generateReportData}
              disabled={isGenerating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isGenerating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Report Preview */}
      {previewData.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Report Preview</h2>
            <div className="flex space-x-2">
              <button
                onClick={exportToCsv}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Export Excel
              </button>
              <button
                onClick={exportToPdf}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Export PDF
              </button>
              <button
                onClick={printReport}
                className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
              >
                Print
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto" ref={tableRef}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(previewData[0]).map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    {Object.values(row).map((value, colIndex) => (
                      <td
                        key={colIndex}
                        className="px-4 py-3 whitespace-nowrap text-sm text-gray-500"
                      >
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-right text-sm text-gray-500">
            Showing {previewData.length} records
          </div>
        </div>
      )}
    </div>
  );
} 