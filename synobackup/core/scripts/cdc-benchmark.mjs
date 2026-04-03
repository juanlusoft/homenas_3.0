#!/usr/bin/env node

import crypto from 'crypto';

const FIXED_CHUNK_SIZE = 4 * 1024 * 1024;
const CDC_MIN = 128 * 1024;
const CDC_AVG = 512 * 1024;
const CDC_MAX = 2 * 1024 * 1024;
const CDC_PRE_MASK = (1 << 19) - 1;
const CDC_POST_MASK = (1 << 17) - 1;
const CDC_WINDOW = 48;

const gearTable = [
  0x2d358dcc, 0xaa6c78a1, 0xa5a0b0f5, 0x62db15d0, 0x0993d58f, 0x4eab86a7, 0x7af7562c, 0x1f4f6d92,
  0x30f98ea9, 0x56f48c5b, 0x91f5a3d4, 0x4bd2779e, 0x6e8b3af1, 0xdde2c6a0, 0x15f2c9d7, 0xe95f7911,
  0x5f7ab942, 0x6c2f4188, 0x8637d721, 0x0cc53da5, 0x2c1f6789, 0x8d7ee132, 0xbb4fa8c3, 0x4a32bd17,
  0x17eac55d, 0xc6248814, 0x35c7fa91, 0xf11ab83e, 0x7423c6d9, 0x28e67a4c, 0x93ad2157, 0x07df3eb0,
  0x1acb57d2, 0x6f45b08c, 0xb6723da1, 0x3f8135fa, 0x8a26d471, 0xcf59b62d, 0x542dd18e, 0x127af4c3,
  0xf69b1d28, 0x2eb1c047, 0x7d8865b4, 0x90d3bf51, 0x48567ea0, 0x649c9327, 0xac1ed56f, 0x3ba4e889,
  0xda803f1c, 0x230b7a6e, 0x0f6dd29a, 0x9c3275d8, 0x72be44a1, 0x58d12f36, 0xe3f48b27, 0x1d99c6b0,
  0xc3a75ef4, 0x443efaa2, 0x7bf31c69, 0x89d7a54f, 0x24f1b8e3, 0xd4c88a10, 0x6af03bd7, 0x315d6cc4,
  0x8f41d2ea, 0x0ab8c759, 0x53de14bc, 0xf3a6e285, 0x2f976d31, 0x7c0ad5e4, 0x9961bf20, 0x40c29e73,
  0x14de6ba8, 0xe1a34f95, 0x67cb1d42, 0x3ce81a7f, 0xb28f64d9, 0x5a1793c1, 0x841d2eb6, 0x1bccf570,
  0xfd7192aa, 0x2738c641, 0x6b5e3f19, 0x92a4dd57, 0x4f1bb2c8, 0x188d74f3, 0xc9e25a1d, 0x73f6c08e,
  0x36b4af29, 0xae982751, 0x0d4f6eb2, 0xe57ad913, 0x62a1c5dc, 0x54cb31f0, 0x9a7f4b86, 0x21d36e45,
  0x77c912ba, 0x4c6fe7d0, 0x13a5b98e, 0xd8e42361, 0x68db7fa5, 0x055e34f2, 0xbcf09847, 0x2ac71d93,
  0xe84f1c2b, 0x5d9a7ee1, 0x816b43d4, 0x39f8cd60, 0x9741a6b7, 0x6d35f09a, 0x20ce8741, 0xf5481bde,
  0x47a26fd5, 0x1ebcf430, 0xc16d82a9, 0x7034bde2, 0x8c51e7fa, 0x33f0a69d, 0x0e2d5c74, 0xdb8a1746,
  0x5b4e29c1, 0x65d7143a, 0x99c0ef57, 0x24a3b801, 0xe7fb4d2c, 0x16d95a8f, 0x7ec430b5, 0x41af72d8,
  0x93274e18, 0x2b6ec4f1, 0xd0f935a4, 0x5ef4872d, 0x18c1db76, 0xa47d6ae3, 0x6a08b519, 0x37f29ce0,
  0x8e5ad341, 0x03d4ff6a, 0xf8261b9d, 0x4d78a25c, 0x1503ce87, 0xc66fb918, 0x71a4e3d2, 0x2c89d740,
  0xe2b314fd, 0x5c4d7aa6, 0x97f26130, 0x0b8d49c5, 0x74dc83ef, 0x3abfdc12, 0xb5e67029, 0x66491ea4,
  0x1c7358db, 0xcf18a245, 0x823ed769, 0x49e5b10c, 0xf0ab3471, 0x263f8ec2, 0x7ab9d51e, 0x54c60fa8,
  0x0ddf7213, 0xea45bc98, 0x616e53d7, 0x309bd8af, 0x8b2641c0, 0x57f3ae24, 0xc85d197b, 0x12ca64e1,
  0x946f30bd, 0x2dc5f783, 0x7f1a4b56, 0x48b82ed0, 0x1fa3dc69, 0xd5c79014, 0x6834a2ff, 0x34de57c1,
  0xa9f1723b, 0x0c4e8db1, 0xe61d4395, 0x53ba60f8, 0x95c4872a, 0x27df19ce, 0x7db63f40, 0x4068a1d7,
  0x18fdc452, 0xcb7e2a91, 0x6245bf1d, 0x3d92e70c, 0xb18c54a6, 0x59f31ad8, 0x84d76c23, 0x13b8f905,
  0xf72a4ec1, 0x2e5d17b4, 0x69cb83da, 0x907f2a18, 0x4b14d6e7, 0x1649af30, 0xc2d53b5f, 0x7a3681a4,
  0x31cf5ad9, 0x8d7b20e6, 0x0af4315c, 0xe4c8bd73, 0x56d29708, 0x9be167c1, 0x25fc4e3d, 0x6f0ab892,
  0x1a95d743, 0xd67ce12f, 0x72b3a564, 0x4ed826b8, 0xf45ac09d, 0x208f1be7, 0x883761da, 0x37c42915,
  0x5dc8fe31, 0xa61b74c0, 0x0f529ae8, 0xe9af35d1, 0x631e48b4, 0x14c7df52, 0xcda34b79, 0x7bb58106,
  0x42e06a9c, 0x99d4f215, 0x2af73dc8, 0x70c18b43, 0x1d6ae950, 0xf38b2761, 0x84f1cda7, 0x36be5429,
  0x5f2d89b6, 0xc41a73ec, 0x0867de15, 0xeb549230, 0x65a83bc7, 0x3274f0d9, 0x9d1ec54a, 0x2cfa68b1,
  0x7e430fd2, 0x49bd71a8, 0x11f4ce36, 0xd3a85b7c, 0x6cb1270e, 0x257d94e1, 0x8f3ae645, 0x54d8bc12,
  0xe1c73d9a, 0x18be5204, 0xca64f871, 0x73d1093f, 0x3b8f6d25, 0xa4e153c8, 0x0e79ba54, 0xf61cd027,
];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function rotl32(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function fixedChunks(buffer) {
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += FIXED_CHUNK_SIZE) {
    const chunk = buffer.subarray(offset, Math.min(offset + FIXED_CHUNK_SIZE, buffer.length));
    chunks.push({ hash: sha256(chunk), size: chunk.length });
  }
  return chunks;
}

