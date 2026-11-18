import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const repo = process.cwd();
const arg = name => { const i=process.argv.indexOf(name); return i<0?undefined:process.argv[i+1]; };
const pages=(arg('--pages')??'01,02,03,04,05,06,07,08,09,10').split(',');
const jobs=Number(arg('--jobs')??2);
if(pages.some(n=>! /^(0[1-9]|10)$/.test(n)) || !Number.isInteger(jobs) || jobs<1 || jobs>2) throw new Error('Invalid bounded OMR selection');
const app=path.join(repo,'.local/audiveris-5.10.2/mnt/Audiveris.app/Contents');
const java=path.join(app,'runtime/Contents/Home/bin/java');
await fs.access(java,1);
const variant=arg('--variant');
if(variant && !/^[a-z][a-z0-9-]{0,31}$/.test(variant)) throw new Error('Invalid bounded OMR variant');
const root=path.join(repo,'tmp/mozart-omr-2026-10-18',...(variant?[variant]:[]));
const userHome=path.join(repo,'.local/audiveris-5.10.2/runtime-user-home');
await fs.mkdir(root,{recursive:true});
const active=new Set();
let stopping=false;
function signal(child,sig) { try {process.kill(-child.pid,sig);} catch {} }
for(const name of ['SIGTERM','SIGINT']) process.on(name,()=>{stopping=true;for(const child of active) signal(child,'SIGTERM');});
async function run(page) {
  if(stopping) return;
  const dir=path.join(root,`page-${page}`);
  const prior=await fs.readFile(path.join(dir,'run.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(prior?.status==='finished' && prior.code===0 && prior.xmlFiles?.length) {console.log(JSON.stringify({page,reused:true,...prior}));return;}
  await fs.mkdir(dir,{recursive:true});
  const temp=path.join(dir,'java-tmp');
  await fs.mkdir(temp,{recursive:true});
  const image=path.join(repo,'tmp/pdfs/mozart-clarinets-2026-10-18',`omr-300dpi-${page}.png`);
  await fs.access(image);
  const startedAt=new Date().toISOString();
  const initial={page:Number(page),part:Number(page)<=5?'Clarinetto I in A':'Clarinetto II in A',status:'processing',startedAt};
  await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(initial,null,2)+'\n');
  const log=createWriteStream(path.join(dir,'engine.log'),{flags:'a'});
  const args=['-Xms256m','-Xmx2g','-XX:ActiveProcessorCount=2',`-Duser.home=${userHome}`,`-Djava.io.tmpdir=${temp}`,
    '-Dfile.encoding=UTF-8','-Djava.awt.headless=true','--add-exports=java.desktop/sun.awt.image=ALL-UNNAMED','--enable-native-access=ALL-UNNAMED',
    '-cp',path.join(app,'app/*'),'Audiveris','-batch','-transcribe','-save','-export','-constant',
    'org.audiveris.omr.sheet.BookManager.useCompression=false','-output',dir,'--',image];
  console.log(JSON.stringify({page,startedAt,status:'processing'}));
  const child=spawn(java,args,{cwd:repo,env:process.env,stdio:['ignore','pipe','pipe'],detached:true});
  active.add(child);
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;signal(child,'SIGTERM');setTimeout(()=>signal(child,'SIGKILL'),3000).unref();},15*60*1000);
  const result=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:String(error)}));child.once('close',(code,signal)=>resolve({code,signal}));});
  clearTimeout(timeout);active.delete(child);await new Promise(resolve=>log.end(resolve));
  const walk=async folder=>{const files=[];for(const entry of await fs.readdir(folder,{withFileTypes:true})){const p=path.join(folder,entry.name);if(entry.isDirectory() && entry.name!=='java-tmp')files.push(...await walk(p));else if(entry.isFile())files.push(p);}return files;};
  const files=await walk(dir);
  const final={...initial,status:'finished',...result,timedOut,finishedAt:new Date().toISOString(),xmlFiles:files.filter(f=>/\.(musicxml|xml|mxl)$/i.test(f)),nativeFiles:files.filter(f=>/\.omr$/i.test(f))};
  await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(final,null,2)+'\n');
  console.log(JSON.stringify(final));
}
let cursor=0;
await Promise.all(Array.from({length:jobs},async()=>{while(cursor<pages.length && !stopping){const page=pages[cursor++];await run(page);}}));
