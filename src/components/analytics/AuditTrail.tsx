"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, where, Timestamp, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/hooks/useAuth';

interface AuditEvent {
  id: string;
  timestamp: Timestamp;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: Record<string, any>;
  ipAddress?: string;
}

interface AuditTrailProps {
  initialLimit?: number;
}

export function AuditTrail({ initialLimit = 50 }: AuditTrailProps) {
  const { user } = useAuth();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    userId: '',
    dateRange: {
      start: null as Date | null,
      end: null as Date | null
    },
    searchTerm: ''
  });

  // Available filter options
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  // Load audit events on component mount
  useEffect(() => {
    loadAuditEvents();
    loadFilterOptions();
  }, []);

  // Load filter options
  const loadFilterOptions = async () => {
    try {
      // Get unique action types
      const actionsSnapshot = await getDocs(query(
        collection(db, 'auditTrail'),
        orderBy('action'),
        limit(100)
      ));
      
      const uniqueActions = new Set<string>();
      actionsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.action) uniqueActions.add(data.action);
      });
      
      setActionTypes(Array.from(uniqueActions));
      
      // Get unique entity types
      const entitiesSnapshot = await getDocs(query(
        collection(db, 'auditTrail'),
        orderBy('entityType'),
        limit(100)
      ));
      
      const uniqueEntities = new Set<string>();
      entitiesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.entityType) uniqueEntities.add(data.entityType);
      });
      
      setEntityTypes(Array.from(uniqueEntities));
      
      // Get users (would typically come from a users collection)
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      const usersList: { id: string; name: string }[] = [];
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        usersList.push({
          id: doc.id,
          name: data.displayName || data.email || doc.id
        });
      });
      
      setUsers(usersList);
    } catch (err) {
      console.error('Error loading filter options:', err);
      setError('Failed to load filter options. Please try again.');
    }
  };

  // Load audit events from Firestore
  const loadAuditEvents = async (reset = true) => {
    setLoading(true);
    setError(null);
    
    try {
      let auditQuery = query(
        collection(db, 'auditTrail'),
        orderBy('timestamp', 'desc'),
        limit(initialLimit)
      );
      
      // Apply filters
      if (filters.action) {
        auditQuery = query(auditQuery, where('action', '==', filters.action));
      }
      
      if (filters.entityType) {
        auditQuery = query(auditQuery, where('entityType', '==', filters.entityType));
      }
      
      if (filters.userId) {
        auditQuery = query(auditQuery, where('userId', '==', filters.userId));
      }
      
      if (filters.dateRange.start) {
        const startTimestamp = Timestamp.fromDate(filters.dateRange.start);
        auditQuery = query(auditQuery, where('timestamp', '>=', startTimestamp));
      }
      
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        const endTimestamp = Timestamp.fromDate(endDate);
        auditQuery = query(auditQuery, where('timestamp', '<=', endTimestamp));
      }
      
      // If loading more, start after the last visible document
      if (!reset && lastVisible) {
        auditQuery = query(auditQuery, startAfter(lastVisible));
      }
      
      const snapshot = await getDocs(auditQuery);
      
      // Check if there are more documents to load
      setHasMore(!snapshot.empty);
      
      // Set the last visible document for pagination
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      // Parse the audit events
      const events = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp,
          userId: data.userId,
          userName: data.userName || 'Unknown',
          userEmail: data.userEmail || 'Unknown',
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          entityName: data.entityName || data.entityId,
          details: data.details || {},
          ipAddress: data.ipAddress
        } as AuditEvent;
      });
      
      // Set or append the audit events
      setAuditEvents(reset ? events : [...auditEvents, ...events]);
    } catch (err) {
      console.error('Error loading audit events:', err);
      setError('Failed to load audit trail. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load more audit events
  const loadMore = () => {
    if (!loading && hasMore) {
      loadAuditEvents(false);
    }
  };

  // Handle filter change
  const handleFilterChange = (field: string, value: any) => {
    setFilters({
      ...filters,
      [field]: value
    });
  };

  // Apply filters
  const applyFilters = () => {
    loadAuditEvents();
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      action: '',
      entityType: '',
      userId: '',
      dateRange: {
        start: null,
        end: null
      },
      searchTerm: ''
    });
    
    // Reload audit events without filters
    loadAuditEvents();
  };

  // Format date for display
  const formatDate = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Highlights search term in text
  const highlightSearchTerm = (text: string) => {
    if (!filters.searchTerm || !text) return text;
    
    const regex = new RegExp(`(${filters.searchTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Audit Trail</h1>
        <p className="text-gray-500 mt-2">Comprehensive log of all user actions in the system</p>
      </div>
      
      {/* Filters Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Filters</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Action Type Filter */}
          <div>
            <label htmlFor="action-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Action Type
            </label>
            <select
              id="action-filter"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            >
              <option value="">All Actions</option>
              {actionTypes.map(action => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          
          {/* Entity Type Filter */}
          <div>
            <label htmlFor="entity-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              id="entity-filter"
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            >
              <option value="">All Entities</option>
              {entityTypes.map(entityType => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </div>
          
          {/* User Filter */}
          <div>
            <label htmlFor="user-filter" className="block text-sm font-medium text-gray-700 mb-1">
              User
            </label>
            <select
              id="user-filter"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            >
              <option value="">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Date Range - Start */}
          <div>
            <label htmlFor="date-start" className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              id="date-start"
              value={filters.dateRange.start ? filters.dateRange.start.toISOString().split('T')[0] : ''}
              onChange={(e) => handleFilterChange('dateRange', {
                ...filters.dateRange,
                start: e.target.value ? new Date(e.target.value) : null
              })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
          </div>
          
          {/* Date Range - End */}
          <div>
            <label htmlFor="date-end" className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              id="date-end"
              value={filters.dateRange.end ? filters.dateRange.end.toISOString().split('T')[0] : ''}
              onChange={(e) => handleFilterChange('dateRange', {
                ...filters.dateRange,
                end: e.target.value ? new Date(e.target.value) : null
              })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
          </div>
          
          {/* Search Term */}
          <div>
            <label htmlFor="search-term" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              id="search-term"
              placeholder="Search in event details"
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
          </div>
        </div>
        
        <div className="flex justify-end mt-4 space-x-2">
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm"
          >
            Reset
          </button>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>
      
      {/* Audit Events Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Audit Events</h2>
        
        {loading && auditEvents.length === 0 ? (
          <div className="py-10 text-center">
            <svg className="animate-spin h-8 w-8 text-gray-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-2 text-gray-500">Loading audit events...</p>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-red-500">{error}</p>
            <button
              onClick={() => loadAuditEvents()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Retry
            </button>
          </div>
        ) : auditEvents.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-500">No audit events found.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditEvents.map((event) => {
                    // Filter by search term if specified
                    if (filters.searchTerm && !JSON.stringify(event).toLowerCase().includes(filters.searchTerm.toLowerCase())) {
                      return null;
                    }
                    
                    return (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(event.timestamp)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{event.userName}</div>
                          <div className="text-xs text-gray-500">{event.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            event.action.includes('create') ? 'bg-green-100 text-green-800' :
                            event.action.includes('update') ? 'bg-blue-100 text-blue-800' :
                            event.action.includes('delete') ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {event.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mr-1">
                              {event.entityType}
                            </span>
                            {event.entityName}
                          </div>
                          <div className="text-xs text-gray-500">ID: {event.entityId}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div className="max-w-md truncate">
                            {Object.entries(event.details).map(([key, value]) => (
                              <div key={key} className="text-xs">
                                <span className="font-semibold">{key}:</span>{' '}
                                <span dangerouslySetInnerHTML={{ 
                                  __html: highlightSearchTerm(typeof value === 'object' ? JSON.stringify(value) : String(value)) 
                                }} />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 