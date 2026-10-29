import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'public/party/assets/favicon.svg'), 'utf8');
const out = join(root, 'public/party/assets/icons');
await mkdir(out, {recursive: true});

const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024];
const maskableSizes = [128, 192, 384, 512, 1024];

async function raster(svg, size) {
  const density = Math.ceil((size * 72) / 64);
  return sharp(Buffer.from(svg), {density}).resize(size, size).flatten({background: '#24172e'}).png().toBuffer();
}

for (const size of sizes) {
  await sharp(await raster(source, size)).toFile(join(out, `icon-${size}.png`));
}

const padded = source.replace(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#24172e"/><g transform="translate(32 32) scale(0.72) translate(-32 -32)">',
).replace('</svg>', '</g></svg>');

for (const size of maskableSizes) {
  await sharp(await raster(padded, size)).flatten({background: '#24172e'}).toFile(join(out, `maskable-${size}.png`));
}

// Browser fallbacks and direct home-screen discovery share the same artwork.
await writeFile(join(root, 'public/favicon.svg'), source);
await writeFile(join(root, 'public/apple-touch-icon.png'), await raster(source, 180));
const icoSizes = [16, 32, 48];
const buffers = await Promise.all(icoSizes.map(size => raster(source, size)));
const header = Buffer.alloc(6 + 16 * buffers.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(buffers.length, 4);
let offset = header.length;
buffers.forEach((buffer, i) => {
  const at = 6 + 16 * i;
  header[at] = header[at + 1] = icoSizes[i];
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(buffer.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += buffer.length;
});
await writeFile(join(root, 'public/favicon.ico'), Buffer.concat([header, ...buffers]));
