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
export const config = { maxDuration: 280 };

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

// Real tarot ranks (14 per suit — Page and Knight both, not the standard
// playing-card "Jack"), picked here in code with genuine, evenly-weighted
// randomness. The model only ever invents the suit name; it never gets a
// chance to default to the same safe "six"/"seven" middle-of-the-deck bias
// that shows up when an LLM is asked to pick "something random" with no
// actual constraint. This guarantees the distribution — nothing left to
// hope a prompt achieves.
const TAROT_RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];

function pickRandomRank() {
  return TAROT_RANKS[Math.floor(Math.random() * TAROT_RANKS.length)];
}

// The original voice document specifies a rare exception, never coded until
// now: "a reading that touches all three answers at once can stand alone
// with just a name, no suit or number." Forcing a rank onto every single
// card (above) silently made this case impossible — a real side effect of
// that fix, not a decision anyone made on purpose. Restored the same way as
// everything else in this file: a genuine, code-level roll, not left to the
// model's own judgment about how rare "rare" should be. One in twenty
// matches the document's own sense of how often something like this
// happens elsewhere in the voice instructions.
const MAJOR_CARD_CHANCE = 1 / 20;

function isMajorCardDraw() {
  return Math.random() < MAJOR_CARD_CHANCE;
}

const RANK_ALTERNATION = TAROT_RANKS.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const LEADING_RANK_RE = new RegExp(`^\\s*(?:${RANK_ALTERNATION})\\s+of\\s+`, 'i');

function stripLeadingRankPrefix(suitName) {
  return suitName.replace(LEADING_RANK_RE, '').trim();
}

