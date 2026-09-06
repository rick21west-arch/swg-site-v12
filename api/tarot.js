import { createClient } from '@sanity/client';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// One shared function for both Jean-Paul's Tarot engines, dispatched by
// ?engine=. Same reason as preview-singleton.js: the project sits at
// Vercel's Hobby-plan 12-serverless-function ceiling, so two new content
// engines have to live in one file, not two. The two engines stay fully
// independent in code (separate functions below, no shared state, the
// image engine never receives the reading) even though they share a file.
export const config = { maxDuration: 120 };

const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';
const REFS_DIR = path.join(process.cwd(), 'api', '_lib', 'tarot-refs');

function sanityClient() {
  return createClient({ projectId: PROJECT_ID, dataset: DATASET, apiVersion: API_VERSION, useCdn: true });
}

function validateAnswers(answers) {
  return Array.isArray(answers) && answers.length === 3 &&
    answers.every(a => a && typeof a.question === 'string' && typeof a.answer === 'string');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runTextEngine(answers) {
  const client = sanityClient();
  const voice = await client.fetch('*[_type == "tarotVoiceText"][0]{fullText}');
  if (!voice || !voice.fullText) {
    throw new Error('tarotVoiceText document not found in Sanity');
  }

  const answerBlock = answers.map((a, i) => `${i + 1}. ${a.question}\n   ${a.answer}`).join('\n');
  const userPrompt = `Here are the three raw answers for this reading:\n\n${answerBlock}\n\nRespond with ONLY valid JSON, no other text, no code fences, in exactly this shape:\n{"cardName": "...", "reading": "..."}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      system: voice.fullText,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  }, 55000);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const rawText = data && data.content && data.content[0] && data.content[0].text;
  if (!rawText) {
    throw new Error(`Anthropic response had no text content: ${JSON.stringify(data)}`);
  }

  let parsed;
  try {
    const cleaned = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse JSON from Claude's response: ${rawText}`);
  }

  if (typeof parsed.cardName !== 'string' || typeof parsed.reading !== 'string') {
    throw new Error(`Parsed JSON missing cardName/reading: ${JSON.stringify(parsed)}`);
  }

  return { cardName: parsed.cardName, reading: parsed.reading };
}

function loadReferenceImages() {
  let files;
  try {
    files = readdirSync(REFS_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  } catch {
    return [];
  }
  return files.map(f => {
    const ext = path.extname(f).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const data = readFileSync(path.join(REFS_DIR, f)).toString('base64');
    return { mimeType, data };
  });
}

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const res = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
    90000
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const responseParts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(responseParts)) {
    throw new Error(`Unexpected Gemini response shape: ${JSON.stringify(data)}`);
  }

  const imagePart = responseParts.find(p => p.inlineData || p.inline_data);
  if (!imagePart) {
    const textPart = responseParts.find(p => p.text);
    throw new Error(`Gemini returned no image. Text response: ${textPart ? textPart.text : JSON.stringify(data)}`);
  }

  const inline = imagePart.inlineData || imagePart.inline_data;
  return { mimeType: inline.mimeType || inline.mime_type, data: inline.data };
}

async function runImageEngine(answers) {
  const client = sanityClient();
  const voice = await client.fetch('*[_type == "tarotVoiceImage"][0]{fullText}');
  if (!voice || !voice.fullText) {
    throw new Error('tarotVoiceImage document not found in Sanity');
  }

  const answerBlock = answers.map((a, i) => `${i + 1}. ${a.question}\n   ${a.answer}`).join('\n');
  const promptText = `${voice.fullText}\n\nHere are today's three raw answers:\n\n${answerBlock}\n\nGenerate one new image following every rule above.`;

  const refImages = loadReferenceImages();
  const parts = [
    { text: promptText },
    ...refImages.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
  ];

  return callGemini(parts);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const engine = req.query && req.query.engine;
  if (engine !== 'text' && engine !== 'image' && engine !== 'bootstrap-ref') {
    return res.status(400).json({ error: 'engine must be "text" or "image"' });
  }

  // Temporary, one-time-use path: generates a single reference image from a
  // literal prompt (bypassing the answers/voice-instructions flow) so the
  // real four-image reference set can be assembled before this phase ships.
  // Removed once that's done — never part of the real product surface.
  if (engine === 'bootstrap-ref') {
    const prompt = req.body && req.body.prompt;
    if (typeof prompt !== 'string' || !prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    try {
      const result = await callGemini([{ text: prompt }]);
      return res.status(200).json(result);
    } catch (err) {
      console.error('Tarot bootstrap-ref error:', err);
      return res.status(502).json({ error: 'bootstrap-ref engine failed', detail: String(err.message || err) });
    }
  }

  const answers = req.body && req.body.answers;
  if (!validateAnswers(answers)) {
    return res.status(400).json({ error: 'answers must be an array of exactly 3 {question, answer} objects' });
  }

  try {
    if (engine === 'text') {
      const result = await runTextEngine(answers);
      return res.status(200).json(result);
    } else {
      const result = await runImageEngine(answers);
      return res.status(200).json(result);
    }
  } catch (err) {
    console.error(`Tarot ${engine} engine error:`, err);
    return res.status(502).json({ error: `${engine} engine failed`, detail: String(err.message || err) });
  }
}
