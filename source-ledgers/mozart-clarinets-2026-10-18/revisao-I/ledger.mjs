// Manual source ledger. Pitch tokens are written pitches (key: one flat).
// w/h/q/e/s/t = whole/half/quarter/eighth/16th/32nd; d = augmentation dot.
// ~ = tie to next event; ( and ) = phrasing slur; . = staccato; ! = staccatissimo.
// Grace notes use :g. Explicit accidentals are #, b, n. Bb is explicit in all data.
export const movements = {I:new Map(),III:new Map()};
export const cues = {I:new Map(),III:new Map()};
export const directions={I:new Map(),III:new Map()};
export const sources=[];
export const multiRests=[];
const put=(mv,n,notes)=>{if(movements[mv].has(n))throw Error(`Duplicate ${mv}-${n}`);movements[mv].set(n,notes);};
export const bar=(mv,n,notes)=>put(mv,n,notes);
export const bars=(mv,start,list)=>list.forEach((notes,i)=>put(mv,start+i,notes));
export const rests=(mv,start,count)=>{for(let n=start;n<start+count;n++)put(mv,n,'r:w');multiRests.push({mv,start,count});};
export const cue=(mv,n,label,notes,extra={})=>cues[mv].set(n,{label,notes,...extra});
export const dir=(mv,n,kind,text,offset=0)=>{const list=directions[mv].get(n)||[];list.push({kind,text,offset});directions[mv].set(n,list);};
export const source=(page,mv,start,end,systems)=>sources.push({page,mv,start,end,systems});

source(1,'I',1,89,[1,10,19,26,36,42,50,58,70,77]);
bars('I',1,['A4:w','A4:h A4:h','A4:w~','A4:q r:q r:h']);
rests('I',5,2);
bars('I',7,['C5:w','C5:h C5:h','C5:w','A4:h A4:h','A4:q A4:q A4:q A4:q','A4:q r:q r:h']);
rests('I',13,2);
bars('I',15,['E5:w','E5:h E5:h','E5:w','E5:h E5:h','F5:q r:q r:h',
 'r:q r:ed C5:s C5:q C5:q','C5:q r:q r:h','r:q r:ed C5:s C5:q C5:q',
 'C5:h D5:h','C5:h D5:h','C5:h D5:h','C5:q r:q r:h']);
rests('I',27,5);
bars('I',32,['r:w','r:w','F5:w','C5:w',
 'A4:q F4:e F4:e F4:q F5:q',
 'F5:e( D5:e) D5:e( Bb4:e) Bb4:e( G4:e) C5:e. C5:e.',
 'C5:e( A4:e) A4:e( F4:e) F4:e( D4:e) Bb4:e. G4:e.',
 'E5:e C5:e F5:e C5:e Bb4:e A4:e G4:e F4:e']);
for(let n=40;n<=47;n++)bar('I',n,`C5:w${n<47?'~':''}`);
bars('I',48,['F5:w','F5:h F5:h','G5:q C5:q C5:q C5:q','C5:q r:q r:h']);
rests('I',52,3);
bars('I',55,['r:w','r:h r:q E5:q(','D5:e) r:e F5:q( E5:e) r:e G5:e! r:e','G5:q( F5:q)tr E5:q r:q']);
rests('I',59,7);
bars('I',66,['r:w','r:w','r:w','r:w','G5:w~','G5:w','F5:w~','F5:w',
 'En5:q C5:q C5:q C5:q','C5:w','C5:h C5:q C5:q','C5:w','C5:h C5:q C5:q','C5:w']);
rests('I',80,1);
bars('I',81,['E5:q! C5:q! G4:q! E4:q!','C5:q! G4:q! E4:q! C4:q!','G4:q r:q G4:q r:q']);
rests('I',84,6);
cue('I',32,'Viol. I','F5:q F4:e F4:e F4:e F4:e F4:e F4:e');
cue('I',33,'','E4:t( D4:t C4:ed) Bb4:e Bb4:e Bb4:e Bb4:e Bb4:e Bb4:e');
cue('I',55,'Viol. I','C6:e. Bn5:e. A5:e. G5:e. F5:e. E5:e. D5:e. C5:e.');
cue('I',56,'','Bn4:e. A4:e. G4:e. F4:e. E4:q r:qi');
cue('I',66,'Viol. I','G6:e( E6:e) r:e E6:e. C6:e. E6:e. C6:e. G5:e.',{octaveStart:true});
cue('I',67,'','G6:e( E6:e) r:e E6:e. C6:e. E6:e. C6:e. G5:e.');
cue('I',68,'','F6:e( D6:e) r:e D6:e. Bn5:e. D6:e. Bn5:e. G5:e.');
cue('I',69,'','F6:e( D6:e) r:e D6:e. Bn5:e. D6:e. Bn5:e. G5:e.',{octaveStop:true});
for(const [n,d] of [[1,'f'],[7,'p'],[9,'f'],[15,'p'],[19,'f'],[34,'f'],[56,'p'],[70,'p'],[74,'f']])dir('I',n,'dynamic',d,n===74?1:n===56?3:0);
dir('I',1,'words','I — Allegro assai');

