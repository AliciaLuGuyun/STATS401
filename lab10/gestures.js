import { CONFIG } from './config.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const angle = (a, b, c) => {
  const u = [a.x-b.x, a.y-b.y, (a.z||0)-(b.z||0)];
  const v = [c.x-b.x, c.y-b.y, (c.z||0)-(b.z||0)];
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  if (!denominator) return 0;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s,n,i)=>s+n*v[i],0)/denominator))) * 180/Math.PI;
};
const FINGERS = [[5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]];
export function extendedFingers(points, cfg = CONFIG) {
  if (!points || points.length !== 21) return [false,false,false,false];
  return FINGERS.map(([base,pip,dip,tip]) =>
    angle(points[base],points[pip],points[dip]) >= cfg.fingerAngle &&
    angle(points[pip],points[dip],points[tip]) >= cfg.fingerAngle &&
    distance(points[tip],points[0]) > distance(points[pip],points[0])*cfg.fingertipReachRatio);
}
const foldedFingers = points => FINGERS.map(([base,pip,dip,tip]) =>
  angle(points[base],points[pip],points[dip]) < 130 && distance(points[tip],points[0]) < distance(points[pip],points[0])*1.05);
export function isPointing(points, cfg = CONFIG) {
  const extended = extendedFingers(points,cfg);
  return extended[0] && foldedFingers(points).slice(1).every(Boolean);
}
export function isThumbsUp(points, image = points, cfg = CONFIG) {
  if (!points || points.length !== 21 || !foldedFingers(points).every(Boolean)) return false;
  const thumbStraight = angle(points[1],points[2],points[3]) >= cfg.thumbAngle && angle(points[2],points[3],points[4]) >= cfg.thumbAngle;
  const size = Math.hypot(image[5].x-image[17].x,image[5].y-image[17].y);
  const rise = image[2].y-image[4].y;
  return thumbStraight && rise > size*0.3 && Math.abs(image[4].x-image[2].x) < rise*0.8 && image[4].y < image[6].y;
}
export function pinchRatio(points) {
  if (!points || points.length !== 21) return Infinity;
  const size = Math.max(distance(points[5],points[17]),distance(points[0],points[9]));
  return size > 0 ? distance(points[4],points[8])/size : Infinity;
}

