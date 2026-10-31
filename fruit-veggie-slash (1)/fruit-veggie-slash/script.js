const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
if(typeof CanvasRenderingContext2D!=="undefined"&&!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){r=Math.min(r,w/2,h/2);this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath()}}
let W,H,DPR,bg=document.createElement("canvas");

function resize(){
 DPR=Math.min(devicePixelRatio||1,2);
 W=innerWidth;H=innerHeight;
 canvas.width=W*DPR;canvas.height=H*DPR;
 ctx.setTransform(DPR,0,0,DPR,0,0);
 bg.width=W*DPR;bg.height=H*DPR;
 let b=bg.getContext("2d");b.setTransform(DPR,0,0,DPR,0,0);
 drawBg(b);
}
addEventListener("resize",resize);

let state="home",score=0,best=0;
try{best=Number(localStorage.getItem("veggieSlashBest"))||0}catch(e){}
let objects=[],halves=[],particles=[],trails=[],rings=[],texts=[],splats=[];
let lastTime=0,spawnTimer=0,spawnInterval=1000,combo=0,comboTimer=0,lastSlice=0,pointer=null;
let shake=0,flash=0,fire=null,endAt=0,muted=false,gid=0,newRec=false;
$("best").textContent="BEST: "+best;

// ================= SOUND (synthesized, no files) =================
let AC=null,master=null;
function audio(){
 try{
  if(!AC){AC=new(window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.9;master.connect(AC.destination)}
  if(AC.state==="suspended")AC.resume();
 }catch(e){}
}
function noise(dur){
 const n=Math.floor(AC.sampleRate*dur),b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0);
 for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
 const s=AC.createBufferSource();s.buffer=b;return s;
}
function nz(dur,type,f0,f1,vol,Q){
 const t=AC.currentTime,s=noise(dur),f=AC.createBiquadFilter(),g=AC.createGain();
 f.type=type;f.Q.value=Q||1;
 f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur);
 g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
 s.connect(f);f.connect(g);g.connect(master);s.start(t);
}
function tone(type,f0,f1,dur,vol,delay){
 const t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();
 o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);
 g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
 o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);
}
const CRUNCHY=["carrot","broccoli","cucumber","corn","pepper","eggplant","onion","greenApple"];
function sfxSlice(type,cmb){
 if(!AC||muted)return;
 nz(.2,"bandpass",6000,800,.8,1.3);              // blade swish
 if(CRUNCHY.includes(type)){                       // crunch
  nz(.09,"highpass",2500,2500,.7);
  setTimeout(()=>{if(AC)nz(.07,"highpass",3500,3500,.5)},40);
  tone("triangle",180,90,.1,.35);
 }else{                                            // juicy squish
  tone("sine",300,60,.16,.55);
  nz(.14,"lowpass",3000,500,.5);
 }
 if(cmb>=2)tone("sine",600+cmb*110,1000+cmb*130,.18,.22,.04); // combo ding
}
function sfxBoom(){
 if(!AC||muted)return;
 nz(1.5,"lowpass",3200,60,1.6);
 nz(.5,"highpass",1500,800,.7);
 tone("sine",140,24,1.1,1.2);
 tone("sawtooth",90,30,.6,.35);
 setTimeout(()=>{if(AC)nz(.9,"lowpass",900,50,.5)},250);
}
function sfxFuse(){if(AC&&!muted)nz(.35,"highpass",4000,6000,.12)}
function sfxMiss(){if(AC&&!muted)tone("square",220,110,.18,.08)}
$("mute").onclick=e=>{e.stopPropagation();muted=!muted;$("mute").textContent=muted?"🔇":"🔊";audio()};

