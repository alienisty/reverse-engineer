export const REQUIRED_DESIGN_SECTIONS = [
  'Overview',
  'Architecture',
  'Component Design',
  'Data Flow',
  'Interface Design',
  'Usage',
  'Roadmap',
] as const;

export type RequiredDesignSection = (typeof REQUIRED_DESIGN_SECTIONS)[number];

export function normalizeSectionName(section: string): string {
  return section.replace(/^#+\s*/, '').trim();
}

export function toSectionHeading(section: string): string {
  return `## ${normalizeSectionName(section)}`;
}

export function splitDesignSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = markdown.split(/^## /m);

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index]!;
    const newlineIndex = part.indexOf('\n');
    const heading = newlineIndex === -1 ? part.trim() : part.slice(0, newlineIndex).trim();
    const body = newlineIndex === -1 ? '' : part.slice(newlineIndex + 1);
    sections.set(heading, body);
  }

  return sections;
}

export function normalizeSectionBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}
