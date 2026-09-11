import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { foodName } = await request.json();

    if (!foodName) {
      return NextResponse.json({ error: 'Food name is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    const systemInstruction = `
You are a nutrition expert. Given the food name, estimate its calories (kcal) and protein (g) per standard serving.
Return ONLY valid JSON matching this schema exactly, nothing else, no markdown formatting like \`\`\`json:
{
  "calories": number,
  "protein": number
}

Food name: `;

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
        input: systemInstruction + foodName
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
    
    if (data.steps && Array.isArray(data.steps)) {
        const modelOutputStep = data.steps.find((s: any) => s.type === 'model_output');
        if (modelOutputStep && modelOutputStep.content && Array.isArray(modelOutputStep.content)) {
            const textContent = modelOutputStep.content.find((c: any) => c.type === 'text');
            if (textContent && textContent.text) {
                textResult = textContent.text;
            }
        }
    }

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

    // Attempt to parse if it contains {
    if (!cleanJson.includes('{')) {
        return NextResponse.json({ error: `AI did not return JSON: ${cleanJson}` }, { status: 500 });
    }

    const jsonStart = cleanJson.indexOf('{');
    const jsonEnd = cleanJson.lastIndexOf('}');
    cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(cleanJson);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Error fetching nutrition:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
