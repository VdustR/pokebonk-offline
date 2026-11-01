import {ast,nodes,nodesOf,one,literal,nameOf,maybeName,requireNode,edits} from './source.ts';

const copy = {
  en:['Friends are available in the online game','This offline edition does not connect to other players. Your progress stays on this device.'],
  zht:['好友功能僅適用線上版','本機版不會連線至其他玩家。你的遊戲進度仍保留在此裝置。'],
  zh:['好友功能仅适用线上版','本机版不会连接其他玩家。你的游戏进度仍保留在此设备。'],
  es:['Los amigos están disponibles en el juego en línea','Esta edición sin conexión no se conecta con otros jugadores. Tu progreso permanece en este dispositivo.'],
  pt:['Os amigos estão disponíveis no jogo online','Esta edição offline não se conecta a outros jogadores. Seu progresso permanece neste dispositivo.'],
  fr:['Les amis sont disponibles dans le jeu en ligne','Cette édition hors ligne ne se connecte pas aux autres joueurs. Votre progression reste sur cet appareil.'],
  ru:['Друзья доступны в онлайн-игре','Эта офлайн-версия не подключается к другим игрокам. Ваш прогресс остаётся на этом устройстве.'],
  ja:['フレンド機能はオンライン版で利用できます','このオフライン版では他のプレイヤーと接続しません。進行状況はこの端末に保存されます。'],
  ko:['친구 기능은 온라인 게임에서 이용할 수 있습니다','이 오프라인 버전은 다른 플레이어와 연결되지 않습니다. 진행 상황은 이 기기에 저장됩니다.'],
};

// Keep the upstream online route intact. Resolve its existing screen, DOM and
// icon helpers semantically so minified binding changes fail closed.
export function patchOfflineFriends(source:string):string {
  const tree=ast(source);
  const route=one(nodesOf(tree,'FunctionDeclaration',fn=>
    nodesOf(fn.body,'CallExpression',call=>call.callee.type==='MemberExpression'&&maybeName(call.callee.property)==='friends').length>0 &&
    nodes(fn.body,node=>literal(node)==='fr-list').length>0), 'friends route');
  const app=nameOf(requireNode(route.params[0],'Identifier'));
  const back=nameOf(requireNode(route.params[1],'AssignmentPattern').left);
  const screens=nodesOf(route.body,'CallExpression',call=>literal(call.arguments[1])==='fr'&&call.arguments.length===7);
  if(screens.length!==2)throw new Error('Unsupported upstream: friends screens');
  const screen=one([...new Set(screens.map(call=>nameOf(call.callee)))],'friends screen helper');
  const guest=one(screens.filter(call=>nodes(call,node=>literal(node)==='panel cl-guest').length>0),'friends guest screen');
  const dom=nameOf(one(nodesOf(guest,'CallExpression',call=>literal(call.arguments[0])==='h2'),'friends DOM helper').callee);
  const icon=nameOf(one(nodesOf(guest,'CallExpression',call=>literal(call.arguments[0])==='friends'&&literal(call.arguments[1])===96),'friends icon helper').callee);
  const title=guest.arguments[2];
  if(!title)throw new Error('Unsupported upstream: friends title');
  const code=`if(${app}.backend.kind==='local'){const messages=new Map(Object.entries(${JSON.stringify(copy)}));const language=localStorage.getItem('pokebonk.lang')||'es';const message=messages.get(language)||messages.get('en');${screen}(${app},'fr',${source.slice(title.start,title.end)},'',${back},[],${dom}('div',{class:'cl-hub'},${dom}('div',{class:'panel cl-guest'},${icon}('friends',96),${dom}('h2',{},message[0]),${dom}('p',{},message[1]))));return;}`;
  return edits(source,[{start:route.body.start+1,end:route.body.start+1,text:code}]);
}
