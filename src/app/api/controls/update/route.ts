import { NextResponse } from 'next/server';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Company, ControlStatus, PriorityLevel, Control } from '@/lib/types'; // Import Company enum and Control type

const CONTROLS_COLLECTION = 'controls';

// POST /api/controls/update - Update a control using POST method
// Body should contain { id: "control_id_to_update", ...other_fields_to_update }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    // Prepare the data object for Firestore update
    const dataToUpdate: Record<string, any> = {};

    // Map known fields explicitly to ensure type safety and handle specific logic
    const knownFields: (keyof Control)[] = [
      'title',
      'explanation',
      'status',
      'assigneeId',
      'progress',
      'tags',
      'company' // Make sure company is in known fields
      // Add other updatable fields here if needed
    ];

    knownFields.forEach((field: keyof Control) => {
      // Check if the field exists in the incoming updates object
      if (field in updates) {
        const value = updates[field as keyof typeof updates]; // Extract the value using type assertion

        if (field === 'assigneeId') {
          // Handle unassigned case
          dataToUpdate[field] = value === '' || value === null ? null : value;
        } else if (field === 'company') {
          // Validate company value against the enum
          if (Object.values(Company).includes(value as Company)) {
            console.log("Updating company field to:", value);
            dataToUpdate[field] = value;
          } else {
            console.warn(`Invalid company value received: ${value}, skipping update.`);
          }
        } else {
          // For other known fields, assign the value directly
          dataToUpdate[field] = value;
        }
      }
    });

    // Handle externalUrl separately
    if (updates.externalUrl !== undefined) {
      if (updates.externalUrl === null || updates.externalUrl === '') {
        dataToUpdate.externalUrl = null;
      } else if (typeof updates.externalUrl === 'string') {
        const trimmedUrl = updates.externalUrl.trim();
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
          dataToUpdate.externalUrl = 'https://' + trimmedUrl;
        } else {
          dataToUpdate.externalUrl = trimmedUrl;
        }
      } else {
        console.warn("Invalid externalUrl format received:", updates.externalUrl);
      }
    }

    // Convert date strings to Firestore compatible format if needed
    if (updates.estimatedCompletionDate !== undefined) {
      const dateValue = updates.estimatedCompletionDate;
      if (dateValue === null || dateValue === '') {
        dataToUpdate.estimatedCompletionDate = null;
      } else {
        try {
          // Parse the date value properly to avoid timezone issues
          let jsDate: Date;
          
          if (typeof dateValue === 'string') {
            // If it's a YYYY-MM-DD format string
            if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const [year, month, day] = dateValue.split('-').map(n => parseInt(n, 10));
              // Use UTC date to prevent timezone shifts
              jsDate = new Date(Date.UTC(year, month - 1, day));
            }
            // If it's an ISO string
            else if (dateValue.includes('T')) {
              jsDate = new Date(dateValue);
            }
            else {
              throw new Error('Unsupported date format');
            }
          } else {
            // For other formats (like timestamp objects)
            jsDate = new Date(dateValue);
          }
          
          if (!isNaN(jsDate.getTime())) {
            // Convert valid JS Date to Firestore Timestamp
            dataToUpdate.estimatedCompletionDate = Timestamp.fromDate(jsDate);
          } else {
            console.warn("Invalid date value received:", dateValue);
          }
        } catch (error) {
          console.error("Date conversion error:", error);
        }
      }
    }

    // Add lastUpdated timestamp
    dataToUpdate.lastUpdated = Timestamp.now();

    const controlRef = doc(db, CONTROLS_COLLECTION, id);
    await updateDoc(controlRef, dataToUpdate); // Use the explicitly constructed data object

    return NextResponse.json({ 
      message: `Control ${id} updated successfully`,
      id,
      ...dataToUpdate // Return the data that was actually updated
    }, { status: 200 }); 

  } catch (error) {
    console.error(`Error updating control:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message: `Failed to update control: ${errorMessage}` }, { status: 500 });
  }
} 