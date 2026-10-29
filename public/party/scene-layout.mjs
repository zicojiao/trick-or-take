// Canvas geometry only. Seats stay close to the sweets at every player count.
export function roomProjection(width,height,imageWidth=1672,imageHeight=941) {
  const scale=Math.max(width/imageWidth,height/imageHeight),w=imageWidth*scale,h=imageHeight*scale;
  const x=(width-w)*.51,y=Math.min((height-h)*.40,height*.57-h*.563);
  return {x,y,w,h,floor:y+h*.563};
}
export function sceneLayout(width, height, count,imageWidth=1672,imageHeight=941) {
  const narrow = width / height < 1.25, small = width < 500;
  const background=roomProjection(width,height,imageWidth,imageHeight),floor=background.floor;
  const hostess = narrow
    ? {x:width*.73, foot:floor+height*.035, height:Math.min(height*.45,width*.53)}
    : {x:width*.72, foot:floor+height*.035, height:height*.50};
  const bowl = {x:width*.49, y:floor+height*.10, radius:Math.min(width*.17,height*.13)};
  const r=bowl.radius;
  const seat=(dx,foot,h)=>({x:bowl.x+dx,foot:Math.min(height-24,Math.max(floor+height*.025,foot)),height:h});
  let positions;
  if(count<=2){
    const h=Math.min(height*.34,width*(count===1?.40:.36));
    const offset=r*.78+h*.27, foot=bowl.y+r*.64+h*.13;
    positions=[seat(-offset,foot,h)];
    if(count===2)positions.push(seat(offset,foot,h));
  }else if(count===3){
    const h=Math.min(height*.29,width*.29,r*1.9);
    positions=[seat(-r*.85-h*.25,bowl.y+r*.28+h*.08,h),seat(r*.85+h*.25,bowl.y+r*.28+h*.08,h),seat(0,bowl.y+r*.90+h*.34,h)];
  }else{
    const front=count-2;
    const h=Math.min(height*.27,width*(count===4?.26:count===5?.24:.205),r*1.65);
    const side=r*.90+h*.31;
    positions=[seat(-side,bowl.y+r*.12+h*.12,h*.94),seat(side,bowl.y+r*.12+h*.12,h*.94)];
    for(const p of positions)p.labelAbove=true;
    for(let i=0;i<front;i++)positions.push(seat((i-(front-1)/2)*h*.98,bowl.y+r*.80+h*.53,h));
  }
  for(const location of positions){
    const row=positions.filter(other=>other!==location&&Math.abs(other.foot-location.foot)<height*.10);
    const left=Math.max(6,...row.filter(other=>other.x<location.x).map(other=>(other.x+location.x)/2+3));
    const right=Math.min(width-6,...row.filter(other=>other.x>location.x).map(other=>(other.x+location.x)/2-3));
    location.labelWidth=Math.max(0,2*Math.min(location.x-left,right-location.x));
  }
  return {narrow,small,hostess,bowl,positions,background,floor};
}

// Half the painted wrapped-candy width, shared by pickup and confiscation.
export const candySize = bowl => bowl.radius * .32;

// Keep the pickup near the bowl and reaching hand, with a small readable hop.
// Candy is painted in front of the actors, so it need not fly over their heads.
export function pickupPoint(stage, location, progress) {
  const p=Math.max(0,Math.min(1,progress)), eased=p*p*(3-2*p);
  const size=candySize(stage.bowl), side=location.x<stage.bowl.x?-1:1;
  const start=stage.bowl.pile ?? {x:stage.bowl.x,y:stage.bowl.y-stage.bowl.radius*.4};
  const end={x:location.x-side*location.height*.35,y:location.foot-location.height*.52};
  const lift=Math.min(stage.bowl.radius*.62,Math.abs(end.x-start.x)*.35+size*.55);
  return {
    x:start.x+(end.x-start.x)*eased+side*Math.sin(p*Math.PI)*location.height*.04,
    y:start.y+(end.y-start.y)*eased-Math.sin(p*Math.PI)*lift,
  };
}