// ================= DRAWING HELPERS =================
function grad(x,y,r,a,b,c){
 let g=ctx.createRadialGradient(x-r*.35,y-r*.45,2,x,y,r*1.3);
 g.addColorStop(0,a);g.addColorStop(.55,b);g.addColorStop(1,c);return g;
}
function oval(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
function shine(x,y,r){
 let g=ctx.createRadialGradient(x,y,1,x,y,r);
 g.addColorStop(0,"rgba(255,255,255,.6)");g.addColorStop(1,"rgba(255,255,255,0)");
 ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}
function leaf(x,y,a=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(a);
 ctx.fillStyle="#36a52f";ctx.beginPath();ctx.moveTo(0,0);
 ctx.quadraticCurveTo(13,-27,34,-13);ctx.quadraticCurveTo(27,9,0,0);ctx.fill();
 ctx.strokeStyle="#b3ec70";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(30,-12);ctx.stroke();
 ctx.restore();
}

// ---- fruits ----
function apple(green){
 ctx.fillStyle=green?grad(0,0,42,"#f4ffb4","#8fd13a","#3c7a12"):grad(0,0,42,"#ffe3a0","#f52c28","#780514");
 ctx.beginPath();ctx.moveTo(0,-25);
 ctx.bezierCurveTo(-43,-55,-55,-12,-35,22);ctx.bezierCurveTo(-19,48,-4,40,0,34);
 ctx.bezierCurveTo(10,48,27,45,42,12);ctx.bezierCurveTo(58,-26,28,-55,0,-25);ctx.fill();
 ctx.fillStyle="#70401b";ctx.fillRect(-3,-39,7,17);leaf(3,-38,-.4);shine(-20,-15,20);oval(-14,1,2,4,"#fff");
}
function orange(){
 ctx.fillStyle=grad(0,0,40,"#fff4a2","#ff9e17","#a93d03");
 ctx.beginPath();ctx.arc(0,0,37,0,Math.PI*2);ctx.fill();
 for(let i=0;i<40;i++){let a=i*2.4,r=8+(i%4)*6;oval(Math.cos(a)*r,Math.sin(a)*r,1.2,1.2,"#ffda63")}
 leaf(5,-34,-.5);shine(-16,-14,18);
}
function watermelon(cut){
 if(cut){
  ctx.fillStyle="#14612b";ctx.beginPath();ctx.ellipse(0,0,48,40,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#7fcf58";ctx.beginPath();ctx.ellipse(0,0,44,36,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f4f7c9";ctx.beginPath();ctx.ellipse(0,0,41,33,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=grad(0,0,36,"#ff8f8a","#ee2f4f","#b0123a");
  ctx.beginPath();ctx.ellipse(0,0,37,29,0,0,Math.PI*2);ctx.fill();
  for(let i=0;i<14;i++){
   let a=i*2.4,r=8+(i%3)*8;
   ctx.save();ctx.translate(Math.cos(a)*r*1.1,Math.sin(a)*r*.85);ctx.rotate(a);
   oval(0,0,2.2,4.2,"#2a1013");oval(-.6,-1.2,.7,1.4,"rgba(255,255,255,.35)");ctx.restore();
  }
  shine(-14,-10,18);
  return;
 }
 ctx.save();ctx.rotate(-.2);
 let g=ctx.createRadialGradient(-16,-18,3,0,0,56);
 g.addColorStop(0,"#7ad65a");g.addColorStop(.5,"#2f9a3f");g.addColorStop(1,"#0d4a22");
 ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,48,40,0,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.beginPath();ctx.ellipse(0,0,48,40,0,0,Math.PI*2);ctx.clip();ctx.lineCap="round";
 for(let x=-36;x<=42;x+=12){
  ctx.strokeStyle="rgba(10,70,25,.75)";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(x*1.1,-42);ctx.bezierCurveTo(x+14,-14,x-14,14,x*1.1,42);ctx.stroke();
  ctx.strokeStyle="rgba(170,235,120,.3)";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x*1.1+6,-42);ctx.bezierCurveTo(x+20,-14,x-8,14,x*1.1+6,42);ctx.stroke();
 }
 ctx.restore();
 shine(-18,-16,22);
 ctx.fillStyle="#6b4a1e";ctx.fillRect(-2,-45,5,9);
 ctx.restore();
}
function watermelonOld(){
 ctx.save();ctx.rotate(-.2);
 ctx.fillStyle="#176e31";ctx.beginPath();ctx.ellipse(0,0,46,38,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#65b943";ctx.beginPath();ctx.ellipse(0,0,40,33,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle="#208c37";ctx.lineWidth=4;
 for(let x=-30;x<=30;x+=15){ctx.beginPath();ctx.moveTo(x,-28);ctx.quadraticCurveTo(x+13,0,x,28);ctx.stroke()}
 ctx.fillStyle=grad(0,0,35,"#ff9a91","#e92d51","#a30e30");
 ctx.beginPath();ctx.ellipse(0,0,31,26,0,0,Math.PI*2);ctx.fill();
 [[-15,-9],[5,-16],[16,5],[-5,12],[7,7],[-1,-2]].forEach(p=>oval(p[0],p[1],2,4,"#461b20"));
 ctx.restore();
}
function strawberry(){
 ctx.fillStyle=grad(0,0,40,"#ffaaa0","#ee234b","#9c0526");
 ctx.beginPath();ctx.moveTo(0,-32);ctx.bezierCurveTo(47,-48,46,-4,0,42);ctx.bezierCurveTo(-46,-4,-47,-48,0,-32);ctx.fill();
 for(let y=-20;y<25;y+=12)for(let x=-20;x<=20;x+=11)oval(x,y,1.5,3,"#ffe7a0");
 leaf(-8,-32,-.5);leaf(8,-34,.4);shine(-15,-15,17);
}
function banana(){
 ctx.save();ctx.rotate(-.5);ctx.lineCap="round";
 ctx.strokeStyle="#9d5909";ctx.lineWidth=39;
 ctx.beginPath();ctx.moveTo(-35,-24);ctx.quadraticCurveTo(2,48,40,-23);ctx.stroke();
 ctx.strokeStyle=grad(0,0,45,"#fffcc0","#ffdb42","#d38b08");ctx.lineWidth=31;
 ctx.beginPath();ctx.moveTo(-35,-24);ctx.quadraticCurveTo(2,48,40,-23);ctx.stroke();
 ctx.strokeStyle="#fff5c4";ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(-25,-19);ctx.quadraticCurveTo(2,33,32,-20);ctx.stroke();
 oval(-37,-24,5,8,"#68451f");oval(41,-23,5,8,"#68451f");
 ctx.restore();
}
function kiwi(){
 ctx.fillStyle=grad(0,0,40,"#e0c080","#9a6a35","#4a2b17");
 ctx.beginPath();ctx.ellipse(0,0,39,34,0,0,Math.PI*2);ctx.fill();
 for(let i=0;i<46;i++){let a=i*2.4,r=6+(i%7)*4.6;oval(Math.cos(a)*r*1.3,Math.sin(a)*r,1.1,1.1,"rgba(255,230,170,.45)")}
 shine(-14,-12,16);
}
function kiwiOld(){
 ctx.fillStyle=grad(0,0,39,"#d5b16a","#96612c","#442719");
 ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#9bdd45";ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#f8f0ad";ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
 for(let i=0;i<14;i++){let a=i*Math.PI*2/14;oval(Math.cos(a)*19,Math.sin(a)*19,2,3,"#34221b")}
}
// ---- vegetables ----
function carrot(){
 ctx.save();ctx.rotate(.08);
 ctx.fillStyle=grad(0,0,40,"#ffdf82","#ff8b13","#9f3605");
 ctx.beginPath();ctx.moveTo(-24,-34);ctx.quadraticCurveTo(0,-47,25,-31);ctx.lineTo(3,48);ctx.quadraticCurveTo(0,55,-5,45);ctx.closePath();ctx.fill();
 ctx.strokeStyle="#ffcc69";ctx.lineWidth=2;
 for(let y=-16;y<28;y+=13){ctx.beginPath();ctx.moveTo(-15,y);ctx.lineTo(13,y+3);ctx.stroke()}
 leaf(-11,-33,-.5);leaf(0,-39,0);leaf(13,-32,.6);shine(-12,-13,18);
 ctx.restore();
}
function tomato(){
 ctx.fillStyle=grad(0,0,40,"#ffb0a0","#ee3035","#8b0614");
 ctx.beginPath();ctx.moveTo(0,-32);
 ctx.bezierCurveTo(-20,-51,-44,-35,-39,-5);ctx.bezierCurveTo(-47,31,-17,43,0,30);
 ctx.bezierCurveTo(20,44,47,25,39,-7);ctx.bezierCurveTo(45,-38,18,-51,0,-32);ctx.fill();
 leaf(0,-30,-.4);leaf(8,-29,.6);leaf(-8,-29,-1);shine(-16,-14,19);
}
function broccoli(){
 ctx.fillStyle=grad(0,20,24,"#e5d48b","#91b94d","#426b20");
 ctx.beginPath();ctx.roundRect(-14,0,28,42,8);ctx.fill();
 [[-23,-9,20],[0,-22,25],[23,-9,20],[-12,9,19],[13,8,19]].forEach(v=>{
  ctx.fillStyle=grad(v[0],v[1],v[2],"#c4f18b","#319e41","#105325");
  ctx.beginPath();ctx.arc(v[0],v[1],v[2],0,Math.PI*2);ctx.fill();
 });
 shine(-17,-22,17);
}
function cucumber(){
 ctx.save();ctx.rotate(-.35);
 ctx.fillStyle=grad(0,0,40,"#b7f78a","#299b48","#104a2b");
 ctx.beginPath();ctx.roundRect(-19,-42,38,84,19);ctx.fill();
 for(let y=-28;y<30;y+=13){oval(-10,y,2,3,"#c7f69b");oval(10,y+5,2,3,"#c7f69b")}
 shine(-9,-20,18);ctx.restore();
}
function corn(){
 ctx.save();ctx.rotate(-.2);
 ctx.fillStyle="#29863d";
 ctx.beginPath();ctx.moveTo(-18,-30);ctx.quadraticCurveTo(-55,0,-18,43);ctx.lineTo(0,20);ctx.fill();
 ctx.beginPath();ctx.moveTo(18,-30);ctx.quadraticCurveTo(55,0,18,43);ctx.lineTo(0,20);ctx.fill();
 ctx.fillStyle=grad(0,0,40,"#fff7a0","#f7c629","#a76b09");
 ctx.beginPath();ctx.roundRect(-19,-39,38,78,18);ctx.fill();
 for(let y=-28;y<=27;y+=10)for(let x=-10;x<=10;x+=10)oval(x,y,4,4,"#ffe86d");
 shine(-9,-22,16);ctx.restore();
}
function pepper(){
 ctx.fillStyle=grad(0,0,43,"#c4ff7e","#45ad2b","#13531b");
 ctx.beginPath();ctx.moveTo(0,-31);
 ctx.bezierCurveTo(-20,-55,-47,-32,-38,10);ctx.bezierCurveTo(-30,50,-10,40,0,26);
 ctx.bezierCurveTo(12,48,34,43,40,7);ctx.bezierCurveTo(48,-32,20,-53,0,-31);ctx.fill();
 ctx.strokeStyle="#b7ed75";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-31);ctx.lineTo(0,24);ctx.stroke();
 leaf(0,-35);shine(-17,-15,18);
}
function eggplant(){
 ctx.save();ctx.rotate(.3);
 ctx.fillStyle=grad(0,0,44,"#d6a3ff","#7333a3","#2a1050");
 ctx.beginPath();ctx.moveTo(0,-30);
 ctx.bezierCurveTo(46,-52,56,4,16,41);ctx.bezierCurveTo(-16,59,-48,22,-27,-12);ctx.bezierCurveTo(-17,-27,-10,-29,0,-30);ctx.fill();
 leaf(-8,-30,-.6);leaf(9,-31,.5);shine(-15,-15,18);ctx.restore();
}
const types=[["apple",1],["orange",1],["lemon",1],["greenApple",2],["tomato",2],["banana",2],["strawberry",3],["kiwi",3],["carrot",3],["cucumber",3],["corn",4],["pepper",4],["watermelon",4],["mango",5],["onion",5],["eggplant",6],["broccoli",6],["pineapple",6]];
const FN={apple,orange,watermelon,strawberry,banana,kiwi,carrot,tomato,broccoli,cucumber,corn,pepper,eggplant,pineapple,mango,lemon,greenApple,onion};
const JC={apple:"#ff3b3b",orange:"#ffa31a",watermelon:"#ff3860",strawberry:"#ff2d55",banana:"#ffe066",kiwi:"#9bdd45",carrot:"#ff8b13",tomato:"#ff3035",broccoli:"#3fae45",cucumber:"#7fd96f",corn:"#ffd83d",pepper:"#58c23a",eggplant:"#9b4dd1",pineapple:"#ffd24a",mango:"#ffa62e",lemon:"#fff04a",greenApple:"#9be04a",onion:"#c46bbf"};
function drawItem(t){FN[t]()}

// ---- more fruits and veggies ----
function greenApple(){apple(1)}
function lemon(){
 ctx.save();ctx.rotate(-.3);
 ctx.fillStyle=grad(0,0,40,"#fffbb0","#ffe135","#b89400");
 ctx.beginPath();ctx.moveTo(-46,0);ctx.quadraticCurveTo(-30,-37,0,-35);ctx.quadraticCurveTo(30,-37,46,0);ctx.quadraticCurveTo(30,37,0,35);ctx.quadraticCurveTo(-30,37,-46,0);ctx.fill();
 for(let i=0;i<18;i++)oval(-26+(i*7)%52,-15+(i*11)%30,1,1,"#d9b800");
 shine(-14,-12,16);ctx.restore();
}
function mango(){
 ctx.save();ctx.rotate(.4);
 ctx.fillStyle=grad(0,0,44,"#ffe27a","#ff9f2e","#d6341f");
 ctx.beginPath();ctx.moveTo(0,-38);ctx.bezierCurveTo(40,-45,56,5,28,35);ctx.bezierCurveTo(8,52,-40,38,-42,0);ctx.bezierCurveTo(-42,-26,-20,-38,0,-38);ctx.fill();
 ctx.fillStyle="#6b4a1e";ctx.fillRect(-2,-46,5,10);leaf(2,-42,-.6);shine(-16,-14,18);ctx.restore();
}
function pineapple(){
 ctx.save();ctx.rotate(.1);
 for(let i=-3;i<=3;i++){
  ctx.fillStyle=i%2?"#2f8f2f":"#46b03a";
  ctx.beginPath();ctx.moveTo(i*5-6,-26);ctx.lineTo(i*9,-64-(3-Math.abs(i))*5);ctx.lineTo(i*5+6,-26);ctx.fill();
 }
 ctx.fillStyle=grad(0,6,38,"#ffe27a","#e8a21c","#8a5206");
 ctx.beginPath();ctx.ellipse(0,8,31,42,0,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.beginPath();ctx.ellipse(0,8,31,42,0,0,Math.PI*2);ctx.clip();
 ctx.strokeStyle="rgba(110,60,5,.6)";ctx.lineWidth=2;
 for(let i=-5;i<=5;i++){
  ctx.beginPath();ctx.moveTo(-32,i*10-22);ctx.lineTo(32,i*10+22);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-32,i*10+22);ctx.lineTo(32,i*10-22);ctx.stroke();
 }
 ctx.restore();shine(-12,-6,18);ctx.restore();
}
function onion(){
 ctx.fillStyle=grad(0,0,40,"#f3c6ff","#a8409c","#4a1259");
 ctx.beginPath();ctx.moveTo(0,-44);ctx.bezierCurveTo(14,-30,46,-24,42,6);ctx.bezierCurveTo(38,40,12,44,0,42);ctx.bezierCurveTo(-12,44,-38,40,-42,6);ctx.bezierCurveTo(-46,-24,-14,-30,0,-44);ctx.fill();
 ctx.strokeStyle="rgba(255,230,255,.5)";ctx.lineWidth=2;
 for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(0,-38);ctx.quadraticCurveTo(i*20,0,i*6,40);ctx.stroke()}
 ctx.strokeStyle="#c9a27a";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-3,42);ctx.lineTo(-7,52);ctx.moveTo(3,42);ctx.lineTo(7,52);ctx.stroke();
 shine(-14,-14,17);
}