async function requestReadingFromClaude(apiKey, voiceText, userPrompt, rank) {
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

  // rank === null is the rare "name only" draw, already decided in code
  // before this call — Claude is asked for a plain cardName directly in
  // that case, not a suitName to be combined with a rank.
  if (rank === null) {
    if (typeof parsed.cardName !== 'string' || typeof parsed.reading !== 'string') {
      throw new Error(`Parsed JSON missing cardName/reading: ${JSON.stringify(parsed)}`);
    }
    return { cardName: stripLeadingRankPrefix(parsed.cardName.trim()), reading: parsed.reading };
  }

  if (typeof parsed.suitName !== 'string' || typeof parsed.reading !== 'string') {
    throw new Error(`Parsed JSON missing suitName/reading: ${JSON.stringify(parsed)}`);
  }

  // The voice document's own examples show full "Rank of Suit" names, so
  // Claude often echoes a rank back as part of its own suitName too (e.g.
  // "Seven of Overgrown Pond" instead of just "Overgrown Pond") — and not
  // always the assigned rank; it can invent a different one entirely.
  // Stripped against the full rank list, not just the assigned rank, in
  // code rather than trusted to a prompt instruction — same reasoning as
  // picking the rank in code to begin with.
  const cleanSuit = stripLeadingRankPrefix(parsed.suitName);

  // Rank is never taken from the model's own output — it was already
  // decided in code before this call. Combined here, not trusted from
  // whatever the model echoed back, so the guarantee holds regardless of
  // what the model does with the rest of its answer.
  return { cardName: `${rank} of ${cleanSuit}`, reading: parsed.reading };
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

  const isMajor = isMajorCardDraw();
  const rank = isMajor ? null : pickRandomRank();
  const answerBlock = answers.map((a, i) => `${i + 1}. ${a.question}\n   ${a.answer}`).join('\n');
  const basePrompt = isMajor
    ? `Here are the three raw answers for this reading:\n\n${answerBlock}\n\nThis is one of the rare cards, already decided before you were asked to write anything: it stands alone with just a name — no rank, no suit, no number. This is the "name only" case the voice instructions describe, for a reading that touches all three answers at once. Write a reading that genuinely braids all three answers together, rather than seizing on just one the way most readings do. Then invent a single cardName for it, pulled directly from the image the reading produces — as specific and absurd as possible, but with no rank word anywhere in it (not "Six", not "Queen", not any of the fourteen) and no "of" structure. Just a name on its own, e.g. "The Overgrown Pond" or "Somebody Else's Casserole".\n\nBefore finalizing, check: does your reading contain any of the literal words (or obvious synonyms/variants of the specific noun) from any of the three answers above? If yes, that breaks the "never name the specific noun or object back" rule from the voice instructions — rewrite the reading so it doesn't, then check again. Only output the final, already-checked version.\n\nRespond with ONLY valid JSON, no other text, no code fences, in exactly this shape:\n{"cardName": "...", "reading": "..."}`
    : `Here are the three raw answers for this reading:\n\n${answerBlock}\n\nThis card's rank has already been decided, before you were asked to write anything: it is the ${rank}. Do not invent a different rank or number, and do not second-guess it. suitName must be ONLY the invented suit/object name itself (e.g. "Overgrown Pond", "Idling Engines") — as specific and absurd as possible, exactly the way the voice instructions describe naming a card. Do not prefix it with a rank — not "${rank}", not any other rank word (Ace, Two through Ten, Page, Knight, Queen, King), and not the word "of" at the start. The website builds the final name as "${rank} of [your suitName]" automatically — your own suitName output must never contain a rank at all, only the suit half.\n\nBefore finalizing, check: does your reading contain any of the literal words (or obvious synonyms/variants of the specific noun) from any of the three answers above? If yes, that breaks the "never name the specific noun or object back" rule from the voice instructions — rewrite the reading so it doesn't, then check again. Only output the final, already-checked version.\n\nRespond with ONLY valid JSON, no other text, no code fences, in exactly this shape:\n{"suitName": "...", "reading": "..."}`;

  let lastResult = null;
  let lastViolations = [];

  for (let attempt = 1; attempt <= MAX_NAMING_ATTEMPTS; attempt++) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous attempt still named these literal words back: ${lastViolations.join(', ')}. That is not allowed. Write a genuinely different reading that avoids every one of those words (and their obvious variants) entirely.`;

    const result = await requestReadingFromClaude(apiKey, voice.fullText, prompt, rank);
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

// Real evidence from today's testing: successful Gemini image generations
// on this prompt regularly took 60-90+ seconds, well past the 40s this was
// previously tightened to (to make room for more retries within one
// request's overall budget). That tradeoff was a mistake — it meant this
// code was routinely killing generations that were still working and would
// have succeeded. Raised back up to match real observed latency, not a
// guess. The other half of that fix is below: a single slow attempt no
// longer burns the whole request, so raising this doesn't cost as many
// retries as it used to.
const GEMINI_TIMEOUT_MS = 90000;

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
    GEMINI_TIMEOUT_MS
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
    const finishReason = data.candidates[0].finishReason;
    const safetyRatings = data.candidates[0].safetyRatings;
    const promptFeedback = data.promptFeedback;
    const err = new Error(
      `Gemini returned no image. finishReason: ${finishReason}. promptFeedback: ${JSON.stringify(promptFeedback)}. safetyRatings: ${JSON.stringify(safetyRatings)}. Text response: ${textPart ? textPart.text : '(none)'}`
    );
    err.isNoImageReturned = true; // lets callers retry this specific failure fast, outside the content-quality attempt budget
    throw err;
  }

  const inline = imagePart.inlineData || imagePart.inline_data;
  return { mimeType: inline.mimeType || inline.mime_type, data: inline.data };
}

// The "no image at all" failure (as opposed to a real content-quality
// rejection) showed up in testing on completely neutral inputs, with no
// clear content-based cause — worth treating as a possible transient API
// hiccup rather than immediately burning one of the 3 content-quality
// attempts on it. One immediate, fast retry, same parts, no backoff.
async function callGeminiWithFastRetry(parts) {
  try {
    return await callGemini(parts);
  } catch (err) {
    if (!err.isNoImageReturned) throw err;
    console.error('Gemini returned no image on first try, retrying once immediately:', err.message);
    return await callGemini(parts);
  }
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
    // Highest channel minus lowest — near zero for a neutral gray/cream/white
    // mat, meaningfully higher for anything actually painted in color. The
    // voice instructions require rich, saturated color everywhere in the
    // image, so a flat AND colorless edge is never a legitimate painted
    // scene — it's a mat, whatever its exact brightness.
    chroma: Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB),
  };
}

// Flags a border when ALL FOUR edges are simultaneously flat-colored AND
// either light or colorless (low chroma) — that combination is what a
// matted/framed border looks like, a light photo-frame mat or a duller
// neutral gray/cream one alike. A real edge-to-edge painted scene would
// need pure coincidence on all four sides at once to trip this, which is
// why it's safe as a hard reject rather than just a warning.
//
// The "light" check alone missed a real mat in production testing — its
// luminance measured ~184, just under the >195 cutoff, because it wasn't
// pure white, just an off-white/gray canvas tone. Its chroma (~10) gave it
// away instead: virtually colorless, unlike every legitimately painted
// edge in this card set, which always carries real hue even when dark.
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
  const allColorless = sides.every(s => s.chroma < 25);

  return { checked: true, hasBorder: allFlat && (allLight || allColorless) };
}

// Real production logs show the model's per-attempt failure rate on the
// text/border check is high enough that 3 attempts isn't a reliable
// budget — the check itself has never let a bad image through, the
// problem is running out of tries. Raised from 3: if per-attempt failure
// is roughly p, total failure is p^N, so doubling N here is a real,
// compounding improvement, not a hopeful prompt tweak.
//
// This is a ceiling, not a guarantee — ENGINE_TIME_BUDGET_MS below is what
// actually decides whether another attempt is safe to start, now that each
// one can legitimately take up to GEMINI_TIMEOUT_MS.
const MAX_IMAGE_ATTEMPTS = 6;

// The function itself gets killed outright (config.maxDuration, 280s) if a
// request runs past this — not a graceful error, just a dead connection.
// Before starting another attempt, check whether there's realistically
// enough time left for one to finish (worst case: a full GEMINI_TIMEOUT_MS
// Gemini call plus a slower vision check plus margin) — if not, stop and
// return a real, honest error instead of gambling on a hard kill.
const ENGINE_TIME_BUDGET_MS = 260000; // 20s under maxDuration for the Sanity fetch, response serialization, etc.
const WORST_CASE_ATTEMPT_MS = GEMINI_TIMEOUT_MS + 35000; // one Gemini call + vision check + slack

// Same lesson as the rank fix above: a model asked to "vary itself" across
// independent calls doesn't reliably self-balance — nudged toward "comic,"
// it drifts to comic on every single card in a row instead of staying a
// genuine mix. Picking the register here, in code, before the model ever
// sees the prompt, guarantees real variety across a batch of cards the
// same way random rank selection guaranteed real variety across ranks —
// nothing left to hope the model does on its own.
const IMAGE_STYLE_REGISTERS = [
  {
    name: 'uncanny-painterly',
    instruction: `Render this specific card in a painterly, illustrative register — closer to a serious gallery painting than a joke. Subtly uncanny and atmospheric: a little strange, restrained, mood and composition doing the work rather than any punchline. Still warm and richly colored, never haunted-house dark or desaturated — just quieter and more serious than a comic scene, the strangeness felt rather than played for laughs.`,
  },
  {
    name: 'comical',
    instruction: `Render this specific card in a warm, comical register — playful, funny, a little absurd in what's actually depicted: the pose, the situation, the juxtaposition of objects. The humor should come from the scene itself, not from a flattened cartoon or comic-strip drawing style — this is still a real painted illustration, rendered with the same weight, texture, and color richness as anything else, simply funnier in content.`,
  },
];

