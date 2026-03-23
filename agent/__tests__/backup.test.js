/**
 * HomePiNAS Agent — Backup Manager Tests
 */

jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; }
    if (cb) cb(null, '', '');
  }),
  spawn: jest.fn(() => {
    const { EventEmitter } = require('events');
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.pid = 12345;
    return proc;
  })
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(() => ''),
  unlinkSync: jest.fn()
}));

describe('BackupManager', () => {
  let BackupManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      ({ BackupManager } = require('../src/backup'));
    });
  });

  test('can be instantiated', () => {
    const bm = new BackupManager();
    expect(bm).toBeDefined();
    expect(bm.running).toBe(false);
    expect(bm.platform).toBeDefined();
  });

  test('progress starts null', () => {
    const bm = new BackupManager();
    expect(bm.progress).toBeNull();
  });

  test('logContent returns string', () => {
    const bm = new BackupManager();
    expect(typeof bm.logContent).toBe('string');
  });

  test('runBackup rejects if already running', async () => {
    const bm = new BackupManager();
    bm.running = true;
    await expect(bm.runBackup({})).rejects.toThrow(/already running/i);
  });

  test('has platform-specific methods', () => {
    const bm = new BackupManager();
    expect(typeof bm._runWindowsBackup).toBe('function');
    expect(typeof bm._runMacBackup).toBe('function');
    expect(typeof bm._runLinuxBackup).toBe('function');
  });

  test('_setProgress updates progress', () => {
    const bm = new BackupManager();
    bm._setProgress('test', 50, 'halfway');
    expect(bm.progress.phase).toBe('test');
    expect(bm.progress.percent).toBe(50);
  });

  test('_setProgress clamps percent 0-100', () => {
    const bm = new BackupManager();
    bm._setProgress('test', 150, 'over');
    expect(bm.progress.percent).toBe(100);
    bm._setProgress('test', -10, 'under');
    expect(bm.progress.percent).toBe(0);
  });
});

// Scheduler tests skipped — requires node-cron (agent dependency, not in root node_modules)