// ---- inner (cut) faces, drawn on top of each half ----
function fl(rot,cx,cy,rx,ry,a,b,c){
 ctx.rotate(rot);ctx.fillStyle=grad(cx,cy,Math.max(rx,ry),a,b,c);
 ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function seg(n,r,col){ctx.strokeStyle=col;ctx.lineWidth=1.8;for(let i=0;i<n;i++){let a=i*Math.PI*2/n;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke()}}
function dots(n,sx,sy,col,w,h,cx,cy){for(let i=0;i<n;i++){let a=i*2.4,k=.4+(i%3)*.3;oval(cx+Math.cos(a)*sx*k,cy+Math.sin(a)*sy*k,w,h,col)}}
function core(cx,cy,rx,ry,col){ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill()}
const CUT={
 apple(){fl(0,0,-3,33,30,"#fffbe6","#f6efc0","#e3d487");core(0,-3,9,13,"#d8c97a");dots(4,6,8,"#4a2512",1.8,3.2,0,-3)},
 greenApple(){fl(0,0,-3,33,30,"#fbffe0","#e8f5b4","#cbe283");core(0,-3,9,13,"#cfdf8a");dots(4,6,8,"#4a2512",1.8,3.2,0,-3)},
 orange(){fl(0,0,0,32,32,"#ffe08a","#ffa31f","#e46c06");seg(9,30,"rgba(255,245,200,.75)");oval(0,0,4,4,"#fff3c4")},
 lemon(){fl(-.3,0,0,39,28,"#fffdd0","#fff27a","#f2d21b");seg(8,26,"rgba(255,255,230,.8)");oval(0,0,4,4,"#fffbe0")},
 strawberry(){fl(0,0,-6,27,26,"#fff0f0","#ff98a0","#ee234b");core(0,-4,6,16,"#ffe9e9")},
 banana(){ctx.rotate(-.5);ctx.lineCap="round";ctx.strokeStyle="#fff1b5";ctx.lineWidth=23;ctx.beginPath();ctx.moveTo(-35,-24);ctx.quadraticCurveTo(2,48,40,-23);ctx.stroke();ctx.strokeStyle="#f4dc86";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-30,-22);ctx.quadraticCurveTo(2,40,35,-22);ctx.stroke()},
 kiwi(){fl(0,0,0,32,29,"#d8f27a","#8ed12c","#4a9a14");seg(24,29,"rgba(230,255,170,.4)");oval(0,0,10,10,"#f8f4c0");for(let i=0;i<14;i++){let a=i*Math.PI*2/14;oval(Math.cos(a)*19,Math.sin(a)*19,2,3,"#2b1a14")}},
 carrot(){ctx.rotate(.08);ctx.fillStyle="#ffa534";ctx.beginPath();ctx.moveTo(-17,-31);ctx.quadraticCurveTo(0,-41,19,-28);ctx.lineTo(2,40);ctx.quadraticCurveTo(0,46,-3,38);ctx.closePath();ctx.fill();ctx.fillStyle="#ffd890";ctx.beginPath();ctx.moveTo(-6,-30);ctx.lineTo(7,-29);ctx.lineTo(1,34);ctx.closePath();ctx.fill()},
 tomato(){fl(0,0,-1,33,27,"#ff9f8f","#ee4540","#c2111f");[[-14,-4],[14,-4],[0,10]].forEach(p=>{core(p[0],p[1],10,9,"#ffd0a0");dots(3,4,4,"#fff2a0",1.6,2.4,p[0],p[1])})},
 broccoli(){[[-23,-9,20],[0,-22,25],[23,-9,20],[-12,9,19],[13,8,19]].forEach(v=>{ctx.fillStyle=grad(v[0],v[1],v[2]*.75,"#e2f7b0","#9ad45f","#5da13a");ctx.beginPath();ctx.arc(v[0],v[1],v[2]*.78,0,Math.PI*2);ctx.fill()});ctx.fillStyle="#e8f0b8";ctx.beginPath();ctx.roundRect(-8,4,16,34,6);ctx.fill()},
 cucumber(){ctx.rotate(-.35);ctx.fillStyle="#bfe38a";ctx.beginPath();ctx.roundRect(-14,-37,28,74,14);ctx.fill();ctx.fillStyle="#e6f6c0";ctx.beginPath();ctx.roundRect(-9,-32,18,64,9);ctx.fill();for(let y=-24;y<=24;y+=12){oval(-3,y,1.6,2.6,"#a8cf6a");oval(3,y+6,1.6,2.6,"#a8cf6a")}},
 corn(){ctx.rotate(-.2);ctx.fillStyle="#ffe167";ctx.beginPath();ctx.roundRect(-15,-35,30,70,14);ctx.fill();ctx.fillStyle="#fff8c9";ctx.beginPath();ctx.roundRect(-6,-28,12,56,6);ctx.fill();for(let y=-26;y<=26;y+=9){oval(-11,y,2,3.6,"#f5c53a");oval(11,y+4,2,3.6,"#f5c53a")}},
 pepper(){fl(0,0,-2,31,28,"#a9e86a","#6fc23a","#3f8f22");core(0,-1,17,20,"#f1ffd0");dots(10,10,12,"#fff4b0",1.8,2.8,0,-1)},
 eggplant(){fl(.3,3,5,27,32,"#f6f1cf","#e6dfaa","#c9c07e");dots(12,16,20,"#6b5a2a",1.3,2.2,3,5)},
 pineapple(){ctx.rotate(.1);fl(0,0,8,25,36,"#fff3b0","#ffe14d","#f2c200");core(0,8,6,29,"#fff9d6")},
 mango(){ctx.rotate(.4);fl(0,-2,-2,33,30,"#ffe58f","#ffc233","#ff9a14");ctx.rotate(-.2);core(0,-2,9,19,"#f4e8bb")},
 onion(){[[34,36,"#f3dcf3"],[28,30,"#b86ab4"],[22,24,"#f3dcf3"],[16,18,"#b86ab4"],[9,11,"#f3dcf3"]].forEach(r=>core(0,0,r[0],r[1],r[2]))}
};
function cutItem(t){
 if(t==="watermelon"){watermelon(1);return}
 drawItem(t);
 const f=CUT[t];if(f){ctx.save();f();ctx.restore()}
 shine(-10,-10,16);
}

