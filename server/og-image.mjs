import {SHARE_SIZE} from '../public/party/share-meta.mjs';
const {width:W,height:H}=SHARE_SIZE,templates=new Map();let fontsPromise;
const bytes=async(stream)=>new Uint8Array(await new Response(stream).arrayBuffer());
const inflate=raw=>bytes(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate')));
const deflate=raw=>bytes(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')));
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);let c=0xffffffff;for(let i=4;i<8+data.length;i++)c=table[(c^out[i])&255]^(c>>>8);v.setUint32(out.length-4,(c^0xffffffff)>>>0);return out;}
export async function encodePng(rgba,width=W,height=H){
  if(rgba.length!==width*height*4)throw new Error('invalid_pixels');
  const scan=new Uint8Array((width*4+1)*height);for(let y=0;y<height;y++)scan.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  const header=new Uint8Array(13),v=new DataView(header.buffer);v.setUint32(0,width);v.setUint32(4,height);header[8]=8;header[9]=6;
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',await deflate(scan)),chunk('IEND',new Uint8Array())],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
function mask(pixels,glyph,cx,cy,color){const raw=Uint8Array.from(atob(glyph.data),c=>c.charCodeAt(0)),left=Math.round(cx-glyph.width/2),top=Math.round(cy-glyph.height/2);
  for(let y=0;y<glyph.height;y++)for(let x=0;x<glyph.width;x++){const a=raw[y*glyph.width+x]/255,px=left+x,py=top+y;if(!a||px<0||py<0||px>=W||py>=H)continue;const at=(py*W+px)*4;for(let c=0;c<3;c++)pixels[at+c]=Math.round(color[c]*a+pixels[at+c]*(1-a));}
}
export async function renderOgPng(env,origin,lang='en',result=null){
  lang=lang==='zh'?'zh':'en';
  if(!result){
    const response=await env.ASSETS.fetch(new Request(new URL('/party/assets/og-home-v3-'+lang+'.png',origin)));
    if(!response.ok)throw new Error('image_unavailable');
    return new Uint8Array(await response.arrayBuffer());
  }
  if(!templates.has(lang))templates.set(lang,(async()=>{const r=await env.ASSETS.fetch(new Request(new URL('/party/assets/share-base-'+lang+'.rgba',origin)));if(!r.ok)throw new Error('image_unavailable');const raw=await inflate(await r.arrayBuffer());if(raw.length!==W*H*4)throw new Error('invalid_template');return raw;})().catch(e=>{templates.delete(lang);throw e;}));
  if(!fontsPromise)fontsPromise=(async()=>{const r=await env.ASSETS.fetch(new Request(new URL('/party/assets/share-type.json',origin)));if(!r.ok)throw new Error('image_unavailable');return r.json();})().catch(e=>{fontsPromise=null;throw e;});
  const [base,fonts]=await Promise.all([templates.get(lang),fontsPromise]),pixels=new Uint8Array(base),score=result?String(result.score):'?';
  const glyphs=[...score].map(c=>fonts['score-'+c]),total=glyphs.reduce((n,g)=>n+g.width,0)+(glyphs.length-1)*9;let x=852-total/2;
  for(const g of glyphs){mask(pixels,g,x+g.width/2,332,[113,65,217]);x+=g.width+9;}
  mask(pixels,fonts[result?lang+':'+result.difficulty+':'+result.mode:lang+':default'],852,440,[83,52,118]);
  return encodePng(pixels);
}
