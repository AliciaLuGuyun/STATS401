// Deterministic landmark fixtures only; never imported by the production page.
export function hand(x = 0.5, open = true, label = 'Right', score = 0.99) {
  const p = Array.from({length:21}, () => ({x, y:0.65, z:0}));
  p[0] = {x,y:0.8,z:0};
  for (const [base,offset] of [[5,-.09],[9,-.03],[13,.03],[17,.09]]) {
    for (let j=0;j<4;j++) p[base+j] = {x:x+offset,y:0.65-j*.09,z:0};
    if (!open) { p[base+2].y=.68; p[base+3].y=.73; }
  }
  for (let j=1;j<=4;j++) p[j]={x:x-.04-j*.045,y:.76-j*.035,z:0};
  if (!open) p[4] = {x:x-.06,y:.77,z:0};
  return {landmarks:[p], worldLandmarks:[p], handedness:[[{categoryName:label,score}]]};
}
export function feed(detector, frames) { return frames.map(([t,result])=>detector.update(result,t)).filter(d=>d.action).map(d=>d.action); }
export function hold(from,to,x=.5,open=true) { return Array.from({length:Math.floor((to-from)/50)+1}, (_,i)=>[from+i*50,hand(x,open)]); }
export function swipe(from=0,right=true) { return Array.from({length:9},(_,i)=>[from+i*50,hand(right ? .70-i*.04 : .30+i*.04)]); }
export function pose(kind, x=.5, ratio=0.1) {
  const result=hand(x,false),p=result.landmarks[0];
  if(kind==='point'||kind==='pinch') {
    const index=hand(x,true).landmarks[0];for(let i=5;i<=8;i++) p[i]=index[i];
  }
  if(kind==='thumb') {
    for(let i=1;i<=4;i++) p[i]={x,y:[0,.73,.63,.50,.35][i],z:0};
  }
  if(kind==='pinch') {
    const size=Math.max(Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y),Math.hypot(p[0].x-p[9].x,p[0].y-p[9].y));
    p[4]={x:p[8].x+size*ratio,y:p[8].y,z:0};
  }
  return result;
}
export function poseHold(kind,from,to,x=.5,ratio=.1) {
  return Array.from({length:Math.floor((to-from)/50)+1},(_,i)=>[from+i*50,pose(kind,x,ratio)]);
}
export function pointAt(x,y,kind='point') {
  const result=pose(kind),p=result.landmarks[0],dx=x-p[8].x,dy=y-p[8].y;
  p.forEach(v=>{v.x+=dx;v.y+=dy;});return result;
}