// ---- bomb ----
function drawBomb(){
 ctx.save();
 ctx.shadowColor="#ff1700";ctx.shadowBlur=35;
 let g=ctx.createRadialGradient(-12,-15,3,0,0,43);
 g.addColorStop(0,"#777d83");g.addColorStop(.35,"#292d34");g.addColorStop(.75,"#08090d");g.addColorStop(1,"#020204");
 ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,3,36,0,Math.PI*2);ctx.fill();
 ctx.shadowBlur=0;ctx.strokeStyle="#ff5a31";ctx.lineWidth=3;ctx.stroke();
 ctx.strokeStyle="#8e969b";ctx.beginPath();ctx.arc(0,3,30,.3,2.8);ctx.stroke();
 oval(-14,-12,8,15,"rgba(255,255,255,.33)");
 ctx.fillStyle="#ffca41";ctx.font="bold 32px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("!",0,5);
 ctx.fillStyle="#b3b4b2";ctx.fillRect(-6,-39,13,11);
 ctx.strokeStyle="#ff9d27";ctx.lineWidth=5;
 ctx.beginPath();ctx.moveTo(0,-39);ctx.quadraticCurveTo(18,-48,12,-60);ctx.stroke();
 let fl=1+Math.sin(performance.now()/60)*.15;
 ctx.fillStyle="#ff4c00";ctx.beginPath();ctx.moveTo(12,-56);
 ctx.quadraticCurveTo(28,-76*fl,17,-84*fl);ctx.quadraticCurveTo(16,-72,8,-76*fl);ctx.quadraticCurveTo(-2,-64,12,-56);ctx.fill();
 oval(13,-65,5,5,"#fff9a4");
 for(let i=0;i<7;i++){let a=i*1.1+performance.now()*.003;oval(Math.cos(a)*47,Math.sin(a)*47,2.5,2.5,"#ffb72d")}
 ctx.restore();
}

