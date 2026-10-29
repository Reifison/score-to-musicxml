// Written pitches read from Clarinetto II in La/A, source PDF pp. 6–10.
// w/h/q/e/s/t = whole/half/quarter/eighth/16th/32nd; d = dotted;
// ~ ties to the next note; :st / :ss = staccato / staccatissimo.
// All Bb pitches are explicit. Unspecified B means B natural.
export const sections = [];
export const cues = [];
export const dynamics = [];
export const slurs = [];
export const trills = [];
export const printedAccidentals = [{mov:'I',m:148,index:0,kind:'flat'}];
export const words = [{mov:'I',m:248,index:6,text:'cresc.'},{mov:'I',m:267,index:6,text:'cresc.'}];
const add = (movement,page,start,systems) => sections.push({movement,page,start,systems});

add('I',6,1,[
  {start:1, bars:'C4w | C4h C4h | C4w~ | C4q Rq Rh | Rw | Rw | Bb4w | Bb4h Bb4h | Bb4w'},
  {start:10,bars:'C4h C4h | C4q C4q C4q C4q | C4q Rq Rh | Rw | Rw | C5w | C5h C5h | C5w | C5h C5h'},
  {start:19,bars:'C5q Rq Rh | Rq Red C5s C5q Bb4q | A4q Rq Rh | Rq Red C5s C5q Bb4q | A4h Bb4h | A4h Bb4h | A4h Bb4h'},
  {start:26,bars:'A4q Rq Rh | Rw*5 | Rw | Rw | F4w | C4w'},
  {start:36,bars:'F4q F4e F4e F4q F5q | F5e D5e D5e Bb4e Bb4e G4e C5e:st C5e:st | C5e A4e A4e F4e F4e D4e Bb4e:st G4e:st | E5e C5e F5e C5e Bb4e A4e G4e F4e | C4w~ | C4w~'},
  {start:42,bars:'C4w~ | C4w~ | C4w~ | C4w~ | C4w~ | C4w | Bb4w | Bn4h B4h'},
  {start:50,bars:'G4q C5q C5q C5q | C5q Rq Rh | Rw*3 | Rw | Rh Rq C5q | Bn4e Re D5q C5e Re E5e:ss Re'},
  {start:58,bars:'E5q D5q C5q Rq | Rw*7 | Rw*4'},
  {start:70,bars:'Eb5w~ | Eb5w | D5w~ | D5w | C5q En4q E4q E4q | E4w | E4h E4q E4q'},
  {start:77,bars:'E4w | E4h E4q E4q | E4w | Rw | E5q:ss C5q:ss G4q:ss E4q:ss | C5q:ss G4q:ss E4q:ss C4q:ss | G4q Rq G4q Rq | Rw*6'},
]);

cues.push(
 {mov:'I',m:32,label:'Viol. I',dynamic:'f',bars:'F5q F4e F4e F4e F4e F4e F4e'},
 {mov:'I',m:33,bars:'E4t D4t C4ed Bb4e Bb4e Bb4e Bb4e Bb4e Bb4e'},
 {mov:'I',m:55,label:'Viol. I',bars:'C6e Bn5e:st A5e:st G5e:st F5e:st E5e:st D5e:st C5e:st'},
 {mov:'I',m:56,bars:'Bn4e:st A4e:st G4e:st F4e:st E4q Rq'},
 {mov:'I',m:66,label:'Viol. I',ottava:1,bars:'G6e E6e Re E6e:st C6e:st E6e:st C6e:st G5e:st | G6e E6e Re E6e:st C6e:st E6e:st C6e:st G5e:st | F6e D6e Re D6e:st Bn5e:st D6e:st B5e:st G5e:st | F6e D6e Re D6e:st Bn5e:st D6e:st B5e:st G5e:st'}
);
dynamics.push(...[[1,'f'],[7,'p'],[9,'f'],[15,'p'],[19,'f'],[34,'f'],[56,'p',2],[70,'p'],[74,'f',1]].map(([m,value,index=0])=>({mov:'I',m,value,index})));
slurs.push(...[[[37,0],[37,1]],[[37,2],[37,3]],[[37,4],[37,5]],[[38,0],[38,1]],[[38,2],[38,3]],[[38,4],[38,5]],[[56,2],[57,0]],[[57,2],[57,3]],[[58,0],[58,1]]].map(([start,end])=>({mov:'I',start,end})));
trills.push({mov:'I',m:58,index:1});