source(2,'I',90,193,[90,96,102,110,118,127,138,147,155,162,170,179,187]);
bars('I',90,['r:w','r:w','r:w','C5:h C5:q C5:q','C5:w','C5:h C5:q C5:q','C5:w','C5:h C5:q C5:q','C5:w']);
rests('I',99,1);
bars('I',100,['E5:q! C5:q! G4:q! E4:q!','C5:q! G4:q! E4:q! C4:q!',
 'F5:w','E5:w','D5:w','C5:w','E5:w','F5:w~','F5:w','G5:w~','G5:w~','G5:w','E5:w','F5:w~','F5:w','G5:w~','G5:w~','G5:q r:q r:h']);
rests('I',118,1);
bars('I',119,['G4:w','G4:h G4:h','G4:w~','G4:q r:q r:h']);
rests('I',123,2);
bars('I',125,['Bn4:w','Bn4:h Bn4:h','Bn4:w','Bn4:h Bn4:h','C5:g( G5:w)','G5:h G5:h','G5:w']);
rests('I',132,4);
bars('I',136,['r:w','r:q Eb5:q(. Eb5:q. Eb5:q.)']);
for(let n=138;n<=145;n++)bar('I',n,`Eb5:w~`);
bar('I',146,'Eb5:q r:q r:h');
rests('I',147,1);
bar('I',148,'Db5:q r:q r:h');
rests('I',149,1);
bars('I',150,['C5:q r:q r:h','Bb4:qa r:q r:h','Ab4:q r:q r:h']);
rests('I',153,2);
bars('I',155,['r:q G4:q( Ab4:h)','G4:q r:q r:h','r:q E5:q( F5:q Ab4:q)',
 'G4:q r:q r:q Ab4:q(','G4:q) r:q r:q Ab4:q(','G4:q) r:q r:h',
 'r:q Dn5:e( C#5:e D5:e C#5:e D5:e C#5:e)',
 'D5:e( Bb4:e) G4:e. G4:e. D5:e( Bb4:e) G4:e. G4:e.',
 'Bb4:e( G4:e) E4:e. E4:e. Bb4:e( G4:e) E4:e. E4:e.',
 'G4:w','An4:h A4:h','A4:q A4:q A4:q A4:q','A4:q r:q r:h']);
rests('I',168,2);
bars('I',170,['E5:w','E5:h E5:h','E5:w','E5:h E5:h','F5:w','C5:h C5:h','A4:w','A4:h A4:h','D4:w','D4:h D4:h',
 'G4:h~ G4:e A4:s Bn4:s C5:s D5:s E5:s F#5:s','G5:q r:q r:h','C4:w','C4:h C4:h',
 'F4:h~ F4:e G4:s A4:s Bb4:s C5:s D5:s E5:s','F5:q r:q r:h']);
rests('I',186,1);
bars('I',187,['r:q r:ed F5:s F5:q F5:q','F5:q r:q r:h','r:q r:ed D5:s D5:q D5:q','D5:q r:q r:h',
 'r:q r:ed C5:s C5:q C5:q','C5:q r:q r:h','r:q r:ed C5:s C5:q C5:q']);
cue('I',90,'Viol. I','A5:e. A5:e. Bn5:e. C6:e. D6:e. E6:e. F6:e. A5:e.');
cue('I',91,'','G5:e. G5:e. A5:e. Bn5:e. C6:e. D6:e. E6:e. G5:e.');
cue('I',92,'','F5:e. F5:e. G5:e. A5:e. Bn5:e. C6:e. D6:e. F5:e.');
cue('I',136,'Fl. I','Eb6:q( D6:q C6:q Bb5:q)');
cue('I',137,'','A5:q r:hdi');
for(const [n,d,o]of [[93,'f',0],[125,'p',0],[129,'f',0],[137,'p',1],[146,'f',0],[148,'f',0],[150,'f',0],[151,'f',0],[152,'f',0],[155,'p',1],[161,'f',1],[170,'p',0],[174,'f',0]])dir('I',n,'dynamic',d,o);