// ---- background (drawn once per resize, cached) ----
function drawBg(c){
 let g=c.createLinearGradient(0,0,W,H);
 g.addColorStop(0,"#5a3820");g.addColorStop(.5,"#2c1a0f");g.addColorStop(1,"#100907");
 c.fillStyle=g;c.fillRect(0,0,W,H);
 for(let y=0;y<H;y+=105){
  c.fillStyle="rgba(0,0,0,.18)";c.fillRect(0,y,W,3);
  for(let x=20;x<W;x+=180){
   c.strokeStyle="rgba(194,128,71,.1)";c.lineWidth=2;c.strokeRect(x,y+7,145,88);
   for(let j=0;j<3;j++){c.beginPath();c.moveTo(x+15,y+25+j*20);c.quadraticCurveTo(x+70,y+18+j*20,x+120,y+28+j*20);c.stroke()}
  }
 }
 let l=c.createRadialGradient(W/2,H*.4,0,W/2,H*.4,H*.8);
 l.addColorStop(0,"rgba(255,174,65,.22)");l.addColorStop(1,"rgba(0,0,0,0)");
 c.fillStyle=l;c.fillRect(0,0,W,H);
 let v=c.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.8);
 v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,.65)");
 c.fillStyle=v;c.fillRect(0,0,W,H);
}

