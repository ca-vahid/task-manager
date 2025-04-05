import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

// Types of entities that can be audited
export type EntityType = 'control' | 'technician' | 'dashboard' | 'user' | 'setting';

// Types of actions that can be performed
export type ActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'login' 
  | 'logout' 
  | 'download_report' 
  | 'export_data' 
  | 'upload_file' 
  | 'bulk_operation';

interface AuditLogOptions {
  user: User | null;
  action: ActionType | string;
  entityType: EntityType | string;
  entityId: string;
  entityName?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Log an action to the audit trail
 * @param options Audit log options
 * @returns Promise that resolves when the log is recorded
 */
export const logAction = async (options: AuditLogOptions) => {
  if (!options.user) {
    console.warn('Attempted to log action without user');
    return;
  }
  
  try {
    const { user, action, entityType, entityId, entityName, details = {}, ipAddress } = options;
    
    const auditEvent = {
      timestamp: serverTimestamp(),
      userId: user.uid,
      userName: user.displayName || '',
      userEmail: user.email || '',
      action,
      entityType,
      entityId,
      entityName: entityName || entityId,
      details,
      ipAddress
    };
    
    await addDoc(collection(db, 'auditTrail'), auditEvent);
    
    console.debug(`Audit log: ${action} on ${entityType}:${entityId}`);
  } catch (error) {
    console.error('Error logging action to audit trail:', error);
  }
};

/**
 * Log a control creation
 */
export const logControlCreate = (user: User | null, controlId: string, controlTitle: string, details?: Record<string, any>) => {
  return logAction({
    user,
    action: 'create',
    entityType: 'control',
    entityId: controlId,
    entityName: controlTitle,
    details
  });
};

/**
 * Log a control update
 */
export const logControlUpdate = (user: User | null, controlId: string, controlTitle: string, details?: Record<string, any>) => {
  return logAction({
    user,
    action: 'update',
    entityType: 'control',
    entityId: controlId,
    entityName: controlTitle,
    details
  });
};

/**
 * Log a control deletion
 */
export const logControlDelete = (user: User | null, controlId: string, controlTitle: string) => {
  return logAction({
    user,
    action: 'delete',
    entityType: 'control',
    entityId: controlId,
    entityName: controlTitle
  });
};

/**
 * Log a bulk operation on controls
 */
export const logBulkOperation = (user: User | null, action: string, controlIds: string[], details?: Record<string, any>) => {
  return logAction({
    user,
    action: `bulk_${action}`,
    entityType: 'control',
    entityId: 'multiple',
    details: {
      controlIds,
      count: controlIds.length,
      ...details
    }
  });
};

/**
 * Log report generation or export
 */
export const logReportExport = (user: User | null, reportType: string, format: 'pdf' | 'excel' | 'csv', details?: Record<string, any>) => {
  return logAction({
    user,
    action: 'export_report',
    entityType: 'report',
    entityId: reportType,
    details: {
      format,
      timestamp: new Date().toISOString(),
      ...details
    }
  });
};

/**
 * Log dashboard creation or update
 */
export const logDashboardAction = (user: User | null, action: 'create' | 'update' | 'delete', dashboardId: string, dashboardName: string) => {
  return logAction({
    user,
    action,
    entityType: 'dashboard',
    entityId: dashboardId,
    entityName: dashboardName
  });
};

/**
 * Log user authentication events
 */
export const logAuthEvent = (user: User | null, action: 'login' | 'logout' | 'signup' | 'password_reset') => {
  if (!user && action !== 'logout') {
    console.warn('Attempted to log auth event without user');
    return Promise.resolve();
  }
  
  return logAction({
    user,
    action,
    entityType: 'user',
    entityId: user?.uid || 'anonymous',
    entityName: user?.displayName || user?.email || 'Anonymous',
    details: {
      timestamp: new Date().toISOString(),
      provider: user?.providerData[0]?.providerId || 'unknown'
    }
  });
};

/**
 * Log an API operation
 */
export const logApiOperation = (user: User | null, endpoint: string, method: string, status: number, details?: Record<string, any>) => {
  return logAction({
    user,
    action: `api_${method.toLowerCase()}`,
    entityType: 'api',
    entityId: endpoint,
    details: {
      status,
      timestamp: new Date().toISOString(),
      ...details
    }
  });
}; 