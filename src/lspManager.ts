import { spawn } from 'cross-spawn';
import type { ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveLSPConfig, type LSPConfigs } from './utils/configLoader.js';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/lib/node/main.js';
import type { MessageConnection } from 'vscode-jsonrpc/lib/common/api.js';
import { createLspConnection } from './utils/lspConnection.js';
import { InitializeRequest, DidOpenTextDocumentNotification, DefinitionRequest, Position, InitializedNotification } from 'vscode-languageserver-protocol';
import type { InitializeResult } from 'vscode-languageserver-protocol';

export interface LSPManagerOptions {
  initializeTimeoutMs?: number;
}

export class LSPManager {
  private static readonly DEFAULT_INITIALIZE_TIMEOUT_MS = 30000;
  private servers: Map<string, ChildProcess> = new Map();
  private connections: Map<string, MessageConnection> = new Map();
  private capabilities: Map<string, InitializeResult> = new Map();
  private config: LSPConfigs;
  private spawnFn: typeof spawn;
  private createConnectionFn: typeof createLspConnection;
  private initializeTimeoutMs: number;
  private requestChains: Map<string, Promise<unknown>> = new Map();

  constructor(
    config?: LSPConfigs,
    spawnFn?: typeof spawn,
    createConnectionFn?: typeof createLspConnection,
    options: LSPManagerOptions = {}
  ) {
    this.config = config || resolveLSPConfig({ pwd: process.cwd() });
    this.spawnFn = spawnFn || spawn;
    this.createConnectionFn = createConnectionFn || createLspConnection;
    this.initializeTimeoutMs = options.initializeTimeoutMs ?? LSPManager.DEFAULT_INITIALIZE_TIMEOUT_MS;
  }

  private withInitializationTimeout<T>(promise: Promise<T>, language: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${language} server initialization timed out after ${this.initializeTimeoutMs}ms`));
      }, this.initializeTimeoutMs);

      promise.then(
        value => {
          clearTimeout(timeout);
          resolve(value);
        },
        err => {
          clearTimeout(timeout);
          reject(err);
        }
      );
    });
  }

  public async startServer(language: string, pwd?: string): Promise<void> {
    if (this.servers.has(language)) return;

    const langConfig = this.config.servers[language];
    if (!langConfig) throw new Error(`No configuration for ${language}`);

    const proc = await new Promise<ChildProcess>((resolve, reject) => {
      const options: { cwd?: string } = {};
      if (pwd) {
        options.cwd = pwd;
      }
      const p = this.spawnFn(langConfig.command, langConfig.args, options);
      
      p.on('error', (err) => reject(err));
      
      if (!p.stdin || !p.stdout) {
        reject(new Error(`Failed to get stdio for ${language} server`));
        return;
      }

      // Allow a moment to see if it immediately errors
      p.on('spawn', () => resolve(p));
    });

    this.servers.set(language, proc);

    const connection = this.createConnectionFn(
      new StreamMessageReader(proc.stdout!),
      new StreamMessageWriter(proc.stdin!)
    );

    connection.listen();

    const rootUri = pathToFileURL(pwd ?? process.cwd()).toString();
    const exitBeforeInitialize = new Promise<never>((_, reject) => {
      const rejectOnExit = (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`${language} server exited before initialization (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
      };

      proc.on('exit', rejectOnExit);
    });

    try {
      const initializeRequest = connection.sendRequest(InitializeRequest.method, {
        processId: process.pid,
        rootUri,
        capabilities: {},
      }) as Promise<InitializeResult>;

      const initResult: InitializeResult = await this.withInitializationTimeout(
        Promise.race<InitializeResult>([
          initializeRequest,
          exitBeforeInitialize,
        ]),
        language
      );

      await connection.sendNotification(InitializedNotification.method, {});
      this.servers.set(language, proc);
      this.connections.set(language, connection);
      this.capabilities.set(language, initResult);
    } catch (err) {
      connection.dispose();
      proc.kill();
      throw err;
    }
  }

  public getSemanticTokensLegend(language: string) {
    const caps = this.capabilities.get(language);
    return caps?.capabilities?.semanticTokensProvider?.legend;
  }

  public async sendRequest<T, R>(language: string, method: string, params: T): Promise<R> {
    const connection = this.connections.get(language);
    if (!connection) throw new Error(`No connection for ${language}`);

    const previous = this.requestChains.get(language) ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(() => connection.sendRequest<R>(method, params));

    this.requestChains.set(language, request);
    return request;
  }

  public async openDocument(language: string, uri: string, languageId: string, version: number, text: string): Promise<void> {
    const connection = this.connections.get(language);
    if (!connection) throw new Error(`No connection for ${language}`);
    
    await connection.sendNotification(DidOpenTextDocumentNotification.method, {
      textDocument: {
        uri,
        languageId,
        version,
        text
      }
    });
  }

  public async getDefinition(language: string, uri: string, position: Position): Promise<any> {
    const connection = this.connections.get(language);
    if (!connection) throw new Error(`No connection for ${language}`);
    
    return connection.sendRequest(DefinitionRequest.method, {
      textDocument: { uri },
      position
    });
  }

  public shutdown(): void {
    for (const [_, connection] of this.connections) {
      connection.dispose();
    }
    for (const [_, proc] of this.servers) {
      proc.kill();
    }
    this.servers.clear();
    this.connections.clear();
    this.capabilities.clear();
    this.requestChains.clear();
  }
}