// ================= SPAWN =================
function spawnWave(){
 const n=3+Math.floor(Math.random()*3),hasBomb=score>=8&&Math.random()<.35,bi=hasBomb?1+Math.floor(Math.random()*(n-1)):-1;
 texts.push({x:W/2,y:H*.33,t:hasBomb?"CAREFUL!":"COMBO TIME!",life:1,color:hasBomb?"#ff6a5a":"#ffe46b",size:34});
 const g=gid;
 for(let i=0;i<n;i++)setTimeout(()=>{if(state==="play"&&g===gid)spawn(i===bi)},i*110);
}
function spawn(fb){
 const bomb=fb===true||fb===false?fb:Math.random()<Math.min(.14+score/1000,.25);
 const item=types[Math.floor(Math.random()*types.length)];
 objects.push({
  x:55+Math.random()*(W-110),y:H+70,vx:(Math.random()-.5)*5,
  vy:-(12+Math.random()*4+Math.min(score/175,4)),gravity:.22,
  type:bomb?"bomb":item[0],points:bomb?0:item[1],bomb,size:43,
  angle:(Math.random()-.5)*.5,spin:(Math.random()-.5)*.025,sliced:false
 });
 if(bomb)sfxFuse();
 if(Math.random()<.2)setTimeout(()=>{if(state==="play")spawn()},130);
}

// ================= EFFECTS =================
function addP(o){particles.push(Object.assign({life:1,d:.023,g:.18,size:4},o))}

function burst(x,y,type){
 const c=JC[type]||"#ffcf45";
 for(let i=0;i<30;i++){
  let a=Math.random()*Math.PI*2,sp=2+Math.random()*8;
  addP({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,size:2+Math.random()*6,color:Math.random()<.2?"#fff7d0":c});
 }
 splats.push({x:x+(Math.random()-.5)*30,y:y+(Math.random()-.5)*30,r:22+Math.random()*26,color:c,life:1});
 rings.push({x,y,r:8,life:1,color:c,w:3,sp:5});
}

function explode(x,y){
 sfxBoom();
 state="explode";endAt=performance.now()+1400;
 shake=40;flash=1;fire={x,y,life:1};ts=.4;
 rings.push({x,y,r:10,life:1,color:"#ffb020",w:10,sp:26});
 rings.push({x,y,r:5,life:1,color:"#fff2a8",w:5,sp:15});
 const cols=["#ff2300","#ff6a00","#ffb020","#ffe36b","#fff"];
 for(let i=0;i<80;i++){
  let a=Math.random()*Math.PI*2,sp=3+Math.random()*17;
  addP({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,size:3+Math.random()*9,color:cols[i%5],glow:true,d:.015+Math.random()*.015});
 }
 for(let i=0;i<24;i++){
  let a=Math.random()*Math.PI*2,sp=1+Math.random()*5;
  addP({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,size:16+Math.random()*20,smoke:true,g:-.03,d:.009});
 }
 for(let i=0;i<20;i++){
  let a=Math.random()*Math.PI*2,sp=4+Math.random()*12;
  addP({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-5,size:3+Math.random()*5,color:"#2a2d33",d:.012,g:.35});
 }
 texts.push({x:W/2,y:y>120?y-80:y+80,t:"BOOM!",life:1,size:70,color:"#ffb020",big:true});
}

function updateEffects(dt){
 let s=dt/16.67;
 for(let i=particles.length-1;i>=0;i--){
  let p=particles[i];p.x+=p.vx*s;p.y+=p.vy*s;p.vy+=p.g*s;
  if(p.smoke){p.vx*=.97}
  p.life-=p.d*s;if(p.life<=0)particles.splice(i,1);
 }
 for(let i=rings.length-1;i>=0;i--){
  let r=rings[i];r.r+=r.sp*s;r.life-=.03*s;if(r.life<=0)rings.splice(i,1);
 }
 for(let i=texts.length-1;i>=0;i--){
  let t=texts[i];t.y-=.6*s;t.life-=dt/(t.big?1000:800);if(t.life<=0)texts.splice(i,1);
 }
 for(let i=splats.length-1;i>=0;i--){
  splats[i].life-=dt/5000;if(splats[i].life<=0)splats.splice(i,1);
 }
 if(fire){fire.life-=dt/550;if(fire.life<=0)fire=null}
 flash=Math.max(0,flash-dt/450);
}

function drawSplats(){
 for(const s of splats){
  ctx.globalAlpha=Math.min(1,s.life)*.32;ctx.fillStyle=s.color;
  ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
  for(let i=0;i<5;i++){let a=i*1.3+s.r;ctx.beginPath();ctx.arc(s.x+Math.cos(a)*s.r*1.2,s.y+Math.sin(a)*s.r*1.2,s.r*.3,0,Math.PI*2);ctx.fill()}
 }
 ctx.globalAlpha=1;
}

function drawEffects(){
 if(fire){
  let r=70+(1-fire.life)*260;
  let g=ctx.createRadialGradient(fire.x,fire.y,0,fire.x,fire.y,r);
  g.addColorStop(0,"rgba(255,255,230,"+fire.life+")");
  g.addColorStop(.35,"rgba(255,170,30,"+fire.life*.8+")");
  g.addColorStop(1,"rgba(255,40,0,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(fire.x,fire.y,r,0,Math.PI*2);ctx.fill();
 }
 for(const p of particles){
  if(p.smoke){
   ctx.globalAlpha=Math.max(0,p.life)*.45;ctx.fillStyle="#3a3a40";
   ctx.beginPath();ctx.arc(p.x,p.y,p.size*(2.2-p.life),0,Math.PI*2);ctx.fill();continue;
  }
  ctx.globalCompositeOperation=p.glow?"lighter":"source-over";
  ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;
  ctx.beginPath();ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);ctx.fill();
 }
 ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
 for(const r of rings){
  ctx.globalAlpha=Math.max(0,r.life)*.8;ctx.strokeStyle=r.color;ctx.lineWidth=r.w*r.life;
  ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();
 }
 ctx.globalAlpha=1;
 ctx.textAlign="center";ctx.textBaseline="middle";
 for(const t of texts){
  let sc=t.big?1+(1-t.life)*.5:Math.min(1,(1.2-t.life)*4+.5);
  ctx.save();ctx.globalAlpha=Math.min(1,t.life*1.6);ctx.translate(t.x,t.y);ctx.scale(sc,sc);
  ctx.font="900 "+(t.size||26)+"px 'Trebuchet MS',Arial";
  ctx.lineWidth=5;ctx.strokeStyle="rgba(40,10,0,.85)";ctx.strokeText(t.t,0,0);
  ctx.fillStyle=t.color;ctx.fillText(t.t,0,0);ctx.restore();
 }
}

