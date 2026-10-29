import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneLayout,candySize,roomProjection} from '../public/party/scene-layout.mjs';

test('the camera and all feet share the painted floor, including wide short canvases',()=>{
  for(const [w,h] of [[1660,440],[1200,520],[840,440],[390,479],[320,154]])for(let n=1;n<=6;n++){
    const s=sceneLayout(w,h,n);
    assert.equal(s.floor,s.background.y+s.background.h*.563);
    assert.ok(s.hostess.foot>s.floor);
    assert.ok(s.positions.every(p=>p.foot>s.floor));
    assert.ok(s.floor<=h*.57+.001,'camera must leave enough actual floor visible');
    const p=roomProjection(w,h);assert.ok(Math.abs(p.w/p.h-1672/941)<1e-9,'background aspect ratio is preserved');
  }
});

test('one thief gets the lower-left bowl corner; two get opposite corners',()=>{
  for(const [w,h] of [[1200,520],[390,479],[320,188]]){
    for(const count of [1,2]){
      const {positions:p,bowl}=sceneLayout(w,h,count);
      assert.ok(p[0].x<bowl.x);assert.ok(p[0].foot>bowl.y);
      if(count===2){assert.ok(p[1].x>bowl.x);assert.equal(p[0].foot,p[1].foot);}
    }
  }
});

test('all one-to-six-player layouts remain on stage and gathered around the bowl',()=>{
  for(const [w,h] of [[1200,520],[700,390],[430,552],[390,479],[360,360],[320,154]]){
    for(let n=1;n<=6;n++){
      const {positions,bowl}=sceneLayout(w,h,n);
      assert.equal(positions.length,n);assert.equal(new Set(positions.map(p=>`${p.x}:${p.foot}`)).size,n);
      for(const p of positions){
        assert.ok(p.x-p.height*.53>=0&&p.x+p.height*.53<=w,'body fits horizontally');
        assert.ok(p.foot-p.height>=0&&p.foot+20<h,'body and name fit vertically');
        assert.ok(p.labelWidth>=24,'name remains identifiable');
        assert.ok(Math.hypot(p.x-bowl.x,p.foot-bowl.y)<bowl.radius*3.5,'seat stays near the sweets');
      }
      assert.ok(candySize(bowl)*2>=bowl.radius*.6,'pickup matches a large wrapped sweet in the pile');
    }
  }
});
