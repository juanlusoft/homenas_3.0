/**
 * Agent Service — NAS discovery & network
 * Split from agent-service.js for maintainability
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { log, CONFIG_DIR, saveConfig } = require('./service-utils');

async function discoverNAS() {
  log('Starting NAS discovery (mDNS + subnet scan)');
  
  const results = [];
  
  // Try mDNS first (if bonjour-service is available)
  try {
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    
    const found = await new Promise((resolve) => {
      const services = [];
      const browser = bonjour.find({ type: 'homepinas', protocol: 'tcp' });
      
      browser.on('up', (service) => {
        log(`mDNS: Found ${service.name} at ${service.host}:${service.port}`);
        services.push({
          address: service.host,
          port: service.port,
          name: service.name,
          method: 'mdns'
        });
      });
      
      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        resolve(services);
      }, 5000);
    });
    
    results.push(...found);
  } catch (e) {
    log(`mDNS discovery failed: ${e.message}`, 'WARN');
  }
  
  // Fallback: subnet scan
  if (results.length === 0) {
    log('mDNS found nothing, trying subnet scan');
    const subnet = getLocalSubnet();
    if (subnet) {
      const scanResults = await scanSubnet(subnet);
      results.push(...scanResults);
    }
  }
  
  return results;
}

function getLocalSubnet() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }
  return null;
}

async function scanSubnet(subnetPrefix) {
  const results = [];
  const commonPorts = [443, 80, 3000];
  
  // Scan common IPs (gateway, .100, .101, etc.)
  const targets = [1, 100, 101, 102, 50, 200];
  
  for (const lastOctet of targets) {
    const ip = `${subnetPrefix}.${lastOctet}`;
    for (const port of commonPorts) {
      try {
        const reachable = await testConnection(ip, port);
        if (reachable) {
          log(`Subnet scan: Found ${ip}:${port}`);
          results.push({ address: ip, port, method: 'subnet' });
        }
      } catch (e) {}
    }
  }
  
  return results;
}

function testConnection(address, port) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: address,
      port,
      path: '/api/active-backup/agent/register',
      method: 'POST',
      timeout: 3000,
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 400);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(JSON.stringify({ hostname: 'discovery-test' }));
    req.end();
  });
}

// ── NAS API ──────────────────────────────────────────────────────────────────

class NASApi {
  constructor(caPath = null) {
    this.agent = new https.Agent({ 
      rejectUnauthorized: false,
      timeout: 120000
    });
    
    if (caPath && fs.existsSync(caPath)) {
      try {
        const ca = fs.readFileSync(caPath);
        this.agent = new https.Agent({ ca, rejectUnauthorized: true });
      } catch (e) {
        log(`Could not load CA cert: ${e.message}`, 'WARN');
      }
    }
  }
  
  request(method, address, port, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: address,
        port,
        path: `/api${reqPath}`,
        method,
        agent: this.agent,
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(json.error || `HTTP ${res.statusCode}`));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error('Invalid response from NAS'));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')); });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
  
  async register(address, port, deviceInfo) {
    return this.request('POST', address, port, '/active-backup/agent/register', {}, deviceInfo);
  }
  
  async poll(address, port, agentToken) {
    return this.request('GET', address, port, '/active-backup/agent/poll', { 'X-Agent-Token': agentToken });
  }
  
  async report(address, port, agentToken, result) {
    return this.request('POST', address, port, '/active-backup/agent/report', { 'X-Agent-Token': agentToken }, result);
  }
}

// ── Agent Registration ───────────────────────────────────────────────────────

async function registerWithNAS(api, nasAddress, nasPort) {
  log(`Registering with NAS at ${nasAddress}:${nasPort}`);
  
  const nets = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }
  
  const deviceInfo = {
    hostname: os.hostname(),
    ip: getLocalIP(),
    os: process.platform,
    osVersion: os.release(),
    arch: os.arch(),
    mac,
  };
  
  const result = await api.register(nasAddress, nasPort, deviceInfo);
  log(`Registered: agentId=${result.agentId}, status=${result.status}`);
  
  return {
    nasAddress,
    nasPort,
    agentId: result.agentId,
    agentToken: result.agentToken,
    status: result.status,
  };
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '0.0.0.0';
}

// ── Backup Worker ────────────────────────────────────────────────────────────

let backupWorkerProcess = null;
let backupWorkerStatus = null;
let statusCheckInterval = null;


module.exports = { discoverNAS, getLocalSubnet, scanSubnet, testConnection, NASApi, registerWithNAS, getLocalIP };
