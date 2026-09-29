import { AuthError } from "../errors/AuthError";

/** Common English + Hinglish abusive terms blocked in chat. */
const BANNED_WORDS = [
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cock",
  "pussy",
  "slut",
  "whore",
  "cunt",
  "motherfucker",
  "mf",
  "stfu",
  "wtf",
  "idiot",
  "stupid",
  "dumbass",
  "retard",
  "nigger",
  "nigga",
  "chutiya",
  "chutia",
  "madarchod",
  "behenchod",
  "bhenchod",
  "bhosdike",
  "bhosdi",
  "randi",
  "harami",
  "kamina",
  "kutte",
  "kutta",
  "saala",
  "sala",
  "gandu",
  "gaand",
  "lund",
  "lawda",
  "lavda",
  "bsdk",
  "mc",
  "bc",
];

function normalizeForModeration(text: string): string {
  let normalized = text.toLowerCase();
  const leetMap: Record<string, string> = {
    "0": "o",
    "1": "i",
    "!": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    $: "s",
  };
  for (const [from, to] of Object.entries(leetMap)) {
    normalized = normalized.split(from).join(to);
  }
  return normalized.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function findAbusiveWord(text: string): string | null {
  const normalized = normalizeForModeration(text);
  if (!normalized) return null;

  const tokens = new Set(normalized.split(" ").filter(Boolean));
  for (const word of BANNED_WORDS) {
    if (tokens.has(word)) return word;
    // Catch glued forms like "youfuck"
    if (word.length >= 4 && normalized.includes(word)) return word;
  }
  return null;
}

export function assertMessageAllowed(text: string): void {
  const hit = findAbusiveWord(text);
  if (hit) {
    throw new AuthError(
      "Message blocked: abusive language is not allowed. Please rephrase.",
      400,
    );
  }
}
