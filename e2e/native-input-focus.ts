import type {ElectronApplication} from 'playwright-core';

export async function focusNativeInput(application:ElectronApplication):Promise<void> {
  await application.evaluate(async({app,BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing native input window');
    const contents=window.webContents;
    // macOS activation completes asynchronously. Observe native focus events
    // instead of trusting document.hasFocus() or an immediate focus() readback.
    await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(deadline);window.removeListener('focus',check);contents.removeListener('focus',check);};
      const check=()=>{if(window.isFocused()&&contents.isFocused()){cleanup();resolve();}};
      const deadline=setTimeout(()=>{cleanup();reject(new Error('Native window and contents did not acquire input focus'));},10000);
      window.on('focus',check);contents.on('focus',check);
      app.focus({steal:true});window.focus();contents.focus();
      setImmediate(check);
    });
  });
}
