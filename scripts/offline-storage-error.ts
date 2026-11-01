import {ast,nodesOf,one,literal,maybeName,edits} from './source.ts';

const copy={
  en:['Unable to load local game data','The saved data could not be read or verified. It has been kept on this device. Do not clear the app data.'],
  zht:['無法載入本機遊戲資料','存檔讀取或驗證失敗。原始資料已保留在此裝置，請勿清除應用程式資料。'],
  zh:['无法载入本机游戏数据','存档读取或验证失败。原始数据已保留在此设备，请勿清除应用数据。'],
  es:['No se pueden cargar los datos locales','No se han podido leer o verificar los datos guardados. Se conservan en este dispositivo. No borres los datos de la aplicación.'],
  pt:['Não foi possível carregar os dados locais','Não foi possível ler ou verificar os dados guardados. Continuam neste dispositivo. Não apagues os dados da aplicação.'],
  fr:['Impossible de charger les données locales','Les données enregistrées n’ont pas pu être lues ou vérifiées. Elles sont conservées sur cet appareil. Ne supprimez pas les données de l’application.'],
  ru:['Не удалось загрузить локальные данные','Не удалось прочитать или проверить сохранение. Данные остались на этом устройстве. Не удаляйте данные приложения.'],
  ja:['ローカルのゲームデータを読み込めません','セーブデータの読み込みまたは検証に失敗しました。データはこの端末に保持されています。アプリのデータを消去しないでください。'],
  ko:['로컬 게임 데이터를 불러올 수 없습니다','저장 데이터를 읽거나 확인하지 못했습니다. 데이터는 이 기기에 유지됩니다. 앱 데이터를 삭제하지 마세요.'],
};

// Reuse the existing failure screen and Retry action. Only its local-backend
// explanation changes; HTTP failures retain their original translation calls.
export function patchOfflineStorageError(source:string):string {
  const tree=ast(source);
  const method=one(nodesOf(tree,'MethodDefinition',node=>maybeName(node.key)==='offline'),'startup failure screen');
  if(nodesOf(method,'Identifier',node=>node.name==='localStorageMessages').length)throw Error('Unsupported upstream: local storage message binding');
  const messages=['No hay conexión con el servidor','Tu progreso se guarda en el servidor. Comprueba tu conexión e inténtalo de nuevo.'];
  const replacements=messages.map((message,index)=>{
    const call=one(nodesOf(method,'CallExpression',node=>node.arguments.length===1&&literal(node.arguments[0])===message),'startup failure message');
    return {start:call.start,end:call.end,text:`(localStorageMessages?localStorageMessages[${index}]:${source.slice(call.start,call.end)})`};
  });
  return edits(source,[{start:method.value.body.start+1,end:method.value.body.start+1,text:`const localStorageMessages=this.backend.kind==='local'?(()=>{const messages=new Map(Object.entries(${JSON.stringify(copy)}));return messages.get(localStorage.getItem('pokebonk.lang')||'es')||messages.get('en');})():null;`},...replacements]);
}
