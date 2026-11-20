/**
 * Deterministic Astro Match scoring (B6).
 *
 * The score is pure: the same two signs always give the same result, in either
 * order. AI must never compute or alter it; the AI layer only explains it.
 *
 * score = 60% aspect (angular distance between the signs)
 *       + 25% element harmony
 *       + 15% modality harmony
 *
 * Bump ALGORITHM_VERSION whenever any table or weight changes, so cached
 * results and AI explanations built on the old numbers are discarded.
 */
import {
  type Element,
  type Modality,
  type Sign,
  elementOf,
  modalityOf,
  signIndex,
} from "./zodiac";

export const ALGORITHM_VERSION = "1.0";

const WEIGHTS = { aspect: 0.6, element: 0.25, modality: 0.15 } as const;

export type AspectType =
  | "conjunction"
  | "semi_sextile"
  | "sextile"
  | "square"
  | "trine"
  | "quincunx"
  | "opposition";

/** Index = number of signs apart (0-6). */
const ASPECTS: ReadonlyArray<{ type: AspectType; score: number }> = [
  { type: "conjunction", score: 78 }, // same sign
  { type: "semi_sextile", score: 55 }, // neighbours
  { type: "sextile", score: 85 }, // compatible elements
  { type: "square", score: 42 }, // same modality, clashing elements
  { type: "trine", score: 95 }, // same element
  { type: "quincunx", score: 50 }, // little in common
  { type: "opposition", score: 72 }, // complementary opposites
];

/** Symmetric: keys are sorted alphabetically, joined by "-". */
const ELEMENT_HARMONY: Record<string, number> = {
  "fire-fire": 90,
  "earth-earth": 88,
  "air-air": 86,
  "water-water": 92,
  "air-fire": 85,
  "earth-water": 87,
  "earth-fire": 45,
  "air-water": 48,
  "fire-water": 40,
  "air-earth": 50,
};

const MODALITY_HARMONY: Record<string, number> = {
  "cardinal-cardinal": 55,
  "fixed-fixed": 50,
  "mutable-mutable": 75,
  "cardinal-fixed": 75,
  "cardinal-mutable": 80,
  "fixed-mutable": 70,
};

export type Band = "excellent" | "strong" | "moderate" | "challenging";

export function bandFor(score: number): Band {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "challenging";
}

export interface Trait {
  key: string;
  label: string;
}

