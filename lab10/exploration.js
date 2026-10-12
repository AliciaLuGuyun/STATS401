import {CONFIG} from './config.js';
export function cameraToSvg(point, box, mirrored = true) {
  const clamp=v=>Math.max(0,Math.min(1,v));
  return {x:box.x+(mirrored ? 1-clamp(point.x):clamp(point.x))*box.width,y:box.y+clamp(point.y)*box.height};
}
export class CursorSmoother {
  constructor(alpha = CONFIG.cursorSmoothingAlpha) {this.alpha=alpha;this.value=null;}
  reset() {this.value=null;}
  update(point) {
    this.value=this.value ? {x:this.value.x+this.alpha*(point.x-this.value.x),y:this.value.y+this.alpha*(point.y-this.value.y)} : {...point};
    return {...this.value};
  }
}
// Hit radius is in CSS pixels, independent of SVG scale, including unequal scales.
export function nearestNode(nodes, point, matrix, radius = CONFIG.nodeRadiusPx) {
  let nearest=null,best=radius;
  for(const node of nodes) {
    const dx=node.x-point.x,dy=node.y-point.y;
    const distance=Math.hypot(matrix.a*dx+matrix.c*dy,matrix.b*dx+matrix.d*dy);
    if(Number.isFinite(distance) && distance<=best) {nearest=node;best=distance;}
  }
  return nearest;
}
export class NetworkExplorer {
  constructor(d3,timeline,root=document,config={}) {
    this.d3=d3;this.timeline=timeline;this.root=root;this.cfg={...CONFIG,...config};
    this.svg=root.querySelector('#network svg');this.smoother=new CursorSmoother(this.cfg.cursorSmoothingAlpha);
    this.cursor=null;this.hovered=null;this.selected=null;
    this.nodes=[...this.svg.querySelectorAll('.company')];
    this.overlay=d3.select(this.svg).append('g').attr('class','exploration-overlay').attr('pointer-events','none').attr('aria-hidden','true');
    this.hoverRing=this.overlay.append('circle').attr('class','hover-ring').attr('r',35).attr('display','none');
    this.selectionRing=this.overlay.append('circle').attr('class','selection-ring').attr('r',39).attr('display','none');
    this.cursorMarker=this.overlay.append('g').attr('class','virtual-cursor').attr('display','none');
    this.cursorMarker.append('circle').attr('r',10);
    this.cursorMarker.append('path').attr('d','M-16,0H16M0,-16V16');
    this.cursorMarker.append('text').attr('x',18).attr('y',-15).text('Point');
    this.clearButton=root.querySelector('#clear-selection');
    this.clearButton.addEventListener('click',()=>this.clearSelection());
    this.nodes.forEach(node=>{
      node.addEventListener('click',event=>{if(!event.defaultPrevented) this.select(node.__data__.id,'Mouse');});
      node.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' ') {event.preventDefault();this.select(node.__data__.id,'Keyboard');}
      });
    });
    root.addEventListener('keydown',event=>{if(event.key==='Escape') this.clearSelection();});
    // Observe original simulation's node transforms; update only our two rings.
    this.positionObserver=new MutationObserver(records=>{
      if(records.some(r=>r.target.classList?.contains('company'))) {this.refreshHover();this.positionRings();}
    });
    this.positionObserver.observe(this.svg,{subtree:true,attributes:true,attributeFilter:['transform']});
    this.dayObserver=new MutationObserver(()=>{this.refreshSelection();this.refreshHover(true);});
    this.dayObserver.observe(root.querySelector('#current-date'),{childList:true});
    this.updateLabels();
  }
  set(id,text) {this.root.querySelector(`#${id}`).textContent=text;}
  report(text) {this.set('action-status',`${text} · ${new Date().toLocaleTimeString()}`);}
  node(id) {return this.nodes.find(n=>n.__data__.id===id);}
  getState() {return {cursor:this.cursor ? {...this.cursor}:null,hovered:this.hovered,selected:this.selected};}
  pauseForExploration() {
    if(this.timeline.getState().playing) {this.timeline.pause();this.report('Paused animation for node exploration');}
  }
  point(point) {
    this.pauseForExploration();
    const box=this.svg.viewBox.baseVal;
    this.cursor=this.smoother.update(cameraToSvg(point,box));
    this.cursorMarker.attr('display',null).attr('transform',`translate(${this.cursor.x},${this.cursor.y})`);
    this.set('cursor-status',`x ${Math.round(this.cursor.x)}, y ${Math.round(this.cursor.y)} (network coordinates)`);
    this.refreshHover();
  }
  refreshHover(force = false) {
    if(!this.cursor) return;
    const matrix=this.svg.getScreenCTM();
    const closest=matrix && nearestNode(this.nodes.map(n=>n.__data__),this.cursor,matrix,this.cfg.nodeRadiusPx);
    const id=closest?.id || null,changed=id!==this.hovered;this.hovered=id;
    if(changed) this.nodes.forEach(node=>node.classList.toggle('gesture-hovered',node.__data__.id===id));
    this.set('hovered-node',closest ? `${closest.company_name} — hover only` : 'None — point closer to a node');
    if(changed || force) this.root.querySelector('#hover-details').innerHTML=closest ? this.existingDetails(this.node(id)):'';
    this.positionRings();
  }
  existingDetails(node) {
    // Reuse the original hover handler and its current-day detail formatting.
    // Restore its floating tooltip immediately so mouse hover stays independent.
    const tooltip=this.root.querySelector('#tooltip');
    const html=tooltip.innerHTML,style=tooltip.getAttribute('style');
    const matrix=this.svg.getScreenCTM(),p=new DOMPoint(node.__data__.x,node.__data__.y).matrixTransform(matrix);
    this.d3.select(node).on('mouseenter').call(node,{pageX:p.x+window.scrollX,pageY:p.y+window.scrollY},node.__data__);
    const details=tooltip.innerHTML;tooltip.innerHTML=html;
    if(style===null) tooltip.removeAttribute('style');else tooltip.setAttribute('style',style);
    return details;
  }
  pinch() {
    this.pauseForExploration();
    if(!this.cursor) {this.report('No cursor target — point at a node first');return false;}
    this.refreshHover(); // Target is frozen at pointing location, not moved by finger closing.
    if(!this.hovered) {this.report('No node within reach — point closer, then pinch again');return false;}
    return this.select(this.hovered,'Pinch');
  }
  select(id,source='Mouse') {
    if(!this.node(id)) return false;
    this.pauseForExploration();this.selected=id;this.refreshSelection();
    this.report(`${source}: selected ${this.node(id).__data__.company_name}`);return true;
  }
  refreshSelection() {
    const neighbors=new Set(this.selected ? [this.selected]:[]);
    const links=[...this.svg.querySelectorAll('.link')];
    for(const link of links) {
      const d=link.__data__;
      // Exit-transition links are no longer part of this day; use live hit targets.
      const active=[...this.svg.querySelectorAll('.link-hit')].some(hit=>hit.__data__.source.id===d.source.id&&hit.__data__.target.id===d.target.id&&hit.__data__.transaction_type===d.transaction_type);
      const connected=Boolean(active && this.selected && (d.source.id===this.selected||d.target.id===this.selected));
      if(connected) {neighbors.add(d.source.id);neighbors.add(d.target.id);}
      link.classList.toggle('selection-connected',connected);
      link.classList.toggle('selection-dim',Boolean(this.selected&&!connected));
    }
    for(const node of this.nodes) {
      const id=node.__data__.id;
      node.classList.toggle('node-selected',id===this.selected);
      node.classList.toggle('node-neighbor',Boolean(this.selected&&id!==this.selected&&neighbors.has(id)));
      node.classList.toggle('selection-dim',Boolean(this.selected&&!neighbors.has(id)));
    }
    const selected=this.node(this.selected);
    this.set('selected-node',selected ? `${selected.__data__.company_name} — selected`:'None');
    this.root.querySelector('#selected-details').innerHTML=selected ? this.existingDetails(selected):'';
    this.clearButton.disabled=!selected;this.positionRings();
  }
  positionRings() {
    for(const [id,ring] of [[this.hovered,this.hoverRing],[this.selected,this.selectionRing]]) {
      const node=this.node(id);
      ring.attr('display',node ? null:'none');
      if(node) ring.attr('cx',node.__data__.x).attr('cy',node.__data__.y);
    }
  }
  clearCursor() {
    this.cursor=null;this.hovered=null;this.smoother.reset();this.cursorMarker.attr('display','none');this.hoverRing.attr('display','none');
    this.nodes.forEach(n=>n.classList.remove('gesture-hovered'));
    this.set('cursor-status','Inactive');this.set('hovered-node','None');this.root.querySelector('#hover-details').innerHTML='';
  }
  clearSelection() {
    if(!this.selected) return;
    this.selected=null;this.refreshSelection();this.report('Selection cleared');
  }
  updateLabels() {this.clearCursor();this.set('selected-node','None');this.clearButton.disabled=true;}
  handle(detection) {
    if(detection.state==='POINTING'&&detection.stable&&detection.cursor) this.point(detection.cursor);
    else if(detection.state.startsWith('PINCH')) {if(this.cursor) this.pauseForExploration();}
    else this.clearCursor();
    if(detection.action==='Pinch') this.pinch();
  }
}
