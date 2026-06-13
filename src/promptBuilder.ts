import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GENERATION_SOURCE_ROLE_MODEL,
  USAGE_EVIDENCE_STYLE_GUIDELINE,
  USAGE_SECTION_RULES,
} from './sourceRoleModel.js';
import type { ContextMap } from './types/context.js';

export class PromptBuilder {
  private fs: typeof fs;

  constructor(fsImpl: typeof fs = fs) {
    this.fs = fsImpl;
  }

  public buildPrompt(context: ContextMap): string {
    let prompt = `Your goal is to analyze the provided source code and generate a high-fidelity "Design Document".
Read the provided source code. Identify every element present. Do not make assumptions about missing dependencies or default behaviors unless explicitly stated in the code snippet itself (e.g., 'The class takes a static array of strings').
Verify against the provided text, do not use external knowledge.

${GENERATION_SOURCE_ROLE_MODEL}

## Main
{main-files}

## Dependencies
{dependency-files}

## Uses
{uses-files}


You must strictly follow the following structure. Do not include any additional chapters, footnotes, or explanatory text outside of these sections.

# [Title: determine title from the main component responsibility]

## Overview
Provide a high-level summary, including goals, scope, primary features and any important background information.

## Architecture
Describe the overall structure and its major components and subsystems and how they relate to each other, showing how different system parts work together to achieve the desired functionality.

Always include:
- A high-level diagram of the architecture.
- Explanation of design patterns and architectural styles used.
- Any design decisions and trade-offs.
- Any Constraints related to hardware, software, or infrastructure.
- Any regulatory or compliance requirements.
- Any Dependencies on external libraries or services.

## Component Design
Provide a detailed description of every major component.

Always include:
- Class diagram.
- For each member in the class diagram, you **must** provide:
  - Its functionality.
  - Inputs they need and outputs they produce.
  - Algorithms and processing logic they use.
  - Any data structures they use.
- Sequence Diagram.
- Dependencies on other components or external systems.

## Data Flow
Focuse on how the components store, manage, and process information, including details about the database structure, data models, and data processing techniques.

Always include:
- Any database structure and table layouts.
- Data flow diagrams.
- Any data validation and integrity rules.
- How data will be stored and retrieved.
- State Machine Diagrams.

## Interface Design
Describe how different components will communicate with each other and interact with external systems or services. This includes both internal interfaces between modules and external APIs or integration points.

Always include:
- Detailed API specifications and protocols documentation.
- Detailed Message formats and data structures documentation.
- How errors and exceptions will be handled.
- Security and authentication methods.
  
## User Interface Design [if any]
Focus on how users interact with the software system. This includes details about the user interface's layout, navigation, functionality, and specific design considerations or usability requirements.

Always include:
- Wireframes or mockups of key screens
- Description of user workflows and interactions
- Accessibility considerations

## Usage
List examples of all possible uses of the features described by the design. Read **Uses** source files to identify integration patterns; write **illustrative** examples in this section only.

Always include:
${USAGE_SECTION_RULES.split('\n').map((line) => `- ${line}`).join('\n')}

## Roadmap
### Shortcomings and weaknesses
List known shortcomings, weaknesses and techdebt with suggestions for each on how to address them.

### Opportunities
List any high value opportunities to improve the current design.

---
**Style Guidelines**:
- **Technical & Precise*:* Use standard architectural terminology (e.g., "Singleton," "Asynchronous," "Decoupled") in narrative prose.  
- **Evidence-Based**: If the provided code uses a specific pattern (e.g., Factory or Strategy), explicitly name it in Overview, Architecture, Component Design, Data Flow, and Interface Design.
${USAGE_EVIDENCE_STYLE_GUIDELINE}
- **Be consistent**: Use the same formatting, terminology, and structure throughout the document to make it easier to read and understand.
- **Include visuals**: Use diagrams, flowcharts, and other visual aids to illustrate complex concepts and relationships between components.
- Provide code block examples in appropriate markdown sections labelled with the appropriate language for syntax coloring.

**Output format**:
- **Formatting**: Markdown only.

**Important Notes**:
- **Diagrams**: Use mermaid markup:
  - Use \`subgraph\` blocks to group Logical Modules.
  - Use vertical flows centered horizontally.
`;

    const buildSection = (files: string[]): string => {
      let section = '';
      for (const file of files) {
        if (this.fs.existsSync(file)) {
          const lang = path.extname(file).slice(1);
          const content = this.fs.readFileSync(file, 'utf8');
          section += `${'```'}${lang}\n${content}\n${'```'}\n`;
        }
      }
      return section;
    };

    return prompt
      .replace('{main-files}', buildSection(context.main))
      .replace('{dependency-files}', buildSection(context.dependencies))
      .replace('{uses-files}', buildSection(context.uses));
  }
}
