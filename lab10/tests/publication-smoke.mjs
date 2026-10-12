// Browser smoke checks for localhost or GitHub Pages; never tests physical gestures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.LAB10_URL||'https://alicialuguyun.github.io/STATS401/lab10/';
const checks=[],errors=[],consoleErrors=[],runtimeInfo=[],badResponses=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
const page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{
  if(msg.type()!=='error') return;
  // TFLite writes this successful CPU initialization INFO line to stderr.
  if(msg.text()==='INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') runtimeInfo.push(msg.text());
  else consoleErrors.push(msg.text());
});
page.on('response',r=>{if(r.status()>=400) badResponses.push({url:r.url(),status:r.status()});});
async function check(name,fn){await fn();checks.push(name);console.log(`PASS ${name}`);}
try {
  await page.addInitScript(()=>{
    window.cameraRequests=0;
    if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia=async()=>{
      cameraRequests++;throw new DOMException('Smoke test intentionally denies physical-camera access','NotAllowedError');
    };
  });
  const response=await page.goto(url,{waitUntil:'networkidle'});
  await check('Lab 10 returns HTTP 200',async()=>assert.equal(response.status(),200));
  await page.waitForFunction(async()=>Boolean((await import(new URL('./main.js',location.href))).app));
  await check('All relative HTML assets and document links return HTTP 200',async()=>{
    const assets=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet],a[href]')].map(el=>el.src||el.href).filter(h=>new URL(h).origin===location.origin));
    for(const asset of new Set(assets)) assert.equal((await page.request.get(asset)).status(),200,asset);
  });
  await check('D3 and CSV data render 12 companies and 367 records',async()=>{
    assert.equal(await page.locator('.company').count(),12);assert.equal(await page.locator('.link-hit').count(),3);
    assert.match(await page.locator('#data-status').innerText(),/367/);assert.equal(await page.locator('#network svg').count(),1);
  });
  await check('Original Lab 7 and CSV bytes match protected baseline',async()=>{
    const lines=(await readFile(new URL('./lab7-baseline.sha256',import.meta.url),'utf8')).trim().split('\n');
    for(const line of lines){const [hash,path]=line.split(/\s+/);const response=await page.request.get(new URL(`../${path}`,url).href);assert.equal(response.status(),200);assert.equal(createHash('sha256').update(await response.body()).digest('hex'),hash,path);}
  });
  await check('Timeline, play/pause, slider and reset remain synchronized',async()=>{
    await page.click('#next');assert.equal(await page.locator('#day-slider').inputValue(),'2');assert.equal(await page.locator('.link-hit').count(),7);
    await page.click('#previous');await page.click('#play');await page.waitForFunction(()=>+document.querySelector('#day-slider').value>1);
    await page.click('#pause');await page.locator('#day-slider').fill('60');await page.locator('#day-slider').dispatchEvent('input');
    assert.equal(await page.locator('.link-hit').count(),9);assert.match(await page.locator('#playback-status').innerText(),/Paused/);
    await page.click('#reset');assert.equal(await page.locator('#day-slider').inputValue(),'1');
  });
  await check('Mouse, keyboard selection and clearing remain usable',async()=>{
    await page.locator('.company').first().hover();assert.match(await page.locator('#tooltip').innerText(),/Sector:/);
    await page.locator('.company').first().click();assert.equal(await page.locator('.node-selected').count(),1);
    await page.locator('.company').nth(1).focus();await page.keyboard.press('Enter');assert.match(await page.locator('#action-status').innerText(),/Keyboard: selected/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.node-selected').count(),0);
  });
  await check('Camera remains off until explicit Start; denied access preserves fallback',async()=>{
    assert.equal(await page.evaluate(()=>cameraRequests),0);assert.equal(await page.evaluate(()=>document.querySelector('#camera').srcObject),null);
    await page.click('#start-camera');await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('permission denied'));
    assert.equal(await page.evaluate(()=>cameraRequests),1);await page.click('#next');await page.click('#reset');
  });
  await check('Real MediaPipe runtime, WASM, model and relative worker initialize',async()=>{
    const count=await page.evaluate(async()=>{
      const {CONFIG}=await import(new URL('./config.js',location.href));
      return await new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./hand-worker.js',location.href));
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('MediaPipe timeout'));},60000);
        const fail=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e));};
        worker.onerror=e=>fail(e.message);
        worker.onmessage=async({data})=>{
          if(data.type==='error') fail(data.message);
          if(data.type==='ready') {const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);const bitmap=await createImageBitmap(c);worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);}
          if(data.type==='result'){clearTimeout(timeout);worker.terminate();resolve(data.result.landmarks.length);}
        };
        worker.postMessage({type:'init',config:CONFIG});
      });
    });assert.equal(count,0);
  });
  await check('Homepage contains Lab 10 navigation and submission link',async()=>{
    await page.goto(new URL('../',url).href,{waitUntil:'networkidle'});
    assert.ok(await page.locator('a[href="lab10/index.html"]').count()>=1);
    assert.match(await page.locator('main').innerText(),/Lab 10: Novel Interaction/);
  });
  await check('No critical JavaScript, console or HTTP errors',async()=>{
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(badResponses,[]);
  });
} finally {
  const summary={url,date:'2026-10-12',passed:checks,errors,consoleErrors,runtimeInfo,badResponses,physicalCameraTested:false};
  if(process.env.SMOKE_OUTPUT) await writeFile(process.env.SMOKE_OUTPUT,JSON.stringify(summary,null,2)+'\n');
  await browser.close();
}
