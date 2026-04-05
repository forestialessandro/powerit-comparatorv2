export default async (req, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const API_KEY = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured. Check Netlify env vars.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (parseErr) {
    return new Response(JSON.stringify({ error: 'Failed to parse request body: ' + parseErr.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { images, prompt } = body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: 'No images provided in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const content = [];
    for (const img of images) {
      const isPdf = img.type === 'application/pdf';
      content.push(
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.data } }
          : { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }
      );
    }
    content.push({ type: 'text', text: prompt });

    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    console.log('OCR request: ' + images.length + ' images, body size: ' + (apiBody.length / 1024 / 1024).toFixed(2) + ' MB');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: apiBody,
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('Anthropic API error: ' + response.status + ' ' + JSON.stringify(data));
      return new Response(JSON.stringify({ error: 'Anthropic API error (' + response.status + '): ' + (data.error?.message || JSON.stringify(data)) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.log('OCR function error: ' + error.message + ' | Stack: ' + error.stack);
    return new Response(JSON.stringify({ error: 'Server error: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

export const config = {
  path: '/api/ocr',
};
