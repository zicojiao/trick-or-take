export const CANDY_COLORS = ['#ee8052','#e683ad','#70b68c','#a687ce','#e6b849'];

// Shuffle a bag so pickups feel varied, including when only one spawns per frame.
export function createCandyPicker(random = Math.random) {
  let bag=[],last;
  return () => {
    if(!bag.length){
      bag=[...CANDY_COLORS];
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.at(-1)===last)[bag[0],bag[bag.length-1]]=[bag.at(-1),bag[0]];
    }
    return last=bag.pop();
  };
}

// Recolor the red wrapper only; keep cream swirls, dark ink, shading and alpha.
// This runs once on small cached textures, never for each animation frame.
export function tintCandyPixels(pixels, color) {
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  const min=Math.min(...rgb),span=Math.max(...rgb)-min;
  const hue=rgb.map(channel=>span?(channel-min)/span:0);
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;
    const hi=Math.max(r,g,b),lo=Math.min(r,g,b),chroma=hi-lo;
    if(!pixels[i+3]||hi<.25||chroma<.18||r<g*1.15||r<b*1.05)continue;
    for(let channel=0;channel<3;channel++)pixels[i+channel]=Math.round((lo+chroma*hue[channel])*255);
  }
  return pixels;
}

export function createCandyTextures(image,frame,doc) {
  const textures=new Map();
  try {
    for(const color of CANDY_COLORS){
      const canvas=doc.createElement('canvas');canvas.width=192;canvas.height=Math.round(192*frame.h/frame.w);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,frame.x,frame.y,frame.w,frame.h,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      tintCandyPixels(pixels.data,color);ctx.putImageData(pixels,0,0);textures.set(color,canvas);
    }
  } catch {return new Map();} // The vector fallback still honors the selected color.
  return textures;
}
