const status = document.createElement('aside');
status.id='offline-status';
status.setAttribute('aria-label','Offline game');
const message=document.createElement('span');
message.setAttribute('role','status');
const retry=document.createElement('button');
retry.className='btn';retry.textContent='重試 / Retry';retry.hidden=true;
const dismiss=document.createElement('button');
dismiss.className='btn';dismiss.textContent='關閉 / Close';dismiss.onclick=()=>{status.hidden=true;};
status.append(message,retry,dismiss);
document.body.append(status);
const chinese=()=>/^(zh|zht)/i.test(localStorage.getItem('pokebonk.lang')??navigator.language);
const text=(zh,en)=>chinese()?zh:en;
let registration;
window.__pokebonkOfflineState='preparing';
function update(data) {
  if(!data.pokebonkOffline)return;
  window.__pokebonkOfflineState=data.state;
  retry.hidden=data.state!=='error';
  if(data.state==='preparing')message.textContent=text('正在準備離線遊戲','Preparing offline game')+(data.total?` ${data.completed}/${data.total}`:'…');
  if(data.state==='downloaded')message.textContent=registration?.active
    ?text('新版已下載；關閉所有遊戲分頁後重開即可更新。','Update downloaded. Close all game tabs and reopen to update.')
    :text('離線資源已下載，正在完成設定…','Download complete. Finishing offline setup…');
  if(data.state==='ready') {
    message.textContent=text('離線遊戲已就緒，可從瀏覽器選單安裝。','Ready offline. Install from your browser menu.');
    setTimeout(()=>{status.hidden=true;},10000);
  }
  if(data.state==='error') {
    status.hidden=false;
    message.textContent=text('離線下載未完成。保持連線後重試；本機存檔不受影響。','Offline download incomplete. Reconnect and retry; local saves are preserved.');
    console.error('Offline setup failed:',data.message);
  }
}
async function register() {
  status.hidden=false;retry.hidden=true;
  update({pokebonkOffline:true,state:'preparing'});
  try {
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    if(registration.waiting)update({pokebonkOffline:true,state:'downloaded'});
    else if(registration.active)registration.active.postMessage({type:'status'});
  }catch(error){update({pokebonkOffline:true,state:'error',message:error.message});}
}
retry.onclick=register;
if('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message',event=>update(event.data??{}));
  void register();
} else update({pokebonkOffline:true,state:'error',message:'Service workers require HTTPS or localhost.'});
