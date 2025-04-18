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
export const restoreData = async (backupData: BackupData, options: RestoreOptions): Promise<void> => {
  const { strategy, progressCallback } = options;
  const collections = Object.keys(backupData.collections) as BackupCollection[];
  
  // Calculate total items for progress tracking
  let totalItems = 0;
  let processedItems = 0;
  
  collections.forEach(collectionName => {
    totalItems += backupData.collections[collectionName]?.length || 0;
  });

  for (const collectionName of collections) {
    const items = backupData.collections[collectionName] || [];
    
    if (progressCallback) {
      progressCallback(
        (processedItems / totalItems) * 100,
        `Restoring ${collectionName}...`
      );
    }

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      
      if (progressCallback) {
        progressCallback(
          (processedItems / totalItems) * 100,
          `Restoring ${collectionName}... (${processedItems + 1} to ${processedItems + chunk.length} of ${totalItems})`
        );
      }

      // Process each item in the chunk
      for (const item of chunk) {
        const { id, ...data } = item;
        const denormalizedData = denormalizeData(data);
        
        try {
          // Check if document with this ID already exists
          const docRef = doc(db, collectionName, id);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            // Document exists, handle according to strategy
            if (strategy === 'overwrite') {
              await updateDoc(docRef, denormalizedData);
            }
            // If strategy is 'skip', do nothing
          } else {
            // Document doesn't exist, create it with the original ID
            // Use setDoc instead of updateDoc for non-existent documents
            await setDoc(docRef, denormalizedData);
          }
        } catch (error) {
          console.error(`Error restoring document ${id} in ${collectionName}:`, error);
          // Continue with next document even if one fails
        }
        
        processedItems++;
      }
    }
  }

  if (progressCallback) {
    progressCallback(100, `Restore completed successfully!`);
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