function pickRandomStyleRegister() {
  return IMAGE_STYLE_REGISTERS[Math.floor(Math.random() * IMAGE_STYLE_REGISTERS.length)];
}

// Real evidence from a retest batch: when an answer sits directly on top of
// one of the four forbidden reference scenes (e.g. "never mowing the lawn"
// for garden, "my aunt, at a crawfish boil" for dinner table), the model
// kept painting the literal forbidden scene across all 6 real attempts —
// generic wording telling it to "pick something different" wasn't enough
// friction against a strongly-associated answer. Same fix as the rank and
// style-register problems: don't just ask the model to invent its own way
// out and hope, hand it an actual concrete alternative chosen in code.
// These keyword lists and idea lists are deliberately blunt, not clever —
// false positives just mean a card gets extra, harmless steering it didn't
// strictly need; false negatives are the real risk, so it's fine to
// overmatch a little.
const FORBIDDEN_SCENES = {
  'dinner table': {
    keywords: ['dinner', 'supper', 'the table', 'family meal', 'family dinner', 'sunday dinner', 'feast', 'potluck', 'thanksgiving', 'crawfish boil', 'casserole', 'place setting', 'tablecloth', 'mealtime'],
    safeIdeas: [
      'a single fork left standing upright in a half-eaten pie, no table visible',
      'a casserole dish cooling alone on a porch rail',
      'a stack of paper plates blown into a ditch after the party is over',
      'a lone folding chair left out overnight with a plate balanced on the arm',
    ],
  },
  'beach walk': {
    keywords: ['beach', 'ocean', 'shore', 'shoreline', 'seaside', 'boardwalk', 'the tide', 'the waves', 'the surf'],
    safeIdeas: [
      'a sunburn peeling on someone\'s shoulder, seen inside a truck cab',
      'a flip-flop half-buried in a truck bed',
      'a jar of sand sitting on a windowsill',
      'a beach towel drying on a porch rail, no ocean anywhere in view',
    ],
  },
  garage: {
    keywords: ['garage', 'mechanic', 'engine repair', 'workshop', 'tool bench', 'car repair', 'oil change', 'the wrench'],
    safeIdeas: [
      'a single wrench left sitting on a porch step',
      'a car battery sitting alone at the curb',
      'an oil-stained rag hanging off a fence post',
      'a jack stand abandoned in tall grass',
    ],
  },
  garden: {
    keywords: ['garden', 'the yard', 'the lawn', 'mowing', 'mow the', 'flower bed', 'flowerbed', 'planting', 'weeding', 'backyard', 'gardening', 'the grass'],
    safeIdeas: [
      'a single garden glove draped over a fence post, no yard visible',
      'a rusted watering can tipped over on a porch',
      'a pair of muddy boots left by a back door',
      'a wheelbarrow parked crooked against a shed wall, weeds growing up through its wheel',
    ],
  },
};

