import { createClient } from '@sanity/client';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import zlib from 'zlib';

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

// Two concrete, binary "never" rules from tarotVoiceImage are checkable
// against the actual generated pixels, unlike the fuzzy style/tone rules
// (acrylic painting, Southern Gothic quality) which need human judgment:
// (1) NEVER IN THE IMAGE — no text, numbers, border, or frame, since the
//     site adds those itself; (2) SUBJECT — never literally recreate one
//     of the four fixed reference scenes (dinner table, beach walk,
//     garage, garden). A second, independent model (Claude, not Gemini)
//     looks at the actual output and judges both, mirroring the text
//     engine's generate-check-retry backstop but for pixels instead of
//     words.
async function classifyImageViolations(apiKey, imageBase64, mimeType) {
  const prompt = `Look at this image and answer with ONLY valid JSON, no other text, no code fences, in exactly this shape:\n{"hasTextOrBorder": true or false, "matchesForbiddenScene": true or false, "forbiddenSceneName": "..."}\n\nhasTextOrBorder: true if the image contains ANY visible text, numbers, letters, a border, or a frame anywhere in it.\nmatchesForbiddenScene: true if the image's main subject is a dinner-table scene, a beach walk, a garage scene, or a garden scene — these four specific scenes belong to a separate fixed reference set and must never be recreated as the actual output.\nforbiddenSceneName: if matchesForbiddenScene is true, which one of the four it matches (\"dinner table\", \"beach walk\", \"garage\", or \"garden\"); otherwise an empty string.`;

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  }, 30000);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic vision-check API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const textBlock = data && data.content && data.content.find(b => b.type === 'text');
  const rawText = textBlock && textBlock.text;
  if (!rawText) {
    throw new Error(`Vision check response had no text content: ${JSON.stringify(data)}`);
  }

  let parsed;
  try {
    const cleaned = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse vision-check JSON: ${rawText}`);
  }

  return {
    hasTextOrBorder: !!parsed.hasTextOrBorder,
    matchesForbiddenScene: !!parsed.matchesForbiddenScene,
    forbiddenSceneName: typeof parsed.forbiddenSceneName === 'string' ? parsed.forbiddenSceneName : '',
  };
}

// Direct pixel check for a flat-colored border/frame — the vision model
// missed a real off-white matted border in production testing, so this
// doesn't rely on a model noticing at all. Only handles standard 8-bit,
// non-interlaced PNG (what Gemini has returned in every test so far);
// deliberately declines to check anything else rather than guess.
function decodePngPixels(buffer) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIG)) return null;

  let offset = 8;
  let width, height, bitDepth, colorType, interlace;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + len + 4;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;

  let channels;
  if (colorType === 2) channels = 3;
  else if (colorType === 6) channels = 4;
  else if (colorType === 0) channels = 1;
  else if (colorType === 4) channels = 2;
  else return null;

  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= channels ? pixels[rowStart + x - channels] : 0;
      const b = y > 0 ? pixels[prevRowStart + x] : 0;
      const c = (x >= channels && y > 0) ? pixels[prevRowStart + x - channels] : 0;

      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: return null;
      }
      pixels[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
  }

  return { width, height, channels, pixels };
}

function edgeStripStats(img, side, stripSize) {
  const { width, height, channels, pixels } = img;
  let sumR = 0, sumG = 0, sumB = 0, sumSqR = 0, sumSqG = 0, sumSqB = 0, count = 0;

  const sampleAt = (x, y) => {
    const idx = (y * width + x) * channels;
    const r = pixels[idx];
    const g = channels >= 2 ? pixels[idx + 1] : r;
    const b = channels >= 3 ? pixels[idx + 2] : r;
    sumR += r; sumG += g; sumB += b;
    sumSqR += r * r; sumSqG += g * g; sumSqB += b * b;
    count++;
  };

  if (side === 'top') {
    for (let y = 0; y < stripSize; y++) for (let x = 0; x < width; x++) sampleAt(x, y);
  } else if (side === 'bottom') {
    for (let y = height - stripSize; y < height; y++) for (let x = 0; x < width; x++) sampleAt(x, y);
  } else if (side === 'left') {
    for (let x = 0; x < stripSize; x++) for (let y = 0; y < height; y++) sampleAt(x, y);
  } else {
    for (let x = width - stripSize; x < width; x++) for (let y = 0; y < height; y++) sampleAt(x, y);
  }

  const meanR = sumR / count, meanG = sumG / count, meanB = sumB / count;
  const varR = sumSqR / count - meanR * meanR;
  const varG = sumSqG / count - meanG * meanG;
  const varB = sumSqB / count - meanB * meanB;
  return {
    stdDev: Math.sqrt(Math.max(0, (varR + varG + varB) / 3)),
    luminance: 0.299 * meanR + 0.587 * meanG + 0.114 * meanB,
  };
}

// Flags a border only when ALL FOUR edges are simultaneously flat-colored
// AND light — that specific combination is what a matted/framed border
// looks like. A real edge-to-edge painted scene would need pure coincidence
// on all four sides at once to trip this, which is why it's safe as a hard
// reject rather than just a warning.
function detectFlatBorder(imageBase64, mimeType) {
  if (!mimeType || !mimeType.includes('png')) {
    return { checked: false, hasBorder: false };
  }
  const img = decodePngPixels(Buffer.from(imageBase64, 'base64'));
  if (!img) {
    return { checked: false, hasBorder: false };
  }

  const stripSize = Math.max(6, Math.round(Math.min(img.width, img.height) * 0.03));
  const sides = ['top', 'bottom', 'left', 'right'].map(side => edgeStripStats(img, side, stripSize));
  const allFlat = sides.every(s => s.stdDev < 10);
  const allLight = sides.every(s => s.luminance > 195);

  return { checked: true, hasBorder: allFlat && allLight };
}

const MAX_IMAGE_ATTEMPTS = 3;

async function runImageEngine(answers) {
  const client = sanityClient();
  const voice = await client.fetch('*[_type == "tarotVoiceImage"][0]{fullText}');
  if (!voice || !voice.fullText) {
    throw new Error('tarotVoiceImage document not found in Sanity');
  }

  const visionApiKey = process.env.ANTHROPIC_API_KEY;
  if (!visionApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured (needed for the image-check backstop)');
  }

  const answerBlock = answers.map((a, i) => `${i + 1}. ${a.question}\n   ${a.answer}`).join('\n');
  const refImages = loadReferenceImages();
  const basePromptText = `${voice.fullText}\n\nHere are today's three raw answers:\n\n${answerBlock}\n\nGenerate one new image following every rule above. Hard requirement, checked automatically: the image itself must contain NO text, NO letters, NO numbers, and NO border or frame of any kind — not a card border, not a title, not a caption, nothing. Render only the painted scene, edge to edge. All of that (the card's name, its border) is added separately afterward by the website — if you include any of it, the image will be rejected.\n\nWatch for this specific trap: if one of today's answers literally names or strongly implies one of the four forbidden reference categories (a dinner table, a beach, a garage, a garden), do NOT paint that category directly just because the answer mentions it. Find a different concrete object or scene that the answer evokes some other way instead — something adjacent to it, not the setting itself. Example: an answer about the beach could become a sunburn peeling, a flip-flop half-buried in a truck bed, a jar of sand on a windowsill — not a person walking on a shoreline.`;

  let lastResult = null;
  let lastViolation = '';

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    const promptText = attempt === 1
      ? basePromptText
      : `${basePromptText}\n\nYour previous attempt was rejected: ${lastViolation}. Generate a genuinely different image that avoids that problem entirely — if it was rejected for recreating a forbidden reference scene, pick a completely different concrete subject, not just a different angle on the same setting.`;

    const parts = [
      { text: promptText },
      ...refImages.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
    ];

    const result = await callGemini(parts);
    const [visionCheck, pixelCheck] = await Promise.all([
      classifyImageViolations(visionApiKey, result.data, result.mimeType),
      Promise.resolve(detectFlatBorder(result.data, result.mimeType)),
    ]);

    if (!visionCheck.hasTextOrBorder && !visionCheck.matchesForbiddenScene && !pixelCheck.hasBorder) {
      return result;
    }

    lastResult = result;
    const reasons = [];
    if (pixelCheck.hasBorder) {
      reasons.push('direct pixel analysis of the image edges found a uniform flat-colored border/frame around it');
    }
    if (visionCheck.hasTextOrBorder) {
      reasons.push('the image contained visible text, numbers, or a border/frame, which is never allowed — those get added by the site afterward');
    }
    if (visionCheck.matchesForbiddenScene) {
      reasons.push(`the image recreated the forbidden "${visionCheck.forbiddenSceneName}" reference scene instead of inventing something new`);
    }
    lastViolation = reasons.join('; ');
  }

  throw new Error(
    `Generated image still failed the check after ${MAX_IMAGE_ATTEMPTS} attempts: ${lastViolation}. Last attempt mime type: ${lastResult && lastResult.mimeType}`
  );
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
