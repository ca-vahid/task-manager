import { NextResponse } from 'next/server';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

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

    // Handle externalUrl - ensure it's properly formatted or null
    if (updates.externalUrl !== undefined) {
      if (updates.externalUrl === null || updates.externalUrl === '') {
        // Allow explicit null or empty string to clear the URL
        updates.externalUrl = null;
      } else if (typeof updates.externalUrl === 'string') {
        // Ensure URL starts with http:// or https://
        const trimmedUrl = updates.externalUrl.trim();
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
          updates.externalUrl = 'https://' + trimmedUrl;
        } else {
          updates.externalUrl = trimmedUrl;
        }
      } else {
        // Invalid type, remove from updates
        console.warn("Invalid externalUrl format received:", updates.externalUrl);
        delete updates.externalUrl;
      }
    }

    // Convert date strings to Firestore compatible format if needed
    if (updates.estimatedCompletionDate !== undefined) {
      const dateValue = updates.estimatedCompletionDate;
      
      // If explicitly null or empty string, keep it null
      if (dateValue === null || dateValue === '') {
        updates.estimatedCompletionDate = null;
      } else {
        try {
          // Handle different data formats
          if (typeof dateValue === 'string') {
            // If it's a date string (YYYY-MM-DD format from date input)
            if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
              // This is a date input string like "2023-07-15"
              const [year, month, day] = dateValue.split('-').map(num => parseInt(num, 10));
              
              // Create a JavaScript Date object at UTC midnight
              // Month is 0-indexed in JS Date
              const jsDate = new Date(Date.UTC(year, month - 1, day));
              
              // Convert to seconds since epoch (what Firestore uses internally)
              const seconds = Math.floor(jsDate.getTime() / 1000);
              const nanoseconds = 0;
              
              // Store these values directly as they're what Firestore uses under the hood
              updates.estimatedCompletionDate = {
                seconds: seconds,
                nanoseconds: nanoseconds
              };
            }
            // If it's a complete ISO string
            else if (dateValue.includes('T')) {
              const jsDate = new Date(dateValue);
              if (!isNaN(jsDate.getTime())) {
                const seconds = Math.floor(jsDate.getTime() / 1000);
                updates.estimatedCompletionDate = {
                  seconds: seconds,
                  nanoseconds: 0
                };
              } else {
                console.warn("Invalid ISO string received:", dateValue);
                delete updates.estimatedCompletionDate;
              }
            } 
            // Any other string format
            else {
              const jsDate = new Date(dateValue);
              if (!isNaN(jsDate.getTime())) {
                const seconds = Math.floor(jsDate.getTime() / 1000);
                updates.estimatedCompletionDate = {
                  seconds: seconds,
                  nanoseconds: 0
                };
              } else {
                console.warn("Invalid date string received:", dateValue);
                delete updates.estimatedCompletionDate;
              }
            }
          } 
          // Handle Timestamp-like objects - we now avoid sending these from the client
          else {
            console.warn("Non-string date value received:", dateValue);
            delete updates.estimatedCompletionDate;
          }
        } catch (error) {
          console.error("Date conversion error:", error);
          console.warn("Skipping update of estimatedCompletionDate due to error");
          // Don't update this field
          delete updates.estimatedCompletionDate;
        }
      }
    }

    const controlRef = doc(db, CONTROLS_COLLECTION, id);
    await updateDoc(controlRef, updates);

    return NextResponse.json({ 
      message: `Control ${id} updated successfully`,
      id,
      ...updates
    }, { status: 200 }); 

  } catch (error) {
    console.error(`Error updating control:`, error);
    return NextResponse.json({ message: `Failed to update control: ${error}` }, { status: 500 });
  }
} 