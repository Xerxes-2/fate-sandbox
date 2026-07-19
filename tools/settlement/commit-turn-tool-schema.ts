import { Type } from "typebox";

/**
 * Model-facing schema for commit_turn's heterogeneous event list.
 *
 * The discriminator-dependent parser remains the authoritative validator. This
 * schema deliberately keeps dependent fields optional so the model receives one
 * readable object shape instead of an anyOf forest, while still exposing every
 * nested field it may need to generate.
 */
export function commitTurnEventsToolSchema(): ReturnType<typeof Type.Array> {
  return Type.Array(
    Type.Object({
      kind: Type.String({
        description:
          "事件领域：scene / scene-presence / actor-condition / servant-form / economy / memory",
      }),
      event: turnEventPayloadSchema(),
    }),
  );
}

function turnEventPayloadSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    kind: Type.Optional(
      Type.String({
        description: `${eventKindDescription()} 仅 scene-presence 领域省略此字段。`,
      }),
    ),
    reason: Type.Optional(Type.String({ description: "事件原因；省略时继承本轮 summary" })),

    // scene / memory common fields
    title: Type.Optional(Type.String()),
    summary: Type.Optional(
      Type.String({ description: "add-objective / add-threat / memory 事件的摘要" }),
    ),
    outcome: Type.Optional(
      Type.String({
        description: "complete-beat 结果文本，或 resolve-condition 的 recovered / stabilized",
      }),
    ),
    consequences: Type.Optional(Type.Array(Type.String())),
    claims: Type.Optional(Type.Array(memoryClaimSchema())),
    eventKind: Type.Optional(
      Type.String({
        description:
          "record-daily-event 必填：mundane / relationship / location / shopping / meeting / travel / observation",
      }),
    ),
    scope: Type.Optional(
      Type.String({ description: "pin-fact：protagonist / npc / faction / world" }),
    ),
    subject: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    sourceEventId: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),

    // scene lifecycle and local scene events
    objectiveId: Type.Optional(Type.String()),
    objectiveSummary: Type.Optional(Type.String()),
    threatId: Type.Optional(Type.String()),
    threatSummary: Type.Optional(Type.String()),
    severity: Type.Optional(
      Type.String({
        description:
          "scene threat: low / medium / high / lethal；wound: minor / moderate / severe / critical",
      }),
    ),
    location: Type.Optional(locationSchema()),
    situation: Type.Optional(situationSchema()),
    objectives: Type.Optional(Type.Array(Type.String())),
    purpose: Type.Optional(Type.String()),
    beatId: Type.Optional(Type.String()),
    actionPolicy: Type.Optional(actionPolicySchema()),
    threats: Type.Optional(Type.Array(threatSchema())),
    presence: Type.Optional(presenceSchema()),
    memory: Type.Optional(beatMemorySchema()),
    nextBeat: Type.Optional(nextBeatSchema()),
    presentActorIds: Type.Optional(Type.Array(Type.String())),
    allyActorIds: Type.Optional(Type.Array(Type.String())),

    // actor-condition / servant-form common fields
    actorId: Type.Optional(Type.String()),
    amount: Type.Optional(Type.Integer({ minimum: 0 })),
    source: Type.Optional(
      Type.String({
        description:
          "actor-condition 的伤害/异常来源，或 gain-money 的 earned / refund / found / gift / withdrawal / sale / quest-reward",
      }),
    ),
    recoverable: Type.Optional(Type.Boolean()),
    expectedDuration: Type.Optional(
      Type.Unknown({ description: "持续时间字符串；永久或未知可填 null" }),
    ),
    mechanicalEffect: Type.Optional(Type.String()),
    conditionId: Type.Optional(Type.String()),
    conditionKind: Type.Optional(Type.String({ description: "wound / affliction" })),
    treatment: Type.Optional(Type.String()),
    circuits: Type.Optional(circuitsSchema()),
    outfit: Type.Optional(outfitSchema()),
    itemId: Type.Optional(Type.String()),
    holderActorId: Type.Optional(
      Type.Unknown({ description: "tracked item 当前持有者 actor id，或 null" }),
    ),
    ownerActorId: Type.Optional(
      Type.Unknown({ description: "tracked item / purse 所有者 actor id，或 null" }),
    ),
    label: Type.Optional(Type.String()),
    itemKind: Type.Optional(
      Type.String({ description: "mundane / weapon / mystic-code / document / key-item / other" }),
    ),
    condition: Type.Optional(
      Type.String({ description: "intact / damaged / broken / spent / unknown" }),
    ),
    visibility: Type.Optional(Type.String({ description: "player-known / suspected" })),
    notes: Type.Optional(Type.Array(Type.String())),
    modifier: Type.Optional(paramModifierSchema()),
    contract: Type.Optional(servantContractSchema()),
    defect: Type.Optional(permanentDefectSchema()),

    // economy
    purseId: Type.Optional(Type.String()),
    debtorActorId: Type.Optional(Type.String()),
    creditor: Type.Optional(Type.String()),
    counterparty: Type.Optional(Type.String()),
    access: Type.Optional(Type.String({ description: "held / shared / requires-permission" })),
  });
}