function drawObjects(){
 for(const o of objects){
  if(o.sliced)continue;
  ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);
  ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=14;ctx.shadowOffsetY=6;
  if(o.bomb){let p=1+Math.sin(performance.now()/95)*.07;ctx.scale(p,p);drawBomb()}
  else drawItem(o.type);
  ctx.restore();
 }
 for(const h of halves){
  ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.angle+h.rel);
  ctx.beginPath();ctx.rect(-120,h.side>0?0:-120,240,120);ctx.clip();
  ctx.rotate(-h.rel);cutItem(h.type);ctx.rotate(h.rel);
  ctx.fillStyle="rgba(255,255,255,.45)";
  ctx.fillRect(-60,h.side>0?0:-2.5,120,2.5);
  ctx.restore();
 }
}

function drawTrail(){
 const now=performance.now(),LIFE=230;
 while(trails.length&&now-trails[0].t>LIFE)trails.shift();
 if(trails.length<2)return;
 ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
 for(const pass of[0,1]){
  for(let i=1;i<trails.length;i++){
   const a=trails[i-1],b=trails[i];if(b.start)continue;
   const k=1-(now-b.t)/LIFE;if(k<=0)continue;
   ctx.globalAlpha=k;ctx.strokeStyle=pass?"#fff":"#ffb02e";
   ctx.shadowColor="#ff8a00";ctx.shadowBlur=pass?6:22;ctx.lineWidth=(pass?5:15)*k;
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
 }
 ctx.restore();
}
function drawTrailOld(dt){
 for(let i=trails.length-1;i>=0;i--){
  let t=trails[i];t.life-=dt/200;
  if(t.life<=0){trails.splice(i,1);continue}
  ctx.save();ctx.lineCap="round";ctx.globalAlpha=t.life;
  ctx.strokeStyle="#ffb02e";ctx.shadowColor="#ff8a00";ctx.shadowBlur=24;ctx.lineWidth=16*t.life;
  ctx.beginPath();ctx.moveTo(t.x1,t.y1);ctx.lineTo(t.x2,t.y2);ctx.stroke();
  ctx.strokeStyle="#fff";ctx.shadowBlur=8;ctx.lineWidth=6*t.life;
  ctx.beginPath();ctx.moveTo(t.x1,t.y1);ctx.lineTo(t.x2,t.y2);ctx.stroke();
  ctx.restore();
 }
}

// ================= LOGIC =================
let cuts=[],ts=1;
function updateCuts(dt){for(let i=cuts.length-1;i>=0;i--){cuts[i].life-=dt/260;if(cuts[i].life<=0)cuts.splice(i,1)}}
function drawCuts(){
 for(const c of cuts){
  const k=c.life,len=60+(1-k)*90;
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);ctx.globalAlpha=k;
  const g=ctx.createLinearGradient(-len,0,len,0);
  g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(.5,"rgba(255,255,255,.95)");g.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=g;ctx.fillRect(-len,-2.5*k,len*2,5*k);
  ctx.restore();
 }
}
function setScore(){
 $("score").textContent=score;
 let el=$("score");el.classList.remove("pop");void el.offsetWidth;el.classList.add("pop");
}

function updateObjects(dt){
 let s=Math.min(dt/16.67,2);
 for(let i=objects.length-1;i>=0;i--){
  let o=objects[i];
  o.x+=o.vx*s;o.y+=o.vy*s;o.vy+=o.gravity*s;o.angle+=o.spin*s;
  if(o.bomb&&Math.random()<.4){
   let c=Math.cos(o.angle),sn=Math.sin(o.angle);
   addP({x:o.x+13*c+62*sn,y:o.y+13*sn-62*c,vx:(Math.random()-.5)*3,vy:-Math.random()*3,size:2+Math.random()*2.5,color:Math.random()<.5?"#ffd34b":"#ff7a1a",d:.07,glow:true});
  }
  if(o.y>H+110){
   if(!o.bomb&&state==="play"){
    score=Math.max(0,score-1);setScore();sfxMiss();
    texts.push({x:Math.max(40,Math.min(W-40,o.x)),y:H-70,t:"-1",life:1,color:"#ff6a5a",size:30});
   }
   objects.splice(i,1);
  }
 }
 for(let i=halves.length-1;i>=0;i--){
  let h=halves[i];
  h.x+=h.vx*s;h.y+=h.vy*s;h.vy+=.22*s;h.angle+=h.spin*s;
  if(Math.random()<.3)addP({x:h.x,y:h.y,vx:(Math.random()-.5)*1.2,vy:Math.random()*1.5,size:2+Math.random()*2.5,color:JC[h.type],d:.05});
  if(h.y>H+130)halves.splice(i,1);
 }
}

