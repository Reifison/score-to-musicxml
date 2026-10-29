import sharp from 'sharp';
import fs from 'node:fs';
const root = new URL('./', import.meta.url).pathname;
fs.mkdirSync(root+'crops',{recursive:true});
const [page, x, y, width, height, name] = process.argv.slice(2);
await sharp(`tmp/pdfs/mozart-clarinets-2026-10-18/omr-300dpi-${String(page).padStart(2,'0')}.png`).extract({left:+x,top:+y,width:+width,height:+height}).toFile(root+`crops/${name}.png`);
