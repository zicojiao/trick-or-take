import {shareLabel,SHARE_SIZE} from './share-meta.mjs';
const INK='#352b42';
const cache=new Map();
async function image(doc,path){if(!cache.has(path))cache.set(path,new Promise((resolve,reject)=>{const img=new doc.defaultView.Image();img.onload=()=>resolve(img);img.onerror=()=>{cache.delete(path);reject(new Error('card_image_unavailable'));};img.src=path;}));return cache.get(path);}
function frames(doc,img){
  const c=doc.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data,out=[];
  for(let i=0;i<3;i++){const l=Math.floor(c.width*i/3),r=Math.floor(c.width*(i+1)/3);let x0=r,y0=c.height,x1=l,y1=0;
    for(let y=0;y<c.height;y+=2)for(let x=l;x<r;x+=2)if(d[(y*c.width+x)*4+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    out.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1});
  }return out;
}
export async function drawShareCard(canvas,{result=null,lang='en',origin='https://trickortake.com',blank=false}={}){
  const doc=canvas.ownerDocument;
  if(!result&&!blank){
    const art=await image(doc,new URL('./assets/og-home-v3-'+(lang==='zh'?'zh':'en')+'.png',import.meta.url).href);
    canvas.width=SHARE_SIZE.width;canvas.height=SHARE_SIZE.height;canvas.getContext('2d').drawImage(art,0,0,canvas.width,canvas.height);return canvas;
  }
  await Promise.all([doc.fonts?.load('600 152px Fredoka'),doc.fonts?.load('800 28px Nunito')]);
  const img=await image(doc,new URL('./assets/thieves-innocent-atlas.webp',import.meta.url).href),f=frames(doc,img);
  canvas.width=SHARE_SIZE.width;canvas.height=SHARE_SIZE.height;const g=canvas.getContext('2d');
  const box=(x,y,w,h,r,color,stroke=false)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=color;g.fill();if(stroke){g.strokeStyle=INK;g.lineWidth=3;g.stroke();}};
  const text=(s,x,y,size,color=INK,font='Nunito',align='left')=>{g.font=`${font==='Fredoka'?600:800} ${size}px ${font},"PingFang SC",sans-serif`;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.fillText(s,x,y);};
  g.fillStyle='#f8ecd6';g.fillRect(0,0,1200,630);
  for(let y=16;y<630;y+=24)for(let x=16;x<1200;x+=24){g.beginPath();g.arc(x,y,1.2,0,Math.PI*2);g.fillStyle='#cfb89c55';g.fill();}
  box(24,24,1152,582,30,'#fffaf0',true);
  // TRICK OR TAKE uses the same approved wordmark as the header.
  const [logo,icon]=await Promise.all([image(doc,new URL('./assets/wordmark-v3-ink.png',import.meta.url).href),image(doc,new URL('./assets/favicon.svg?v=3',import.meta.url).href)]);
  g.drawImage(icon,66,55,56,56);g.drawImage(logo,138,55,356,59);
  text(lang==='zh'?'免费万圣节偷糖小游戏 · 60 秒挑战':'FREE HALLOWEEN CANDY GAME · 60 SECONDS',68,137,25,'#746173');
  box(572,183,560,305,30,'#e8ddf5');
  text(lang==='zh'?'偷偷到手的糖果':'TREATS SNEAKED',852,225,21,'#746173','Nunito','center');
  const heights=[239,263,243],xs=[137,292,445],feet=[490,494,499];
  for(let i=0;i<3;i++){const h=heights[i],w=h*f[i].w/f[i].h;g.beginPath();g.ellipse(xs[i],feet[i]-1,w*.34,9,0,0,Math.PI*2);g.fillStyle='#352b4225';g.fill();g.drawImage(img,f[i].x,f[i].y,f[i].w,f[i].h,xs[i]-w/2,feet[i]-h,w,h);}
  if(!blank){text(result?String(result.score):'?',852,335,152,'#7141d9','Fredoka','center');text(shareLabel(result,lang),852,440,28,'#533476','Nunito','center');}
  box(64,530,1072,56,14,'#9be0bb',true);
  text(lang==='zh'?'万圣节偷糖挑战，轮到你了！':'Your turn. Steal more candy!',88,558,28,'#193f2f');
  text(new URL(origin).host,1112,559,24,'#193f2f','Nunito','right');
  return canvas;
}
export async function shareCardBlob(doc,options){const c=doc.createElement('canvas');await drawShareCard(c,options);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('card_unavailable')),'image/png'));}