function slice(x1,y1,x2,y2){
 let dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy;
 if(len<1)return;
 for(let i=objects.length-1;i>=0;i--){
  let o=objects[i];if(o.sliced)continue;
  let t=Math.max(0,Math.min(1,((o.x-x1)*dx+(o.y-y1)*dy)/len));
  let d=Math.hypot(o.x-(x1+t*dx),o.y-(y1+t*dy));
  if(d<o.size*.9){
   o.sliced=true;
   if(o.bomb){explode(o.x,o.y);objects.splice(i,1);return}
   burst(o.x,o.y,o.type);cuts.push({x:o.x,y:o.y,a:Math.atan2(dy,dx),life:1});ts=.55;
   let L=Math.sqrt(len),nx=-dy/L,ny=dx/L,ca=Math.atan2(dy,dx),rel=ca-o.angle;
   for(const side of[-1,1])halves.push({x:o.x,y:o.y,vx:o.vx+nx*side*3.2,vy:o.vy+ny*side*3.2-1,angle:o.angle,rel,side,spin:o.spin+side*.05,type:o.type});
   let now=performance.now();
   combo=now-lastSlice<800?combo+1:1;lastSlice=now;comboTimer=1000;
   let earned=o.points;
   score+=earned;setScore();
   sfxSlice(o.type,combo);
   texts.push({x:o.x,y:o.y-30,t:"+"+earned,life:1,color:"#ffe46b",size:combo>=3?36:28});
   if(combo>=2){let c=$("combo");c.textContent=combo+"x COMBO! +"+earned;c.style.animation="none";void c.offsetWidth;c.style.animation=""}
   if(score>best){best=score;newRec=true;try{localStorage.setItem("veggieSlashBest",best)}catch(e){}$("best").textContent="BEST: "+best}
   objects.splice(i,1);
  }
 }
}

// ================= CONTROLS =================
function getPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener("pointerdown",e=>{
 if(state!=="play")return;
 pointer=getPoint(e);trails.push({x:pointer.x,y:pointer.y,t:performance.now(),start:true});canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
 if(!pointer||state!=="play")return;
 const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];
 for(const ev of(evs.length?evs:[e])){
  if(!pointer)break;
  let p=getPoint(ev);
  trails.push({x:p.x,y:p.y,t:performance.now()});
  slice(pointer.x,pointer.y,p.x,p.y);
  pointer=p;
 }
});
const release=()=>{pointer=null};
canvas.addEventListener("pointerup",release);
canvas.addEventListener("pointercancel",release);

// ================= LOOP =================
function loop(time){
 if(state==="home"||state==="over")return;
 let raw=Math.min(time-lastTime,40);lastTime=time;
 ts+=(1-ts)*Math.min(1,raw/170);let dt=raw*ts;

 ctx.save();
 if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake=Math.max(0,shake-dt*.045)}
 ctx.drawImage(bg,-30,-30,W+60,H+60);
 drawSplats();

 if(state==="play"){
  spawnTimer+=dt;
  if(spawnTimer>=spawnInterval){if(Math.random()<.28){spawnWave();spawnTimer=-700}else{spawn();spawnTimer=0}spawnInterval=Math.max(430,1050-score*1.4)}
  comboTimer-=dt;
  if(comboTimer<=0&&combo){combo=0;$("combo").textContent=""}
 }
 updateObjects(dt);updateEffects(dt);updateCuts(dt);
 drawObjects();drawEffects();drawCuts();drawTrail();
 ctx.restore();

 if(flash>0){ctx.fillStyle="rgba(255,240,200,"+flash*.85+")";ctx.fillRect(0,0,W,H)}
 if(state==="explode"&&time>endAt)endGame();
 if(state==="play"||state==="explode")requestAnimationFrame(loop);
}

function startGame(){
 audio();
 gid++;newRec=false;score=0;combo=0;
 objects=[];halves=[];particles=[];trails=[];rings=[];texts=[];splats=[];fire=null;cuts=[];ts=1;
 spawnTimer=0;spawnInterval=1000;pointer=null;shake=0;flash=0;
 $("score").textContent="0";$("combo").textContent="";
 state="play";lastTime=performance.now();
 $("home").classList.add("hidden");$("gameOver").classList.add("hidden");
 $("hud").classList.remove("hidden");$("hint").classList.remove("hidden");
 requestAnimationFrame(loop);
}

function endGame(){
 state="over";pointer=null;$("combo").textContent="";
 $("finalScore").textContent=score;
 $("finalBest").textContent="BEST SCORE: "+best;
 $("newBest").textContent=newRec?"🏆 NEW HIGH SCORE!":"";
 $("gameOver").classList.remove("hidden");
 $("hint").classList.add("hidden");
}

$("play").onclick=startGame;
$("restart").onclick=startGame;
$("homeBtn").onclick=()=>{
 state="home";
 $("gameOver").classList.add("hidden");$("hud").classList.add("hidden");$("hint").classList.add("hidden");
 $("combo").textContent="";$("home").classList.remove("hidden");
};

// ================= FULLSCREEN / ROTATE =================
function toast(msg){const t=$("toast");t.textContent=msg;t.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>{t.style.opacity=0},2600)}
function inFs(){return document.fullscreenElement||document.webkitFullscreenElement}
async function goFs(){const el=document.documentElement,f=el.requestFullscreen||el.webkitRequestFullscreen;if(!f)throw new Error("nofs");await f.call(el)}
$("fs").onclick=async e=>{
 e.stopPropagation();
 try{
  if(inFs()){
   try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(_){}
   (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  }else await goFs();
 }catch(err){toast(err.message==="nofs"?"Full screen is not supported here. On iPhone use Share, then Add to Home Screen.":"Full screen is blocked here. Try opening the game in its own tab.")}
};
$("rot").onclick=async e=>{
 e.stopPropagation();
 const so=screen.orientation;
 if(!so||!so.lock){toast("Turn off rotation lock and turn your phone sideways.");return}
 try{
  if(!inFs())await goFs();
  await so.lock(so.type.indexOf("landscape")===0?"portrait":"landscape");
 }catch(err){toast("Cannot rotate automatically. Turn your phone sideways.")}
};
document.addEventListener("fullscreenchange",()=>{$("fs").textContent=inFs()?"\u2921":"\u2922";setTimeout(resize,150)});
document.addEventListener("webkitfullscreenchange",()=>setTimeout(resize,150));
addEventListener("orientationchange",()=>setTimeout(resize,200));

setTimeout(()=>{const sp=$("splash");sp.classList.add("out");setTimeout(()=>sp.remove(),700)},2800);
resize();
