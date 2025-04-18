import { NextRequest, NextResponse } from 'next/server';
import { backupData, BackupCollection } from '@/lib/backup/backupUtils';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { collections } = data;

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return NextResponse.json(
        { error: 'Collections array is required and cannot be empty' },
        { status: 400 }
      );
    }

    // Validate collection names
    const validCollections: BackupCollection[] = [];
    for (const collection of collections) {
      if (['tasks', 'technicians', 'groups'].includes(collection)) {
        validCollections.push(collection as BackupCollection);
      }
    }

    if (validCollections.length === 0) {
      return NextResponse.json(
        { error: 'No valid collections specified' },
        { status: 400 }
      );
    }

    // Initiate backup
    const backupResult = await backupData({
      collections: validCollections
    });

    return NextResponse.json({ 
      success: true, 
      data: backupResult 
    });
  } catch (error: any) {
    console.error('Backup API error:', error);
    
    return NextResponse.json(
      { error: `Failed to create backup: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
} 