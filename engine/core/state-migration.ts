import { generateSeed } from "./seeded-rng.ts";
import { CURRENT_STATE_SCHEMA_VERSION } from "./state.ts";
import { assertInteger, formatUnknown, isRecord } from "./typebox-validation.ts";

/**
 * Persisted state schema migration —— 项目宪章里唯一允许的兼容层。
 * 迁移链必须线性：每个函数只负责相邻版本 v_n -> v_{n+1}，禁止 O(n²) 迁移矩阵。
 * 这里只处理裸 record 形态；schema 校验由 parseStateSchema 在迁移之后负责。
 */
export function migrateRawGameState(raw: Record<string, unknown>): Record<string, unknown> {
  let current = structuredClone(raw);
  while (true) {
    const version = readRawSchemaVersion(current);
    if (version === CURRENT_STATE_SCHEMA_VERSION) {
      return current;
    }
    current = migrateOneSchemaVersion(current, version);
  }
}

function migrateOneSchemaVersion(
  raw: Record<string, unknown>,
  version: number,
): Record<string, unknown> {
  switch (version) {
    case 1:
      return migrateGameStateV1ToV2(raw);
    case 2:
      return migrateGameStateV2ToV3(raw);
    case 3:
      return migrateGameStateV3ToV4(raw);
    case 4:
      return migrateGameStateV4ToV5(raw);
    case 5:
      return migrateGameStateV5ToV6(raw);
    case 6:
      return migrateGameStateV6ToV7(raw);
    case 7:
      return migrateGameStateV7ToV8(raw);
    case 8:
      return migrateGameStateV8ToV9(raw);
    case 9:
      return migrateGameStateV9ToV10(raw);
    case 10:
      return migrateGameStateV10ToV11(raw);
    case 11:
      return migrateGameStateV11ToV12(raw);
    case 12:
      return migrateGameStateV12ToV13(raw);
    case 13:
      return migrateGameStateV13ToV14(raw);
    default:
      throw new Error(
        `不支持的 state schemaVersion: ${version}。当前支持逐步迁移到 ${CURRENT_STATE_SCHEMA_VERSION}。`,
      );
  }
}

function readRawSchemaVersion(raw: Record<string, unknown>): number {
  const meta = assertRecordForMigration(raw["meta"], "meta");
  return assertInteger(meta["schemaVersion"], "meta.schemaVersion");
}

function migrateGameStateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 2;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["turnLog"] = [];
  return next;
}

function migrateGameStateV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 3;
  const publicState = assertRecordForMigration(next["public"], "public");
  const rawTurnLog = Array.isArray(publicState["turnLog"]) ? publicState["turnLog"] : [];
  publicState["turnLog"] = rawTurnLog.filter(hasAdvancingTurnTime);
  return next;
}

function migrateGameStateV3ToV4(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 4;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["obligations"] = [];
  return next;
}

function migrateGameStateV4ToV5(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 5;
  const secrets = assertRecordForMigration(next["secrets"], "secrets");
  secrets["factionClocks"] = [];
  secrets["scheduledEvents"] = [];
  return next;
}

function migrateGameStateV5ToV6(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 6;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["hooks"] = [];
  return next;
}

function migrateGameStateV6ToV7(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 7;
  const secrets = assertRecordForMigration(next["secrets"], "secrets");
  secrets["actorAgendas"] = [];
  secrets["actorKnowledgeLenses"] = [];
  return next;
}

function migrateGameStateV7ToV8(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 8;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["relationshipSignals"] = [];
  const secrets = assertRecordForMigration(next["secrets"], "secrets");
  secrets["relationshipSignals"] = [];
  return next;
}

function migrateGameStateV8ToV9(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 9;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["actorImpressions"] = [];
  return next;
}

function migrateGameStateV9ToV10(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 10;
  meta["rngSeed"] = generateSeed();
  meta["rngCounter"] = 0;
  return next;
}

function migrateGameStateV10ToV11(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 11;
  const publicState = assertRecordForMigration(next["public"], "public");
  const actors = assertRecordForMigration(publicState["actors"], "public.actors");
  for (const [actorId, actorValue] of Object.entries(actors)) {
    const actor = assertRecordForMigration(actorValue, `public.actors.${actorId}`);
    const presentation = assertRecordForMigration(
      actor["presentation"],
      `public.actors.${actorId}.presentation`,
    );
    presentation["renderName"] = assertStringForMigration(
      presentation["displayName"],
      `public.actors.${actorId}.presentation.displayName`,
    );
  }
  return next;
}