function pickSafeIdea(category) {
  const ideas = FORBIDDEN_SCENES[category].safeIdeas;
  return ideas[Math.floor(Math.random() * ideas.length)];
}

// Pre-generation check against the raw answers, not the model's output —
// catches the collision before the first attempt is even made, instead of
// waiting to discover it after a wasted generation.
function detectForbiddenSceneRisk(answers) {
  const combinedText = answers.map(a => a.answer).join(' \n ').toLowerCase();
  const hits = [];
  for (const [category, { keywords }] of Object.entries(FORBIDDEN_SCENES)) {
    const matched = keywords.find(kw => combinedText.includes(kw));
    if (matched) hits.push({ category, matched });
  }
  return hits;
}

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
  const styleRegister = pickRandomStyleRegister();

  // Real evidence: answers that sit directly on top of a forbidden scene
  // (a lawn-mowing answer for "garden", a crawfish-boil answer for "dinner
  // table") made the model paint the literal forbidden scene across all 6
  // real attempts, even with the general warning below already in place.
  // When that collision is detected up front, hand the model an actual
  // concrete alternative chosen in code, right from attempt 1 — not just a
  // stronger version of the same generic instruction it already ignored.
  const sceneRisk = detectForbiddenSceneRisk(answers);
  const collisionWarning = sceneRisk.length
    ? `\n\nCOLLISION WARNING FOR TODAY'S ANSWERS SPECIFICALLY: ${sceneRisk.map(({ category, matched }) =>
        `one of today's answers ("${matched}") sits very close to the forbidden "${category}" scene. Do not paint anything resembling ${category} in response to it. Concrete starting idea for this specific card, already chosen for you — you may adapt it, but do not default back to the literal ${category} scene instead: ${pickSafeIdea(category)}.`
      ).join(' ')}`
    : '';

  const basePromptText = `${voice.fullText}\n\nHere are today's three raw answers:\n\n${answerBlock}\n\nGenerate one new image following every rule above. Hard requirement, checked automatically: the image itself must contain NO text, NO letters, NO numbers, and NO border or frame of any kind — not a card border, not a title, not a caption, nothing. Render only the painted scene, edge to edge. All of that (the card's name, its border) is added separately afterward by the website — if you include any of it, the image will be rejected.\n\nWatch for this specific trap: if one of today's answers literally names or strongly implies one of the four forbidden reference categories (a dinner table, a beach, a garage, a garden), do NOT paint that category directly just because the answer mentions it. Find a different concrete object or scene that the answer evokes some other way instead — something adjacent to it, not the setting itself. Example: an answer about the beach could become a sunburn peeling, a flip-flop half-buried in a truck bed, a jar of sand on a windowsill — not a person walking on a shoreline.${collisionWarning}\n\nSTYLE FOR THIS SPECIFIC CARD, already decided, not yours to choose: ${styleRegister.instruction}\n\nColor and tone, applies no matter which style above: warm and vivid, bright and lively, not dark or heavy. Do NOT default to gray, beige, sepia, faded, dim lighting, or a muted horror-movie palette — that is a real, common mistake this exact model makes whenever a scene feels the least bit odd or uncanny, pulling toward gloom by association. Resist that pull. Look at the actual saturation in the four reference images attached to this request — deep golds, saturated oranges, rich greens, vivid blues — that is the target, not a desaturated version of it. If a choice must be made between "more haunted/somber" and "more warm and vivid," always choose warm and vivid.\n\nDo not drop any of the three answers just because one is harder to render than the others — this applies especially when an answer names a real person: represent that answer's influence obliquely (an object tied to them, a silhouette, an instrument, a mood) rather than omitting it from the image entirely. All three answers must leave a real trace in the final image.\n\nIf an answer names a real brand, company, or product (a store name, a logo, a chain), do NOT render its actual logo, mascot, or signage text — that counts as text on the image and will be rejected same as any other text. Represent it obliquely instead: its color palette, the general feeling of the place, an unbranded stand-in object.\n\nConfirmed real problem in testing, not theoretical: roadside/gas-station/motel-type scenes keep growing a lit sign or storefront sign with readable letters on it, even with no brand named. Any building, vehicle, or storefront in the scene must have blank, worn, or turned-away signage — no legible words anywhere, not even an invented placeholder word. Also do not add a stylized artist signature or initials in a corner, the way a painter signs a canvas — that is text too and will be rejected.

