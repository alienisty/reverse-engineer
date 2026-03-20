const SECTION_FILLER =
  'This section documents the system with enough detail to satisfy minimum length checks for revision validation tests.';

export function buildMinimalDesign(sectionBodies: Record<string, string> = {}): string {
  const defaultBodies: Record<string, string> = {
    Overview: SECTION_FILLER,
    Architecture: ['High-level structure.', '```mermaid', 'graph TD', '  A-->B', '```'].join('\n'),
    'Component Design': SECTION_FILLER,
    'Data Flow': SECTION_FILLER,
    'Interface Design': SECTION_FILLER,
    Usage: SECTION_FILLER,
    Roadmap: SECTION_FILLER,
  };

  const merged = { ...defaultBodies, ...sectionBodies };
  const lines = ['# Sample System Design', ''];

  for (const [heading, body] of Object.entries(merged)) {
    lines.push(`## ${heading}`, body, '');
  }

  return lines.join('\n').trimEnd();
}
