// Generate all timer voice announcements using ElevenLabs.
// Voice: Harry (Fierce Warrior), tuned for CrossFit coach-style energy.
// Run from the wod-board repo root:
//   node generate_timer_voices.js
// Requires ElevenLabs API key in ~/.claude/skills/speech-generator/scripts/.env
//
// To re-generate with different tuning, edit VOICE_SETTINGS below and re-run.
// To switch voice, edit VOICE_ID.

const fs = require('fs');
const path = require('path');

// Load .env from the speech-generator skill
const dotenv = require('C:/Users/User/.claude/skills/speech-generator/scripts/node_modules/dotenv');
dotenv.config({ path: 'C:/Users/User/.claude/skills/speech-generator/scripts/.env' });

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

const VOICE_ID = 'SOYHLrjzK2X1ezoPC6cr'; // Harry — Fierce Warrior
const MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = {
  stability: 0.20,         // low = more emotional variation
  similarity_boost: 0.70,  // keep voice identity
  style: 0.95,             // max expressive/CrossFit energy
  use_speaker_boost: true
};

const OUT_DIR = path.join(__dirname, 'sounds', 'voice');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════
// Cue list. CAPS + exclamation encourages more intense delivery.
// ═══════════════════════════════════════════════════════════════════
const CUES = [
  // Countdown to start
  { key: 'three',                text: 'Three!' },
  { key: 'two',                  text: 'Two!' },
  { key: 'one',                  text: 'One!' },
  { key: 'go',                   text: 'GO!' },

  // Warnings
  { key: 'ten_seconds',          text: 'Ten seconds!' },
  { key: 'one_minute_remaining', text: 'One minute remaining!' },
  { key: 'halfway',              text: 'HALFWAY!' },
  { key: 'last_round',           text: 'LAST ROUND!' },

  // End
  { key: 'time',                 text: 'TIME!' },

  // Tabata work/rest
  { key: 'work',                 text: 'WORK!' },
  { key: 'rest',                 text: 'Rest.' },

  // Round counter — round 1 starts with GO!, so calls run 2..15 (2026-07-27:
  // extended 8→15 per coach so long EMOM/interval blocks call every round).
  { key: 'round_two',            text: 'Round two!' },
  { key: 'round_three',          text: 'Round three!' },
  { key: 'round_four',           text: 'Round four!' },
  { key: 'round_five',           text: 'Round five!' },
  { key: 'round_six',            text: 'Round six!' },
  { key: 'round_seven',          text: 'Round seven!' },
  { key: 'round_eight',          text: 'Round eight!' },
  { key: 'round_nine',           text: 'Round nine!' },
  { key: 'round_ten',            text: 'Round ten!' },
  { key: 'round_eleven',         text: 'Round eleven!' },
  { key: 'round_twelve',         text: 'Round twelve!' },
  { key: 'round_thirteen',       text: 'Round thirteen!' },
  { key: 'round_fourteen',       text: 'Round fourteen!' },
  { key: 'round_fifteen',        text: 'Round fifteen!' },
];

async function generate(cue) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cue.text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS })
  });
  if (!r.ok) {
    console.error(`  ✗ ${cue.key}: HTTP ${r.status} — ${await r.text()}`);
    return false;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const out = path.join(OUT_DIR, cue.key + '.mp3');
  fs.writeFileSync(out, buf);
  console.log(`  ✓ ${cue.key.padEnd(24)} "${cue.text}"`.padEnd(60) + ` ${(buf.length / 1024).toFixed(1)} KB`);
  return true;
}

async function checkQuota() {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': API_KEY }});
  const d = await r.json();
  return { used: d.character_count, limit: d.character_limit };
}

(async () => {
  console.log(`Voice: Harry (${VOICE_ID})`);
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Settings: stability=${VOICE_SETTINGS.stability}, style=${VOICE_SETTINGS.style}`);
  console.log(`Output:   ${OUT_DIR}`);
  console.log('');

  const before = await checkQuota();
  console.log(`Quota before: ${before.used} / ${before.limit}`);
  console.log('');
  console.log('Generating cues:');

  // Idempotent by default: skip cues whose .mp3 already exists, so a re-run only
  // fills in NEW files (and never re-rolls existing audio, which is non-deterministic
  // at low stability). Pass --force to regenerate everything.
  const FORCE = process.argv.includes('--force');
  let ok = 0, skipped = 0;
  for (const cue of CUES) {
    if (!FORCE && fs.existsSync(path.join(OUT_DIR, cue.key + '.mp3'))) {
      console.log(`  · ${cue.key.padEnd(24)} (exists — skip)`);
      skipped++;
      continue;
    }
    const success = await generate(cue);
    if (success) ok++;
  }
  if (skipped) console.log(`  (${skipped} existing files skipped; use --force to regenerate)`);

  const after = await checkQuota();
  console.log('');
  console.log(`Generated:    ${ok} / ${CUES.length} files`);
  console.log(`Quota after:  ${after.used} / ${after.limit}  (used ${after.used - before.used} this run)`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
