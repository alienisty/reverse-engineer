export const PROGRESS_LOG_PREFIX = '[reverse-engineer]';

export interface ProgressLogger {
  info(message: string): void;
  warn(message: string): void;
  stop?(success?: boolean): void;
}

export type ConsoleLike = Pick<Console, 'log' | 'warn'>;

export function formatProgressMessage(message: string): string {
  return `${PROGRESS_LOG_PREFIX} ${message}`;
}

export function createConsoleProgressLogger(consoleLike: ConsoleLike = console): ProgressLogger {
  return {
    info(message: string) {
      consoleLike.log(formatProgressMessage(message));
    },
    warn(message: string) {
      consoleLike.warn(formatProgressMessage(message));
    },
  };
}

interface StageState {
  label: string;
  status: 'pending' | 'running' | 'done' | 'warning' | 'failed';
  detail: string;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class TUIProgressLogger implements ProgressLogger {
  private projectName = '';
  private modelName = '';
  private startTime: number;
  private logs: string[] = [];
  private lastLinesCount = 0;
  private spinnerFrame = 0;
  private spinnerInterval: NodeJS.Timeout | undefined;
  private isStopped = false;
  private activeStage = 0;

  private stages: StageState[] = [
    { label: 'Initialize LSP', status: 'pending', detail: 'Waiting to start...' },
    { label: 'Workspace Discovery', status: 'pending', detail: 'Waiting to start...' },
    { label: 'Context Classification', status: 'pending', detail: 'Waiting to start...' },
    { label: 'Design Generation', status: 'pending', detail: 'Waiting to start...' },
    { label: 'Design Review', status: 'pending', detail: 'Waiting to start...' },
  ];

  constructor() {
    this.startTime = Date.now();
    this.modelName = process.env.LLM_MODEL || 'unknown';
    
    // Start spinner animation
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame++;
      this.render();
    }, 80);

