import type {Page} from 'playwright-core';

export async function readStorageDiagnostics(page:Page) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const capture=(async()=>{
    const cdp=await page.context().newCDPSession(page);
    try {
      const {frameTree}=await cdp.send('Page.getFrameTree');
      const {storageKey}=await cdp.send('Storage.getStorageKeyForFrame',{frameId:frameTree.frame.id});
      const {histograms}=await cdp.send('Browser.getHistograms',{query:'Storage.',delta:false});
      return {url:page.url(),storageKey,histograms};
    } finally {
      await cdp.detach();
    }
  })();
  try {
    return await Promise.race([capture,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(Error('Chromium storage diagnostics timed out')),10000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