function cdcChunks(buffer) {
  if (buffer.length === 0) return [];
  const chunks = [];
  let start = 0;
  let hash = 0;
  const window = new Uint8Array(CDC_WINDOW);
  let windowCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (windowCount < CDC_WINDOW) {
      hash = (rotl32(hash, 1) ^ gearTable[byte]) >>> 0;
      window[windowCount++] = byte;
    } else {
      const slot = i % CDC_WINDOW;
      const out = window[slot];
      window[slot] = byte;
      hash = (rotl32(hash, 1) ^ rotl32(gearTable[out], CDC_WINDOW % 32) ^ gearTable[byte]) >>> 0;
    }
    const size = i - start + 1;
    if (size < CDC_MIN) continue;
    const mask = size < CDC_AVG ? CDC_PRE_MASK : CDC_POST_MASK;
    if ((hash & mask) === 0 || size >= CDC_MAX) {
      const chunk = buffer.subarray(start, i + 1);
      chunks.push({ hash: sha256(chunk), size: chunk.length });
      start = i + 1;
      hash = 0;
      windowCount = 0;
    }
  }
  if (start < buffer.length) {
    const chunk = buffer.subarray(start);
    chunks.push({ hash: sha256(chunk), size: chunk.length });
  }
  return chunks;
}

function reuseStats(baseChunks, nextChunks) {
  const base = new Map(baseChunks.map((chunk) => [chunk.hash, chunk.size]));
  let reusedChunks = 0;
  let reusedBytes = 0;
  for (const chunk of nextChunks) {
    if (!base.has(chunk.hash)) continue;
    reusedChunks += 1;
    reusedBytes += chunk.size;
  }
  return {
    totalChunks: nextChunks.length,
    reusedChunks,
    reusedBytes,
    reusedRatio: nextChunks.length > 0 ? reusedChunks / nextChunks.length : 0,
  };
}

function makeBaseBuffer(size) {
  const out = Buffer.allocUnsafe(size);
  let state = 0x12345678;
  for (let i = 0; i < out.length; i++) {
    state = (1664525 * state + 1013904223) >>> 0;
    out[i] = state & 0xff;
  }
  return out;
}

function scenarioBuffers(base) {
  const prepend = Buffer.concat([Buffer.alloc(64 * 1024, 0x7a), base]);
  const append = Buffer.concat([base, Buffer.alloc(64 * 1024, 0x6b)]);
  const insertAt = Math.floor(base.length / 2);
  const insert = Buffer.concat([
    base.subarray(0, insertAt),
    Buffer.alloc(128 * 1024, 0x5c),
    base.subarray(insertAt),
  ]);
  const modify = Buffer.from(base);
  modify.fill(0x33, 5 * 1024 * 1024, 5 * 1024 * 1024 + 128 * 1024);
  return { prepend, append, insert, modify };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function benchmark() {
  const base = makeBaseBuffer(32 * 1024 * 1024);
  const scenarios = scenarioBuffers(base);
  const fixedBase = fixedChunks(base);
  const cdcBase = cdcChunks(base);

  const results = Object.entries(scenarios).map(([name, buffer]) => {
    const fixed = reuseStats(fixedBase, fixedChunks(buffer));
    const cdc = reuseStats(cdcBase, cdcChunks(buffer));
    return {
      scenario: name,
      fixed: {
        ...fixed,
        reusedRatio: formatPercent(fixed.reusedRatio),
      },
      cdc: {
        ...cdc,
        reusedRatio: formatPercent(cdc.reusedRatio),
      },
      improvementBytes: cdc.reusedBytes - fixed.reusedBytes,
    };
  });

  return {
    baseBytes: base.length,
    fixedBaseChunks: fixedBase.length,
    cdcBaseChunks: cdcBase.length,
    results,
  };
}

console.log(JSON.stringify(benchmark(), null, 2));
