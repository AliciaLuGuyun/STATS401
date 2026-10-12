import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureDetector,isThumbsUp,isPointing,pinchRatio} from '../gestures.js';
import {CursorSmoother,cameraToSvg,nearestNode} from '../exploration.js';
import {hand,feed,hold,swipe,pose,poseHold} from './fixtures.mjs';
test('thumbs up requires upright thumb and four folded fingers; open palm excluded',()=>{
  assert.equal(isThumbsUp(pose('thumb').landmarks[0]),true);
  assert.equal(isThumbsUp(hand().landmarks[0]),false);
  assert.equal(isThumbsUp(pose('point').landmarks[0]),false);
  const sideways=pose('thumb');sideways.landmarks[0][4].x+=.2;assert.equal(isThumbsUp(sideways.landmarks[0]),false);
});
test('stable thumbs up fires once and requires release before another action',()=>{
  const d=new GestureDetector();assert.deepEqual(feed(d,poseHold('thumb',0,3000)),['Thumbs_Up']);
  assert.deepEqual(feed(d,hold(3050,3350,.5,false)),[]);
  assert.deepEqual(feed(d,poseHold('thumb',3400,4900)),['Thumbs_Up']);
});
test('short thumb hold and moving thumbs up do not toggle or swipe',()=>{
  assert.deepEqual(feed(new GestureDetector(),poseHold('thumb',0,350)),[]);
  assert.deepEqual(feed(new GestureDetector(),poseHold('thumb',0,400).map(([t],i)=>[t,pose('thumb',.7-i*.04)])),[]);
});
test('open palm has no stationary action',()=>assert.deepEqual(feed(new GestureDetector(),hold(0,3000)),[]));
test('multi-frame horizontal motion determines mirrored swipe direction',()=>{
  assert.deepEqual(feed(new GestureDetector(),swipe()),['Swipe_Right']);assert.deepEqual(feed(new GestureDetector(),swipe(0,false)),['Swipe_Left']);
});
test('pointing, even when moving horizontally, never navigates the timeline',()=>{
  assert.equal(isPointing(pose('point').landmarks[0]),true);
  const d=new GestureDetector();assert.deepEqual(feed(d,swipe().map(([t,h])=>[t,pose('point',h.landmarks[0][0].x)])),[]);
  assert.equal(d.mode,'POINT');assert.deepEqual(feed(new GestureDetector(),poseHold('point',0,2000)),[]);
});
test('point requires stability and returns actual index fingertip coordinates',()=>{
  const d=new GestureDetector();assert.equal(d.update(pose('point'),0).cursor,null);
  d.update(pose('point'),50);d.update(pose('point'),100);
  const result=d.update(pose('point'),150);assert.equal(result.stable,true);assert.deepEqual(result.cursor,{x:pose('point').landmarks[0][8].x,y:pose('point').landmarks[0][8].y});
});
test('pinch distance is hand-size normalized and scale invariant',()=>{
  const p=pose('pinch',.5,.2).landmarks[0],scale=p.map(v=>({x:v.x*.5,y:v.y*.5,z:v.z*.5}));
  assert.ok(Math.abs(pinchRatio(p)-.2)<1e-8);assert.ok(Math.abs(pinchRatio(p)-pinchRatio(scale))<1e-8);
  assert.equal(pinchRatio([]),Infinity);
});
test('pinch requires prior stable point, brief hold, and only selects once',()=>{
  const d=new GestureDetector();assert.deepEqual(feed(d,poseHold('pinch',0,1500)),[]);
  const ready=new GestureDetector();feed(ready,poseHold('point',0,300));
  assert.deepEqual(feed(ready,poseHold('pinch',350,2000)),['Pinch']);
});
test('pinch hysteresis blocks swipes and requires sustained wide release',()=>{
  const d=new GestureDetector();feed(d,poseHold('point',0,300));assert.deepEqual(feed(d,poseHold('pinch',350,800)),['Pinch']);
  assert.deepEqual(feed(d,poseHold('pinch',850,1600,.5,.33)),[]);assert.equal(d.pinchLatched,true);
  // One wide sample cannot rearm; returning to the band cancels release.
  d.update(pose('pinch',.5,.5),1650);d.update(pose('pinch',.5,.33),1700);assert.equal(d.pinchLatched,true);
  feed(d,poseHold('point',1750,2250));assert.equal(d.pinchLatched,false);
  assert.deepEqual(feed(d,poseHold('pinch',2300,2800)),['Pinch']);
});
test('pinch candidates moving horizontally cannot swipe',()=>{
  const d=new GestureDetector();feed(d,poseHold('point',0,200,.7));
  assert.deepEqual(feed(d,swipe(250).map(([t,h])=>[t,pose('pinch',h.landmarks[0][0].x)])),['Pinch']);
});
test('pinch band cannot complete a candidate; threshold is configurable',()=>{
  const d=new GestureDetector();feed(d,poseHold('point',0,250));
  d.update(pose('pinch',.5,.1),300);assert.deepEqual(feed(d,poseHold('pinch',350,900,.5,.33)),[]);
  const strict=new GestureDetector({pinchStartRatio:.05});feed(strict,poseHold('point',0,250));
  assert.deepEqual(feed(strict,poseHold('pinch',300,1000,.5,.1)),[]);
});
test('lost hand cancels incomplete thumb/pinch and hides pointing',()=>{
  const d=new GestureDetector();feed(d,poseHold('thumb',0,550));d.update({landmarks:[]},600);
  assert.deepEqual(feed(d,poseHold('thumb',650,1000)),[]);
  const pinch=new GestureDetector();feed(pinch,poseHold('point',0,200));pinch.update(pose('pinch'),250);pinch.update({landmarks:[]},300);
  assert.deepEqual(feed(pinch,poseHold('pinch',350,1000)),[]);
  assert.equal(d.update({landmarks:[]},1050).cursor,null);
});
test('brief loss does not release a held thumb; sustained loss rearms it',()=>{
  const d=new GestureDetector();feed(d,poseHold('thumb',0,1500));d.update({landmarks:[]},1550);d.update({landmarks:[]},1700);
  assert.deepEqual(feed(d,poseHold('thumb',1750,3000)),[]);
  for(let t=3050;t<=3750;t+=50) d.update({landmarks:[]},t);
  assert.deepEqual(feed(d,poseHold('thumb',3800,5300)),['Thumbs_Up']);
});
test('low confidence, invalid landmarks, multiple hands and identity changes cancel candidates',()=>{
  const multi=hand();multi.landmarks.push(hand(.7).landmarks[0]);
  for(const result of [hand(.5,true,'Right',.3),multi,{landmarks:[[]]}]) assert.deepEqual(feed(new GestureDetector(),Array.from({length:50},(_,i)=>[i*50,result])),[]);
  assert.deepEqual(feed(new GestureDetector(),swipe().map(([t,h],i)=>[t,hand(h.landmarks[0][0].x,true,i%2?'Left':'Right')])),[]);
});
test('frame gaps, jitter, vertical travel and insufficient horizontal movement are rejected',()=>{
  assert.deepEqual(feed(new GestureDetector(),swipe().map(([t,h])=>[t*10,h])),[]);
  assert.deepEqual(feed(new GestureDetector(),hold(0,2000,.5,false).map(([t])=>[t,hand(.5+Math.sin(t)*.01,false)])),[]);
  assert.deepEqual(feed(new GestureDetector(),swipe().map(([t,h],i)=>{h.landmarks[0].forEach(p=>p.y+=i*.022);return[t,h];})),[]);
  assert.deepEqual(feed(new GestureDetector(),swipe().map(([t],i)=>[t,hand(.6-i*.01)])),[]);
});
test('swipe latch and global cooldown prevent repeated commands',()=>{
  const d=new GestureDetector();assert.deepEqual(feed(d,swipe()),['Swipe_Right']);assert.deepEqual(feed(d,swipe(450,false)),[]);
  feed(d,hold(900,1650,.7,false));assert.deepEqual(feed(d,swipe(1700)),['Swipe_Right']);
  const cool=new GestureDetector({cooldownMs:3000,missingRearmMs:150});feed(cool,swipe());
  for(let t=450;t<=650;t+=50) cool.update({landmarks:[]},t);
  assert.equal(cool.latched,false);assert.deepEqual(feed(cool,swipe(700,false)),[]);
});
test('camera mapping mirrors x, preserves y, clamps edges and uses viewBox offsets',()=>{
  const box={x:10,y:20,width:1000,height:700};
  assert.deepEqual(cameraToSvg({x:.2,y:.3},box),{x:810,y:230});
  assert.deepEqual(cameraToSvg({x:.2,y:.3},box,false),{x:210,y:230});
  assert.deepEqual(cameraToSvg({x:-1,y:2},box),{x:1010,y:720});
});
test('cursor smoothing reduces jitter and reset avoids stale movement',()=>{
  const s=new CursorSmoother(.25);assert.deepEqual(s.update({x:100,y:100}),{x:100,y:100});
  assert.deepEqual(s.update({x:200,y:0}),{x:125,y:75});s.reset();assert.deepEqual(s.update({x:200,y:0}),{x:200,y:0});
});
test('nearest-node hit testing rejects distant nodes and handles responsive CSS-pixel radius',()=>{
  const nodes=[{id:'a',x:100,y:100},{id:'b',x:200,y:100}],matrix={a:.5,b:0,c:0,d:.5};
  assert.equal(nearestNode(nodes,{x:120,y:100},matrix,15)?.id,'a');
  assert.equal(nearestNode(nodes,{x:150,y:200},matrix,15),null);
  assert.equal(nearestNode(nodes,{x:220,y:100},{a:2,b:0,c:0,d:1},34),null);
  assert.equal(nearestNode([],{x:100,y:100},matrix),null);
});
test('pinch cooldown blocks a second selection even after release and pointing',()=>{
  const d=new GestureDetector();feed(d,poseHold('point',0,200));
  assert.deepEqual(feed(d,poseHold('pinch',250,500)),['Pinch']);
  feed(d,poseHold('point',550,1000));
  assert.deepEqual(feed(d,poseHold('pinch',1050,1300)),[]);
  feed(d,poseHold('point',1350,1900));
  assert.deepEqual(feed(d,poseHold('pinch',1950,2300)),['Pinch']);
});
