import {_electron as electron,errors} from 'playwright-core';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {resumeSavedRun} from './run-save-checks.ts';

// This fixture verifies native input acknowledgment under a long synchronous
// handler. The real game's serialization, restoration and settlement remain in
// electron.ts; a fixture state is not gameplay acceptance.
const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-recovery-budget-'));
await writeFile(path.join(root,'index.html'),`<body>
  <div class="sv-card"><button>繼續</button></div>
  <script>
    window.__pokebonkLocalApp={run:null};
    document.querySelector('button').onclick=event=>{
      document.body.dataset.trusted=String(event.isTrusted);
      const deadline=performance.now()+35000;
      while(performance.now()<deadline){}
      document.querySelector('.sv-card').remove();
      window.__pokebonkLocalApp.run={state:'paused'};
    };
  </script>
</body>`);
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
const results:{mode:string;elapsed:number;clickTimedOut:boolean;trusted:string|null}[]=[];
try {
  app=await electron.launch({
    args:['dist/desktop/main.js',...(process.platform==='linux'?['--no-sandbox','--disable-gpu']:[])],
    env:{...process.env,POKEBONK_GAME_DIR:root,POKEBONK_USER_DATA_DIR:path.join(root,'profile')},
    timeout:30000,
  });
  const page=await app.firstWindow();
  for(const mode of ['legacy','shared-deadline','legacy'] as const) {
    await page.reload();
    await page.locator('.sv-card').waitFor();
    const started=performance.now();
    let clickTimedOut=false;
    if(mode==='shared-deadline') {
      await resumeSavedRun(page);
    } else {
      try {
        await page.locator('.sv-card').getByRole('button',{name:'繼續',exact:true}).click({noWaitAfter:true,timeout:30000});
      } catch(error) {
        if(!(error instanceof errors.TimeoutError))throw error;
        clickTimedOut=true;
      }
      assert.equal(clickTimedOut,true,'The legacy click must time out during the synchronous handler');
      await page.waitForFunction(()=>window.__pokebonkLocalApp.run?.state==='paused',null,{timeout:15000});
    }
    const elapsed=performance.now()-started,trusted=await page.locator('body').getAttribute('data-trusted');
    assert.equal(trusted,'true','Recovery must receive actual native input');
    assert.equal(await page.locator('.sv-card').count(),0);
    assert.ok(elapsed>=35000&&elapsed<120000,'Restoration must complete within the unchanged total budget');
    results.push({mode,elapsed,clickTimedOut,trusted});
    console.log('Recovery click budget:',results.at(-1));
  }
  await page.reload();
  await page.locator('.sv-card').waitFor();
  await page.evaluate(()=>{
    const button=document.querySelector('button');
    if(!button)throw Error('Missing recovery control');
    button.onclick=event=>{document.body.dataset['trusted']=String(event.isTrusted);};
  });
  const failedStarted=performance.now();
  await assert.rejects(resumeSavedRun(page),errors.TimeoutError);
  const failedElapsed=performance.now()-failedStarted;
  assert.ok(failedElapsed>=119000&&failedElapsed<130000,'A failed recovery must retain the total deadline');
  const trusted=await page.locator('body').getAttribute('data-trusted');
  assert.equal(trusted,'true');
  assert.equal(await page.locator('.sv-card').count(),1);
  assert.equal(await page.evaluate(()=>window.__pokebonkLocalApp.run),null);
  results.push({mode:'failed-restoration',elapsed:failedElapsed,clickTimedOut:false,trusted});
  console.log('Recovery failure remains observable:',results.at(-1));
} finally {
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/recovery-click-budget.json',JSON.stringify(results,null,2));
  if(app) {
    const child=app.process();
    await app.close();
    assert.equal(child.exitCode,0);
  }
  await rm(root,{recursive:true,force:true});
}