// Priority: invalid/lost > pinch (including release hysteresis) > thumbs up > point > swipe.
// Latches survive brief tracking loss. Incomplete candidates and cursor arming do not.
export class GestureDetector {
  constructor(config = {}) { this.cfg = {...CONFIG,...config}; this.reset(); }
  reset() {
    this.latched = false; this.thumbLatched = false; this.pinchLatched = false;
    this.lastAction = -Infinity; this.lastPinch = -Infinity; this.lastFrame = null;
    this.identity = null; this.missingSince = null; this.clearMotion();
  }
  clearMotion() {
    this.samples = []; this.smooth = null; this.lastRaw = null; this.mode = 'IDLE';
    this.thumbSince = null; this.thumbReleaseSince = null; this.pointSince = null;
    this.pinchSince = null; this.pinchFrames = 0; this.pinchActive = false; this.pinchReleaseSince = null;
    this.neutralSince = null; this.pointArmed = false;
  }
  output(state, label, stable = false, action = null, cursor = null) { return {state,label,stable,action,cursor}; }
  update(result, now) {
    const c = this.cfg;
    if (this.lastFrame !== null && now-this.lastFrame > c.maxFrameGapMs) this.clearMotion();
    this.lastFrame = now;
    const hands = result?.landmarks || [];
    if (hands.length !== 1) {
      this.clearMotion();
      if (!hands.length) {
        this.missingSince ??= now;
        if (now-this.missingSince >= c.missingRearmMs) {
          this.latched = this.thumbLatched = this.pinchLatched = false; this.identity = null;
        }
      } else this.missingSince = null;
      return this.output('UNTRACKED',hands.length ? 'Multiple hands — show only one' : 'No hand detected');
    }
    this.missingSince = null;
    const points = hands[0], category = result.handedness?.[0]?.[0];
    const width = points.length === 21 ? Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y) : 0;
    if (!category || category.score < c.handednessConfidence || points.length !== 21 ||
      !points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1) || width<c.minPalmWidth || width>c.maxPalmWidth) {
      this.clearMotion(); return this.output('UNTRACKED','Uncertain tracking — reposition hand');
    }
    const pose = result.worldLandmarks?.[0] || points;
    const palm = [0,5,9,13,17].map(i=>points[i]);
    const raw = {x:1-palm.reduce((s,p)=>s+p.x,0)/5,y:palm.reduce((s,p)=>s+p.y,0)/5};
    if ((this.identity && this.identity!==category.categoryName) || (this.lastRaw && Math.hypot(raw.x-this.lastRaw.x,raw.y-this.lastRaw.y)>c.handJumpLimit)) {
      this.clearMotion(); this.identity=category.categoryName;
      return this.output('UNTRACKED','Hand changed — hold still');
    }
    this.identity=category.categoryName; this.lastRaw=raw;
    const thumb=isThumbsUp(pose,points,c), ratio=pinchRatio(pose);
    if (!thumb) {
      this.thumbReleaseSince ??= now;
      if(now-this.thumbReleaseSince>=c.thumbReleaseMs) this.thumbLatched=false;
    } else this.thumbReleaseSince=null;
    // Enter at the tight threshold; stay in this mode through the wider release threshold.
    if (this.pinchActive || ratio<=c.pinchStartRatio || this.pinchLatched) {
      this.samples=[];this.smooth=null;this.thumbSince=null;this.pointSince=null;this.mode='PINCH';
      if(ratio>=c.pinchReleaseRatio) {
        this.pinchSince=null;this.pinchFrames=0;this.pinchReleaseSince ??= now;
        if(now-this.pinchReleaseSince>=c.pinchReleaseMs) {
          this.pinchActive=false;this.pinchLatched=false;this.pointArmed=false;this.pinchReleaseSince=null;this.mode='IDLE';
        }
        return this.output('PINCH_RELEASE','Release pinch — point again');
      }
      this.pinchActive=true;this.pinchReleaseSince=null;
      if(this.pinchLatched) return this.output('PINCH_HELD','Pinch held — release to rearm',true);
      // The wider hysteresis band maintains mode but cannot finish an incomplete pinch.
      if(ratio>c.pinchStartRatio) {this.pinchSince=null;this.pinchFrames=0;return this.output('PINCH_PENDING','Pinch — bring fingertips closer');}
      this.pinchSince ??= now;this.pinchFrames++;
      const stable=now-this.pinchSince>=c.pinchHoldMs && this.pinchFrames>=c.pinchMinFrames;
      if(!this.pointArmed) return this.output('PINCH_PENDING','Point at a node before pinching',stable);
      if(stable && now-this.lastPinch>=c.pinchCooldownMs && now-this.lastAction>=c.cooldownMs) {
        this.pinchLatched=true;this.lastPinch=now;this.lastAction=now;
        return this.output('PINCH_HELD','Pinch',true,'Pinch');
      }
      return this.output('PINCH_PENDING',stable ? 'Pinch — cooldown' : 'Pinch — hold briefly',stable);
    }
    const pointing=isPointing(pose,c);
    const mode=thumb ? 'THUMB' : pointing ? 'POINT' : 'NAVIGATE';
    if(mode!==this.mode) {
      this.samples=[];this.smooth=null;this.thumbSince=null;this.pointSince=null;this.neutralSince=null;
      this.mode=mode;
    }
    if(pointing) {
      this.pointSince ??= now;
      const stable=now-this.pointSince>=c.pointHoldMs;
      if(stable) this.pointArmed=true;
      return this.output('POINTING',stable ? 'Point — explore nodes' : 'Point — acquiring',stable,null,stable ? {x:points[8].x,y:points[8].y}:null);
    }
    this.pointArmed=false;
    this.smooth=this.smooth ? {x:this.smooth.x+c.smoothingAlpha*(raw.x-this.smooth.x),y:this.smooth.y+c.smoothingAlpha*(raw.y-this.smooth.y)} : raw;
    this.samples.push({...this.smooth,t:now});this.samples=this.samples.filter(p=>now-p.t<=c.swipeWindowMs);
    const recent=this.samples.filter(p=>now-p.t<=c.stationaryWindowMs);
    const range=k=>Math.max(...recent.map(p=>p[k]))-Math.min(...recent.map(p=>p[k]));
    const stationary=recent.length>=3 && now-recent[0].t>=c.stationaryWindowMs*0.7 && range('x')<c.stationaryRadius && range('y')<c.stationaryRadius;
    if(thumb) {
      if(this.thumbLatched) return this.output('THUMB_HELD','Thumbs Up — release to rearm',true);
      if(!stationary) this.thumbSince=null; else this.thumbSince ??= now;
      const stable=this.thumbSince!==null && now-this.thumbSince>=c.thumbHoldMs;
      if(stable && now-this.lastAction>=c.cooldownMs) {
        this.thumbLatched=true;this.lastAction=now;
        return this.output('THUMB_HELD','Thumbs Up',true,'Thumbs_Up');
      }
      return this.output('THUMB_PENDING',stable ? 'Thumbs Up — cooldown' : 'Thumbs Up — hold still',stable);
    }
    if(stationary) {this.neutralSince ??= now;if(now-this.neutralSince>=c.neutralMs) this.latched=false;} else this.neutralSince=null;
    if(this.latched) return this.output('SWIPE_HELD','Swipe complete — hold still or lower hand',true);
    if(now-this.lastAction<c.cooldownMs) return this.output('COOLDOWN','Cooldown');
    const first=this.samples[0],last=this.samples.at(-1),dx=last.x-first.x,dy=last.y-first.y;
    let travel=0;for(let i=1;i<this.samples.length;i++) travel+=Math.abs(this.samples[i].x-this.samples[i-1].x);
    if(this.samples.length>=c.swipeMinFrames && now-first.t>=c.swipeMinMs && Math.abs(dx)>=c.swipeDistance && Math.abs(dy)<=c.swipeVerticalLimit && Math.abs(dx)/(travel||1)>=c.swipeDirectionRatio) {
      const action=dx>0 ? 'Swipe_Right':'Swipe_Left';this.latched=true;this.lastAction=now;this.samples=[];
      return this.output('SWIPE_HELD',action.replaceAll('_',' '),true,action);
    }
    return this.output('NAVIGATE','Ready — swipe with an open hand');
  }
}