add('I',7,90,[
  {start:90,bars:'Rw*3 | E4h E4q E4q | E4w | E4h E4q E4q'},
  {start:96,bars:'E4w | E4h E4q E4q | E4w | Rw | E5q:ss C5q:ss G4q:ss E4q:ss | C5q:ss G4q:ss E4q:ss C4q:ss'},
  {start:102,bars:'C5w~ | C5w~ | C5h Bn4h | C5w~ | C5w~ | C5w~ | C5w~ | C5w'},
  {start:110,bars:'D5w | C5w~ | C5w~ | C5w~ | C5w~ | C5w | D5w | C5q Rq Rh'},
  {start:118,bars:'Rw | E4w | E4h E4h | E4w~ | E4q Rq Rh | Rw*2 | G4w | G4h G4h'},
  {start:127,bars:'G4w | G4h G4h | C5w | C5h C5h | C5w | Rw*4 | Rw | Rq Eb4q:st Eb4q:st Eb4q:st'},
  {start:138,bars:'Eb4w~ | Eb4w~ | Eb4w~ | Eb4w~ | Eb4w~ | Eb4w~ | Eb4w~ | Eb4w~ | Eb4q Rq Rh'},
  {start:147,bars:'Rw | Bb4q Rq Rh | Rw | Ab4q Rq Rh | G4q Rq Rh | F4q Rq Rh | Rw*2'},
  {start:155,bars:'Rq En4q F4h | E4q Rq Rh | Rq Bb4q Ab4q F4q | E4q Rq Rq F4q | E4q Rq Rq F4q | E4q Rq Rh | Rq Dn5e C#5e D5e C#5e D5e C#5e'},
  {start:162,bars:'D5e Bb4e G4e:st G4e:st D5e Bb4e G4e:st G4e:st | Bb4e G4e E4e:st E4e:st Bb4e G4e E4e:st E4e:st | F4w | C4h C4h | C4q C4q C4q C4q | C4q Rq Rh | Rw*2'},
  {start:170,bars:'C5w | C5h C5h | C5w | C5h C5h | A4w | A4h A4h | C4w | C4h C4h | D4w'},
  {start:179,bars:'D4h D4h | G4h~ G4e A4s B4s C5s D5s E5s F#5s | G5q Rq Rh | C4w | C4h C4h | F4h~ F4e G4s A4s Bb4s C5s D5s E5s | F5q Rq Rh | Rw'},
  {start:187,bars:'Rq Red F4s F4q F4q | F4q Rq Rh | Rq Red D4s D4q D4q | D4q Rq Rh | Rq Red C4s C4q C4q | C4q Rq Rh | Rq Red C5s C5q Bb4q'},
]);
cues.push(
 {mov:'I',m:90,label:'Viol. I',bars:'A5e:st A5e:st Bn5e:st C6e:st D6e:st E6e:st F6e:st A5e:st | G5e:st G5e:st A5e:st Bn5e:st C6e:st D6e:st E6e:st G5e:st | F5e:st F5e:st G5e:st A5e:st Bn5e:st C6e:st D6e:st F5e:st'},
 {mov:'I',m:136,label:'Fl. I',bars:'Eb6q D6q C6q Bb5q | A5q Rh Rq'},
);
dynamics.push(...[[93,'f'],[125,'p'],[129,'f'],[137,'p',1],[146,'f'],[148,'f'],[150,'f'],[151,'f'],[152,'f'],[155,'p',1],[161,'f',1],[170,'p'],[174,'f']].map(([m,value,index=0])=>({mov:'I',m,value,index})));
slurs.push(...[[[137,1],[137,3]],[[155,1],[155,2]],[[157,1],[157,3]],[[158,3],[159,0]],[[159,3],[160,0]],[[161,1],[161,6]],[[162,0],[162,1]],[[162,4],[162,5]],[[163,0],[163,1]],[[163,4],[163,5]]].map(([start,end])=>({mov:'I',start,end})));