function eventKindDescription(): string {
  return [
    "子事件 kind。",
    "scene: set-location / set-situation / add-objective / resolve-objective / add-threat / clear-threat / begin-beat / complete-beat。",
    "memory: pin-fact / record-major-event / record-daily-event / record-daily-summary。",
    "servant-form: spend-mana / restore-mana / damage-spiritual-core / add-param-modifier / change-contract / add-permanent-defect。",
    "economy: spend-money / gain-money / add-purse / rename-purse / add-debt。",
    "actor-condition: add-wound / update-wound / add-affliction / add-permanent-effect / update-magecraft-circuits / resolve-condition / change-outfit / transfer-tracked-item / update-tracked-item / add-tracked-item。",
    "scene-presence 没有子 kind。",
  ].join(" ");
}

function memoryClaimSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    kind: Type.String({
      description:
        "mundane / identity / location / affiliation / motive / ability / resource / relationship / event-cause / world-fact",
    }),
    statement: Type.String(),
    certainty: Type.String({
      description: "observed / confirmed / inferred / rumor / hypothesis",
    }),
    subjectId: Type.Optional(Type.String()),
    relatedSecretSlotIds: Type.Optional(Type.Array(Type.String())),
    evidence: Type.Optional(Type.String()),
  });
}

function locationSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    region: Type.String(),
    site: Type.String(),
    detail: Type.String(),
    boundary: Type.String({ description: "normal / bounded-field / reality-marble / otherworld" }),
  });
}

function situationSchema(): ReturnType<typeof Type.String> {
  return Type.String({
    description: "daily / investigation / social / combat / ritual / escape / downtime",
  });
}

function presenceSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    presentActorIds: Type.Optional(Type.Array(Type.String())),
    allyActorIds: Type.Optional(Type.Array(Type.String())),
  });
}

function threatSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    summary: Type.String(),
    severity: Type.String({ description: "low / medium / high / lethal" }),
  });
}

function actionPolicySchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    allowedActions: Type.Optional(Type.Array(Type.String())),
    forbiddenEscalations: Type.Optional(Type.Array(Type.String())),
    completionCriteria: Type.Optional(Type.Array(Type.String())),
    nextBeatHints: Type.Optional(Type.Array(Type.String())),
  });
}

function beatMemorySchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    title: Type.String(),
    summary: Type.String(),
    consequences: Type.Optional(Type.Array(Type.String())),
    claims: Type.Array(memoryClaimSchema(), {
      description:
        "complete-beat 内嵌 memory 必填；日常记录不要放这里，改为同轮独立 memory event kind=record-daily-event",
    }),
  });
}

function nextBeatSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    title: Type.String(),
    objectives: Type.Array(Type.String()),
    beatId: Type.Optional(Type.String()),
    actionPolicy: Type.Optional(actionPolicySchema()),
    threats: Type.Optional(Type.Array(threatSchema())),
    presence: Type.Optional(presenceSchema()),
    situation: Type.Optional(situationSchema()),
  });
}

function circuitsSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    count: Type.String(),
    quality: Type.String(),
    od: Type.Integer({ minimum: 0 }),
    status: Type.String({ description: "normal / overheated / depleted / dormant / damaged" }),
    traits: Type.Array(Type.String()),
  });
}

function outfitSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({ label: Type.String(), details: Type.String() });
}

function paramModifierSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    id: Type.Optional(Type.String()),
    source: Type.String(),
    affectedParams: Type.Array(Type.String()),
    summary: Type.String(),
    expiresAt: Type.Optional(Type.Unknown({ description: "ISO 时刻或 null" })),
  });
}

function servantContractSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    masterActorId: Type.Optional(Type.Unknown({ description: "御主 actor id；无主时填 null" })),
    masterName: Type.Optional(Type.Unknown({ description: "御主显示名；无主时填 null" })),
    status: Type.String({ description: "stable / weak / cut / masterless" }),
    manaSupply: Type.String({ description: "sufficient / strained / starved" }),
  });
}

function permanentDefectSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    id: Type.Optional(Type.String()),
    source: Type.String(),
    text: Type.String(),
    mechanicalEffect: Type.String(),
  });
}
