import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(root, "assets");

fs.mkdirSync(assetsDir, { recursive: true });

const colors = {
  bg: [247, 248, 248, 255],
  ink: [32, 33, 36, 255],
  muted: [104, 112, 118, 255],
  primary: [20, 108, 95, 255],
  primaryDark: [15, 79, 70, 255],
  paper: [255, 255, 255, 255],
  staff: [77, 84, 90, 255],
  accent: [232, 190, 92, 255]
};

function makeCanvas(width, height, color) {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set(color, i);
  }
  return { width, height, pixels };
}

function drawIcon(size) {
  const canvas = makeCanvas(size, size, colors.primary);
  const m = 132;
  roundRect(canvas, m, m, size - m * 2, size - m * 2, 88, colors.paper);
  roundRect(canvas, m + 38, m + 54, size - (m + 38) * 2, size - (m + 70) * 2, 32, [242, 244, 244, 255]);
  for (let i = 0; i < 5; i++) {
    rect(canvas, 250, 328 + i * 64, 524, 14, colors.staff);
  }
  ellipse(canvas, 394, 545, 74, 52, colors.primary);
  rect(canvas, 456, 315, 24, 230, colors.primary);
  ellipse(canvas, 624, 450, 74, 52, colors.primaryDark);
  rect(canvas, 686, 252, 24, 202, colors.primaryDark);
  rect(canvas, 456, 315, 254, 22, colors.primary);
  roundRect(canvas, 270, 706, 484, 74, 37, colors.accent);
  return canvas;
}

function drawSplash(width, height) {
  const canvas = makeCanvas(width, height, colors.bg);
  const iconSize = 360;
  const x = Math.floor((width - iconSize) / 2);
  const y = Math.floor(height * 0.32);
  const icon = drawIcon(1024);
  blitScaled(canvas, icon, x, y, iconSize, iconSize);
  for (let i = 0; i < 5; i++) {
    rect(canvas, Math.floor(width * 0.26), y + iconSize + 180 + i * 38, Math.floor(width * 0.48), 7, colors.muted);
  }
  ellipse(canvas, Math.floor(width * 0.45), y + iconSize + 305, 46, 32, colors.primary);
  rect(canvas, Math.floor(width * 0.49), y + iconSize + 180, 12, 128, colors.primary);
  ellipse(canvas, Math.floor(width * 0.56), y + iconSize + 254, 46, 32, colors.primaryDark);
  rect(canvas, Math.floor(width * 0.60), y + iconSize + 150, 12, 108, colors.primaryDark);
  return canvas;
}

function rect(canvas, x, y, width, height, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) setPixel(canvas, px, py, color);
  }
}

function roundRect(canvas, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      const dx = px < x + radius ? x + radius - px : px >= x + width - radius ? px - (x + width - radius - 1) : 0;
      const dy = py < y + radius ? y + radius - py : py >= y + height - radius ? py - (y + height - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius) setPixel(canvas, px, py, color);
    }
  }
}

function ellipse(canvas, cx, cy, rx, ry, color) {
  for (let py = cy - ry; py <= cy + ry; py++) {
    for (let px = cx - rx; px <= cx + rx; px++) {
      const nx = (px - cx) / rx;
      const ny = (py - cy) / ry;
      if (nx * nx + ny * ny <= 1) setPixel(canvas, px, py, color);
    }
  }
}

function blit(target, source, x, y) {
  for (let py = 0; py < source.height; py++) {
    for (let px = 0; px < source.width; px++) {
      const si = (py * source.width + px) * 4;
      setPixel(target, x + px, y + py, source.pixels.subarray(si, si + 4));
    }
  }
}

function blitScaled(target, source, x, y, width, height) {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const sx = Math.floor((px / width) * source.width);
      const sy = Math.floor((py / height) * source.height);
      const si = (sy * source.width + sx) * 4;
      setPixel(target, x + px, y + py, source.pixels.subarray(si, si + 4));
    }
  }
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  canvas.pixels.set(color, (y * canvas.width + x) * 4);
}

function writePng(filePath, canvas) {
  const rows = [];
  for (let y = 0; y < canvas.height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(canvas.pixels.subarray(y * canvas.width * 4, (y + 1) * canvas.width * 4)));
  }
  const raw = Buffer.concat(rows);
  const data = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(canvas.width, canvas.height)),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, data);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

writePng(path.join(assetsDir, "icon.png"), drawIcon(1024));
writePng(path.join(assetsDir, "splash.png"), drawSplash(1290, 2796));