export interface CompatibilityResult {
  score: number;
  band: Band;
  algorithmVersion: string;
  method: "sun_sign";
  signs: [Sign, Sign];
  breakdown: {
    aspect: { type: AspectType; signsApart: number; score: number; weight: number };
    element: { pair: [Element, Element]; score: number; weight: number };
    modality: { pair: [Modality, Modality]; score: number; weight: number };
  };
  strengths: Trait[];
  challenges: Trait[];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

export function signsApart(a: Sign, b: Sign): number {
  const diff = Math.abs(signIndex(a) - signIndex(b));
  return Math.min(diff, 12 - diff);
}

const STRENGTH_LABELS: Record<string, string> = {
  natural_understanding: "You instinctively understand each other",
  shared_values: "Shared core values and outlook",
  effortless_harmony: "Things tend to flow easily between you",
  easy_communication: "Easy, friendly communication",
  complementary_energy: "Your energies complement each other",
  strong_attraction: "Strong mutual attraction",
  shared_ambition: "Shared drive to start new things",
  loyalty: "Deep loyalty and commitment",
  adaptability: "Flexible and adaptable together",
  growth: "You help each other grow",
};

const CHALLENGE_LABELS: Record<string, string> = {
  mirror_flaws: "You may share the same blind spots",
  different_rhythms: "Different rhythms and priorities",
  friction: "Friction when you disagree",
  misunderstandings: "Prone to misunderstandings",
  opposing_views: "Opposing views on some things",
  power_struggles: "Both like to take the lead",
  stubbornness: "Neither likes to back down",
  restlessness: "Can lack stability together",
  impulse_vs_emotion: "Impulse versus emotional depth",
  practical_vs_abstract: "Practical versus abstract thinking",
  pace_mismatch: "Different pace in life",
  head_vs_heart: "Head versus heart",
  routine: "May settle into routine",
};

function trait(key: string, labels: Record<string, string>): Trait {
  return { key, label: labels[key] ?? key };
}

function uniq(keys: string[]): string[] {
  return Array.from(new Set(keys));
}

function deriveTraits(
  aspect: AspectType,
  elements: [Element, Element],
  modalities: [Modality, Modality],
): { strengths: string[]; challenges: string[] } {
  const strengths: string[] = [];
  const challenges: string[] = [];
  const elementPair = pairKey(elements[0], elements[1]);
  const sameModality = modalities[0] === modalities[1];

  switch (aspect) {
    case "conjunction":
      strengths.push("natural_understanding");
      challenges.push("mirror_flaws");
      break;
    case "semi_sextile":
      strengths.push("growth");
      challenges.push("different_rhythms");
      break;
    case "sextile":
      strengths.push("easy_communication");
      break;
    case "square":
      strengths.push("growth");
      challenges.push("friction");
      break;
    case "trine":
      strengths.push("effortless_harmony");
      break;
    case "quincunx":
      challenges.push("misunderstandings");
      break;
    case "opposition":
      strengths.push("strong_attraction");
      challenges.push("opposing_views");
      break;
  }

  if (elements[0] === elements[1]) strengths.push("shared_values");
  if (elementPair === "air-fire" || elementPair === "earth-water") {
    strengths.push("complementary_energy");
  }
  if (elementPair === "fire-water") challenges.push("impulse_vs_emotion");
  if (elementPair === "air-earth") challenges.push("practical_vs_abstract");
  if (elementPair === "earth-fire") challenges.push("pace_mismatch");
  if (elementPair === "air-water") challenges.push("head_vs_heart");

  if (sameModality && modalities[0] === "cardinal") {
    strengths.push("shared_ambition");
    challenges.push("power_struggles");
  }
  if (sameModality && modalities[0] === "fixed") {
    strengths.push("loyalty");
    challenges.push("stubbornness");
  }
  if (sameModality && modalities[0] === "mutable") {
    strengths.push("adaptability");
    challenges.push("restlessness");
  }
  if (!sameModality && modalities.includes("mutable")) strengths.push("adaptability");
  if (!sameModality && modalities.includes("fixed")) strengths.push("loyalty");

  // Every result shows at least one item on each side (F5 relies on this).
  if (challenges.length === 0) challenges.push("routine");

  return { strengths: uniq(strengths), challenges: uniq(challenges) };
}

export function computeCompatibility(a: Sign, b: Sign): CompatibilityResult {
  // Order the pair so (a, b) and (b, a) are computed identically.
  const [first, second] = signIndex(a) <= signIndex(b) ? [a, b] : [b, a];

  const apart = signsApart(first, second);
  const aspect = ASPECTS[apart];

  const elements: [Element, Element] = [elementOf(first), elementOf(second)];
  const modalities: [Modality, Modality] = [modalityOf(first), modalityOf(second)];

  const elementScore = ELEMENT_HARMONY[pairKey(elements[0], elements[1])];
  const modalityScore = MODALITY_HARMONY[pairKey(modalities[0], modalities[1])];

  const raw =
    aspect.score * WEIGHTS.aspect +
    elementScore * WEIGHTS.element +
    modalityScore * WEIGHTS.modality;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const traits = deriveTraits(aspect.type, elements, modalities);

  return {
    score,
    band: bandFor(score),
    algorithmVersion: ALGORITHM_VERSION,
    method: "sun_sign",
    signs: [first, second],
    breakdown: {
      aspect: {
        type: aspect.type,
        signsApart: apart,
        score: aspect.score,
        weight: WEIGHTS.aspect,
      },
      element: { pair: elements, score: elementScore, weight: WEIGHTS.element },
      modality: { pair: modalities, score: modalityScore, weight: WEIGHTS.modality },
    },
    strengths: traits.strengths.map((k) => trait(k, STRENGTH_LABELS)),
    challenges: traits.challenges.map((k) => trait(k, CHALLENGE_LABELS)),
  };
}
