import { jest } from '@jest/globals';
import { Command } from 'commander';
import { execSync } from 'node:child_process';

describe('CLI', () => {
  it('should parse arguments', () => {
    const program = new Command();
    program
      .requiredOption('--name <name>', 'Name of the design')
      .option('--pwd <path>', 'Custom working directory', 'cwd')
      .option('--config <path>', 'Path to LSP config')
      .argument('<files...>', 'Input file paths');

    program.parse(['node', 'test', '--name', 'my-design', 'file.ts']);
    
    expect(program.opts().name).toBe('my-design');
    expect(program.args).toContain('file.ts');
    expect(program.opts().config).toBeUndefined();
  });

  it('should parse --output', () => {
    const program = new Command();
    program
      .requiredOption('--name <name>', 'Name of the design')
      .option('--output <path>', 'Directory for generated artifacts')
      .argument('<files...>', 'Input file paths');

    program.parse(['node', 'test', '--name', 'my-design', '--output', '../docs', 'file.ts']);

    expect(program.opts().output).toBe('../docs');
  });

  it('should parse --config', () => {
    const program = new Command();
    program
      .requiredOption('--name <name>', 'Name of the design')
      .option('--config <path>', 'Path to LSP config')
      .argument('<files...>', 'Input file paths');

    program.parse(['node', 'test', '--name', 'my-design', '--config', 'custom/lsp.json', 'file.ts']);

    expect(program.opts().config).toBe('custom/lsp.json');
  });
});

describe('CLI Validation', () => {
  it('should exit with 1 and print error when pwd does not exist', () => {
    let threw = false;
    try {
      execSync('npx tsx src/cli.ts --name test --pwd C:\\non-existent-pwd-dir-test file.ts', {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      threw = true;
      expect(err.status).toBe(1);
      const stderr = err.stderr.toString();
      expect(stderr).toContain('Error: Working directory (pwd) does not exist');
    }
    expect(threw).toBe(true);
  });

  it('should exit with 1 and print error when input file does not exist', () => {
    let threw = false;
    try {
      execSync('npx tsx src/cli.ts --name test --pwd . non-existent-file-test-123.ts', {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      threw = true;
      expect(err.status).toBe(1);
      const stderr = err.stderr.toString();
      expect(stderr).toContain('Error: Input file does not exist');
    }
    expect(threw).toBe(true);
  });
});

