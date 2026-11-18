import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import createModule from 'verovio/wasm';
import {VerovioToolkit} from 'verovio/esm';
const dir=path.dirname(new URL(import.meta.url).pathname);
const mod=await createModule(),tk=new VerovioToolkit(mod);
tk.setOptions({pageWidth:2400,pageHeight:3200,scale:40,breaks:'encoded',footer:'none',adjustPageHeight:true});
const loaded=tk.loadData(fs.readFileSync('output/mozart-clarinets-2026-10-18/Clarinet-II-reviewed.musicxml','utf8'));
if(!loaded)throw new Error(tk.getLog());
fs.mkdirSync(dir+'/rendered',{recursive:true});
for(let i=1;i<=tk.getPageCount();i++){const svg=tk.renderToSVG(i,{});fs.writeFileSync(`${dir}/rendered/page-${String(i).padStart(2,'0')}.svg`,svg);await sharp(Buffer.from(svg)).flatten({background:'#fff'}).png().toFile(`${dir}/rendered/page-${String(i).padStart(2,'0')}.png`);}
fs.writeFileSync(dir+'/render-report.json',JSON.stringify({loaded,pages:tk.getPageCount(),version:tk.getVersion(),log:tk.getLog()},null,2)+'\n');
console.log(JSON.stringify({loaded,pages:tk.getPageCount(),log:tk.getLog()}));