source(3,'I',194,295,[194,201,211,221,231,237,248,255,266,272,280,288]);
bar('I',194,'C5:q r:q r:h');
rests('I',195,1);
bars('I',196,['F5:w','C5:w','A4:q F4:e F4:e F4:q F5:q',
 'F5:e( D5:e) D5:e( Bb4:e) Bb4:e( G4:e) C5:e. C5:e.',
 'C5:e( A4:e) A4:e( F4:e) F4:e( D4:e) Bb4:e. G4:e.',
 'E5:e C5:e F5:e C5:e Bb4:e A4:e G4:e F4:e',
 'F5:w','F5:h F5:h','G5:q C5:q C5:q C5:q','C5:q r:q r:h']);
rests('I',206,3);
bars('I',209,['r:w','r:h r:q A4:q~','A4:e r:e Bb4:q( A4:e) r:e C5:e! r:e','C5:q( Bb4:q)tr A4:q r:q']);
rests('I',213,4);
bars('I',217,['r:w','r:w','r:w','C5:w~','C5:w','Bb4:w~','Bb4:w','Ab4:q r:q r:h']);
rests('I',225,3);
bars('I',228,['F4:h F4:q F4:q','F4:e G4:s A4:s Bb4:s C5:s D5:s E5:s F5:q r:q',
 'A4:h A4:q A4:q','A4:e Bb4:s C5:s D5:s E5:s F5:s G5:s A5:q r:q',
 'C5:h C5:q C5:q','C5:e D5:s E5:s F5:s G5:s A5:s Bb5:s C6:q r:q',
 'C5:w~','C5:w','F5:q! C5:q! A4:q! F4:q!','C5:q r:q C5:q r:q']);
rests('I',238,6);
bars('I',244,['r:w','r:w','r:h r:q Cn5:e! r:e']);
for(let n=247;n<=250;n++)bar('I',n,'C5:e r:e C5:e r:e C5:e r:e C5:e r:e');
bars('I',251,['C5:w~','C5:w','D5:w','Db5:w','C5:h F5:h~','F5:h E5:h']);
rests('I',257,6);
bars('I',263,['r:w','r:w','r:h r:q Cn5:e! r:e']);
for(let n=266;n<=269;n++)bar('I',n,'C5:e r:e C5:e r:e C5:e r:e C5:e r:e');
bars('I',270,['C5:w~','C5:w','D5:w','F5:w','C5:w~','C5:w','C5:h D5:h','C5:h D5:h',
 'C5:q r:q F5:q r:q','Bb3:q D5:q C5:q E5:q','F5:q C5:q D5:h','C5:h D5:h',
 'C5:q r:q F5:q r:q','Bb3:q D5:q C5:q E5:q']);
for(let n=284;n<=287;n++)bar('I',n,'F4:w~');
bars('I',288,['F4:q r:q r:q F5:q!','A5:q! F5:q! C5:q! A4:q!','F4:w','F4:h F4:h',
 'F4:h~ F4:e G4:s A4:s Bb4:s C5:s D5:s E5:s','F5:q C5:q C5:q C5:q','C5:h C5:h','C5:h r:h']);
cue('I',209,'Viol. I','F6:e. E6:e. D6:e. C6:e. Bb5:e. A5:e. G5:e. F5:e.');
cue('I',210,'','E5:e. D5:e. C5:e. Bb4:e. A4:q r:qi');
cue('I',217,'Ob. I, II','r:h r:q E5+G5:q(');
cue('I',218,'','D5+F5:e) r:e E5+G5:q( D5+F5:e) r:e F5+A5:e. r:e');
cue('I',219,'','F5+A5:q( E5+G5:q)tr D5+F5:q r:q');
cue('I',244,'Viol. I','D6:e. C#6:e. D6:e. C#6:e. D6:e. A5:e. Bb5:e. A5:e.');
cue('I',245,'','C6:e. F#5:e. G5:e. F#5:e. G5:e. A5:e. Bb5:e. A5:e.');
cue('I',246,'','Bb5:e. C#6:e. D6:e. C#6:e. D6:e. E6:e. r:qi');
cue('I',263,'Viol. I','D6:e. C#6:e. D6:e. C#6:e. D6:e. A5:e. Bb5:e. A5:e.');
cue('I',264,'','C6:e. F#5:e. G5:e. F#5:e. G5:e. A5:e. Bb5:e. A5:e.');
cue('I',265,'','Bb5:e. C#6:e. D6:e. C#6:e. D6:e. E6:e. r:qi');
for(const [n,d,o]of [[210,'p',3],[220,'p',0],[228,'f',0],[246,'p',3],[251,'f',0],[265,'p',3],[270,'f',0]])dir('I',n,'dynamic',d,o);
dir('I',248,'words','cresc.',3);dir('I',267,'words','cresc.',3);

