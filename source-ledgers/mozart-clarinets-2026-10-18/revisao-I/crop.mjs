import sharp from 'sharp';
import fs from 'node:fs/promises';
const dir='source-ledgers/mozart-clarinets-2026-10-18/revisao-I';
await fs.mkdir(`${dir}/crops`,{recursive:true});
for(const [page,top,height,name,left=180,width=2200] of [
  [1,740,720,'p1-a'],[1,1440,640,'p1-b'],[1,2070,620,'p1-c'],[1,2640,630,'p1-d'],
  [2,300,660,'p2-a'],[2,930,680,'p2-b'],[2,1580,680,'p2-c'],[2,2220,630,'p2-d'],[2,2830,520,'p2-e'],
  [3,240,660,'p3-a'],[3,900,670,'p3-b'],[3,1560,660,'p3-c'],[3,2220,630,'p3-d'],[3,2830,410,'p3-e'],
  [3,800,350,'p3-oboe'],[2,1500,340,'p2-flute'],
  [3,1450,350,'p3-244',730,1650],[3,1990,360,'p3-263',750,1600],
  [4,0,900,'p4-a'],[4,850,650,'p4-b'],[4,1480,650,'p4-c'],[4,2110,650,'p4-d'],[4,2720,650,'p4-e'],
  [4,1990,220,'p4-65',1850,550],[4,2200,300,'p4-67',200,1600],
  [4,2620,300,'p4-98',1650,750],[4,3080,240,'p4-117',2000,400],
  [4,430,240,'p4-opening',1100,1300],
  [5,200,660,'p5-a'],[5,840,650,'p5-b'],[5,1460,650,'p5-c'],[5,2080,650,'p5-d'],[5,2700,650,'p5-e']
]) await sharp(`tmp/pdfs/mozart-clarinets-2026-10-18/omr-300dpi-${String(page).padStart(2,'0')}.png`).extract({left,top,width,height}).png().toFile(`${dir}/crops/${name}.png`);
