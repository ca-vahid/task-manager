import { 
  collection,
  getDocs,
  query,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  where,
  limit,
  Timestamp,
  startAfter,
  Query,
  DocumentData,
  QuerySnapshot,
  QueryDocumentSnapshot,
  setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Task, Technician, Group } from '@/lib/types';

export type BackupCollection = 'tasks' | 'technicians' | 'groups';
export type RestoreStrategy = 'overwrite' | 'skip';

export interface BackupOptions {
  collections: BackupCollection[];
  progressCallback?: (progress: number, message: string) => void;
}

export interface RestoreOptions {
  strategy: RestoreStrategy;
  progressCallback?: (progress: number, message: string) => void;
}

export interface BackupData {
  version: string;
  timestamp: string;
  collections: {
    [key in BackupCollection]?: any[];
  };
}

export interface RestoreSummary {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

// Process data in chunks to avoid hitting limits
const CHUNK_SIZE = 100;

// Normalize Timestamp objects for JSON serialization
const normalizeData = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Timestamp) {
    return {
      __type: 'timestamp',
      seconds: data.seconds,
      nanoseconds: data.nanoseconds
    };
  }

  if (Array.isArray(data)) {
    return data.map(normalizeData);
  }

  if (typeof data === 'object') {
    const normalized: any = {};
    Object.keys(data).forEach(key => {
      normalized[key] = normalizeData(data[key]);
    });
    return normalized;
  }

  return data;
};

// Denormalize data when restoring from backup
const denormalizeData = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'object' && data.__type === 'timestamp') {
    return new Timestamp(data.seconds, data.nanoseconds);
  }

  if (Array.isArray(data)) {
    return data.map(denormalizeData);
  }

  if (typeof data === 'object') {
    const denormalized: any = {};
    Object.keys(data).forEach(key => {
      denormalized[key] = denormalizeData(data[key]);
    });
    return denormalized;
  }

  return data;
};

/**
 * Backup selected collections to a JSON object
 */
export const backupData = async (options: BackupOptions): Promise<BackupData> => {
  const { collections, progressCallback } = options;
  const backupData: BackupData = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    collections: {}
  };

  // Calculate total collections for progress tracking
  const totalCollections = collections.length;
  let completedCollections = 0;

  for (const collectionName of collections) {
    if (progressCallback) {
      progressCallback(
        (completedCollections / totalCollections) * 100,
        `Backing up ${collectionName}...`
      );
    }

    const collectionRef = collection(db, collectionName);
    let allDocuments: any[] = [];
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMore = true;
    let processedChunks = 0;

    while (hasMore) {
      let q: Query<DocumentData> = lastDoc 
        ? query(collectionRef, startAfter(lastDoc), limit(CHUNK_SIZE))
        : query(collectionRef, limit(CHUNK_SIZE));
      
      const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
      
      if (querySnapshot.empty) {
        hasMore = false;
        break;
      }

      const documents = querySnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...normalizeData(doc.data())
      }));

      allDocuments = [...allDocuments, ...documents];
      lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      processedChunks++;

      if (progressCallback) {
        progressCallback(
          (completedCollections / totalCollections) * 100 + 
          ((1 / totalCollections) * (processedChunks * CHUNK_SIZE / (allDocuments.length + CHUNK_SIZE)) * 100),
          `Backing up ${collectionName}... (${allDocuments.length} items)`
        );
      }

      // If we got fewer documents than the chunk size, we've reached the end
      if (querySnapshot.docs.length < CHUNK_SIZE) {
        hasMore = false;
      }
    }

    backupData.collections[collectionName] = allDocuments;
    completedCollections++;

    if (progressCallback) {
      progressCallback(
        (completedCollections / totalCollections) * 100,
        `Completed backup of ${collectionName} (${allDocuments.length} items)`
      );
    }
  }

  if (progressCallback) {
    progressCallback(100, `Backup completed successfully!`);
  }

  return backupData;
};

/**
 * Restore data from a backup JSON object
 */