FINAL RULE, ABSOLUTE, NO EXCEPTIONS: ABSOLUTELY NO text, letters, numbers, signage, or writing of any kind, anywhere in the image, under any circumstances — this includes signs, labels, tags, price stickers, license plates, book/magazine covers, screens, gauges, clocks, graffiti, embroidery, or writing reflected in glass or water. Every single generation gets checked by software for this specific thing and is thrown away and regenerated if it fails. If you are even slightly unsure whether something you're about to paint counts as text, leave it out.

SECOND FINAL RULE, ABSOLUTE, NO EXCEPTIONS: if any of today's three answers resembles a dinner table, a beach, a garage, or a garden scene, you MUST transform it into a genuinely different concrete scene that captures the same feeling — never paint the literal forbidden scene itself, no exceptions, even if the answer names it directly or seems to leave no other option. Every single generation gets checked by software for exactly this and is thrown away and regenerated if it fails. Find the adjacent object or moment instead of the setting itself.`;

  const engineStart = Date.now();
  let lastResult = null;
  let lastViolation = '';
  let lastForbiddenCategory = '';

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    // Real evidence from today's testing: a slow or failed connection to
    // Gemini on a single attempt used to crash this whole function
    // immediately, skipping every remaining attempt — the retry loop below
    // only ever caught content-quality rejections (a bad scene, a visible
    // border), never a transport failure. That's the real cause behind
    // "operation was aborted" reaching visitors: it wasn't attempt 6 of 6
    // failing, it was attempt 1 of 6 failing and the other 5 never running.
    // Both the Gemini call and the post-generation checks are wrapped here
    // so any failure — timeout, a malformed response, a safety block —
    // consumes one attempt and moves on, the same as a content rejection
    // already did.
    if (attempt > 1 && Date.now() - engineStart + WORST_CASE_ATTEMPT_MS > ENGINE_TIME_BUDGET_MS) {
      throw new Error(
        `Ran out of safe time budget before attempt ${attempt} of ${MAX_IMAGE_ATTEMPTS} (this function gets killed outright past ${ENGINE_TIME_BUDGET_MS}ms). Last problem: ${lastViolation || '(first attempt never completed)'}`
      );
    }

    // Same lesson as the pre-generation collision warning above: after an
    // actual forbidden-scene rejection, don't just repeat "pick something
    // different" and hope harder — hand it a fresh, concrete, code-picked
    // alternative for that exact category. A different idea than any
    // pre-generation suggestion, or than a previous retry's, since it's
    // picked fresh from the list each time.
    const retryFeedback = lastForbiddenCategory
      ? `Your previous attempt was rejected: ${lastViolation}. You painted the literal "${lastForbiddenCategory}" scene again — stop defaulting to it. Concrete alternative idea for this retry, already chosen for you — you may adapt it, but do not paint ${lastForbiddenCategory} instead: ${pickSafeIdea(lastForbiddenCategory)}.`
      : `Your previous attempt was rejected: ${lastViolation}. Generate a genuinely different image that avoids that problem entirely.`;

    const promptText = attempt === 1
      ? basePromptText
      : `${basePromptText}\n\n${retryFeedback}`;

    const parts = [
      { text: promptText },
      ...refImages.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
    ];

    let result;
    try {
      result = await callGeminiWithFastRetry(parts);
    } catch (err) {
      lastViolation = `the image generation call itself failed: ${err.message}`;
      continue;
    }

    let visionCheck, pixelCheck;
    try {
      [visionCheck, pixelCheck] = await Promise.all([
        classifyImageViolations(visionApiKey, result.data, result.mimeType),
        Promise.resolve(detectFlatBorder(result.data, result.mimeType)),
      ]);
    } catch (err) {
      lastResult = result;
      lastViolation = `the post-generation check itself failed: ${err.message}`;
      continue;
    }

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
    // Only trusted as a target for the next retry's concrete suggestion
    // when it's one of the four categories this code actually has safe
    // ideas for — the vision model's own wording could in principle drift,
    // and a lookup on an unrecognized category would throw.
    if (visionCheck.matchesForbiddenScene && FORBIDDEN_SCENES[visionCheck.forbiddenSceneName]) {
      reasons.push(`the image recreated the forbidden "${visionCheck.forbiddenSceneName}" reference scene instead of inventing something new`);
      lastForbiddenCategory = visionCheck.forbiddenSceneName;
    } else {
      if (visionCheck.matchesForbiddenScene) {
        reasons.push(`the image recreated a forbidden reference scene ("${visionCheck.forbiddenSceneName}")`);
      }
      lastForbiddenCategory = '';
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
  if (engine !== 'text' && engine !== 'image') {
    return res.status(400).json({ error: 'engine must be "text" or "image"' });
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
