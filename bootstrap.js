// All catalog and portrait requests are transient: no localStorage/IndexedDB/service worker.
globalThis.BEAR_PETS=[];
globalThis.BEAR_EVOLUTIONS={};
const remoteRoot='https://media.githubusercontent.com/media/buaa-yaoqiu/ForestallBear/master/';
const portraitRequests=new Map();
globalThis.loadPetPortrait=async(img,name)=>{
  img.dataset.loadingPet=name;
  try {
    if(!portraitRequests.has(name))portraitRequests.set(name,(async()=>{
      const pet=BearEngine.pets.find(p=>p.name===name);
      const path=pet?.portraitPath||'assets/thumbs/'+name+'.webp';
      if(!path.startsWith('assets/')||path.includes('..'))throw Error('头像路径无效');
      const r=await fetch(remoteRoot+path.split('/').map(encodeURIComponent).join('/'),{cache:'no-store'});
      if(!r.ok)throw Error('头像下载失败');return URL.createObjectURL(await r.blob());
    })());
    const url=await portraitRequests.get(name);if(img.dataset.loadingPet===name)img.src=url;
  }catch {portraitRequests.delete(name);img.alt=name+'（头像暂不可用）';}
};
async function loadRemoteData(){
  const status=document.getElementById('remote-status');
  status.textContent='正在从 GitHub 加载图鉴与进化链…';document.getElementById('load-retry').hidden=true;
  try {
    const [petsResponse,evolutionResponse]=await Promise.all([
      fetch(remoteRoot+'data/pets.json',{cache:'no-store',signal:AbortSignal.timeout(45000)}),
      fetch(remoteRoot+'data/evolutions.json',{cache:'no-store',signal:AbortSignal.timeout(45000)})
    ]);
    if(!petsResponse.ok||!evolutionResponse.ok)throw Error('GitHub 数据暂不可用');
    const catalog=await petsResponse.json(),evolutions=await evolutionResponse.json();
    if(!Array.isArray(catalog.pets)||!catalog.pets.length||!evolutions.entries)throw Error('远程数据格式不完整');
    BearEngine.pets.splice(0,BearEngine.pets.length,...catalog.pets);
    globalThis.BEAR_EVOLUTIONS=evolutions.entries;
    globalThis.startBearApp();
    document.getElementById('app-content').hidden=false;document.getElementById('remote-loading').hidden=true;
  }catch(error){status.textContent=error.message+'。请检查网络后重试。';document.getElementById('load-retry').hidden=false;}
}
document.getElementById('load-retry').onclick=loadRemoteData;
loadRemoteData();
