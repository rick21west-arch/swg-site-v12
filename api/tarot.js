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

// Deliberately small and blunt rather than linguistically clever — this is
// a hard backstop against literal repeats of the answer text, not a style
// checker. False negatives (a well-disguised synonym slipping through) are
// acceptable; the prompt-level reminder is the first line of defense for
// that. This just catches the literal word.
const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','than','so','because','of','to','in','on','at','by','for',
  'with','about','against','between','into','through','during','before','after','above','below','from',
  'up','down','out','off','over','under','again','further','once','here','there','when','where','why',
  'how','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own',
  'same','as','just','don','dont','you','your','yours','i','me','my','mine','we','our','ours','he','him',
  'his','she','her','hers','it','its','they','them','their','theirs','what','which','who','whom','this',
  'that','these','those','am','is','are','was','were','be','been','being','have','has','had','having',
  'do','does','did','doing','will','would','shall','should','can','could','may','might','must','yes',
  'always','never','really','actually','obviously','probably','definitely','totally','literally',
  'honestly','basically','kind','sort','get','got','going','one','two','three','right','well','yeah',
]);

function significantWords(text) {
  const matches = text.toLowerCase().match(/[a-z']+/g) || [];
  return matches.filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function findNamedBackWords(reading, answers) {
  const readingLower = reading.toLowerCase();
  const found = new Set();
  for (const a of answers) {
    for (const w of significantWords(a.answer)) {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(readingLower)) {
        found.add(w);
      }
    }
  }
  return Array.from(found);
}

async function requestReadingFromClaude(apiKey, voiceText, userPrompt) {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: voiceText,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  }, 55000);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const textBlock = data && data.content && data.content.find(b => b.type === 'text');
  const rawText = textBlock && textBlock.text;
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

const MAX_NAMING_ATTEMPTS = 3;

async function runTextEngine(answers) {
  const client = sanityClient();
  const voice = await client.fetch('*[_type == "tarotVoiceText"][0]{fullText}');
  if (!voice || !voice.fullText) {
    throw new Error('tarotVoiceText document not found in Sanity');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const answerBlock = answers.map((a, i) => `${i + 1}. ${a.question}\n   ${a.answer}`).join('\n');
  const basePrompt = `Here are the three raw answers for this reading:\n\n${answerBlock}\n\nBefore finalizing, check: does your reading contain any of the literal words (or obvious synonyms/variants of the specific noun) from any of the three answers above? If yes, that breaks the "never name the specific noun or object back" rule from the voice instructions — rewrite the reading so it doesn't, then check again. Only output the final, already-checked version.\n\nRespond with ONLY valid JSON, no other text, no code fences, in exactly this shape:\n{"cardName": "...", "reading": "..."}`;

  let lastResult = null;
  let lastViolations = [];

  for (let attempt = 1; attempt <= MAX_NAMING_ATTEMPTS; attempt++) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous attempt still named these literal words back: ${lastViolations.join(', ')}. That is not allowed. Write a genuinely different reading that avoids every one of those words (and their obvious variants) entirely.`;

    const result = await requestReadingFromClaude(apiKey, voice.fullText, prompt);
    const violations = findNamedBackWords(result.reading, answers);

    if (violations.length === 0) {
      return result;
    }

    lastResult = result;
    lastViolations = violations;
  }

  throw new Error(
    `Reading still named back "${lastViolations.join(', ')}" after ${MAX_NAMING_ATTEMPTS} attempts. Last attempt: ${JSON.stringify(lastResult)}`
  );
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