    this.render();
  }

  public info = (message: string) => {
    this.logs.push(message);
    this.updateState(message);
    this.render();
  };

  public warn = (message: string) => {
    // Add colored output for warnings in log history
    this.logs.push(`\x1b[33m${message}\x1b[0m`);
    this.updateState(message);
    this.render();
  };

  public stop = (success = true) => {
    if (this.isStopped) return;
    this.isStopped = true;

    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }

    // Mark running stages to final status
    for (const stage of this.stages) {
      if (stage.status === 'running') {
        stage.status = success ? 'done' : 'failed';
      }
    }

    this.render();
    // Restore cursor and add a trailing newline so terminal prompt behaves nicely
    process.stdout.write('\x1b[?25h\n');
  };

  private updateState(message: string) {
    // 1. Project name & Init LSP
    const projectMatch = message.match(/Starting design generation for project "([^"]+)"/);
    if (projectMatch) {
      this.projectName = projectMatch[1]!;
      this.transitionToStage(0, 'Detecting languages...');
      return;
    }

    const detectMatch = message.match(/Detecting languages from (\d+) input file\(s\)/);
    if (detectMatch) {
      this.transitionToStage(0, `Detecting languages from ${detectMatch[1]} input files...`);
      return;
    }

    const langMatch = message.match(/Detected language\(s\): (.+)/);
    if (langMatch) {
      this.transitionToStage(0, `Languages: ${langMatch[1]}`);
      return;
    }

    const lspMatch = message.match(/Starting LSP server: (.+)/);
    if (lspMatch) {
      this.transitionToStage(0, `Starting LSP: ${lspMatch[1]}`);
      return;
    }

    // 2. Discovery
    if (message.includes('Discovering workspace context')) {
      this.transitionToStage(1, 'Scanning files and dependencies...');
      return;
    }

    const discCompleteMatch = message.match(/Discovery complete: (\d+) main, (\d+) dependencies, (\d+) uses/);
    if (discCompleteMatch) {
      const [, m, d, u] = discCompleteMatch;
      this.transitionToStage(1, `Discovered ${m} main, ${d} dependencies, ${u} uses`, 'done');
      return;
    }

    // 3. Classification
    if (message.includes('Classifying dependencies for promotion to main')) {
      this.transitionToStage(2, 'Calling LLM for dependency promotion...');
      return;
    }

    const classAttemptMatch = message.match(/Context classification: calling LLM \(attempt (\d+)\/(\d+)\)/);
    if (classAttemptMatch) {
      this.transitionToStage(2, `Calling LLM (attempt ${classAttemptMatch[1]}/${classAttemptMatch[2]})...`);
      return;
    }

    const classPromoteMatch = message.match(/Context classification: promoted (\d+) of (\d+) dependencies/);
    if (classPromoteMatch) {
      this.transitionToStage(2, `Promoted ${classPromoteMatch[1]} of ${classPromoteMatch[2]} dependencies to main`);
      return;
    }

    const classResultMatch = message.match(/Context map after classification: (\d+) main, (\d+) dependencies, (\d+) uses/);
    if (classResultMatch) {
      const [, m, d, u] = classResultMatch;
      this.transitionToStage(2, `Classified context: ${m} main, ${d} dependencies, ${u} uses`, 'done');
      return;
    }

    // 4. Prompt & Generation
    if (message.includes('Building generation prompt')) {
      this.transitionToStage(3, 'Building prompt...');
      return;
    }

    if (message.includes('Generating design document (LLM)')) {
      this.transitionToStage(3, 'Generating design document via LLM...');
      return;
    }

    if (message.includes('Post-processing Mermaid diagrams')) {
      this.transitionToStage(3, 'Post-processing Mermaid...');
      return;
    }

    if (message.includes('Wrote') && message.includes('design.v0.')) {
      this.transitionToStage(3, 'Initial design v0 generated', 'done');
      return;
    }

    // 5. Review
    const checklistMatch = message.match(/Extracted (\d+) coverage checklist items/);
    if (checklistMatch) {
      this.transitionToStage(4, `Extracted ${checklistMatch[1]} checklist items`);
      return;
    }

    if (message.includes('Starting design review')) {
      this.transitionToStage(4, 'Starting design review...');
      return;
    }

    const reviewRoundsMatch = message.match(/Design review: up to (\d+) rounds, (\d+) checklist items/);
    if (reviewRoundsMatch) {
      this.transitionToStage(4, `Round 0/${reviewRoundsMatch[1]} (${reviewRoundsMatch[2]} checklist items)`);
      return;
    }

    const roundCallMatch = message.match(/Review round (\d+)\/(\d+): loading source context and calling reviewer/);
    if (roundCallMatch) {
      this.transitionToStage(4, `Round ${roundCallMatch[1]}/${roundCallMatch[2]}: Calling reviewer...`);
      return;
    }

    const roundReviseMatch = message.match(/Review round (\d+)\/(\d+): revising design \((\d+) feedback item\(s\), (\d+) uncovered checklist item\(s\)\)/);
    if (roundReviseMatch) {
      const [, r, tot, f, unc] = roundReviseMatch;
      this.transitionToStage(4, `Round ${r}/${tot}: Revising (${f} feedback, ${unc} uncovered)`);
      return;
    }

    if (message.includes('Review complete — all checklist items covered')) {
      this.transitionToStage(4, 'All checklist items covered!', 'done');
      return;
    }

    const reviewRoundsCompleteMatch = message.match(/Review round (\d+) complete — max rounds reached with (\d+) unresolved gap/);
    if (reviewRoundsCompleteMatch) {
      this.transitionToStage(4, `Finished with ${reviewRoundsCompleteMatch[2]} unresolved gaps`, 'warning');
      return;
    }
  }

  private transitionToStage(index: number, detail: string, status?: 'pending' | 'running' | 'done' | 'warning' | 'failed') {
    this.activeStage = index;

    // Auto-complete previous stages if they are still pending or running
    for (let i = 0; i < index; i++) {
      const prevStage = this.stages[i]!;
      if (prevStage.status === 'pending' || prevStage.status === 'running') {
        if (i === 2 && prevStage.detail === 'Waiting to start...') {
          prevStage.detail = 'Skipped (no dependencies)';
        } else if (prevStage.detail === 'Waiting to start...') {
          prevStage.detail = 'Done';
        }
        prevStage.status = 'done';
      }
    }

    const currentStage = this.stages[index]!;
    currentStage.detail = detail;
    if (status) {
      currentStage.status = status;
    } else if (currentStage.status === 'pending') {
      currentStage.status = 'running';
    }
  }

  private render() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const spinnerChar = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];

    let out = '';
    out += `\x1b[1m\x1b[36m=== REVERSE ENGINEER ===\x1b[0m\n`;
    out += `\x1b[1mProject:\x1b[0m ${this.projectName || 'Detecting...'}\n`;
    out += `\x1b[1mModel:\x1b[0m   \x1b[35m${this.modelName}\x1b[0m\n`;
    out += `\x1b[1mElapsed:\x1b[0m \x1b[33m${elapsed}s\x1b[0m\n\n`;

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i]!;
      let icon = '';
      let color = '';

      if (stage.status === 'pending') {
        icon = '○';
        color = '\x1b[90m'; // gray/dim
      } else if (stage.status === 'running') {
        icon = spinnerChar!;
        color = '\x1b[36m'; // cyan
      } else if (stage.status === 'done') {
        icon = '✔';
        color = '\x1b[32m'; // green
      } else if (stage.status === 'warning') {
        icon = '⚠';
        color = '\x1b[33m'; // yellow
      } else {
        icon = '✖';
        color = '\x1b[31m'; // red
      }

      const labelStr = stage.label.padEnd(22, '.');
      out += `  ${color}${icon}\x1b[0m  \x1b[1m${stage.label}\x1b[0m ${'\x1b[90m...\x1b[0m'.padStart(25 - stage.label.length)} \x1b[2m${stage.detail}\x1b[0m\n`;
    }

    out += `\n\x1b[90m────────────────────────────────────────────────────────────────────────────────\x1b[0m\n`;
    out += `\x1b[1m\x1b[90mRecent Activity:\x1b[0m\n`;

    // Show last 5 logs
    const recentLogs = this.logs.slice(-5);
    while (recentLogs.length < 5) {
      recentLogs.unshift('');
    }

    for (const log of recentLogs) {
      // Clean up log prefixes or ansi codes if necessary, but writing as is is fine.
      out += `  \x1b[90m${log}\x1b[0m\n`;
    }

    // Split and add ANSI clear to end of line for each line to avoid artifacts on terminal size changes
    const lines = out.split('\n');
    const clearedOut = lines.map((line) => line + '\x1b[K').join('\n');

    if (this.lastLinesCount > 0) {
      process.stdout.write(`\x1b[${this.lastLinesCount}A` + clearedOut);
    } else {
      process.stdout.write('\x1b[?25l' + clearedOut);
    }

    this.lastLinesCount = lines.length - 1;
  }
}
