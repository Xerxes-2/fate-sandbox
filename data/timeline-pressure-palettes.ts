import type { TimelineId } from "../engine/core/state.ts";

const SHORT_COOLDOWN_TURNS = 1;
const DEFAULT_COOLDOWN_TURNS = 2;
const LONG_COOLDOWN_TURNS = 3;

export interface TimelinePressureSlot {
  id: string;
  timelineId: TimelineId;
  label: string;
  pressureType: string;
  actorOrFactionHints: string[];
  playerSafeProjectionKinds: string[];
  cooldownTurns: number;
  forbiddenWhen: string[];
}

const TIMELINE_PRESSURE_PALETTES: readonly TimelinePressureSlot[] = [
  {
    id: "fsn-night-servant-scouting",
    timelineId: "fsn",
    label: "Night Servant scouting",
    pressureType: "servant-autonomy",
    actorOrFactionHints: ["Lancer", "Rider", "Caster", "Assassin", "unidentified Servant"],
    playerSafeProjectionKinds: [
      "distant trace",
      "damaged boundary",
      "witness gap",
      "mana aftertaste",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current beat forbids Servant pressure", "player is in a purely OOC/meta turn"],
  },
  {
    id: "fsn-school-daily-fracture",
    timelineId: "fsn",
    label: "School daily life fracture",
    pressureType: "civilian-society",
    actorOrFactionHints: ["Homurahara students", "teachers", "ordinary witnesses"],
    playerSafeProjectionKinds: [
      "attendance oddity",
      "club schedule shift",
      "rumor",
      "route closure",
    ],
    cooldownTurns: SHORT_COOLDOWN_TURNS,
    forbiddenWhen: ["current location is far outside Fuyuki daily-life space"],
  },
  {
    id: "fsn-three-families-positioning",
    timelineId: "fsn",
    label: "Three Families positioning",
    pressureType: "mage-association-politics",
    actorOrFactionHints: ["Tohsaka", "Matou", "Einzbern", "Church supervisor"],
    playerSafeProjectionKinds: ["invitation", "closed gate", "familiar trace", "formal warning"],
    cooldownTurns: LONG_COOLDOWN_TURNS,
    forbiddenWhen: ["route facts are not established enough to name a family actor"],
  },
  {
    id: "fz-modern-assassination-prep",
    timelineId: "fz",
    label: "Modern assassination prep",
    pressureType: "covert-violence",
    actorOrFactionHints: ["Kiritsugu", "Maiya", "Assassin network", "mercenary assets"],
    playerSafeProjectionKinds: ["sightline problem", "destroyed device", "safehouse compromise"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current window forbids lethal pressure"],
  },
  {
    id: "fz-workshop-defense",
    timelineId: "fz",
    label: "Workshop defense adjustment",
    pressureType: "magecraft-infrastructure",
    actorOrFactionHints: ["magus workshop", "bounded field", "familiars", "family retainers"],
    playerSafeProjectionKinds: ["new ward", "blocked route", "familiar remains", "ritual residue"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["no tracked workshop or territory exists"],
  },
  {
    id: "fsf-institutional-line",
    timelineId: "fsf",
    label: "Institutional line",
    pressureType: "authority-surveillance",
    actorOrFactionHints: ["Orlando", "Clan Calatin", "Faldeus", "police command"],
    playerSafeProjectionKinds: ["route check", "public cordon", "interview request", "camera gap"],
    cooldownTurns: LONG_COOLDOWN_TURNS,
    forbiddenWhen: ["latest pressure type was authority-surveillance without novelty"],
  },
  {
    id: "fsf-land-myth-aftermath",
    timelineId: "fsf",
    label: "Land and myth aftermath",
    pressureType: "territory-environment",
    actorOrFactionHints: ["Tine", "Gilgamesh", "Enkidu", "land guardian"],
    playerSafeProjectionKinds: [
      "weather anomaly",
      "animal silence",
      "crater rumor",
      "spiritual pressure",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current scope forbids myth-scale aftershock"],
  },
  {
    id: "fsf-abnormal-master-servant",
    timelineId: "fsf",
    label: "Abnormal Master/Servant line",
    pressureType: "servant-autonomy",
    actorOrFactionHints: ["Flat", "Jack", "Tsubaki", "Pale Rider", "Sigma", "Watcher"],
    playerSafeProjectionKinds: [
      "dream bleed",
      "wrong witness",
      "mercenary movement",
      "inhuman trace",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["player-safe projection would reveal an unrevealed true name"],
  },
  {
    id: "fsf-church-observation",
    timelineId: "fsf",
    label: "Church observation",
    pressureType: "church-supervision",
    actorOrFactionHints: ["Hansa", "Church supervisor", "executor"],
    playerSafeProjectionKinds: ["warning", "shelter offer", "interrogation", "blessed trace"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["Church presence has not been established in this campaign"],
  },
  {
    id: "extra-round-deadline",
    timelineId: "extra",
    label: "Round deadline",
    pressureType: "system-deadline",
    actorOrFactionHints: ["Moon Cell", "opposing Master", "arena gate"],
    playerSafeProjectionKinds: ["timer", "permission hint", "route lock", "rule warning"],
    cooldownTurns: SHORT_COOLDOWN_TURNS,
    forbiddenWhen: ["campaign premise is not a Moon Cell tournament"],
  },
  {
    id: "extra-opponent-scouting",
    timelineId: "extra",
    label: "Opponent scouting",
    pressureType: "servant-autonomy",
    actorOrFactionHints: ["opposing Master", "opposing Servant", "school shell NPC"],
    playerSafeProjectionKinds: [
      "arena trace",
      "library access",
      "infirmary rumor",
      "supply pressure",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["no opponent slot exists yet"],
  },
  {
    id: "extra-ccc-labyrinth-shift",
    timelineId: "extra-ccc",
    label: "Sakura Labyrinth shift",
    pressureType: "labyrinth-anomaly",
    actorOrFactionHints: ["BB side", "Sentinel", "Alter Ego", "Sakura Labyrinth"],
    playerSafeProjectionKinds: [
      "floor change",
      "privacy breach",
      "permission loss",
      "safe-route expiry",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current beat is outside the Far Side anomaly"],
  },
  {
    id: "extra-ccc-old-school-barrier",
    timelineId: "extra-ccc",
    label: "Old School Building barrier upkeep",
    pressureType: "safe-base-upkeep",
    actorOrFactionHints: ["student council", "Sakura", "old school building"],
    playerSafeProjectionKinds: ["resource request", "barrier flicker", "NPC permission conflict"],
    cooldownTurns: SHORT_COOLDOWN_TURNS,
    forbiddenWhen: ["old school building is not established as base"],
  },
  {
    id: "case-files-clock-tower-politics",
    timelineId: "case-files",
    label: "Clock Tower politics",
    pressureType: "mage-association-politics",
    actorOrFactionHints: ["El-Melloi classroom", "noble faction", "patent holder"],
    playerSafeProjectionKinds: ["summons", "debt pressure", "withheld access", "auction clue"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["case is not connected to mage society"],
  },
  {
    id: "case-files-ritual-logic",
    timelineId: "case-files",
    label: "Ritual-structure flaw",
    pressureType: "magecraft-infrastructure",
    actorOrFactionHints: ["ritual owner", "Mystic Code", "family foundation"],
    playerSafeProjectionKinds: ["contradictory trace", "medium damage", "bounded-field seam"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["no mystery structure has been introduced"],
  },
  {
    id: "mahoyo-territory-upkeep",
    timelineId: "mahoyo",
    label: "Misaki territory upkeep",
    pressureType: "territory-environment",
    actorOrFactionHints: ["Aoko", "Alice", "mansion bounded field", "leyline"],
    playerSafeProjectionKinds: ["familiar behavior", "ward strain", "town route anomaly"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current premise is not Misaki territory management"],
  },
  {
    id: "kara-urban-anomaly",
    timelineId: "kara-no-kyoukai",
    label: "Urban anomaly case",
    pressureType: "occult-contagion",
    actorOrFactionHints: ["Garan no Dou", "Touko", "Kokutou", "Shiki"],
    playerSafeProjectionKinds: ["commission", "police rumor", "abnormal body trace", "origin echo"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current premise is ordinary Fate Grail War"],
  },
  {
    id: "tsukihime-night-predation",
    timelineId: "tsukihime-2000",
    label: "Night predation trace",
    pressureType: "occult-contagion",
    actorOrFactionHints: ["Dead Apostle", "Church executor", "Tohno household"],
    playerSafeProjectionKinds: ["bloodless rumor", "night route closure", "executor warning"],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["vampire ecology has not been established"],
  },
  {
    id: "tsukihime-remake-city-disaster",
    timelineId: "tsukihime-2021",
    label: "Souya city disaster pressure",
    pressureType: "authority-surveillance",
    actorOrFactionHints: ["Church executor", "Dead Apostle incident", "city emergency services"],
    playerSafeProjectionKinds: [
      "public hazard",
      "evacuation route",
      "executor trace",
      "hospital pressure",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["current premise uses old Tsukihime continuity"],
  },
  {
    id: "apocrypha-war-front",
    timelineId: "apocrypha",
    label: "Great War front movement",
    pressureType: "faction-war-front",
    actorOrFactionHints: ["Black faction", "Red faction", "homunculi", "Ruler"],
    playerSafeProjectionKinds: [
      "frontline report",
      "supply demand",
      "homunculus risk",
      "fortress movement",
    ],
    cooldownTurns: DEFAULT_COOLDOWN_TURNS,
    forbiddenWhen: ["campaign is not a Great Holy Grail War"],
  },
];

export function getTimelinePressureSlots(timelineId: TimelineId): TimelinePressureSlot[] {
  return TIMELINE_PRESSURE_PALETTES.filter((slot) => slot.timelineId === timelineId).map(cloneSlot);
}

function cloneSlot(slot: TimelinePressureSlot): TimelinePressureSlot {
  return {
    ...slot,
    actorOrFactionHints: [...slot.actorOrFactionHints],
    playerSafeProjectionKinds: [...slot.playerSafeProjectionKinds],
    forbiddenWhen: [...slot.forbiddenWhen],
  };
}
