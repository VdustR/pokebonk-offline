import {_electron as electron} from 'playwright-core';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Visible OS acceptance: inspect and then close only the created probe tab.
const url='https://example.com/?pokebonk-external-link-probe=20261101';
const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-browser-'));
await writeFile(path.join(temp,'index.html'),`<a href="${url}" target="_blank" rel="noopener">Open browser probe</a>`);
const app=await electron.launch({args:['dist/desktop/main.js'],env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}});
try {
  const page=await app.firstWindow();
  await page.waitForURL('pokebonk://game/index.html');
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({shell})=>{
    const open=shell.openExternal.bind(shell);
    shell.openExternal=(...args:Parameters<typeof shell.openExternal>)=>{
      const result=open(...args);
      Reflect.set(globalThis,'externalLaunch',result);
      return result;
    };
  });
  await page.getByRole('link',{name:'Open browser probe'}).click();
  await app.evaluate(()=>Reflect.get(globalThis,'externalLaunch'));
  console.log(`OS browser launch resolved: ${url}. Inspect the default browser tab to establish acceptance.`);
} finally {
  await app.close().catch(()=>{});
  await rm(temp,{recursive:true,force:true});
}
