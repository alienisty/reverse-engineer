import type { LLMService } from '../llm.js';
import { buildMermaidRepairPrompt, stripRepairResponse } from './repairDesignMermaid.js';
import { validateDesignMermaid } from './validateDesignMermaid.js';

const MAX_REPAIR_ATTEMPTS = 3;

export interface MermaidPostProcessorDeps {
  llmService: Pick<LLMService, 'repairDesignMermaid'>;
  validateDesignMermaid?: typeof validateDesignMermaid;
  logInfo?: (message: string) => void;
  logWarning?: (message: string) => void;
}

export class MermaidPostProcessor {
  private readonly llmService: Pick<LLMService, 'repairDesignMermaid'>;
  private readonly validate: typeof validateDesignMermaid;
  private readonly logInfo: (message: string) => void;
  private readonly logWarning: (message: string) => void;

  constructor(deps: MermaidPostProcessorDeps) {
    this.llmService = deps.llmService;
    this.validate = deps.validateDesignMermaid ?? validateDesignMermaid;
    this.logInfo = deps.logInfo ?? (() => {});
    this.logWarning = deps.logWarning ?? ((message) => console.warn(message));
  }

  async postProcess(designDoc: string, generationPrompt: string): Promise<string> {
    let current = designDoc;

    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
      const result = await this.validate(current);
      if (result.valid) {
        if (attempt > 0) {
          this.logInfo(`Mermaid validation passed after ${attempt} repair attempt${attempt === 1 ? '' : 's'}`);
        }
        return current;
      }

      this.logInfo(
        `Mermaid validation failed: ${result.failures.length} invalid diagram(s); repair attempt ${attempt + 1}/${MAX_REPAIR_ATTEMPTS}`,
      );
      const repairPrompt = buildMermaidRepairPrompt({
        designDoc: current,
        failures: result.failures,
        generationPrompt,
      });
      current = stripRepairResponse(await this.llmService.repairDesignMermaid(repairPrompt));
    }

    const final = await this.validate(current);
    if (!final.valid) {
      for (const failure of final.failures) {
        this.logWarning(
          `Mermaid diagram at line ${failure.line} (block ${failure.blockIndex}) remains invalid: ${failure.error}`,
        );
      }
    }

    return current;
  }
}
