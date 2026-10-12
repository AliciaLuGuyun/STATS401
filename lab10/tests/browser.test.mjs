import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LAB10_URL || 'http://127.0.0.1:8010/lab10/';
const results = []; const errors = [];
const browser = await chromium.launch({headless:true, executablePath: process.env.BROWSER_EXECUTABLE});
const context = await browser.newContext({viewport:{width:1400,height:1000}});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }
const state = () => page.evaluate(async()=> (await import('/lab10/main.js')).app.timeline.getState());
const execute = gesture => page.evaluate(async g=>(await import('/lab10/main.js')).app.timeline.execute(g),gesture);
try {
  await check('Original Lab 7 and both CSVs unchanged (SHA-256)',async()=>{
    const lines=(await readFile(new URL('lab7-baseline.sha256',import.meta.url),'utf8')).trim().split('\n');
    for(const line of lines) {const [hash,path]=line.split(/\s+/);const content=await readFile(new URL(`../../${path}`,import.meta.url)); assert.equal(createHash('sha256').update(content).digest('hex'),hash);}
  });
  await page.addInitScript(()=>{
    window.cameraTest={calls:0,stopped:0,terminated:0,frames:0,mode:'normal',pending:null};
    navigator.mediaDevices.getUserMedia=async constraints=>{
      cameraTest.calls++;cameraTest.constraints=constraints;
      if(cameraTest.mode==='denied') throw new DOMException('Denied','NotAllowedError');
      if(cameraTest.mode==='missing') throw new DOMException('Missing','NotFoundError');
      if(cameraTest.mode==='pending') await new Promise(r=>cameraTest.pending=r);
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
      const stream=canvas.captureStream(10);cameraTest.stream=stream;
      const draw=setInterval(()=>{const ctx=canvas.getContext('2d');ctx.fillStyle=`rgb(${Date.now()%255},0,0)`;ctx.fillRect(0,0,320,240);},100);
      for(const track of stream.getTracks()) {const stop=track.stop.bind(track);track.stop=()=>{cameraTest.stopped++;clearInterval(draw);stop();};}
      return stream;
    };
    window.Worker=class {
      constructor(){cameraTest.worker=this;}
      postMessage(data) {
        if(data.type==='init') {
          setTimeout(()=>this.onmessage?.({data:cameraTest.mode==='modelFailure'?{type:'error',message:'Test loading failure'}:{type:'ready'}}),0);
        } else {cameraTest.frames++;data.bitmap.close();setTimeout(()=>this.onmessage?.({data:{type:'result',result:{landmarks:[]},timestamp:data.timestamp}}),0);}
      }
      terminate(){cameraTest.terminated++;this.onmessage=null;}
    };
  });
  await page.goto(base);
  await page.waitForFunction(async()=>Boolean((await import('/lab10/main.js')).app));
  await check('Data rendered: 12 nodes, Day 1 has 3 links, 367 records',async()=>{
    assert.equal(await page.locator('.company').count(),12);assert.equal(await page.locator('.link-hit').count(),3);
    assert.match(await page.locator('#data-status').innerText(),/367/);
  });
  await check('Camera stays off until explicit click',async()=>{assert.equal(await page.evaluate(()=>cameraTest.calls),0);assert.equal(await page.evaluate(()=>document.querySelector('#camera').srcObject),null);});
  await check('Playback, slider, reset, and one persistent SVG work',async()=>{
    await page.click('#play');await page.waitForFunction(()=>+document.querySelector('#day-slider').value>1);
    await page.locator('#day-slider').fill('25');await page.locator('#day-slider').dispatchEvent('input');
    assert.deepEqual(await state(),{day:25,playing:false});await page.waitForTimeout(1050);assert.equal((await state()).day,25);
    await page.click('#reset');assert.deepEqual(await state(),{day:1,playing:false});assert.equal(await page.locator('#network svg').count(),1);
  });
  await check('Gesture bridge maps both swipes and thumbs up; pauses manual steps',async()=>{
    await execute('Thumbs_Up');assert.equal((await state()).playing,true);
    await execute('Swipe_Right');assert.deepEqual(await state(),{day:2,playing:false});assert.equal(await page.locator('.link-hit').count(),7);
    await execute('Swipe_Left');assert.deepEqual(await state(),{day:1,playing:false});
    await execute('Thumbs_Up');await execute('Thumbs_Up');assert.equal((await state()).playing,false);
  });
  await check('Day boundaries clamp; playback wraps Day 60 to Day 1',async()=>{
    assert.match(await execute('Swipe_Left'),/boundary/);
    await page.locator('#day-slider').fill('60');await page.locator('#day-slider').dispatchEvent('input');
    assert.match(await execute('Swipe_Right'),/boundary/);assert.equal((await state()).day,60);
    assert.equal(await page.locator('.link-hit').count(),9);
    await page.click('#play');await page.waitForFunction(()=>document.querySelector('#day-slider').value==='1');await page.click('#pause');await page.click('#reset');
  });
  await check('Mouse hover, keyboard focus, and node drag remain usable',async()=>{
    await page.locator('.company').first().hover();assert.match(await page.locator('#tooltip').innerText(),/Sector:/);
    await page.locator('.company').first().focus();assert.match(await page.locator('#tooltip').innerText(),/Active links:/);
    const box=await page.locator('.company').first().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+60,box.y+30,{steps:8});await page.mouse.up();
    assert.equal(await page.locator('.company').count(),12);
    await page.locator('.link-hit').first().hover();assert.match(await page.locator('#tooltip').innerText(),/Transactions:/);
  });
  await check('Permission denial and no-camera feedback preserve controls',async()=>{
    for(const [mode,pattern] of [['denied',/permission denied/i],['missing',/No camera/]]) {
      await page.evaluate(m=>cameraTest.mode=m,mode);await page.click('#start-camera');
      await page.waitForFunction(()=>!document.querySelector('#start-camera').disabled);
      assert.match(await page.locator('#camera-status').innerText(),pattern);await page.click('#next');await page.click('#reset');
    }
  });
  await check('Start/Stop release real test-stream tracks and terminate worker',async()=>{
    await page.evaluate(()=>cameraTest.mode='normal');await page.click('#start-camera');await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('Camera on'));
    assert.equal(await page.evaluate(()=>cameraTest.constraints.audio),false);
    await page.click('#stop-camera');
    assert.equal(await page.evaluate(()=>cameraTest.stream.getTracks().every(t=>t.readyState==='ended')),true);
    assert.equal(await page.evaluate(()=>document.querySelector('#camera').srcObject),null);
    assert.equal(await page.evaluate(()=>cameraTest.terminated),1);
    const frames=await page.evaluate(()=>cameraTest.frames);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>cameraTest.frames),frames);
  });
  await check('Cancel pending permission request stops late stream',async()=>{
    await page.evaluate(()=>cameraTest.mode='pending');await page.click('#start-camera');await page.click('#stop-camera');await page.evaluate(()=>cameraTest.pending());
    await page.waitForFunction(()=>cameraTest.stream.getTracks().every(t=>t.readyState==='ended'));
    assert.equal(await page.evaluate(()=>document.querySelector('#camera').srcObject),null);
  });
  await check('Model failure releases resources with visible fallback message',async()=>{
    await page.evaluate(()=>cameraTest.mode='modelFailure');await page.click('#start-camera');
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('MediaPipe error'));
    assert.equal(await page.evaluate(()=>cameraTest.stream.getTracks().every(t=>t.readyState==='ended')),true);
    await page.click('#next');assert.equal((await state()).day,2);await page.click('#reset');
  });
  await check('Page visibility change stops camera and requires explicit restart',async()=>{
    await page.evaluate(()=>cameraTest.mode='normal');await page.click('#start-camera');await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('Camera on'));
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await page.locator('#camera-status').innerText(),/tab is hidden/);
    assert.equal(await page.evaluate(()=>cameraTest.stream.getTracks().every(t=>t.readyState==='ended')),true);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('#start-camera').isDisabled(),false);
  });
  await check('Deterministic landmarks traverse detector → gesture bridge → original D3',async()=>{
    const result=await page.evaluate(async()=>{
      const {GestureDetector}=await import('/lab10/gestures.js'); const {swipe,hold}=await import('/lab10/tests/fixtures.mjs');
      const {app}=await import('/lab10/main.js'); const detector=new GestureDetector();
      let actions=0;for(const [t,result] of [...swipe(),...hold(450,1800,.38)]) {const detection=detector.update(result,t);if(detection.action){app.timeline.execute(detection.action);actions++;}}
      return {actions,...app.timeline.getState()};
    });
    assert.deepEqual(result,{actions:1,day:2,playing:false});await page.click('#reset');
  });
  await check('Open palm command removed; guide presents all five active gestures',async()=>{
    assert.equal(await execute('Open_Palm'),null);
    const guide=await page.locator('.gesture-guide').innerText();
    for(const text of ['Thumbs Up','Point','Pinch','Swipe Left','Swipe Right']) assert.ok(guide.includes(text));
    assert.equal(guide.includes('Hold Open Palm'),false);
  });
  await check('Stable point maps to SVG, pauses playback and hovers without selecting',async()=>{
    const result=await page.evaluate(async()=>{
      const {app}=await import('/lab10/main.js');const {pointAt}=await import('/lab10/tests/fixtures.mjs');
      app.explorer.clearSelection();app.camera.detector.reset();
      const node=document.querySelector('.company').__data__;node.x=node.fx=450;node.y=node.fy=250;
      app.timeline.execute('Thumbs_Up');
      for(let t=0;t<=300;t+=50) app.camera.processResult(pointAt(1-node.x/1000,node.y/700),t);
      return {node:node.id,...app.explorer.getState(),timeline:app.timeline.getState(),stable:document.querySelector('#gesture-stability').textContent};
    });
    assert.equal(result.hovered,result.node);assert.equal(result.selected,null);
    assert.ok(Math.abs(result.cursor.x-450)<1e-8&&Math.abs(result.cursor.y-250)<1e-8);
    assert.equal(result.timeline.playing,false);assert.equal(result.stable,'Stable');
    assert.match(await page.locator('#hover-details').innerText(),/Day 1 volume:/);
    assert.equal(await page.locator('.gesture-hovered').count(),1);
  });
  await check('Pinch selects frozen cursor target once and highlights current neighbors',async()=>{
    const result=await page.evaluate(async()=>{
      const {app}=await import('/lab10/main.js');const {pointAt}=await import('/lab10/tests/fixtures.mjs');
      const target=document.querySelector('.company').__data__,before=app.explorer.getState().cursor;
      let actions=0;
      for(let t=350;t<=1750;t+=50) {
        const frame=pointAt(1-target.x/1000,target.y/700,'pinch');frame.landmarks[0][8].x+=.035;frame.landmarks[0][4].x+=.035;
        if(app.camera.processResult(frame,t).action==='Pinch') actions++;
      }
      const edges=[...document.querySelectorAll('.link-hit')].map(n=>n.__data__).filter(d=>d.source.id===target.id||d.target.id===target.id);
      return {actions,before,...app.explorer.getState(),connected:document.querySelectorAll('.selection-connected').length,expected:edges.length};
    });
    assert.equal(result.actions,1);assert.equal(result.selected,result.hovered);assert.deepEqual(result.cursor,result.before);
    assert.equal(result.connected,result.expected);assert.equal(await page.locator('.node-selected').count(),1);
    assert.match(await page.locator('#selected-details').innerText(),/Active links:/);
    assert.match(await page.locator('#action-status').innerText(),/Pinch: selected/);
  });
  await check('Selection survives time changes and camera stop; details and edges follow day',async()=>{
    const selected=await page.evaluate(async()=>(await import('/lab10/main.js')).app.explorer.getState().selected);
    await page.locator('#day-slider').fill('25');await page.locator('#day-slider').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#selected-details').textContent.includes('Day 25 volume'));
    const result=await page.evaluate(async()=>{
      const {app}=await import('/lab10/main.js');app.camera.stop();
      const id=app.explorer.getState().selected,edges=[...document.querySelectorAll('.link-hit')].map(n=>n.__data__).filter(d=>d.source.id===id||d.target.id===id);
      return {...app.explorer.getState(),expected:edges.length,connected:document.querySelectorAll('.selection-connected').length};
    });
    assert.equal(result.selected,selected);assert.equal(result.cursor,null);assert.equal(result.hovered,null);assert.equal(result.connected,result.expected);
    await page.click('#clear-selection');assert.equal(await page.locator('.node-selected').count(),0);assert.equal(await page.locator('.selection-dim').count(),0);await page.click('#reset');
  });
  await check('Pointing far from nodes and pinching cannot select a remote company',async()=>{
    const result=await page.evaluate(async()=>{
      const {app}=await import('/lab10/main.js');app.explorer.point({x:1,y:0});
      return {ok:app.explorer.pinch(),...app.explorer.getState()};
    });
    assert.equal(result.ok,false);assert.equal(result.hovered,null);assert.equal(result.selected,null);
    assert.match(await page.locator('#action-status').innerText(),/No node within reach/);
  });
  await check('Tracking loss cancels incomplete pinch, hides cursor, preserves selection',async()=>{
    const result=await page.evaluate(async()=>{
      const {app}=await import('/lab10/main.js');const {pointAt}=await import('/lab10/tests/fixtures.mjs');
      app.camera.detector.reset();const target=document.querySelector('.company').__data__;
      app.explorer.select(target.id);
      for(let t=0;t<=250;t+=50) app.camera.processResult(pointAt(1-target.x/1000,target.y/700),t);
      app.camera.processResult(pointAt(1-target.x/1000,target.y/700,'pinch'),300);
      app.camera.processResult({landmarks:[]},350);
      const detection=app.camera.processResult(pointAt(1-target.x/1000,target.y/700,'pinch'),400);
      return {action:detection.action,cursor:app.explorer.getState().cursor,selected:app.explorer.getState().selected,target:target.id};
    });
    assert.equal(result.action,null);assert.equal(result.cursor,null);assert.equal(result.selected,result.target);
    await page.click('#clear-selection');
  });
  await check('Mouse and keyboard selection plus Escape retain conventional fallback',async()=>{
    await page.locator('.company').nth(1).click();assert.equal(await page.locator('.node-selected').count(),1);
    await page.locator('.company').nth(2).focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#action-status').innerText(),/Keyboard: selected/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.node-selected').count(),0);
    await page.evaluate(async()=>{const {app}=await import('/lab10/main.js');app.camera.stop();document.activeElement.blur();const d=document.querySelector('.company').__data__;d.fx=null;d.fy=null;});
  });
  await page.waitForTimeout(450);
  await page.screenshot({path:new URL('desktop.png',import.meta.url).pathname,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await check('Mobile page fits viewport',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);});
  await page.screenshot({path:new URL('mobile.png',import.meta.url).pathname,fullPage:true});
  await check('No critical JavaScript errors',async()=>assert.deepEqual(errors,[]));
  // Fresh context: real hosted MediaPipe runtime/model, with a blank image only.
  // No getUserMedia, physical camera, or real gesture validation occurs here.
  const realPage=await browser.newPage();await realPage.goto(base);
  await check('Real MediaPipe worker initializes and infers a blank frame (not webcam)',async()=>{
    const output=await realPage.evaluate(async()=>{
      const {CONFIG}=await import('/lab10/config.js');
      return await new Promise((resolve,reject)=>{
        const worker=new Worker('/lab10/hand-worker.js');const timeout=setTimeout(()=>{worker.terminate();reject(new Error('real model timeout'));},60000);
        worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e.message));};
        worker.onmessage=async({data})=>{
          if(data.type==='error'){clearTimeout(timeout);worker.terminate();reject(new Error(data.message));}
          if(data.type==='ready'){const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);const bitmap=await createImageBitmap(c);worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);}
          if(data.type==='result'){clearTimeout(timeout);worker.terminate();resolve(data.result.landmarks.length);}
        };worker.postMessage({type:'init',config:CONFIG});
      });
    });
    assert.equal(output,0);
  });
  await realPage.close();
} finally {
  await writeFile(new URL('browser-results.json',import.meta.url),JSON.stringify({date:'2026-10-12',passed:results,errors,realWebcamTested:false},null,2)+'\n');
  await browser.close();
}