// v11→v12: presentation.displayName 改名为 internalName（内部/绑定层标签，可含未公开真名）。
function migrateGameStateV11ToV12(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 12;
  const publicState = assertRecordForMigration(next["public"], "public");
  const actors = assertRecordForMigration(publicState["actors"], "public.actors");
  for (const [actorId, actorValue] of Object.entries(actors)) {
    const actor = assertRecordForMigration(actorValue, `public.actors.${actorId}`);
    const presentation = assertRecordForMigration(
      actor["presentation"],
      `public.actors.${actorId}.presentation`,
    );
    presentation["internalName"] = assertStringForMigration(
      presentation["displayName"],
      `public.actors.${actorId}.presentation.displayName`,
    );
    delete presentation["displayName"];
  }
  return next;
}

// v13: per-actor 侧表从 Array<{actorId,...}> 改为 Record<actorId, ...>，消除手动 join 与去重。
function migrateGameStateV12ToV13(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = 13;
  const publicState = assertRecordForMigration(next["public"], "public");
  publicState["actorImpressions"] = indexByActorId(
    publicState["actorImpressions"],
    "public.actorImpressions",
  );
  const secrets = assertRecordForMigration(next["secrets"], "secrets");
  secrets["actorAgendas"] = indexByActorId(secrets["actorAgendas"], "secrets.actorAgendas");
  secrets["actorKnowledgeLenses"] = indexByActorId(
    secrets["actorKnowledgeLenses"],
    "secrets.actorKnowledgeLenses",
  );
  return next;
}

// v14: secrets 侧的三张 per-actor 表（actorSecrets / actorAgendas / actorKnowledgeLenses）
// 收敛成单一聚合 actorStates: Record<actorId, { actorId, secrets?, agenda?, knowledgeLens? }>。
function migrateGameStateV13ToV14(raw: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(raw);
  const meta = assertRecordForMigration(next["meta"], "meta");
  meta["schemaVersion"] = CURRENT_STATE_SCHEMA_VERSION;
  const secrets = assertRecordForMigration(next["secrets"], "secrets");
  const actorStates: Record<string, Record<string, unknown>> = {};
  const bundleFor = (actorId: string): Record<string, unknown> => {
    const existing = actorStates[actorId];
    if (existing !== undefined) {
      return existing;
    }
    const fresh: Record<string, unknown> = { actorId };
    actorStates[actorId] = fresh;
    return fresh;
  };
  for (const [actorId, slots] of Object.entries(recordOrEmpty(secrets["actorSecrets"]))) {
    bundleFor(actorId)["secrets"] = slots;
  }
  for (const [actorId, agenda] of Object.entries(recordOrEmpty(secrets["actorAgendas"]))) {
    bundleFor(actorId)["agenda"] = agenda;
  }
  for (const [actorId, lens] of Object.entries(recordOrEmpty(secrets["actorKnowledgeLenses"]))) {
    bundleFor(actorId)["knowledgeLens"] = lens;
  }
  secrets["actorStates"] = actorStates;
  delete secrets["actorSecrets"];
  delete secrets["actorAgendas"];
  delete secrets["actorKnowledgeLenses"];
  return next;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function indexByActorId(value: unknown, fieldName: string): Record<string, unknown> {
  const rows = Array.isArray(value) ? value : [];
  const indexed: Record<string, unknown> = {};
  for (const row of rows) {
    const entry = assertRecordForMigration(row, `${fieldName}[]`);
    const actorId = assertStringForMigration(entry["actorId"], `${fieldName}[].actorId`);
    indexed[actorId] = entry;
  }
  return indexed;
}

function hasAdvancingTurnTime(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const time = value["time"];
  if (!isRecord(time)) {
    return false;
  }
  return time["kind"] === "elapsed" || time["kind"] === "travel";
}

function assertRecordForMigration(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`非法 ${fieldName}: ${formatUnknown(value)}。迁移需要对象。`);
  }
  return value;
}

function assertStringForMigration(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`非法 ${fieldName}: ${formatUnknown(value)}。迁移需要非空字符串。`);
  }
  return value;
}
