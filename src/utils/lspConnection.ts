import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
  type MessageStrategy,
} from 'vscode-jsonrpc/lib/node/main.js';
import type { Message } from 'vscode-jsonrpc/lib/common/messages.js';

/** Normalize jdtls/lsp4j responses that omit `result` when empty (see eclipse.jdt.ls#3112). */
export function normalizeIncomingLspMessage(message: unknown): unknown {
  if (!message || typeof message !== 'object') {
    return message;
  }

  const candidate = message as {
    id?: string | number | null;
    method?: string;
    result?: unknown;
    error?: unknown;
  };

  const hasRequestId =
    typeof candidate.id === 'string' || typeof candidate.id === 'number';

  if (
    hasRequestId &&
    candidate.method === undefined &&
    candidate.result === undefined &&
    candidate.error === undefined
  ) {
    return { ...candidate, result: null };
  }

  return message;
}

const tolerantMessageStrategy: MessageStrategy = {
  handleMessage(message, next) {
    next(normalizeIncomingLspMessage(message) as Message);
  },
};

export function createLspConnection(
  reader: StreamMessageReader,
  writer: StreamMessageWriter
): MessageConnection {
  const connection = createMessageConnection(reader, writer, undefined, {
    messageStrategy: tolerantMessageStrategy,
  });

  connection.onRequest('client/registerCapability', () => null);
  connection.onRequest('window/workDoneProgress/create', () => null);

  return connection;
}