add('I',8,194,[
  {start:194,bars:'A4q Rq Rh | Rw | F4w | C4w | A4q F4e F4e F4q F5q | F5e D5e D5e Bb4e Bb4e G4e C5e:st C5e:st | C5e A4e A4e F4e F4e D4e Bb4e:st G4e:st'},
  {start:201,bars:'E5e C5e F5e C5e Bb4e A4e G4e F4e | Bb4w | Bn4h B4h | G4q C5q C5q C5q | C5q Rq Rh | Rw*3 | Rw | Rh Rq F4q'},
  {start:211,bars:'E4e Re G4q F4e Re A4e:ss Re | A4q G4q F4q Rq | Rw*4 | Rw*3 | A4w~'},
  {start:221,bars:'A4w | G4w~ | G4w | F4q Rq Rh | Rw*3 | F4h F4q F4q | F4e G4s A4s Bb4s C5s D5s E5s F5q Rq | A4h A4q A4q'},
  {start:231,bars:'A4e Bb4s C5s D5s E5s F5s G5s A5q Rq | C5h C5q C5q | C5e D5s E5s F5s G5s A5s Bb5s C6q Rq | F4w~ | F4w | F5q:ss C5q:ss A4q:ss F4q:ss'},
  {start:237,bars:'C4q Rq C4q Rq | Rw*6 | Rw*2 | Rh Rq Bb4e:ss Re | A4e Re Bb4e Re A4e Re Bb4e Re'},
  {start:248,bars:'A4e Re Bb4e Re A4e Re Bb4e Re | A4e Re Bb4e Re A4e Re Bb4e Re | A4e Re Bb4e Re A4e Re Bb4e Re | A4w~ | A4w | Bb4w~ | Bb4w'},
  {start:255,bars:'A4w | D5h C5h | Rw*6 | Rw*2 | Rh Rq Bb4e:ss Re'},
  {start:266,bars:'A4e Re Bb4e Re A4e Re Bb4e Re | A4e Re Bb4e Re A4e Re Bb4e Re | A4e Re Bb4e Re A4e Re Bb4e Re | A4e Re Bb4e Re A4e Re Bb4e Re | A4w~ | A4w'},
  {start:272,bars:'Bb4w~ | Bb4w | A4w | Bb4w | A4h Bb4h | A4h Bb4h | A4q Rq A4q Rq | Bb3q Bb4q A4q G4q'},
  {start:280,bars:'A4h Bb4h | A4h Bb4h | A4q Rq A4q Rq | Bb3q Bb4q A4q G4q | F4w~ | F4w~ | F4w~ | F4w~'},
  {start:288,bars:'F4q Rq Rq F5q:ss | A5q:ss F5q:ss C5q:ss A4q:ss | F4w | F4h F4h | F4h~ F4e G4s A4s Bb4s C5s D5s E5s | F5q A4q A4q A4q | A4h A4h | A4h Rh'},
]);
cues.push(
 {mov:'I',m:209,label:'Viol. I',bars:'F6e E6e:st D6e:st C6e:st Bb5e:st A5e:st G5e:st F5e:st | E5e:st D5e:st C5e:st Bb4e:st A4q Rq'},
 {mov:'I',m:217,label:'Ob. I, II',dynamic:'p',bars:'Rh Rq F5+A5q | E5+G5e Re G5+Bb5q F5+A5e Re A5+C6e:ss Re | A5+C6q G5+Bb5q F5+A5q Rq'},
 {mov:'I',m:244,label:'Viol. I',bars:'D6e:st C#6e:st D6e:st C#6e:st D6e:st A5e:st Bb5e:st A5e:st | Bb5e:st F#5e:st G5e:st F#5e:st G5e:st A5e:st Bb5e:st A5e:st | Bb5e:st C#6e:st D6e:st C#6e:st D6e:st E6e:st Rq'},
 {mov:'I',m:263,label:'Viol. I',bars:'D6e:st C#6e:st D6e:st C#6e:st D6e:st A5e:st Bb5e:st A5e:st | Bb5e:st F#5e:st G5e:st F#5e:st G5e:st A5e:st Bb5e:st A5e:st | Bb5e:st C#6e:st D6e:st C#6e:st D6e:st E6e:st Rq'},
);
dynamics.push(...[[210,'p',2],[220,'p'],[228,'f'],[246,'p',2],[251,'f'],[265,'p',2],[270,'f']].map(([m,value,index=0])=>({mov:'I',m,value,index})));
slurs.push(...[[[199,0],[199,1]],[[199,2],[199,3]],[[199,4],[199,5]],[[200,0],[200,1]],[[200,2],[200,3]],[[200,4],[200,5]],[[210,2],[211,0]],[[211,2],[211,3]],[[212,0],[212,1]]].map(([start,end])=>({mov:'I',start,end})));
trills.push({mov:'I',m:212,index:1});