export const restoreData = async (
  backupData: BackupData,
  options: RestoreOptions
): Promise<RestoreSummary> => {
  const result: RestoreSummary = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    warnings: [],
  };

  const { strategy, progressCallback } = options;
  // Get collections from the backup data
  const collections = Object.keys(backupData.collections) as BackupCollection[];
  const totalItems = collections.reduce((sum: number, colName: BackupCollection) => {
    return sum + (backupData.collections[colName]?.length || 0);
  }, 0);

  // Calculate total number of items to be processed
  let processedItems = 0;

  // How many items to process before updating progress
  const progressUpdateInterval = 5;

  // Helper function to add a small delay between operations for smoother UI updates
  const addDelay = (ms: number = 25) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // Process each selected collection
    for (const collectionName of collections) {
      if (!backupData.collections[collectionName]) {
        result.warnings.push(`Collection '${collectionName}' not found in backup data.`);
        continue;
      }

      const items = backupData.collections[collectionName] || [];
      
      if (progressCallback) {
        progressCallback(
          Math.min(Math.round((processedItems / totalItems) * 100), 99),
          `Starting to restore collection: ${collectionName} (${items.length} items)`
        );
        await addDelay(50); // Shorter delay
      }
      
      const collectionRef = collection(db, collectionName);

      // Process items in chunks
      const chunkSize = 10; // Back to 10 for faster processing
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        let chunkProcessedItems = 0;
        
        // Process each item in the chunk
        for (const item of chunk) {
          const docId = item.id;
          const docRef = doc(db, collectionName, docId);
          
          try {
            // Check if document exists
            const docSnapshot = await getDoc(docRef);
            
            if (docSnapshot.exists()) {
              if (strategy === 'overwrite') {
                // Update existing document
                const { id, ...dataWithoutId } = item;
                await updateDoc(docRef, denormalizeData(dataWithoutId));
                result.updated++;
              } else {
                // Skip if document exists and overwrite is false
                result.skipped++;
              }
            } else {
              // Create new document
              const { id, ...dataWithoutId } = item;
              await setDoc(docRef, denormalizeData(dataWithoutId));
              result.created++;
            }
            
            result.processed++;
            chunkProcessedItems++;
          } catch (error: any) {
            console.error(`Error restoring document ${docId} in ${collectionName}:`, error);
            result.errors++;
            result.warnings.push(`Failed to restore ${collectionName}/${docId}: ${error.message}`);
          }
          
          // Update progress counter
          processedItems++;
          
          // Only update UI every progressUpdateInterval items or at the end of a chunk
          if (progressCallback && 
              (processedItems % progressUpdateInterval === 0 || 
               chunkProcessedItems === chunk.length)) {
              
            const progress = Math.min(Math.round((processedItems / totalItems) * 100), 99);
            const actionText = `(created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped})`;
            
            progressCallback(
              progress,
              `Processed ${processedItems}/${totalItems} items ${actionText}`
            );
            
            // Only add delay when we're actually updating the UI
            await addDelay();
          }
        }
      }
      
      if (progressCallback) {
        progressCallback(
          Math.min(Math.round((processedItems / totalItems) * 100), 99),
          `Completed restoring ${collectionName}: ${items.length} items processed`
        );
      }
    }
    
    // Final callback with 100% progress and summary
    if (progressCallback) {
      // Small delay before showing final result
      await addDelay(100);
      
      progressCallback(
        100,
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.errors} errors`
      );
    }
    
    return result;
  } catch (error: any) {
    console.error('Restore operation failed:', error);
    if (progressCallback) {
      progressCallback(0, `Restore failed: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Export backup data to a JSON file
 */
export const exportBackupToFile = (backupData: BackupData, filename: string = 'task-manager-backup.json'): void => {
  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Read a backup JSON file
 */
export const readBackupFile = (file: File): Promise<BackupData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        resolve(jsonData as BackupData);
      } catch (error) {
        reject(new Error('Invalid backup file format'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read backup file'));
    };
    
    reader.readAsText(file);
  });
}; 