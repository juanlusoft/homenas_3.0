/**
 * HomePiNAS Agent — Service Network Tests
 */

jest.mock('https', () => ({
  Agent: jest.fn(() => ({})),
  request: jest.fn((opts, cb) => {
    const mockRes = {
      statusCode: 200,
      on: jest.fn((event, handler) => {
        if (event === 'data') handler('{"success":true}');
        if (event === 'end') handler();
      })
    };
    if (cb) cb(mockRes);
    return {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn()
    };
  })
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
}));

jest.mock('../src/service-utils', () => ({
  log: jest.fn(),
  CONFIG_DIR: '/tmp/test',
  saveConfig: jest.fn()
}));

describe('Service Network', () => {
  let network;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      network = require('../src/service-network');
    });
  });

  test('exports expected functions', () => {
    expect(typeof network.discoverNAS).toBe('function');
    expect(typeof network.getLocalSubnet).toBe('function');
    expect(typeof network.testConnection).toBe('function');
    expect(typeof network.NASApi).toBe('function');
    expect(typeof network.registerWithNAS).toBe('function');
    expect(typeof network.getLocalIP).toBe('function');
  });

  test('NASApi can be instantiated', () => {
    const api = new network.NASApi();
    expect(api).toBeDefined();
    expect(typeof api.request).toBe('function');
    expect(typeof api.register).toBe('function');
    expect(typeof api.poll).toBe('function');
    expect(typeof api.report).toBe('function');
  });

  test('getLocalSubnet returns subnet prefix', () => {
    const subnet = network.getLocalSubnet();
    // Should return a string like "192.168.1" or null
    if (subnet) {
      expect(subnet).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test('getLocalIP returns an IP or hostname', () => {
    const ip = network.getLocalIP();
    expect(typeof ip).toBe('string');
    expect(ip.length).toBeGreaterThan(0);
  });

  test('testConnection resolves boolean', async () => {
    const result = await network.testConnection('192.168.1.100', 443);
    expect(typeof result).toBe('boolean');
  });
});