add('III',9,1,[
  {start:1,bars:'Rw*7'},
  {start:8,bars:'Rw | F4h F4q F4q | A4h A4q A4q | C5h C5q C5q | C5q Rq Rh | Rw*6 | Rw'},
  {start:20,bars:'Rw*2 | F4h F4q F4q | A4h A4q A4q | C5h C5q C5q | C5w~ | C5w'},
  {start:27,bars:'Bb4w~ | Bb4w | Bb4w~ | Bb4w | A4w~ | A4hd C5q | Bn4w~ | B4q Bn4h B4q | C5w~'},
  {start:36,bars:'C5q C5h C5q | C5w~ | C5q C5h C5q | Bn4q Rq Rq C5q | Bn4h Rq C5q | Bn4q G4q G4q G4q | G4q G4q G4q G4q'},
  {start:43,bars:'G4h G4h | G4h Rh | Rw*7 | Rw*4 | Bn4w~ | B4w~'},
  {start:58,bars:'Bn4w | Bn4w~ | B4w | C5q Rq F4q Rq | Rw | E4q Rq F4q Rq | Rw | Eb4w | Eb4w~'},
  {start:67,bars:'Eb4w | D4w | Rw*3 | Eb4w | Eb4w~ | Eb4w | D4w | Rw*5'},
  {start:81,bars:'Rw*4 | G4h Rh | G4h Rh | G4h Rh | Bn4h Rh'},
  {start:89,bars:'C5h Rh | Rw | G4h~ G4q Rq | Rw | G4h~ G4q Rq | Rw*4 | Rw | C4w | A4w'},
  {start:101,bars:'G4h Rh | Rw | C4w | A4w | G4h Rh | Rw | C4h G4h | C4h G4h | C4q Rq Rh'},
  {start:110,bars:'Rw | C4h C4q C4q | E4h E4q E4q | G4h G4q G4q | C5q G4q C5q G4q | C5h C5h | C5h Rh | Rw*2'},
]);
cues.push(
 {mov:'III',m:1,label:'Viol. I',dynamic:'p',bars:'Rh Rq C6q~ | C6q A5q Rq F5q~ | F5q E5q Rq C6q~ | C6q Bb5q Rq G5q~ | G5q F5q Rq F6q~ | F6q D6q Rq A5q | Bb5q C6q D6q Rq'},
 {mov:'III',m:8,bars:'D6g C6q Bb5e A5e A5g G5q F5e E5e'},
 {mov:'III',m:19,label:'Viol. I',bars:'D6g C6q Bb5e A5e A5g G5q F5e E5e | G5e F5e A5e G5e Bb5e A5e C6e Bb5e | D6g C6q Bb5e A5e A5g G5q F5e E5e'},
 {mov:'III',m:52,label:'Viol. I',bars:'A4h D5e C5e Bn4e A4e | G4h C5e Bn4e A4e G4e | F4h F5e E5e D5e C5e | Bn4h Bn5e C6e D6e E6e'},
 {mov:'III',m:81,label:'Viol. I',bars:'A5w | G#5e A5e Bn5e A5e Gn5e F5e E5e D5e | C5q Rq C5h~ | C5h D5qd Bn4e'},
 {mov:'III',m:98,label:'Fl. II',dynamic:'f',bars:'A5h Bn5h'},
 {mov:'III',m:117,label:'Viol. I',dynamic:'p',bars:'G5w | C6w'},
);
dynamics.push(...[[9,'f'],[22,'f'],[56,'p'],[61,'f'],[63,'f'],[65,'f'],[72,'f'],[85,'f'],[93,'f'],[99,'f']].map(([m,value,index=0])=>({mov:'III',m,value,index})));
slurs.push(...[[[2,0],[2,1]],[[3,0],[3,1]],[[4,0],[4,1]],[[5,0],[5,1]],[[6,0],[6,1]],[[6,3],[7,0]],[[8,0],[8,1]],[[8,4],[8,5]],[[19,0],[19,1]],[[19,4],[19,5]],[[20,0],[20,1]],[[20,2],[20,3]],[[20,4],[20,7]],[[21,0],[21,1]],[[21,4],[21,5]],[[52,1],[52,4]],[[53,1],[53,4]],[[54,1],[54,4]],[[55,1],[55,4]],[[82,0],[82,7]],[[84,1],[84,2]]].map(([start,end])=>({mov:'III',cue:true,start,end})));
trills.push({mov:'III',m:7,index:1,cue:true});

