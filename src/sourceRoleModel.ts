export const SOURCE_ROLE_PROHIBITIONS =
  '**Prohibitions:** No consumer-driven architecture. No full designs for dependency modules as primary subjects. No use-site class names, file paths, or verbatim consumer code in the **Usage** section.';

export const GENERATION_SOURCE_ROLE_MODEL = [
  'The source code is provided in three categories with distinct roles:',
  '',
  '1. **Main** — Core design subject. Overview, Architecture, Component Design, Data Flow, Interface Design, Roadmap, and all other primary sections must describe **main** code only.',
  '2. **Dependencies** — Implementation context for what main builds on. Use them to understand and accurately describe what main implements. Do **not** produce standalone designs for dependency modules; do not let dependency internals drive architecture or component sections.',
  '3. **Uses** — Read-only evidence for how main is wired in production or testing (configuration, wiring, consumption). Extract integration patterns for the **Usage** section only. **Do not** reproduce consumer code in the design or let consumer code shape other sections. Empty uses is acceptable.',
  '',
  SOURCE_ROLE_PROHIBITIONS,
].join('\n');

export const REVIEW_SOURCE_ROLE_MODEL = [
  'Source code is grouped into three categories (same roles as generation):',
  '',
  '1. **Main** — Core design subject. Verify completeness of what main code does in Overview, Architecture, Component Design, Data Flow, Interface Design, Roadmap, and other non-Usage sections.',
  '2. **Dependencies** — Implementation context for what main builds on. Check accuracy of how main describes its implementation against dependency evidence. Do **not** require standalone designs for dependency modules or let dependency internals drive non-Usage sections.',
  '3. **Uses** — Read-only evidence for wiring. Relevant for the **Usage** section only: patterns must appear as illustrative examples, not verbatim consumer code. Consumer code must **not** block COMPLETE for gaps in other sections. Empty uses is acceptable.',
  '',
  '**Prohibitions:** No consumer-driven architecture in non-Usage sections. No expecting full designs for dependency modules as primary subjects. No use-site identifiers or copied consumer snippets in **Usage**.',
].join('\n');

export const USAGE_SECTION_RULES = [
  'Document every distinct integration pattern evidenced in **Uses** (one illustrative example per pattern).',
  'Examples must be **stable illustrative snippets**, not copies of consumer source.',
  'Use fictional names for consumer components (e.g. ExampleTaskScheduler); cite only types and APIs from **main**.',
  'Keep snippets minimal (construction, offer flow, custom Request merge); omit unrelated domain logic.',
  'Do **not** include consumer file paths, production class names, packages, or multi-line copied consumer bodies.',
].join('\n');

export const USAGE_EVIDENCE_STYLE_GUIDELINE =
  '- **Evidence-Based (Usage)**: Ground each example in patterns from **Uses** evidence, but write **illustrative** snippets — not verbatim consumer code.';
