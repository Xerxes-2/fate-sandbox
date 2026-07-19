export interface SkillInvocation {
  name: string;
  argumentsText?: string;
}

const SKILL_OPENING = /^<skill name="([a-z0-9-]+)" location="[^"\n]+">\n/;
const SKILL_CLOSING = "\n</skill>";

export function parseSkillInvocation(text: string): SkillInvocation | undefined {
  const opening = SKILL_OPENING.exec(text);
  if (opening === null) {
    return undefined;
  }
  const name = opening[1];
  if (name === undefined) {
    return undefined;
  }
  const closingIndex = text.lastIndexOf(SKILL_CLOSING);
  if (closingIndex < opening[0].length) {
    return undefined;
  }
  const trailingText = text.slice(closingIndex + SKILL_CLOSING.length).trim();
  return trailingText === ""
    ? { name }
    : {
        name,
        argumentsText: trailingText,
      };
}

export function formatSkillPlayerInput(invocation: SkillInvocation): string {
  return invocation.argumentsText === undefined
    ? `/skill:${invocation.name}`
    : `/skill:${invocation.name} ${invocation.argumentsText}`;
}

export function formatCompletedSkillInvocation(invocation: SkillInvocation): string {
  const lines = ["[已完成技能调用]", `玩家调用 /skill:${invocation.name}`];
  if (invocation.argumentsText !== undefined) {
    lines.push(`参数：${invocation.argumentsText}`);
  }
  return lines.join("\n");
}
