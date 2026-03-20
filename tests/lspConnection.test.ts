import { normalizeIncomingLspMessage } from '../src/utils/lspConnection.js';

test('normalizeIncomingLspMessage should treat id-only payloads as null results', () => {
  const normalized = normalizeIncomingLspMessage({
    jsonrpc: '2.0',
    id: 3,
  }) as { result: unknown };

  expect(normalized.result).toBeNull();
});

test('normalizeIncomingLspMessage should leave valid responses unchanged', () => {
  const message = {
    jsonrpc: '2.0',
    id: 1,
    result: [{ uri: 'file:///test.java' }],
  };

  expect(normalizeIncomingLspMessage(message)).toBe(message);
});

test('normalizeIncomingLspMessage should leave server requests unchanged', () => {
  const message = {
    jsonrpc: '2.0',
    id: 2,
    method: 'window/workDoneProgress/create',
    params: { token: 'abc' },
  };

  expect(normalizeIncomingLspMessage(message)).toBe(message);
});
