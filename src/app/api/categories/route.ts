import { NextResponse } from 'next/server';
import { Category } from '@/lib/types';

const FRESHSERVICE_DOMAIN = process.env.FRESHSERVICE_DOMAIN;
const FRESHSERVICE_API_TOKEN = process.env.FRESHSERVICE_API_TOKEN;

// GET /api/categories - Fetch all categories from Freshservice
export async function GET() {
  try {
    // Debug info
    console.log('Fetching categories from Freshservice');
    console.log(`FRESHSERVICE_DOMAIN: ${FRESHSERVICE_DOMAIN ? 'configured' : 'missing'}`);
    console.log(`FRESHSERVICE_API_TOKEN: ${FRESHSERVICE_API_TOKEN ? 'configured' : 'missing'}`);

    if (!FRESHSERVICE_DOMAIN || !FRESHSERVICE_API_TOKEN) {
      console.error("Freshservice configuration missing");
      return NextResponse.json({ message: 'Freshservice configuration missing' }, { status: 500 });
    }

    // Encode API token for Basic Auth (Base64 of 'api_key:X')
    const encodedToken = Buffer.from(`${FRESHSERVICE_API_TOKEN}:X`).toString('base64');

    // Make API call to Freshservice
    const response = await fetch(`https://${FRESHSERVICE_DOMAIN}/api/v2/ticket_form_fields`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Freshservice API error: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      return NextResponse.json(
        { message: `Failed to fetch ticket fields: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Freshservice API response received');

    // Find the Category field (id: 1000158814, label: "Category")
    const categoryField = data.ticket_fields.find(
      (field: any) => field.id === 1000158814 && field.label === 'Category'
    );

    if (!categoryField) {
      console.log('Category field not found in response');
      return NextResponse.json({ categories: [] });
    }

    console.log(`Found category field with ${categoryField.choices?.length || 0} choices`);

    // Extract categories from the choices array
    const categories: Category[] = (categoryField.choices || []).map((choice: any) => ({
      id: choice.id.toString(),
      displayId: choice.display_id,
      value: choice.value
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { message: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
} 