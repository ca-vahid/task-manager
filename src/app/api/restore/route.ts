import { NextRequest, NextResponse } from 'next/server';
import { restoreData, BackupData, RestoreStrategy } from '@/lib/backup/backupUtils';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { backupData, strategy } = data;

    if (!backupData || typeof backupData !== 'object') {
      return NextResponse.json(
        { error: 'Valid backup data is required' },
        { status: 400 }
      );
    }

    // Validate backup data
    if (!backupData.version || !backupData.timestamp || !backupData.collections) {
      return NextResponse.json(
        { error: 'Invalid backup data format' },
        { status: 400 }
      );
    }

    // Validate collections
    const collections = Object.keys(backupData.collections);
    if (collections.length === 0) {
      return NextResponse.json(
        { error: 'Backup contains no collections' },
        { status: 400 }
      );
    }

    // Validate strategy
    let restoreStrategy: RestoreStrategy = 'skip';
    if (strategy === 'overwrite') {
      restoreStrategy = 'overwrite';
    }

    // Initiate restore and get the summary
    const summary = await restoreData(backupData as BackupData, {
      strategy: restoreStrategy
      // We don't pass progressCallback here as it's handled client-side
    });

    return NextResponse.json({ 
      success: true,
      message: 'Restore completed', // Changed message
      summary: summary // Include the summary in the response
    });
  } catch (error: any) {
    console.error('Restore API error:', error);
    
    return NextResponse.json(
      { error: `Failed to restore backup: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
} 