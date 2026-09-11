import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];
    const systemInstruction = `
You are an expert at parsing natural language expense descriptions.
Today's date is: ${today}

Extract the distinct transactions. If the user mentions multiple shops or distinct purchases, return them as separate transaction objects in the array.
If price is not mentioned, use 0.
If quantity is not mentioned, use 1.
If shop name is not clearly mentioned, leave it empty or guess it from context.
If date is not clearly mentioned, use today's date (${today}). For relative dates like "yesterday", calculate the correct date based on today's date. Format date as YYYY-MM-DD.
Extract any relevant notes into the "note" field.

Return ONLY valid JSON matching this schema exactly, nothing else, no markdown formatting like \`\`\`json:
[
  {
    "shopName": "string",
    "date": "string (YYYY-MM-DD)",
    "note": "string",
    "items": [
      {
        "name": "string",
        "quantity": number,
        "price": number
      }
    ]
  }
]

User input: `;

    const referer = request.headers.get('referer') || 'http://localhost:3000';

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
        'Referer': referer
      },
      body: JSON.stringify({
        model: 'gemini-3.5-flash-lite',
        input: systemInstruction + prompt
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: `Failed to communicate with AI. ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    
    // The Interactions API response format
    let textResult = '';
    
    // Check if it's the specific interactions API structure
    if (data.steps && Array.isArray(data.steps)) {
        const modelOutputStep = data.steps.find((s: any) => s.type === 'model_output');
        if (modelOutputStep && modelOutputStep.content && Array.isArray(modelOutputStep.content)) {
            const textContent = modelOutputStep.content.find((c: any) => c.type === 'text');
            if (textContent && textContent.text) {
                textResult = textContent.text;
            }
        }
    }

    // Fallbacks
    if (!textResult) {
        if (typeof data === 'string') {
            textResult = data;
        } else if (data.text) {
            textResult = data.text;
        } else if (data.response) {
            textResult = data.response;
        } else if (data.output) {
            textResult = data.output;
        } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            textResult = data.candidates[0].content.parts[0].text;
        } else {
            textResult = JSON.stringify(data);
        }
    }

    if (!textResult) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 500 });
    }

    // Clean up potential markdown formatting
    let cleanJson = textResult.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // Attempt to parse if it contains [
    if (!cleanJson.includes('[')) {
        return NextResponse.json({ error: `AI did not return JSON array: ${cleanJson}` }, { status: 500 });
    }

    const jsonStart = cleanJson.indexOf('[');
    const jsonEnd = cleanJson.lastIndexOf(']');
    cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(cleanJson);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Error parsing AI request:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
