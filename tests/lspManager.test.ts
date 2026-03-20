import { LSPManager } from '../src/lspManager.js';
import { jest } from '@jest/globals';
import { type MessageConnection } from 'vscode-jsonrpc/lib/common/api.js';

describe('LSPManager', () => {
  it('should start a server', async () => {
    // Setup spawn mock
    const spawnMock = jest.fn().mockReturnValue({
      stdin: { write: jest.fn(), end: jest.fn(), on: jest.fn() },
      stdout: { on: jest.fn() },
      on: jest.fn((event: string, cb: () => void) => { if (event === 'spawn') cb(); }),
      kill: jest.fn(),
    });

    // Setup vscode-jsonrpc mock
    const mockConnection = {
        sendRequest: (jest.fn() as any).mockResolvedValue({}),
        listen: jest.fn(),
        dispose: jest.fn(),
        sendNotification: (jest.fn() as any).mockResolvedValue({}),
    } as any;
    const createConnectionMock = jest.fn().mockReturnValue(mockConnection);
    
    // Inject configuration and mocks
    const config = {
      servers: {
        typescript: { command: 'ts-server', args: ['--stdio'] }
      },
      extensions: { ts: 'typescript' }
    };
    const manager = new LSPManager(config, spawnMock as any, createConnectionMock as any);
    await manager.startServer('typescript');

    expect(spawnMock).toHaveBeenCalled();
    expect(createConnectionMock).toHaveBeenCalled();
    expect(mockConnection.sendRequest).toHaveBeenCalled();
    expect(mockConnection.listen).toHaveBeenCalled();
  });

  it('should time out when initialize never responds', async () => {
    const kill = jest.fn();
    const spawnMock = jest.fn().mockReturnValue({
      stdin: { write: jest.fn(), end: jest.fn(), on: jest.fn() },
      stdout: { on: jest.fn() },
      on: jest.fn((event: string, cb: () => void) => { if (event === 'spawn') cb(); }),
      kill,
    });

    const mockConnection = {
      sendRequest: jest.fn().mockReturnValue(new Promise(() => {})),
      listen: jest.fn(),
      dispose: jest.fn(),
      sendNotification: jest.fn(),
    } as any;
    const createConnectionMock = jest.fn().mockReturnValue(mockConnection);

    const config = {
      servers: {
        typescript: { command: 'ts-server', args: ['--stdio'] }
      },
      extensions: { ts: 'typescript' }
    };

    const manager = new LSPManager(config, spawnMock as any, createConnectionMock as any, { initializeTimeoutMs: 10 });

    await expect(manager.startServer('typescript')).rejects.toThrow('timed out');
    expect(mockConnection.dispose).toHaveBeenCalled();
    expect(kill).toHaveBeenCalled();
  });

  it('should fail if the server exits before initialize completes', async () => {
    const kill = jest.fn();
    const spawnMock = jest.fn().mockReturnValue({
      stdin: { write: jest.fn(), end: jest.fn(), on: jest.fn() },
      stdout: { on: jest.fn() },
      on: jest.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'spawn') cb();
        if (event === 'exit') setTimeout(() => cb(1, null), 0);
      }),
      kill,
    });

    const mockConnection = {
      sendRequest: jest.fn().mockReturnValue(new Promise(() => {})),
      listen: jest.fn(),
      dispose: jest.fn(),
      sendNotification: jest.fn(),
    } as any;
    const createConnectionMock = jest.fn().mockReturnValue(mockConnection);

    const config = {
      servers: {
        typescript: { command: 'ts-server', args: ['--stdio'] }
      },
      extensions: { ts: 'typescript' }
    };

    const manager = new LSPManager(config, spawnMock as any, createConnectionMock as any, { initializeTimeoutMs: 1000 });

    await expect(manager.startServer('typescript')).rejects.toThrow('exited before initialization');
    expect(mockConnection.dispose).toHaveBeenCalled();
    expect(kill).toHaveBeenCalled();
  });
});
