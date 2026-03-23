/**
 * HomePiNAS Agent — Service Utils Tests
 */

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

const fs = require('fs');

describe('Service Utils', () => {
  let utils;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      utils = require('../src/service-utils');
    });
  });

  test('exports expected functions', () => {
    expect(typeof utils.log).toBe('function');
    expect(typeof utils.loadConfig).toBe('function');
    expect(typeof utils.saveConfig).toBe('function');
    expect(typeof utils.updateStatus).toBe('function');
    expect(typeof utils.loadStatus).toBe('function');
  });

  test('exports expected constants', () => {
    expect(utils.CONFIG_DIR).toBeDefined();
    expect(utils.CONFIG_FILE).toBeDefined();
    expect(utils.STATUS_FILE).toBeDefined();
    expect(utils.LOG_FILE).toBeDefined();
  });

  test('log does not throw', () => {
    expect(() => utils.log('test message')).not.toThrow();
    expect(() => utils.log('warning', 'WARN')).not.toThrow();
  });

  test('loadConfig returns parsed config', () => {
    fs.readFileSync.mockReturnValueOnce('{"nasAddress":"192.168.1.100"}');
    const config = utils.loadConfig();
    expect(config.nasAddress).toBe('192.168.1.100');
  });

  test('loadConfig returns null on missing file', () => {
    fs.readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const config = utils.loadConfig();
    expect(config).toBeNull();
  });

  test('saveConfig writes JSON', () => {
    utils.saveConfig({ test: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = fs.writeFileSync.mock.calls[0][1];
    expect(JSON.parse(written).test).toBe(true);
  });

  test('updateStatus writes status file', () => {
    utils.updateStatus({ status: 'running' });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('loadStatus returns parsed status', () => {
    fs.readFileSync.mockReturnValueOnce('{"status":"idle"}');
    const status = utils.loadStatus();
    expect(status.status).toBe('idle');
  });
});