source(4,'III',1,118,[1,8,20,27,36,43,58,67,81,89,101,110]);
rests('III',1,8);
bars('III',9,['F4:h F4:q F4:q','A4:h A4:q A4:q','C5:h C5:q C5:q','F5:q r:q r:h']);
rests('III',13,6);
bars('III',19,['r:w','r:w','r:w','F4:h F4:q F4:q','A4:h A4:q A4:q','C5:h C5:q C5:q',
 'F5:w~','F5:w','D5:w','Db5:w','C5:w','C5:w~','C5:w~','C5:w',
 'Dn5:w~','D5:q D5:h D5:q','G5:w~','G5:q G5:h G5:q','Eb5:w~','Eb5:q Eb5:ha Eb5:q',
 'D5:q r:q r:q Eb5:q','D5:h r:q Eb5:q','D5:q G5:q G5:q G5:q','G5:q G5:q G5:q G5:q','G5:h G5:h','G4:h r:h']);
rests('III',45,7);
bars('III',52,['r:w','r:w','r:w','r:w','F5:w~','F5:w~','F5:w','F5:w~','F5:w','E5:q r:q D5:q r:q']);
rests('III',62,1);
bar('III',63,'C5:q r:q D5:q r:q');rests('III',64,1);
bars('III',65,['G4:w','Ab4:w~','Ab4:ha G4:h','F#4:h( Fn4:h)']);
rests('III',69,3);
bars('III',72,['G4:w','Ab4:w(','A4:h) G4:h','F#4:h( Fn4:h)']);
rests('III',76,5);
bars('III',81,['r:w','r:w','r:w','r:w','C5:h r:h','D5:h r:h','C5:h r:h','F5:h r:h','E5:h r:h']);
rests('III',90,1);
bar('III',91,'C5:h( Bn4:q) r:q');rests('III',92,1);
bar('III',93,'C5:h( Bn4:q) r:q');rests('III',94,4);
bars('III',98,['r:w','C4:w','A4:w','G4:h r:h']);rests('III',102,1);
bars('III',103,['C4:w','A4:w','G4:h r:h']);rests('III',106,1);
bars('III',107,['C5:h Bn4:q( D5:q)','C5:h Bn4:q( D5:q)','C5:q r:q r:h']);
rests('III',110,1);
bars('III',111,['C4:h C4:q C4:q','E4:h E4:q E4:q','G4:h G4:q G4:q','C5:q G4:q C5:q G4:q','C5:h E5:h','E5:h r:h','r:w','r:w']);
cue('III',1,'Viol. I','r:h r:q C6:q~');
cue('III',2,'','C6:q( A5:q) r:q F5:q~');
cue('III',3,'','F5:q( E5:q) r:q C6:q~');
cue('III',4,'','C6:q( Bb5:q) r:q G5:q~');
cue('III',5,'','G5:q( F5:q) r:q F6:q~');
cue('III',6,'','F6:q( C6:q) r:q A5:q(');
cue('III',7,'','Bb5:q) C6:qtr D6:q r:q');
cue('III',8,'','D6:g( C6:q) Bb5:e A5:e A5:g( G5:q) F5:e E5:e');
cue('III',19,'Viol. I','D6:g( C6:q) Bb5:e A5:e A5:g( G5:q) F5:e E5:e');
cue('III',20,'','G5:e( F5:e) A5:e( G5:e) Bb5:e( A5:e C6:e Bb5:e)');
cue('III',21,'','D6:g( C6:q) Bb5:e A5:e A5:g( G5:q) F5:e E5:e');
cue('III',52,'Viol. I','G4:h D5:e( C5:e Bn4:e G4:e)');
cue('III',53,'','F4:h C5:e( Bn4:e A4:e F4:e)');
cue('III',54,'','E4:h F5:e( E5:e D5:e C5:e)');
cue('III',55,'','Bn4:h Bn5:e( C6:e D6:e E6:e)');
cue('III',81,'Viol. I','A5:w');
cue('III',82,'','G#5:e( A5:e Bn5:e A5:e Gn5:e F5:e E5:e D5:e)');
cue('III',83,'','C5:q r:q C5:h~');
cue('III',84,'','C5:h( D5:qd Bn4:e)');
cue('III',98,'Fl. II','A5:h Bn5:h');
cue('III',117,'Viol. I','G5:w');cue('III',118,'','C6:w');
dir('III',1,'words','III — Allegro');
for(const[n,d]of [[9,'f'],[22,'f'],[56,'p'],[61,'f'],[63,'f'],[65,'f'],[72,'f'],[85,'f'],[93,'f'],[99,'f']])dir('III',n,'dynamic',d);

