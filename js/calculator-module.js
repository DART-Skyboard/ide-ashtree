// ============================================================
//  calculator-module.js — Reckon scientific calculator (embedded)
//  Ash Tree IDE · © 2025 DART Meadow | Radical Deepscale LLC.
//
//  Direct integration of the Reckon calculator from
//  radicaldeepscale.com/reckon.html — same real algebraic engine
//  (recursive-descent parser, full operator precedence, scientific
//  functions, DEG/RAD), same theme system, same tape/history.
//  Wrapped in ReckonCalculator.init() so it activates once, the
//  first time the Calculator panel is opened, rather than running
//  at script-load time before its DOM exists.
// ============================================================

const ReckonCalculator = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;


const PRESETS={
  desk:{name:"Desk", bg:"#141311",fg:"#ece8e0",mut:"#9a958c",subtle:"#6f6b64",chassis:"#1e1c19",edge:"#2c2925",
    key:"#2f2c28",keyfg:"#ece8e0",keyfn:"#252320",keyop:"#3a3732",eq:"#ece8e0",eqfg:"#1a1916",
    lcd:"#d2dccb",lcdink:"#1c2418",lcdmut:"#5d6b56",code:"#161513",kw:"#c9b8a0",str:"#8fa37f",cmt:"#6f6b64",numc:"#b9c4ae",scheme:"dark"},
  cyan:{name:"Cyan", bg:"#060a10",fg:"#dceeff",mut:"#7a93a8",subtle:"#4e6476",chassis:"#121820",edge:"#1c2a36",
    key:"#1a2430",keyfg:"#dceeff",keyfn:"#141c26",keyop:"#1a2a32",eq:"#00e5ff",eqfg:"#061018",
    lcd:"#c9d6bc",lcdink:"#1c2e18",lcdmut:"#4a5c40",code:"#0a1018",kw:"#7dffd4",str:"#9ecbff",cmt:"#6d7f73",numc:"#9ecbff",scheme:"dark"},
  ash:{name:"Ash", bg:"#0e1410",fg:"#e4eee4",mut:"#8aa08a",subtle:"#5b6d5b",chassis:"#161e18",edge:"#243028",
    key:"#243028",keyfg:"#e4eee4",keyfn:"#1a221c",keyop:"#2c3a30",eq:"#8fbf7a",eqfg:"#10160f",
    lcd:"#c5d4b8",lcdink:"#1c2418",lcdmut:"#4e5e46",code:"#101610",kw:"#a8c89a",str:"#8fbf7a",cmt:"#6a7a66",numc:"#b9c4ae",scheme:"dark"},
  ink:{name:"Ink", bg:"#0a0a0a",fg:"#f2f2f0",mut:"#8a8a86",subtle:"#5c5c58",chassis:"#141414",edge:"#222",
    key:"#222",keyfg:"#f2f2f0",keyfn:"#1a1a1a",keyop:"#2c2c2c",eq:"#f2f2f0",eqfg:"#111",
    lcd:"#e8e4d8",lcdink:"#1a1916",lcdmut:"#6a645c",code:"#111",kw:"#d8d2c6",str:"#a8b49a",cmt:"#6f6b64",numc:"#c9c4b8",scheme:"dark"},
  copper:{name:"Copper", bg:"#16110d",fg:"#f0e4d4",mut:"#b08a6a",subtle:"#7a5c44",chassis:"#231c16",edge:"#3a2e24",
    key:"#3a2e24",keyfg:"#f0e4d4",keyfn:"#2a221c",keyop:"#4a382c",eq:"#c47a48",eqfg:"#1a100c",
    lcd:"#e6d3b8",lcdink:"#2a1c12",lcdmut:"#7a5c44",code:"#1a1410",kw:"#e0b090",str:"#c47a48",cmt:"#8a7060",numc:"#e6d3b8",scheme:"dark"},
  ember:{name:"Ember", bg:"#140c0c",fg:"#f3e6e2",mut:"#b88880",subtle:"#7a5550",chassis:"#1e1414",edge:"#32201e",
    key:"#32201e",keyfg:"#f3e6e2",keyfn:"#241616",keyop:"#3e2826",eq:"#d45c4c",eqfg:"#1a0c0c",
    lcd:"#e8cfc4",lcdink:"#2a1614",lcdmut:"#7a5550",code:"#180e0e",kw:"#e0a098",str:"#d45c4c",cmt:"#8a6a66",numc:"#e8cfc4",scheme:"dark"},
  glacier:{name:"Glacier", bg:"#0c1218",fg:"#e4eef4",mut:"#7a96a8",subtle:"#4e6878",chassis:"#141c24",edge:"#1e2a34",
    key:"#1e2a34",keyfg:"#e4eef4",keyfn:"#161e26",keyop:"#243440",eq:"#7ec8e8",eqfg:"#0a1218",
    lcd:"#d4e4ec",lcdink:"#142028",lcdmut:"#5a7484",code:"#0e141a",kw:"#9ed0e8",str:"#7ec8e8",cmt:"#6a8494",numc:"#d4e4ec",scheme:"dark"},
  dusk:{name:"Dusk", bg:"#121018",fg:"#ece6f4",mut:"#9a90b0",subtle:"#6a6280",chassis:"#1c1824",edge:"#2a2434",
    key:"#2a2434",keyfg:"#ece6f4",keyfn:"#201c28",keyop:"#342e44",eq:"#c8ccd4",eqfg:"#121018",
    lcd:"#ddd4ec",lcdink:"#1c1824",lcdmut:"#6a6280",code:"#16141c",kw:"#c8ccd4",str:"#b0a8c8",cmt:"#7a7288",numc:"#ddd4ec",scheme:"dark"},
  paper:{name:"Paper", bg:"#efe8dc",fg:"#1c1916",mut:"#6a645c",subtle:"#8a847c",chassis:"#f6f1e8",edge:"#e0d8cc",
    key:"#e8e0d4",keyfg:"#1c1916",keyfn:"#efe8dc",keyop:"#ddd4c6",eq:"#1c1916",eqfg:"#f6f1e8",
    lcd:"#dbe6d0",lcdink:"#1c2418",lcdmut:"#5d6b56",code:"#f3eee6",kw:"#5a4a38",str:"#3d4a34",cmt:"#8a847c",numc:"#3a4234",scheme:"light"}
};
function hexToRgb(h){h=(""+h).replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c}).join("");var n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]}
function rgbToHex(r,g,b){function h(x){return("0"+Math.max(0,Math.min(255,Math.round(x))).toString(16)).slice(-2)}return"#"+h(r)+h(g)+h(b)}
function mix(a,b,t){var A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t)}
function luma(h){var c=hexToRgb(h);return(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255}
function customPalette(accent,lcd,paper){
  accent=accent||"#ece8e0";lcd=lcd||"#d2dccb";
  if(paper){
    var bg=mix("#efe8dc",accent,.07),chassis=mix("#f6f1e8",accent,.05),key=mix("#e4dcd0",accent,.1);
    var ink="#1c1916";
    return{name:"Custom",bg:bg,fg:ink,mut:"#6a645c",subtle:"#8a847c",chassis:chassis,edge:mix(chassis,ink,.12),
      key:key,keyfg:ink,keyfn:mix("#efe8dc",accent,.04),keyop:mix("#ddd4c6",accent,.14),
      eq:accent,eqfg:luma(accent)>.55?ink:"#f6f1e8",lcd:lcd,lcdink:luma(lcd)>.5?"#1c2418":"#f4f7f0",
      lcdmut:mix(luma(lcd)>.5?"#1c2418":"#f4f7f0",lcd,.4),code:mix("#f3eee6",accent,.04),
      kw:mix(ink,accent,.3),str:mix("#3d4a34",accent,.2),cmt:"#8a847c",numc:mix("#1c2418",accent,.2),scheme:"light"}
  }
  var bg=mix("#121110",accent,.07),chassis=mix("#1c1a18",accent,.1),fg=mix("#ece8e0",accent,.08);
  return{name:"Custom",bg:bg,fg:fg,mut:mix("#9a958c",accent,.15),subtle:mix("#6f6b64",accent,.1),
    chassis:chassis,edge:mix(chassis,fg,.12),key:mix("#2a2824",accent,.14),keyfg:fg,
    keyfn:mix("#201e1c",accent,.08),keyop:mix("#34302c",accent,.16),eq:accent,
    eqfg:luma(accent)>.62?"#1a1916":"#f4f1ea",lcd:lcd,lcdink:luma(lcd)>.5?"#1c2418":"#f4f7f0",
    lcdmut:mix(luma(lcd)>.5?"#1c2418":"#f4f7f0",lcd,.4),code:mix("#161513",accent,.08),
    kw:mix("#c9b8a0",accent,.25),str:mix("#8fa37f",accent,.2),cmt:"#6f6b64",numc:mix("#b9c4ae",accent,.2),scheme:"dark"}
}
var THEME={id:"desk",accent:"#ece8e0",lcd:"#d2dccb",paper:false};
function loadTheme(){
  try{var s=JSON.parse(localStorage.getItem("rds-reckon-theme")||"null");if(s&&s.id)THEME=Object.assign(THEME,s)}catch(e){}
}
function saveTheme(){try{localStorage.setItem("rds-reckon-theme",JSON.stringify(THEME))}catch(e){}}
function applyTheme(){
  var p=THEME.id==="custom"?customPalette(THEME.accent,THEME.lcd,THEME.paper):(PRESETS[THEME.id]||PRESETS.desk);
  // Scoped to the floating window element, not document.documentElement —
  // this is an embedded module, not a standalone page, so it must never
  // touch the rest of the IDE's theme/colors.
  var root=document.getElementById("calcFloatWindow");
  if(!root)return;
  root.setAttribute("data-theme",THEME.id);
  root.setAttribute("data-scheme",p.scheme||"dark");
  var map={bg:p.bg,fg:p.fg,mut:p.mut,subtle:p.subtle,chassis:p.chassis,edge:p.edge,key:p.key,keyfg:p.keyfg,
    keyfn:p.keyfn,keyop:p.keyop,eq:p.eq,eqfg:p.eqfg,lcd:p.lcd,lcdink:p.lcdink,lcdmut:p.lcdmut,
    code:p.code,kw:p.kw,str:p.str,cmt:p.cmt,numc:p.numc};
  Object.keys(map).forEach(function(k){root.style.setProperty("--"+k,map[k])});
  var sw=document.getElementById("swatches");if(sw){
    [].forEach.call(sw.querySelectorAll(".calc-swatch"),function(b){b.classList.toggle("on",b.dataset.id===THEME.id)});
  }
  var an=document.getElementById("cAccent"),lc=document.getElementById("cLcd");
  if(an)an.value=THEME.accent;if(lc)lc.value=THEME.lcd;
  var n=document.getElementById("baseNight"),pp=document.getElementById("basePaper");
  if(n)n.classList.toggle("on",!THEME.paper);if(pp)pp.classList.toggle("on",!!THEME.paper);
  document.getElementById("themeBtn").setAttribute("aria-pressed", THEME.id==="custom" ? "true" : "false");
}
function pickTheme(id){THEME.id=id;if(PRESETS[id]){THEME.accent=PRESETS[id].eq;THEME.lcd=PRESETS[id].lcd;THEME.paper=PRESETS[id].scheme==="light"}saveTheme();applyTheme()}
function pickCustom(){THEME.id="custom";saveTheme();applyTheme()}
loadTheme();
(function(){ // was DOMContentLoaded — init() only runs once our DOM exists
  var host=document.getElementById("swatches");
  Object.keys(PRESETS).forEach(function(id){
    var p=PRESETS[id],b=document.createElement("button");
    b.type="button";b.className="calc-swatch"+(THEME.id===id?" on":"");b.dataset.id=id;
    b.innerHTML='<span class="dot" style="background:linear-gradient(135deg,'+p.chassis+' 42%,'+p.eq+' 42% 70%,'+p.lcd+' 70%)"></span>'+p.name;
    b.onclick=function(){pickTheme(id)};
    host.appendChild(b);
  });
  applyTheme();
  document.getElementById("cAccent").addEventListener("input",function(e){THEME.accent=e.target.value;pickCustom()});
  document.getElementById("cLcd").addEventListener("input",function(e){THEME.lcd=e.target.value;pickCustom()});
  document.getElementById("baseNight").onclick=function(){THEME.paper=false;pickCustom()};
  document.getElementById("basePaper").onclick=function(){THEME.paper=true;pickCustom()};
  var btn=document.getElementById("themeBtn"),pop=document.getElementById("themePop");
  btn.onclick=function(e){e.stopPropagation();var open=pop.classList.contains("calc-hidden");pop.classList.toggle("calc-hidden",!open);btn.setAttribute("aria-expanded",open?"true":"false")};
  document.addEventListener("click",function(e){if(!pop.contains(e.target)&&e.target!==btn){pop.classList.add("calc-hidden");btn.setAttribute("aria-expanded","false")}});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"){pop.classList.add("calc-hidden");btn.setAttribute("aria-expanded","false")}});
})();



const MAX=14;
const OP_SYM={"+":"+","-":"−","*":"×","/":"÷","^":"^",root:"ⁿ√"};
const FN={sin:"sin",cos:"cos",tan:"tan",asin:"sin⁻¹",acos:"cos⁻¹",atan:"tan⁻¹",sinh:"sinh",cosh:"cosh",tanh:"tanh",
  asinh:"sinh⁻¹",acosh:"cosh⁻¹",atanh:"tanh⁻¹",ln:"ln",exp:"e^",log:"log",exp10:"10^",sqrt:"√",cbrt:"³√",abs:"abs"};
function tidy(n){if(!Number.isFinite(n)||n===0)return n;const k=Math.round(n);return Math.abs(n-k)<=Math.abs(n)*1e-12?k:n}
function fmt(n){if(!Number.isFinite(n))return"Error";n=tidy(n);if(n===0)return"0";const a=Math.abs(n);
  if(a>=1e12||a<1e-9)return n.toExponential(6).replace(/\.?0+e/,"e").replace("e+","e");
  let s=n.toPrecision(MAX);if(/e/i.test(s))return s.replace(/\.?0+e/i,"e").replace("e+","e");
  if(s.includes("."))s=s.replace(/\.?0+$/,"");return s==="-0"?"0":s}
function fmtTok(t){return t.map(x=>x.k==="n"?x.v:x.k==="o"?OP_SYM[x.v]:x.k==="p"?x.v:x.k==="("?"(":x.k===")"?")":x.k==="c"?x.v==="pi"?"π":"e":(FN[x.v]||x.v)).join("")}
function depth(t){let d=0;for(const x of t){if(x.k==="(")d++;else if(x.k===")")d--}return d}
function last(t){return t[t.length-1]}
function complete(t){const x=last(t);return!!x&&(x.k==="n"||x.k===")"||x.k==="c"||x.k==="p")}
function needMul(t){return complete(t)}
function pushMul(t){return needMul(t)?t.concat([{k:"o",v:"*"}]):t}
function single(t){if(!t.length)return false;if(t.length===1)return t[0].k==="n"||t[0].k==="c";
  if(t[0].k==="n"&&t.length===2&&t[1].k==="p")return true;
  if(t[0].k!=="("&&t[0].k!=="f")return false;let d=0,s=false;
  for(let i=0;i<t.length;i++){const x=t[i];if(x.k==="("){d++;s=true}else if(x.k===")")d--;
    if(s&&d===0)return i===t.length-1||(i===t.length-2&&t[i+1].k==="p")}return false}
function fact(n){if(n<0||!Number.isInteger(n))return NaN;if(n>170)return Infinity;let r=1;for(let i=2;i<=n;i++)r*=i;return r}
function nroot(n,x){if(n===0)return NaN;if(x<0){if(Number.isInteger(n)&&Math.abs(n)%2===1)return -((-x)**(1/n));return NaN}return x**(1/n)}
class PE extends Error{}
class P{constructor(t,ang){this.t=t;this.i=0;this.ang=ang}
  pk(){return this.t[this.i]}
  is(v){const x=this.pk();return x&&x.k==="o"&&x.v===v}
  primS(){const x=this.pk();return!!x&&(x.k==="n"||x.k==="c"||x.k==="f"||x.k==="(")}
  eat(){const x=this.t[this.i];if(!x)throw new PE("Syntax error");this.i++;return x}
  expr(){let v=this.term();while(this.is("+")||this.is("-")){const o=this.eat();const r=this.term();v=o.v==="+"?v+r:v-r}return v}
  term(){let v=this.pow();while(true){if(this.is("*")||this.is("/")){const o=this.eat();const r=this.pow();if(o.v==="/"){if(r===0)throw new PE("Cannot divide by zero");v/=r}else v*=r}
    else if(this.primS())v*=this.pow();else break}return v}
  pow(){const v=this.un();if(this.is("^")){this.eat();return v**this.pow()}if(this.is("root")){this.eat();return nroot(v,this.pow())}return v}
  un(){if(this.is("-")){this.eat();return -this.un()}if(this.is("+")){this.eat();return this.un()}return this.post()}
  post(){let v=this.pri();while(this.pk()&&this.pk().k==="p"){const p=this.eat();if(p.v==="!"){v=fact(v);if(Number.isNaN(v))throw new PE("Invalid input")}else v/=100}return v}
  pri(){const x=this.pk();if(!x)throw new PE("Syntax error");
    if(x.k==="n"){this.eat();const n=Number(x.v);if(!Number.isFinite(n))throw new PE("Invalid input");return n}
    if(x.k==="c"){this.eat();return x.v==="pi"?Math.PI:Math.E}
    if(x.k==="f"){this.eat();let a;if(this.pk()&&this.pk().k==="("){this.eat();a=this.expr();if(!this.pk()||this.pk().k!==")")throw new PE("Mismatched parentheses");this.eat()}
      else a=this.un();const r=applyFn(x.v,a,this.ang);if(Number.isNaN(r))throw new PE("Invalid input");if(!Number.isFinite(r))throw new PE("Overflow");return r}
    if(x.k==="("){this.eat();const v=this.expr();if(!this.pk()||this.pk().k!==")")throw new PE("Mismatched parentheses");this.eat();return v}
    throw new PE("Syntax error")}
}
function prepare(t){const a=t.slice();while(a.length&&a[a.length-1].k==="o")a.pop();let d=0;for(const x of a){if(x.k==="(")d++;else if(x.k===")")d--;if(d<0)throw new PE("Mismatched parentheses")}
  while(d>0){a.push({k:")"});d--}return a}
function evaluate(t,ang){const p=prepare(t);if(!p.length)return 0;const pr=new P(p,ang);const v=pr.expr();if(pr.i!==p.length)throw new PE("Syntax error");
  if(Number.isNaN(v))throw new PE("Invalid input");if(!Number.isFinite(v))throw new PE("Overflow");return tidy(v)}
function toRad(n,m){return m==="deg"?n*Math.PI/180:n}
function fromRad(n,m){return m==="deg"?n*180/Math.PI:n}
function applyFn(name,n,ang){
  switch(name){case"sin":return Math.sin(toRad(n,ang));case"cos":return Math.cos(toRad(n,ang));case"tan":return Math.tan(toRad(n,ang));
    case"asin":return fromRad(Math.asin(n),ang);case"acos":return fromRad(Math.acos(n),ang);case"atan":return fromRad(Math.atan(n),ang);
    case"sinh":return Math.sinh(n);case"cosh":return Math.cosh(n);case"tanh":return Math.tanh(n);
    case"asinh":return Math.asinh(n);case"acosh":return Math.acosh(n);case"atanh":return Math.atanh(n);
    case"ln":return Math.log(n);case"exp":return Math.exp(n);case"log":return Math.log10(n);case"exp10":return 10**n;
    case"sqrt":return Math.sqrt(n);case"cbrt":return Math.cbrt(n);case"abs":return Math.abs(n);default:return NaN}}
function fnName(id,sec,hyp){
  if(id==="sin")return hyp&&sec?"asinh":hyp?"sinh":sec?"asin":"sin";
  if(id==="cos")return hyp&&sec?"acosh":hyp?"cosh":sec?"acos":"cos";
  if(id==="tan")return hyp&&sec?"atanh":hyp?"tanh":sec?"atan":"tan";
  if(id==="ln")return sec?"exp":"ln";if(id==="log")return sec?"exp10":"log";if(id==="sqrt")return sec?"cbrt":"sqrt";return null}

let S={tok:[],disp:"0",ow:true,mem:0,err:null,tape:"",ang:"deg",sec:false,hyp:false};
function paint(tok,patch){const expr=fmtTok(tok);S={...S,err:null,tape:"",sec:false,ow:false,...patch,tok:patch&&patch.tok||tok,disp:patch&&patch.disp||(expr||"0")};render()}
function fail(msg){S={...S,err:msg,disp:"Error",ow:true,sec:false,hyp:false};render()}
function insertFn(name){let t=S.ow?[]:S.tok.slice();if(S.ow&&S.tok.length===1&&S.tok[0].k==="n")t=S.tok.slice();
  if(single(t)){paint([{k:"f",v:name},{k:"("},...t],{hyp:false});return}
  paint(pushMul(t).concat([{k:"f",v:name},{k:"("}]),{hyp:false})}
function insertOp(op){let t=S.tok.slice();if(!(S.ow&&t.length===1&&t[0].k==="n")){if(S.ow)t=[]}
  const L=last(t);if(!L){if(op==="-")t.push({k:"o",v:"-"});else if(op==="+"){paint(t);return}else return}
  else if(L.k==="o"){t=t.slice(0,-1);t.push({k:"o",v:op})}
  else if(L.k==="("&&op==="-")t.push({k:"o",v:"-"});
  else if(L.k==="(")return;else t.push({k:"o",v:op});
  paint(t,{ow:false,hyp:false})}
function go(a){
  if(S.err){if(a.t==="ac"||a.t==="c"){S={...S,tok:[],disp:"0",ow:true,err:null,tape:"",sec:false,hyp:false};render();return}
    if(a.t==="d"||a.t==="."){S={...S,tok:[],disp:"0",ow:true,err:null,tape:"",sec:false,hyp:false};go(a);return}return}
  switch(a.t){
    case"d":{let t=S.ow?[]:S.tok.slice();const L=last(t);
      if(L&&L.k==="n"){if(L.v==="0")t=[...t.slice(0,-1),{k:"n",v:a.v}];else if(L.v==="-0")t=[...t.slice(0,-1),{k:"n",v:"-"+a.v}];
        else{const e=L.v.search(/e/i);if(e>=0){if(L.v.slice(e+1).replace(/-/g,"").length>=3){S.sec=false;render();return}}
          else if(L.v.replace(/[-.]/g,"").split(/e/i)[0].length>=MAX){S.sec=false;render();return}
          t=[...t.slice(0,-1),{k:"n",v:L.v+a.v}]}}
      else t=pushMul(t).concat([{k:"n",v:a.v}]);paint(t);break}
    case".":{let t=S.ow?[]:S.tok.slice();const L=last(t);
      if(L&&L.k==="n"){if(/e/i.test(L.v)||L.v.includes(".")){S.sec=false;render();return}t=[...t.slice(0,-1),{k:"n",v:L.v+"."}]}
      else t=pushMul(t).concat([{k:"n",v:"0."}]);paint(t);break}
    case"op":insertOp(a.v);break;
    case"(": {let t=S.ow?[]:S.tok.slice();if(S.ow&&S.tok.length===1&&S.tok[0].k==="n")t=[];paint(pushMul(t).concat([{k:"("}]));break}
    case")": {let t=S.ow?[]:S.tok.slice();if(depth(t)<=0||!complete(t)){S.sec=false;render();return}paint(t.concat([{k:")"}]));break}
    case"=":{try{const src=S.tok.length?S.tok:[{k:"n",v:"0"}];const expr=fmtTok(prepare(src));const val=evaluate(src,S.ang);const r=fmt(val);
      S={...S,tok:[{k:"n",v:r}],disp:r,ow:true,err:null,tape:expr,sec:false,hyp:false};record(expr,r);render()}catch(e){fail(e.message||"Invalid input")}break}
    case"c":if(!S.ow&&S.tok.length){paint([],{ow:true,disp:"0"});break}S={...S,tok:[],disp:"0",ow:true,err:null,tape:"",sec:false,hyp:false,mem:S.mem,ang:S.ang};render();break;
    case"ac":S={tok:[],disp:"0",ow:true,mem:S.mem,err:null,tape:"",ang:S.ang,sec:false,hyp:false};render();break;
    case"sign":{let t=S.tok.slice();const L=last(t);if(L&&L.k==="n"){const ie=L.v.search(/e/i);let n;
      if(ie>=0){const h=L.v.slice(0,ie+1),e=L.v.slice(ie+1);n=h+(e.startsWith("-")?e.slice(1):"-"+e)}
      else n=L.v.startsWith("-")?(L.v.slice(1)||"0"):"-"+L.v;paint([...t.slice(0,-1),{k:"n",v:n}])}else insertOp("-");break}
    case"%":{let t=S.tok.slice();if(!complete(t)){S.sec=false;render();return}paint(t.concat([{k:"p",v:"%"}]));break}
    case"bs":{if(S.ow){S.sec=false;render();return}let t=S.tok.slice();const L=last(t);if(!L){paint([],{ow:true,disp:"0"});return}
      if(L.k==="n"&&L.v.length>1){const n=L.v.slice(0,-1);t=[...t.slice(0,-1),{k:"n",v:n==="-"?"0":n}]}
      else{t=t.slice(0,-1);const p=last(t);if(L.k==="("&&p&&p.k==="f")t=t.slice(0,-1)}
      if(!t.length){paint([],{ow:true,disp:"0"});return}paint(t);break}
    case"mp":S.mem+=(function(){try{return evaluate(S.tok,S.ang)}catch{return 0}})();S.sec=false;render();break;
    case"mm":S.mem-=(function(){try{return evaluate(S.tok,S.ang)}catch{return 0}})();S.sec=false;render();break;
    case"mr":{const v=fmt(S.mem);let t=S.ow?[]:S.tok.slice();paint(pushMul(t).concat([{k:"n",v}]));break}
    case"mc":S.mem=0;S.sec=false;render();break;
    case"2nd":S.sec=!S.sec;render();break;
    case"hyp":S.hyp=!S.hyp;render();break;
    case"ang":S.ang=S.ang==="deg"?"rad":"deg";S.sec=false;render();break;
    case"pi":{let t=S.ow?[]:S.tok.slice();paint(pushMul(t).concat([{k:"c",v:"pi"}]));break}
    case"e":{let t=S.ow?[]:S.tok.slice();paint(pushMul(t).concat([{k:"c",v:"e"}]));break}
    case"ee":{let t=S.tok.slice();const L=last(t);if(L&&L.k==="n"&&!/e/i.test(L.v))paint([...t.slice(0,-1),{k:"n",v:L.v+"e"}]);else{S.sec=false;render()}break}
    case"sci":{
      if(a.id==="pow"){insertOp("^");break}if(a.id==="nroot"){insertOp("root");break}
      if(a.id==="sq"){if(!complete(S.tok)){S.sec=false;render();return}paint(S.tok.concat([{k:"o",v:"^"},{k:"n",v:S.sec?"3":"2"}]),{sec:false,hyp:false});break}
      if(a.id==="fact"){if(!complete(S.tok)){S.sec=false;render();return}paint(S.tok.concat([{k:"p",v:"!"}]),{hyp:false});break}
      if(a.id==="inv"){if(S.sec){insertFn("abs");break}let t=S.ow?S.tok.slice():S.tok.slice();
        if(single(t)){paint([{k:"n",v:"1"},{k:"o",v:"/"},{k:"("},...t,{k:")"}],{hyp:false});break}
        paint(pushMul(t).concat([{k:"n",v:"1"},{k:"o",v:"/"},{k:"("}]),{hyp:false});break}
      const n=fnName(a.id,S.sec,S.hyp);if(!n){S.sec=false;render();return}insertFn(n);break}
  }
}
function sciFace(id){
  if(id==="sin")return S.hyp&&S.sec?"sinh⁻¹":S.hyp?"sinh":S.sec?"sin⁻¹":"sin";
  if(id==="cos")return S.hyp&&S.sec?"cosh⁻¹":S.hyp?"cosh":S.sec?"cos⁻¹":"cos";
  if(id==="tan")return S.hyp&&S.sec?"tanh⁻¹":S.hyp?"tanh":S.sec?"tan⁻¹":"tan";
  if(id==="ln")return S.sec?"eˣ":"ln";if(id==="log")return S.sec?"10ˣ":"log";
  if(id==="sq")return S.sec?"x³":"x²";if(id==="sqrt")return S.sec?"³√":"√";
  if(id==="pow")return"xⁿ";if(id==="nroot")return"ⁿ√";if(id==="inv")return S.sec?"|x|":"1/x";return"n!";
}
const SCI=[
  ["2nd","2nd","mod",()=>go({t:"2nd"})],["hyp","hyp","mod",()=>go({t:"hyp"})],["deg","Deg","mod",()=>go({t:"ang"})],
  ["pi","π","sci",()=>go({t:"pi"})],["e","e","sci",()=>go({t:"e"})],
  ["sin","sin","sci",()=>go({t:"sci",id:"sin"})],["cos","cos","sci",()=>go({t:"sci",id:"cos"})],["tan","tan","sci",()=>go({t:"sci",id:"tan"})],
  ["ln","ln","sci",()=>go({t:"sci",id:"ln"})],["log","log","sci",()=>go({t:"sci",id:"log"})],
  ["pow","xⁿ","sci",()=>go({t:"sci",id:"pow"})],["nroot","ⁿ√","sci",()=>go({t:"sci",id:"nroot"})],["sqrt","√","sci",()=>go({t:"sci",id:"sqrt"})],
  ["sq","x²","sci",()=>go({t:"sci",id:"sq"})],["fact","n!","sci",()=>go({t:"sci",id:"fact"})],
  ["lp","(","fn",()=>go({t:"("})],["rp",")","fn",()=>go({t:")"})],["inv","1/x","sci",()=>go({t:"sci",id:"inv"})],
  ["ee","EE","sci",()=>go({t:"ee"})],["pct","%","fn",()=>go({t:"%"})],
  ["mc","MC","fn",()=>go({t:"mc"})],["mr","MR","fn",()=>go({t:"mr"})],["mp","M+","fn",()=>go({t:"mp"})],["mm","M−","fn",()=>go({t:"mm"})]
];
const NUM=[
  ["ac","AC","fn",()=>go({t:S.ow||!S.tok.length||S.err?"ac":"c"})],["sign","±","fn",()=>go({t:"sign"})],["bk","⌫","fn",()=>go({t:"bs"})],["div","÷","op",()=>go({t:"op",v:"/"})],
  ["7","7","num",()=>go({t:"d",v:"7"})],["8","8","num",()=>go({t:"d",v:"8"})],["9","9","num",()=>go({t:"d",v:"9"})],["mul","×","op",()=>go({t:"op",v:"*"})],
  ["4","4","num",()=>go({t:"d",v:"4"})],["5","5","num",()=>go({t:"d",v:"5"})],["6","6","num",()=>go({t:"d",v:"6"})],["sub","−","op",()=>go({t:"op",v:"-"})],
  ["1","1","num",()=>go({t:"d",v:"1"})],["2","2","num",()=>go({t:"d",v:"2"})],["3","3","num",()=>go({t:"d",v:"3"})],["add","+","op",()=>go({t:"op",v:"+"})],
  ["0","0","num span2",()=>go({t:"d",v:"0"})],["dot",".","num",()=>go({t:"."})],["eq","=","eq",()=>go({t:"="})]
];
function mk(spec,host){
  const cell=document.createElement("div");
  const kind=spec[2]||"";
  cell.className="calc-kcell"+(kind.indexOf("span2")>=0?" span2":"");
  const b=document.createElement("button");
  b.type="button";
  b.className="calc-k "+kind.replace("span2","").trim();
  b.dataset.id=spec[0];
  b.textContent=spec[1];
  if((spec[1]||"").length>3)b.classList.add("tight");
  b.onclick=spec[3];
  cell.appendChild(b);
  host.appendChild(cell);
}
SCI.forEach(s=>mk(s,document.getElementById("sci")));
NUM.forEach(s=>mk(s,document.getElementById("num")));
let hist=[];
try{hist=JSON.parse(localStorage.getItem("rds-reckon-tape")||"[]")}catch{hist=[]}
function record(expr,res){hist=[{expr,res},...hist].slice(0,24);try{localStorage.setItem("rds-reckon-tape",JSON.stringify(hist))}catch{}}
function clearTape(){hist=[];try{localStorage.removeItem("rds-reckon-tape")}catch{}render()}
function render(){
  const o=document.getElementById("out");o.textContent=S.disp;o.className="calc-out "+(S.err?"err ":"")+(S.disp.length>16?"xs":S.disp.length>13?"sm":S.disp.length>10?"m":"s");
  const d=Math.max(0,depth(S.tok));
  document.getElementById("flags").innerHTML=
    (S.sec?"<b>2nd</b>":"")+(S.hyp?"<b>HYP</b>":"")+`<b>${S.ang==="deg"?"DEG":"RAD"}</b>`+
    (S.mem?"<b>M</b>":"")+(d?`<b>${"(".repeat(Math.min(d,4))}</b>`:"")+`<span>${S.tape||"\u00a0"}</span>`;
  const q=id=>document.querySelector('[data-id="'+id+'"]');
  q("2nd")&&q("2nd").classList.toggle("lit",S.sec);
  q("hyp")&&q("hyp").classList.toggle("lit",S.hyp);
  if(q("deg"))q("deg").textContent=S.ang==="deg"?"Deg":"Rad";
  if(q("ac"))q("ac").textContent=S.ow||!S.tok.length||S.err?"AC":"C";
  ["sin","cos","tan","ln","log","sq","sqrt","pow","nroot","inv","fact"].forEach(id=>{
    const el=document.querySelector('[data-id="'+id+'"]');if(!el)return;const lab=sciFace(id);el.textContent=lab;el.classList.toggle("tight",lab.length>3);
  });
  const h=document.getElementById("hist");const hint=document.getElementById("hint");const clr=document.getElementById("clrTape");
  if(!hist.length){h.innerHTML="";hint.style.display="";clr.style.display="none"}
  else{hint.style.display="none";clr.style.display="";h.innerHTML=hist.map((x,i)=>`<button class="calc-row" data-i="${i}"><span class="e">${x.expr}</span><span class="r">${x.res}</span></button>`).join("");
    h.querySelectorAll(".calc-row").forEach(b=>b.onclick=()=>{const e=hist[+b.dataset.i];S={...S,tok:[{k:"n",v:e.res}],disp:e.res,ow:true,tape:e.expr,err:null};render()})}
}
render();
// Scoped to the floating calculator window only — otherwise typing
// digits/operators in the Ash editor (or anywhere else in the IDE)
// would get hijacked the moment this module has ever initialized.
window.addEventListener("keydown",e=>{
  const win = document.getElementById("calcFloatWindow");
  if (!win || win.hidden) return;
  const active = document.activeElement;
  const focusIsOutside = active && active !== document.body && !win.contains(active);
  if (focusIsOutside) return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key;let a=null;
  if(k>="0"&&k<="9")a={t:"d",v:k};else if(k===".")a={t:"."};else if(k==="+")a={t:"op",v:"+"};else if(k==="-")a={t:"op",v:"-"};
  else if(k==="*"||k==="x"||k==="X")a={t:"op",v:"*"};else if(k==="/")a={t:"op",v:"/"};else if(k==="^")a={t:"sci",id:"pow"};
  else if(k==="(")a={t:"("};else if(k===")")a={t:")"};else if(k==="Enter"||k==="=")a={t:"="};else if(k==="Escape")a={t:"ac"};
  else if(k==="Backspace")a={t:"bs"};else if(k==="Delete")a={t:"c"};else if(k==="%")a={t:"%"};
  if(a){e.preventDefault();go(a)}
});
function showView(v){
  document.getElementById("view-calc").classList.toggle("calc-hidden",v!=="calc");
  document.getElementById("view-src").classList.toggle("calc-hidden",v!=="src");
  document.getElementById("tab-calc").classList.toggle("on",v==="calc");
  document.getElementById("tab-src").classList.toggle("on",v==="src");
  if(v==="src")loadCpp();
}
let cppText="";
function highlight(src){
  return src.replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">")
    .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?:include|define|ifndef|ifdef|endif|else)\b[^\n]*|"[^"\\]*(?:\\.[^"\\]*)*"|'[^']*'|\b(?:class|public|private|return|if|else|switch|case|break|default|for|while|do|true|false|nullptr|const|static|void|int|char|bool|double|float|long|unsigned|namespace|using|struct|auto|try|catch|throw|this|sizeof|virtual|template|typename)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,(m)=>{
      if(m.startsWith("//")||m.startsWith("/*"))return `<span class="calc-cmt">${m}</span>`;
      if(m.startsWith("#")||/^(class|public|private|return|if|else|switch|case|break|default|for|while|do|true|false|nullptr|const|static|void|int|char|bool|double|float|long|unsigned|namespace|using|struct|auto|try|catch|throw|this|sizeof|virtual|template|typename)$/.test(m))return `<span class="calc-kw">${m}</span>`;
      if(m.startsWith('"')||m.startsWith("'"))return `<span class="calc-str">${m}</span>`;
      if(/^\d/.test(m))return `<span class="calc-numc">${m}</span>`;
      return m;
    });
}
async function loadCpp(){
  if(cppText)return;
  try{const r=await fetch("assets/calculator.cpp");if(!r.ok)throw 0;cppText=await r.text();document.getElementById("cpp").innerHTML=highlight(cppText)}
  catch{document.getElementById("cpp").textContent="Could not load calculator.cpp — use Download if the file is on this host."}
}
async function copyCpp(){
  if(!cppText){try{const r=await fetch("assets/calculator.cpp");cppText=await r.text()}catch{return}}
  try{await navigator.clipboard.writeText(cppText)}catch{}
}


    // Expose what the panel's own controls (source-view tab, theme
    // button) need to call from outside this closure.
    this.showView = showView;
    this.copyCpp = copyCpp;

    // The embedded calculator markup uses inline onclick="go(...)" etc.
    // (unchanged from the reference page) — expose the handful it calls
    // onto window so those attributes resolve from outside this closure.
    window.go = go;
    window.clearTape = clearTape;
    window.copyCpp = copyCpp;
    window.showView = showView;
  }
};
