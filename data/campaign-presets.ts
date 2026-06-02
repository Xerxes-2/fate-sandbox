import type {
  CurrencyCode,
  LocationState,
  OpeningMode,
  RuleSetId,
  SituationKind,
  TimelineId,
  TimeZoneId,
} from "../engine/core/state";

export interface CampaignPreset {
  id: string;
  title: string;
  timeline: TimelineId;
  openingMode: OpeningMode;
  premise: string;
  activeRuleSetIds: RuleSetId[];
  timezone: TimeZoneId;
  startedAt: string;
  currentAt: string;
  location: LocationState;
  situation: SituationKind;
  economy: {
    currency: CurrencyCode;
    purseLabel: string;
    startingFunds: number;
  };
}

export const CAMPAIGN_PRESETS = {
  fsn_2004_fuyuki: {
    id: "fsn_2004_fuyuki",
    title: "Fate/stay night 沙盒",
    timeline: "fsn",
    openingMode: "selected",
    premise: "2004 年冬木，圣杯战争即将开幕；玩家角色身份与卷入方式由开局确认。",
    activeRuleSetIds: ["fate-worldview-filter", "fate-rank-combat", "jpy-2004-economy"],
    timezone: "Asia/Tokyo",
    startedAt: "2004-01-30T07:00:00.000Z",
    currentAt: "2004-01-30T07:00:00.000Z",
    location: {
      region: "冬木市",
      site: "深山镇",
      detail: "穗群原学园·校门外",
      boundary: "normal",
    },
    situation: "daily",
    economy: { currency: "JPY", purseLabel: "随身现金", startingFunds: 50000 },
  },
  fsf_2008_snowfield: {
    id: "fsf_2008_snowfield",
    title: "Fate/strange Fake 沙盒",
    timeline: "fsf",
    openingMode: "selected",
    premise:
      "2008 年斯诺菲尔德，虚假圣杯战争与真实从者机制交叠；具体替换角色与阵营关系由开局确认。",
    activeRuleSetIds: ["fate-worldview-filter", "fate-rank-combat", "custom"],
    timezone: "America/Denver",
    startedAt: "2008-06-03T03:00:00.000Z",
    currentAt: "2008-06-03T03:00:00.000Z",
    location: {
      region: "斯诺菲尔德",
      site: "歌剧院",
      detail: "后台更衣区",
      boundary: "normal",
    },
    situation: "escape",
    economy: { currency: "USD", purseLabel: "随身现金", startingFunds: 200 },
  },
} as const satisfies Record<string, CampaignPreset>;

const CAMPAIGN_PRESET_INDEX: Readonly<Record<string, CampaignPreset>> = CAMPAIGN_PRESETS;

export type CampaignPresetId = keyof typeof CAMPAIGN_PRESETS;

export function getCampaignPreset(id: string): CampaignPreset {
  const preset = CAMPAIGN_PRESET_INDEX[id];
  if (preset === undefined) {
    throw new Error(
      `campaign preset 不存在: ${id}。可用 preset: ${Object.keys(CAMPAIGN_PRESETS).join(", ")}。`,
    );
  }
  return structuredClone(preset);
}
