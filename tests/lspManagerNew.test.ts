import { LSPManager } from '../src/lspManager.js';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { type MessageConnection } from 'vscode-jsonrpc/lib/common/api.js';

describe('LSPManager', () => {
  let lspManager: LSPManager;

  beforeEach(() => {
    lspManager = new LSPManager();
    // mock connections if necessary
  });

  test('openDocument should call sendNotification', async () => {
    // Need to mock the connection
    const mockConnection = {
      sendNotification: (jest.fn() as any).mockResolvedValue(undefined),
      sendRequest: jest.fn(),
      listen: jest.fn(),
      dispose: jest.fn()
    };
    
    (lspManager as any)['connections'].set('java', mockConnection as unknown as MessageConnection);
    
    await lspManager.openDocument('java', 'file:///test.java', 'java', 1, 'class MyClass {}');
    
    expect(mockConnection.sendNotification).toHaveBeenCalled();
  });

  test('getDefinition should call sendRequest', async () => {
    const mockConnection = {
      sendRequest: (jest.fn() as any).mockResolvedValue({ uri: 'file:///def.java', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }),
      sendNotification: jest.fn(),
      listen: jest.fn(),
      dispose: jest.fn()
    };
    
    (lspManager as any)['connections'].set('java', mockConnection as unknown as MessageConnection);
    
    const result = await lspManager.getDefinition('java', 'file:///test.java', { line: 1, character: 5 });
    
    expect(mockConnection.sendRequest).toHaveBeenCalled();
    expect(result.uri).toBe('file:///def.java');
  });
});
