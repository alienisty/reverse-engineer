import { OpenAI } from 'openai';
import { fetch, Agent, type RequestInfo, type RequestInit } from 'undici';

export const SYSTEM_PROMPT = `You are an experienced Software Architect specialized in technical reverse-engineering.`;

export const MERMAID_REPAIR_SYSTEM_PROMPT = `You are an experienced Software Architect repairing invalid Mermaid diagrams in an existing design document.
Use the provided source analysis context to infer correct diagram syntax.
Return the complete design markdown and change only the invalid \`\`\`mermaid\`\`\` blocks listed in the repair request.
Do not rewrite prose, headings, or valid diagrams.`;

export const DESIGN_REVIEW_SYSTEM_PROMPT = `You are an experienced Software Architect reviewing a reverse-engineered design document against source code.
Return only structured markdown with exactly these sections in order: ## Coverage Check, ## Review Result, ## Feedback Items.
Include every pre-injected checklist line unchanged; toggle only [ ] to [x] when the design adequately covers that item.
Set STATUS to COMPLETE or NEEDS_REVISION in ## Review Result; the pipeline may override STATUS from checklist coverage.
Add manual feedback only for gaps not already represented by unchecked checklist items; each manual item must include _Ref: filename_ pointing to a file from the review prompt.
Do not invent checklist items or alter checklist labels or ids.
Mark use: checklist rows [x] only when Usage documents the integration pattern from that file with illustrative examples, not verbatim consumer code or use-site class names.
Compare **Uses** files to the **Usage** section: if fenced Usage code pastes consumer implementation bodies or production class names from a use file, leave that use: row unchecked, set NEEDS_REVISION, and add **[Usage]** feedback with _Ref: <path>_ explaining the copy-paste. Imports and main-library types shared across examples are fine; fictional illustrative snippets are fine.`;

export const DESIGN_REVISION_SYSTEM_PROMPT = `You are an experienced Software Architect revising a reverse-engineered design document from structured review feedback.
Return the complete design markdown. Change only the sections explicitly listed as allowed in the revision request; keep all other section bodies verbatim (whitespace normalization aside).
Preserve the document title, required section headings, and at least as many \`\`\`mermaid\`\`\` blocks as the original design.
Address every feedback item in the allowed sections without removing unrelated content.
When revising Usage, replace copied consumer code with fictional illustrative examples; do not introduce use-site class names or verbatim consumer snippets.`;

export const CONTEXT_CLASSIFICATION_SYSTEM_PROMPT = `You are an experienced Software Architect classifying discovered source files for reverse-engineering.
Determine which dependency candidate files are integral parts of the main component design and should be promoted to the main design subject.
Return only the relative paths to promote, one path per line, or an empty response when none apply.
Do not include prose, bullets, or markdown headings.`;

export interface LLMServiceConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
}

export interface LLMTransportRequest {
  model: string;
  prompt: string;
  systemPrompt: string;
}

export interface LLMTransport {
  streamDesignDocument(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>>;
  streamMermaidRepair(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>>;
  streamDesignReview(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>>;
  streamDesignRevision(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>>;
  streamContextClassification(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>>;
}

export async function collectStreamedContent(stream: AsyncIterable<LLMStreamChunk>): Promise<string> {
  let content = '';
  for await (const chunk of stream) {
    content += chunk.choices?.[0]?.delta?.content ?? '';
  }

  return content;
}

class OpenAITransport implements LLMTransport {
  constructor(private readonly client: OpenAI) {}

  private streamChatCompletion(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.client.chat.completions.create({
      model: request.model,
      temperature: 0.1,
      stream: true,
      messages: [
        {
          role: 'system',
          content: request.systemPrompt
        },
        { role: 'user', content: request.prompt },
      ]
    });
  }

  async streamDesignDocument(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.streamChatCompletion(request);
  }

  async streamMermaidRepair(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.streamChatCompletion(request);
  }

  async streamDesignReview(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.streamChatCompletion(request);
  }

  async streamDesignRevision(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.streamChatCompletion(request);
  }

  async streamContextClassification(request: LLMTransportRequest): Promise<AsyncIterable<LLMStreamChunk>> {
    return this.streamChatCompletion(request);
  }
}

export class LLMService {
  private static readonly REQUEST_TIMEOUT_MS = 3600000;
  private transport: LLMTransport;
  readonly model: string;

  constructor(config: LLMServiceConfig, client?: OpenAI, transport?: LLMTransport) {
    const openAIClient = client || new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      timeout: LLMService.REQUEST_TIMEOUT_MS,
      fetch: ((url: RequestInfo, options?: RequestInit | undefined) => {
        return fetch(url, {
          ...options,
          dispatcher: new Agent({
            // Set to 0 to disable, or a high number (ms)
            bodyTimeout: LLMService.REQUEST_TIMEOUT_MS,
            headersTimeout: LLMService.REQUEST_TIMEOUT_MS
          })
        });
      }) as any
    });

    this.transport = transport ?? new OpenAITransport(openAIClient);
    this.model = config.model;
  }

  public async generateDesignDocument(prompt: string): Promise<string> {
    const stream = await this.transport.streamDesignDocument({
      model: this.model,
      prompt,
      systemPrompt: SYSTEM_PROMPT
    });
    return collectStreamedContent(stream);
  }

  public async repairDesignMermaid(repairPrompt: string): Promise<string> {
    const stream = await this.transport.streamMermaidRepair({
      model: this.model,
      prompt: repairPrompt,
      systemPrompt: MERMAID_REPAIR_SYSTEM_PROMPT
    });
    return collectStreamedContent(stream);
  }

  public async reviewDesignDocument(reviewPrompt: string): Promise<string> {
    const stream = await this.transport.streamDesignReview({
      model: this.model,
      prompt: reviewPrompt,
      systemPrompt: DESIGN_REVIEW_SYSTEM_PROMPT
    });
    return collectStreamedContent(stream);
  }

  public async reviseDesignDocument(revisionPrompt: string): Promise<string> {
    const stream = await this.transport.streamDesignRevision({
      model: this.model,
      prompt: revisionPrompt,
      systemPrompt: DESIGN_REVISION_SYSTEM_PROMPT
    });
    return collectStreamedContent(stream);
  }

  public async classifyDependencies(classificationPrompt: string): Promise<string> {
    const stream = await this.transport.streamContextClassification({
      model: this.model,
      prompt: classificationPrompt,
      systemPrompt: CONTEXT_CLASSIFICATION_SYSTEM_PROMPT,
    });
    return collectStreamedContent(stream);
  }
}