source(5,'III',119,243,[119,138,147,154,170,178,186,197,208,216,229,237]);
bars('III',119,['r:w','r:w','r:w','r:w','r:w','r:w','A4:w','F5:w']);
rests('III',127,9);
bars('III',136,['r:w','r:w','G4:w','D5:w']);rests('III',140,3);
for(const n of[143,145,147,149])bar('III',n,'G4:h G4:q G4:q');
for(const n of[144,146,148,150])bar('III',n,'Ab4:h Ab4:q Ab4:q');
bars('III',151,['G4:q r:q Ab4:q r:q','Bb4:q r:q Ab4:q r:q','G4:q r:q Ab4:q r:q','Bb4:q r:q Ab4:q r:q']);
rests('III',155,9);
bars('III',164,['r:w','r:w','r:w','F4:h F4:q F4:q','A4:h A4:q A4:q','C5:h C5:q C5:q','Eb5:w~','Eb5:w~','Eb5:w~','Eb5:w',
 'D5:h En5:h','F5:w','E5:h r:q F5:q','E5:h r:q F5:q','E5:q C5:h C5:q','C5:q C5:q C5:q C5:q','C5:h C5:h','C5:h r:h']);
rests('III',182,2);
bar('III',184,'F5:q r:q G5:q r:q');rests('III',185,1);
bar('III',186,'F5:q r:q G5:q r:q');rests('III',187,1);
bars('III',188,['C5:w','Db5:w~','Db5:h C5:h','Bn4:h( Bb4:h)']);rests('III',192,3);
bars('III',195,['C5:w','Db5:w~','Db5:ha C5:h','Bn4:h( Bb4:h)']);rests('III',199,1);
bars('III',200,['r:h G4:h(','F#4:h G4:h)','r:h Bb4:h(','An4:h Bb4:h)']);rests('III',204,4);
bars('III',208,['r:w','r:w']);
for(let n=210;n<=214;n++)bar('III',n,'C5:h r:h');
rests('III',215,1);bar('III',216,'F5:h( E5:q) r:q');rests('III',217,1);bar('III',218,'F5:h( E5:q) r:q');rests('III',219,5);
bars('III',224,['F4:w','D5:w','C5:h r:h']);rests('III',227,1);
bars('III',228,['F4:w','D5:w','C5:h r:h']);rests('III',231,1);
bars('III',232,['F5:h E5:q( G5:q)','F5:h E5:q( G5:q)','F5:h E5:q( G5:q)','F5:q( G5:q F5:q G5:q)','F5:q r:q r:h']);
rests('III',237,1);
bars('III',238,['F4:h F4:q F4:q','A4:h A4:q A4:q','C5:h C5:q C5:q','F5:q C5:q F5:q C5:q','F5:h F5:h','F5:h r:h']);
cue('III',119,'Viol. II','G4:w');cue('III',120,'','C5:w');
cue('III',121,'Ob. I, II','G5:w');cue('III',122,'','C6:w');
cue('III',123,'Fl. I','C6:w');cue('III',124,'','E6:w');
cue('III',136,'Fl. I, II','G5:w');cue('III',137,'','C6:w');
cue('III',164,'Viol. I','F6:q( C6:q) r:q A5:q(');
cue('III',165,'','Bb5:q) C6:qtr D6:q r:q');
cue('III',166,'','D6:g( C6:q) Bb5:e A5:e A5:g( G5:q) F5:e E5:e');
cue('III',208,'Ob. I','C6:h( Bb5:h');cue('III',209,'','A5:h G5:h)');
for(const[n,d,o]of [[125,'p',0],[143,'f',0],[167,'f',0],[184,'f',0],[186,'f',0],[188,'f',0],[195,'f',0],[200,'p',2],[210,'f',0],[218,'f',0],[224,'f',0]])dir('III',n,'dynamic',d,o);

// Dynamics printed with small reference notes belong to the cue voice.
for(const[mv,n,d]of[['I',32,'f'],['III',1,'p'],['III',98,'f'],['III',117,'p'],['III',119,'p'],['III',121,'p'],['III',123,'p']])cues[mv].get(n).dynamic=d;