add('III',10,119,[
  {start:119,bars:'Rw*6 | C4w | F4w | Rw*9 | Rw*2'},
  {start:138,bars:'G4w | D5w | Rw*3 | E4h E4q E4q | F4h F4q F4q | E4h E4q E4q | F4h F4q F4q'},
  {start:147,bars:'E4h E4q E4q | F4h F4q F4q | E4h E4q E4q | F4h F4q F4q | E4q Rq F4q Rq | G4q Rq F4q Rq | E4q Rq F4q Rq'},
  {start:154,bars:'G4q Rq F4q Rq | Rw*9 | Rw*3 | F4h F4q F4q | A4h A4q A4q | C5h C5q C5q'},
  {start:170,bars:'C5w~ | C5w~ | C5w~ | C5w | Bb4w | A4h Bn4h | C5h Rq Ab4q | G4h Rq Ab4q'},
  {start:178,bars:'G4q C4h C4q | C4q C4q C4q C4q | C4h C4h | C4h Rh | Rw*2 | A4q Rq Bb4q Rq | Rw'},
  {start:186,bars:'A4q Rq Bb4q Rq | Rw | Ab4w | Ab4w~ | Ab4w | Dn5h G4h | Rw*3 | Ab4w | Ab4w~'},
  {start:197,bars:'Ab4w | Dn5h G4h | Rw*9 | Rw*2 | An4h Rh | Bb4h Rh | A4h Rh | Bb4h Rh'},
  {start:214,bars:'A4h Rh | Rw | A4q C5q Bb4q Rq | Rw | A4q C5q Bb4q Rq | Rw*5 | F4w | D5w | C5h Rh | Rw'},
  {start:228,bars:'F4w | D5w | C5h Rh | Rw | C5w~ | C5w~ | C5w~ | C5w~'},
  {start:236,bars:'C5q Rq Rh | Rw | F4h F4q F4q | A4h A4q A4q | C5h C5q C5q | F5q C5q F5q C5q | C5h C5h | C5h Rh'},
]);
cues.push(
 {mov:'III',m:119,label:'Viol. II',dynamic:'p',bars:'G4w | C5w'},
 {mov:'III',m:121,label:'Ob. I, II',dynamic:'p',bars:'G5w | C6w'},
 {mov:'III',m:123,label:'Fl. I',bars:'C6w | F6w'},
 {mov:'III',m:136,label:'Fl. I, II',bars:'G5w | C6w'},
 {mov:'III',m:164,label:'Viol. I',bars:'F6q D6q Rq A5q | Bb5q C6q D6q Rq | D6g C6q Bb5e A5e A5g G5q F5e E5e'},
 {mov:'III',m:208,label:'Ob. I',bars:'C6h Bb5h | A5h G5h'},
);
dynamics.push(...[[125,'p'],[143,'f'],[167,'f'],[184,'f'],[186,'f'],[188,'f'],[195,'f'],[210,'f'],[218,'f'],[224,'f']].map(([m,value,index=0])=>({mov:'III',m,value,index})));
slurs.push(...[[[216,0],[216,2]],[[218,0],[218,2]]].map(([start,end])=>({mov:'III',start,end})));
slurs.push(...[[[164,0],[164,1]],[[164,3],[165,0]],[[166,0],[166,1]],[[166,4],[166,5]],[[208,0],[209,1]]].map(([start,end])=>({mov:'III',cue:true,start,end})));
trills.push({mov:'III',m:165,index:1,cue:true});

slurs.push(...[[[33,0],[33,2]],[[55,0],[55,1]],[[66,0],[66,1]],[[67,0],[67,1]],[[68,0],[68,1]],[[69,0],[69,1]],[[136,0],[136,3]],[[209,0],[209,1]],[[217,2],[218,0]],[[218,2],[218,3]],[[219,0],[219,1]]].map(([start,end])=>({mov:'I',cue:true,start,end})));
trills.push({mov:'I',m:219,index:1,cue:true,chordTop:true});
