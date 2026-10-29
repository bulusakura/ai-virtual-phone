
// 跳一跳·对决：内置版本（与大堂安装版一致，可直接读取角色、写回记忆）
export const TIAOYITIAO_GAME_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>跳一跳 · 对决</title>
<style>
  :root{
    --ink:#eaf2ff; --dim:#93a2c4; --acc:#6ee7ff; --acc2:#a78bfa; --warn:#ff8a8a;
    --panel:rgba(18,24,44,.72); --line:rgba(140,170,255,.18);
  }
  *{ -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
  html,body{ width:100%; height:100%; margin:0; overflow:hidden;
    background:radial-gradient(120% 80% at 50% 0%, #16204a 0%, #0a0e1e 55%, #05070f 100%);
    color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    user-select:none; }
  #app{ position:fixed; inset:0; display:flex; flex-direction:column; }
  #hud{ position:relative; z-index:5; flex:0 0 auto;
    padding:var(--ai-phone-game-safe-top,88px) 14px 8px; }
  #hudRow{ display:flex; align-items:center; gap:10px; }
  .side{ flex:1 1 0; min-width:0; display:flex; align-items:center; gap:8px;
    background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:7px 9px; backdrop-filter:blur(8px); transition:.2s; }
  .side.me{ justify-content:flex-end; }
  .side.on{ border-color:rgba(110,231,255,.55); box-shadow:0 0 0 1px rgba(110,231,255,.18),0 6px 20px rgba(60,120,255,.18); }
  .side.on.foe{ border-color:rgba(167,139,250,.6); box-shadow:0 0 0 1px rgba(167,139,250,.2),0 6px 20px rgba(140,80,255,.18); }
  .av{ width:26px; height:26px; border-radius:9px; flex:0 0 auto; background:rgba(120,150,255,.18);
    display:flex; align-items:center; justify-content:center; font-size:13px; overflow:hidden; }
  .av img{ width:100%; height:100%; object-fit:cover; }
  .meta{ min-width:0; }
  .nm{ font-size:11px; color:var(--dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px; }
  .sc{ font-size:17px; font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums; }
  .vs{ flex:0 0 auto; font-size:10px; color:#5f6d90; letter-spacing:1px; padding:0 2px; }
  #turnTip{ margin:8px 2px 0; text-align:center; font-size:12px; color:var(--dim); height:16px;
    transition:.2s; }
  #turnTip b{ color:var(--acc); font-weight:600; }
  #stage{ position:relative; flex:1 1 auto; min-height:0; }
  #cv{ position:absolute; inset:0; width:100%; height:100%; display:block; }
  #say{ position:absolute; left:50%; top:8px; transform:translate(-50%,-8px);
    max-width:78%; padding:8px 13px; border-radius:14px; font-size:13px; line-height:1.45;
    background:rgba(20,26,48,.9); border:1px solid var(--line); color:#dbe6ff;
    opacity:0; pointer-events:none; transition:opacity .25s, transform .25s; text-align:center; }
  #say.show{ opacity:1; transform:translate(-50%,0); }
  #say .who{ color:var(--acc2); font-size:11px; display:block; margin-bottom:2px; }
  #float{ position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .mark{ position:absolute; font-size:14px; font-weight:700; color:var(--acc);
    text-shadow:0 2px 10px rgba(0,0,0,.5); animation:up .9s ease-out forwards; white-space:nowrap; }
  .mark.bad{ color:var(--warn); }
  .mark.perfect{ color:#ffd479; }
  @keyframes up{ 0%{opacity:0;transform:translate(-50%,0) scale(.8)} 25%{opacity:1;transform:translate(-50%,-8px) scale(1.06)} 100%{opacity:0;transform:translate(-50%,-46px) scale(1)} }
  #bottom{ position:relative; z-index:5; flex:0 0 auto;
    padding:6px 16px calc(var(--ai-phone-game-safe-bottom,24px) + 6px); }
  #powerWrap{ height:8px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; margin-bottom:10px; }
  #powerBar{ height:100%; width:0%; border-radius:99px;
    background:linear-gradient(90deg,#6ee7ff,#a78bfa 60%,#ffd479); transition:width .04s linear; }
  #tapBtn{ width:100%; padding:15px 10px; border-radius:18px; border:1px solid rgba(140,180,255,.28);
    background:linear-gradient(180deg,rgba(70,110,220,.34),rgba(40,60,140,.28));
    color:#eaf2ff; font-size:15px; font-weight:600; letter-spacing:.5px;
    box-shadow:0 8px 24px rgba(30,60,160,.28); transition:.12s; }
  #tapBtn:active{ transform:scale(.985); background:linear-gradient(180deg,rgba(90,140,255,.5),rgba(50,80,180,.4)); }
  #tapBtn:disabled{ opacity:.42; }
  #hint{ text-align:center; font-size:11px; color:#6b7a9e; margin-top:8px; height:14px; }
  .sheet{ position:absolute; inset:0; z-index:20; display:flex; flex-direction:column;
    background:rgba(6,9,20,.82); backdrop-filter:blur(10px);
    padding:var(--ai-phone-game-safe-top,88px) 20px calc(var(--ai-phone-game-safe-bottom,24px) + 14px); }
  .sheet.hide{ display:none; }
  .sheet h1{ font-size:24px; margin:4px 0 2px; letter-spacing:1px; }
  .sheet h1 span{ color:var(--acc); }
  .sheet .sub{ color:var(--dim); font-size:12px; line-height:1.7; margin-bottom:14px; }
  .list{ flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;
    display:flex; flex-direction:column; gap:9px; padding-right:2px; }
  .card{ display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:15px;
    background:rgba(255,255,255,.05); border:1px solid var(--line); transition:.15s; }
  .card.sel{ background:rgba(110,231,255,.12); border-color:rgba(110,231,255,.55); }
  .card .av{ width:38px; height:38px; border-radius:12px; font-size:16px; }
  .card .t{ min-width:0; flex:1 1 auto; }
  .card .t b{ display:block; font-size:14px; margin-bottom:2px; }
  .card .t i{ font-style:normal; font-size:11px; color:var(--dim); display:block;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .btn{ width:100%; padding:15px; border-radius:16px; border:none; font-size:15px; font-weight:600;
    background:linear-gradient(135deg,#6ee7ff,#a78bfa); color:#0a1020; margin-top:12px;
    box-shadow:0 10px 28px rgba(110,231,255,.22); }
  .btn:active{ transform:scale(.985); }
  .btn.ghost{ background:rgba(255,255,255,.07); color:var(--ink);
    border:1px solid var(--line); box-shadow:none; font-weight:500; }
  .btn[disabled]{ opacity:.5; }
  .empty{ color:var(--dim); font-size:12px; text-align:center; padding:22px 8px; line-height:1.7; }
  .lvRow{ display:flex; gap:8px; margin-bottom:6px; }
  .lv{ flex:1 1 0; padding:10px 4px; border-radius:12px; font-size:13px; font-weight:600;
    background:rgba(255,255,255,.05); color:var(--dim); border:1px solid var(--line); transition:.15s; }
  .lv.on{ color:#0a1020; background:linear-gradient(135deg,#6ee7ff,#a78bfa); border-color:transparent;
    box-shadow:0 6px 18px rgba(110,231,255,.22); }
  .lv[data-lv="hell"].on{ background:linear-gradient(135deg,#ff9a9a,#ff5d8f); box-shadow:0 6px 18px rgba(255,110,140,.24); }
  .lvDesc{ font-size:11px; color:#6b7a9e; margin-bottom:10px; text-align:center; height:14px; }
  .skinLabel{ display:flex; align-items:baseline; justify-content:space-between;
    font-size:11px; color:var(--dim); margin:0 2px 6px; }
  .skinLabel b{ font-size:10px; font-weight:500; color:#7b88a8; }
  .lockToast{ position:absolute; left:50%; bottom:calc(var(--ai-phone-game-safe-bottom,24px) + 92px);
    transform:translate(-50%,8px); max-width:80%; padding:9px 14px; border-radius:12px;
    background:rgba(60,26,40,.96); border:1px solid rgba(255,138,138,.4);
    color:#ffd5d5; font-size:12px; text-align:center; white-space:nowrap;
    opacity:0; pointer-events:none; transition:opacity .22s, transform .22s; z-index:5; }
  .lockToast.show{ opacity:1; transform:translate(-50%,0); }
  .skinLabel span{ cursor:default; user-select:none; }
  .skinLabel span.dev{ color:#ffd479; }
  .skinLabel span.dev::after{ content:' · 开发者'; font-size:9px; opacity:.85; }
  .skinRow{ display:flex; gap:8px; overflow-x:auto; -webkit-overflow-scrolling:touch;
    padding:0 0 10px; margin-bottom:2px; }
  .skinRow::-webkit-scrollbar{ display:none; }
  .skin{ flex:0 0 auto; width:56px; padding:8px 4px 6px; border-radius:12px;
    background:rgba(255,255,255,.05); border:1px solid var(--line);
    display:flex; flex-direction:column; align-items:center; gap:6px; transition:.15s; }
  .skin.on{ background:rgba(255,255,255,.1); }
  .skin i{ width:15px; height:21px; border-radius:6px; display:block; }
  .skin span{ font-size:10px; color:var(--dim); white-space:nowrap; }
  .skin.on span{ color:var(--ink); }
  .skin.locked{ opacity:.5; background:rgba(255,255,255,.02); cursor:not-allowed; }
  .skin.locked i{ filter:grayscale(1); position:relative; }
  .skin.locked span{ color:#5e6a88; }
  .skin.locked::after{ content:'✕'; position:absolute; font-size:20px; color:rgba(255,110,110,.5);
    pointer-events:none; }
  .skin{ position:relative; }
  .skin em{ font-style:normal; font-size:9px; color:#7b88a8; white-space:nowrap; }
  .skin.premium{ width:64px; border-width:1.5px; }
  .skin.premium:not(.locked){ border-color:rgba(255,207,77,.6);
    background:linear-gradient(180deg,rgba(255,207,77,.16),rgba(255,158,196,.08));
    box-shadow:0 0 16px rgba(255,190,61,.22); }
  .skin.premium span{ color:#ffe9a8; }
  .skin.premium i{ width:17px; height:24px; }
  .skin .pv{ position:absolute; top:-6px; right:-4px; font-size:8px; letter-spacing:.5px;
    color:#3a2a05; background:linear-gradient(135deg,#ffe9a8,#ffbe3d);
    padding:1px 5px; border-radius:99px; font-weight:700; }
  #soundBtn{ position:absolute; right:10px; top:calc(var(--ai-phone-game-safe-top,88px) + 26px);
    z-index:12; width:34px; height:34px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    background:rgba(18,24,44,.72); border:1px solid var(--line); color:#c8d6f5;
    backdrop-filter:blur(8px); transition:.18s; }
  #soundBtn:active{ transform:scale(.92); }
  #soundBtn.on{ color:var(--acc); border-color:rgba(110,231,255,.42); }
  #soundBtn .slash{ display:none; }
  #soundBtn.muted .wave1,
  #soundBtn.muted .wave2{ display:none; }
  #soundBtn.muted .slash{ display:block; stroke:#ff8a8a; }
  #soundBtn.muted{ color:#8e9ab8; }
  #autoBtn{ position:absolute; right:10px; top:calc(var(--ai-phone-game-safe-top,88px) + 68px);
    z-index:12; width:34px; height:34px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    background:rgba(18,24,44,.72); border:1px solid var(--line); color:#5f6d90;
    backdrop-filter:blur(8px); transition:.18s; }
  #autoBtn:active{ transform:scale(.92); }
  #autoBtn.on{ color:#ffd479; border-color:rgba(255,212,121,.55);
    box-shadow:0 0 14px rgba(255,190,61,.32); }
  #autoBadge{ position:absolute; right:52px; top:calc(var(--ai-phone-game-safe-top,88px) + 76px);
    z-index:12; font-size:10px; letter-spacing:1px; color:#ffd479;
    background:rgba(60,44,18,.9); border:1px solid rgba(255,212,121,.4);
    padding:3px 8px; border-radius:99px; opacity:0; transition:.2s; pointer-events:none; }
  #autoBadge.show{ opacity:1; }
  #unlockToast{ position:absolute; left:50%; top:calc(var(--ai-phone-game-safe-top,88px) + 54px);
    transform:translate(-50%,-14px) scale(.94); z-index:30; pointer-events:none;
    min-width:190px; max-width:82%; padding:13px 16px; border-radius:16px;
    background:linear-gradient(160deg,rgba(38,48,86,.97),rgba(22,28,54,.97));
    border:1px solid rgba(255,212,121,.45);
    box-shadow:0 14px 38px rgba(0,0,0,.5),0 0 0 1px rgba(255,212,121,.1) inset;
    opacity:0; transition:opacity .26s, transform .26s; }
  #unlockToast.show{ opacity:1; transform:translate(-50%,0) scale(1); }
  #unlockToast .ut{ display:flex; align-items:center; gap:10px; }
  #unlockToast .udot{ width:26px; height:34px; border-radius:9px; flex:0 0 auto; }
  #unlockToast .uc{ min-width:0; }
  #unlockToast .uh{ font-size:10px; letter-spacing:2px; color:#ffd479; margin-bottom:3px; }
  #unlockToast .un{ font-size:14px; font-weight:700; color:#f2f7ff; }
  #unlockToast .us{ font-size:11px; color:#93a2c4; margin-top:3px; line-height:1.5; }
  .bubbleWrap{ margin-top:12px; }
  .bubbleWrap.hide{ display:none; }
  .bubbleWho{ font-size:11px; color:var(--acc2); margin:0 2px 5px; }
  .previewTip{ margin-top:8px; font-size:11px; line-height:1.65; color:#ffd0a8;
    background:rgba(90,60,20,.4); border:1px solid rgba(255,190,120,.3);
    border-radius:10px; padding:8px 11px; }
  .bubble{ position:relative; display:inline-block; max-width:100%; padding:10px 14px;
    border-radius:16px 16px 16px 5px; font-size:13px; line-height:1.7;
    background:rgba(110,231,255,.12); border:1px solid rgba(110,231,255,.3); color:#e6f2ff; }
  #over .big{ font-size:40px; font-weight:800; text-align:center; margin:6px 0 2px;
    font-variant-numeric:tabular-nums; background:linear-gradient(135deg,#6ee7ff,#a78bfa);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  #over .winner{ text-align:center; font-size:15px; margin-bottom:12px; color:#dfe9ff; }
  #over .rowbox{ display:flex; gap:10px; margin:4px 0 12px; }
  #over .cell{ flex:1 1 0; background:rgba(255,255,255,.05); border:1px solid var(--line);
    border-radius:14px; padding:10px; text-align:center; }
  #over .cell i{ font-style:normal; display:block; font-size:11px; color:var(--dim); margin-bottom:3px; }
  #over .cell b{ font-size:20px; font-variant-numeric:tabular-nums; }
  #over .cmt{ font-size:12.5px; line-height:1.75; color:#cfdaf5; background:rgba(167,139,250,.1);
    border:1px solid rgba(167,139,250,.24); border-radius:14px; padding:11px 13px; }
  .loader{ display:inline-block; width:13px; height:13px; border-radius:50%;
    border:2px solid rgba(255,255,255,.25); border-top-color:var(--acc);
    animation:spin .7s linear infinite; vertical-align:-2px; margin-right:6px; }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  .scroll{ flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; }
</style>
</head>
<body>
<div id="app">
  <div id="hud">
    <div id="hudRow">
      <div class="side me" id="sideMe">
        <div class="av" id="avMe">我</div>
        <div class="meta"><div class="nm" id="nmMe">我</div><div class="sc" id="scMe">0</div></div>
      </div>
      <div class="vs">VS</div>
      <div class="side foe" id="sideFoe">
        <div class="meta" style="text-align:right"><div class="nm" id="nmFoe">对手</div><div class="sc" id="scFoe">0</div></div>
        <div class="av" id="avFoe">AI</div>
      </div>
    </div>
    <div id="turnTip">准备开始</div>
  </div>

  <div id="stage">
    <canvas id="cv"></canvas>
    <button id="soundBtn" type="button" aria-label="音效开关" title="音效开关">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <polygon points="4,9 3,9 3,15 4,15 8,15 12,19 12,5 8,9" fill="currentColor" stroke="none"></polygon>
        <path class="wave1" d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8"></path>
        <path class="wave2" d="M17.9 6a8.4 8.4 0 0 1 0 12"></path>
        <path class="slash" d="M16 9l5 6M21 9l-5 6"></path>
      </svg>
    </button>
    <button id="autoBtn" type="button" aria-label="自动瞄准开关" title="自动瞄准">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="7.2"></circle>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"></circle>
        <path d="M12 2.4v3.4M12 18.2v3.4M2.4 12h3.4M18.2 12h3.4"></path>
      </svg>
    </button>
    <div id="autoBadge">AUTO AIM</div>
    <div id="say"></div>
    <div id="float"></div>
    <div id="unlockToast"><div class="ut"><div class="udot" id="uDot"></div><div class="uc"><div class="uh">NEW OUTFIT</div><div class="un" id="uName"></div><div class="us" id="uSub"></div></div></div></div>
  </div>

  <div id="bottom">
    <div id="powerWrap"><div id="powerBar"></div></div>
    <button id="tapBtn">按住蓄力 · 松手起跳</button>
    <div id="hint">跳到下一个方块正中央会有额外加分</div>
  </div>

  <div class="sheet" id="pick">
    <h1>跳一跳 <span>对决</span></h1>
    <div class="sub">选一个手机里的角色当对手，轮流跳同一排方块。跳空的人出局。</div>
    <div class="lvRow" id="lvRow">
      <button class="lv" data-lv="easy">简单</button>
      <button class="lv on" data-lv="hard">困难</button>
      <button class="lv" data-lv="hell">地狱</button>
    </div>
    <div class="lvDesc" id="lvDesc">正常速度，落点要准</div>
    <div class="skinLabel"><span id="skinTitle">我的造型</span><b id="skinProgress">胜 0 场 · 最佳 0 分</b></div>
    <div class="skinRow" id="skinRow"></div>
    <div class="list" id="charList"></div>
    <button class="btn" id="startBtn">开始对决</button>
    <button class="btn ghost" id="soloBtn">自己练练手</button>
    <div class="lockToast" id="lockToast"></div>
  </div>

  <div class="sheet hide" id="over">
    <div class="scroll">
      <h1 style="text-align:center" id="overTitle">本局结束</h1>
      <div class="big" id="bigScore">0</div>
      <div class="winner" id="winner">—</div>
      <div class="rowbox">
        <div class="cell"><i id="c1n">我</i><b id="c1v">0</b></div>
        <div class="cell"><i id="c2n">对手</i><b id="c2v">0</b></div>
      </div>
      <div class="cmt" id="cmt">—</div>
      <div class="bubbleWrap hide" id="bubbleWrap">
        <div class="bubbleWho" id="bubbleWho">对手</div>
        <div class="bubble" id="chatBubble"><span class="loader"></span>正在组织语言…</div>
      </div>
    </div>
    <button class="btn" id="againBtn">再来一局</button>
    <button class="btn ghost" id="backBtn">换对手</button>
  </div>
</div>
<script>
(function(){
'use strict';
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const stage = $('stage');
const G = (typeof window !== 'undefined' && window.AiPhoneGame) ? window.AiPhoneGame : null;
const el = {
  scMe: $('scMe'), scFoe: $('scFoe'), nmMe: $('nmMe'), nmFoe: $('nmFoe'),
  avMe: $('avMe'), avFoe: $('avFoe'), sideMe: $('sideMe'), sideFoe: $('sideFoe'),
  tip: $('turnTip'), bar: $('powerBar'), tap: $('tapBtn'), hint: $('hint'),
  list: $('charList'), pick: $('pick'), over: $('over'),
  say: $('say'), float: $('float'),
  startBtn: $('startBtn'), soloBtn: $('soloBtn'),
  againBtn: $('againBtn'), backBtn: $('backBtn'),
  bigScore: $('bigScore'), winner: $('winner'), cmt: $('cmt'),
  overTitle: $('overTitle'),
  c1n: $('c1n'), c1v: $('c1v'), c2n: $('c2n'), c2v: $('c2v')
};

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

let W = 360, H = 520, DPR = 1, groundY = 360;

function resize() {
  const r = stage.getBoundingClientRect();
  W = Math.max(240, Math.round(r.width || 360));
  H = Math.max(240, Math.round(r.height || 520));
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  groundY = Math.round(H * 0.70);
}

const S = {
  phase: 'pick',
  me:  { key:'me',  name:'我',  avatar:'', idx:0, x:0, jumpY:0, lives:3, score:0, skill:1,   squash:0, alpha:1, alive:true },
  foe: { key:'foe', name:'对手', avatar:'', idx:0, x:0, jumpY:0, lives:3, score:0, skill:0.8, squash:0, alpha:1, alive:true },
  turn: 'me',
  blocks: [],
  cam: 0, camTarget: 0,
  chargeStart: 0, chargeMs: 1050, aiHold: null, jump: null, falling: null,
  playerName: '我', charObj: null, pkg: null,
  wins: 0, best: 0, seenOutfits: {}, autopilot: false, autoLeft: 3, devMode: false,
  ended: false, bank: null, bankBusy: false
};

const MAX_DIST = 270, MIN_DIST = 44;
const AUTO_PER_MATCH = 3;

const LEVELS = {
  easy: { name: '简单', w: [58, 88], gap: [44, 64], grow: 1.2, chargeMs: 1250, aiMul: 0.78, missBase: 0.10, desc: '方块宽、间距近，先找手感' },
  hard: { name: '困难', w: [46, 70], gap: [56, 84], grow: 2.4, chargeMs: 1050, aiMul: 1.00, missBase: 0.15, desc: '正常速度，落点要准' },
  hell: { name: '地狱', w: [34, 52], gap: [70, 102], grow: 3.0, chargeMs: 900, aiMul: 1.14, missBase: 0.20, desc: '窄块远距，对手也会失误' }
};
let LV = LEVELS.hard;

const OUTFITS = [
  { id: 'cyan',   name: '霓虹青', body: '#6ee7ff', glow: '#6ee7ff', hat: 'none',  scarf: null,      aura: 0.60, unlock: null },
  { id: 'jade',   name: '薄荷绿', body: '#8ef2c0', glow: '#8ef2c0', hat: 'cap',   scarf: null,      aura: 0.45, unlock: null },
  { id: 'amber',  name: '焦糖橙', body: '#ffc46b', glow: '#ffc46b', hat: 'none',  scarf: '#ff8a5c', aura: 0.45, unlock: null },
  { id: 'sakura', name: '樱花粉', body: '#ff9ec4', glow: '#ff9ec4', hat: 'bow',   scarf: null,      aura: 0.50, unlock: { kind: 'wins', need: 1 } },
  { id: 'frost',  name: '霜雪白', body: '#e8f0ff', glow: '#cfe4ff', hat: 'cap',   scarf: '#8ea6ff', aura: 0.35, unlock: { kind: 'best', need: 12 } },
  { id: 'violet', name: '星辉紫', body: '#a78bfa', glow: '#a78bfa', hat: 'crown', scarf: null,      aura: 0.70, unlock: { kind: 'wins', need: 3 } },
  { id: 'ember',  name: '余烬红', body: '#ff7a7a', glow: '#ff5d5d', hat: 'tail',  scarf: null,      aura: 0.55, unlock: { kind: 'wins', need: 5 } },
  { id: 'sky',    name: '云间白', body: '#cfe3ff', glow: '#a8c8ff', hat: 'wings', scarf: '#7fa8ff', aura: 0.50, unlock: { kind: 'best', need: 25 } },
  { id: 'gold',   name: '流金', body: '#ffd479', glow: '#ffbe3d', hat: 'halo',  scarf: null,      aura: 0.85, unlock: { kind: 'best', need: 40 } },
  { id: 'night',  name: '夜行黑', body: '#5b6480', glow: '#8fa0d8', hat: 'wings', scarf: '#3a4260', aura: 0.65, unlock: { kind: 'wins', need: 8 } },
  { id: 'abyss',  name: '深渊', body: '#8b5cf6', glow: '#c084fc', hat: 'halo',  scarf: '#1e1b3a', aura: 0.90, unlock: { kind: 'wins', need: 12 } },
  { id: 'prism',  name: '棱镜', body: '#7dfcd0', glow: '#9beaff', hat: 'tail',  scarf: '#a78bfa', aura: 0.95, unlock: { kind: 'best', need: 60 } },
  { id: 'seraph', name: '炽天使', body: '#ffe9a8', glow: '#ffcf4d', hat: 'seraph',
    scarf: null, aura: 1.00, unlock: { kind: 'best', need: 80 }, premium: true,
    desc: '金色棋子加一对翅膀，起跳展翼滑翔' }
];

function isUnlocked(o) {
  if (!o) return false;
  if (S.devMode) return true;
  if (!o.unlock) return true;
  if (o.unlock.kind === 'wins') return (S.wins || 0) >= o.unlock.need;
  if (o.unlock.kind === 'best') return (S.best || 0) >= o.unlock.need;
  return true;
}

function unlockText(o) {
  if (!o || !o.unlock) return '';
  if (o.unlock.kind === 'wins') return '胜 ' + o.unlock.need + ' 局解锁';
  if (o.unlock.kind === 'best') return '单局 ' + o.unlock.need + ' 分解锁';
  return '';
}

S.outfit = OUTFITS[0];
S.me.skin = OUTFITS[0];
S.foe.skin = OUTFITS[1];

function outfitById(id) {
  for (let i = 0; i < OUTFITS.length; i++) if (OUTFITS[i].id === id) return OUTFITS[i];
  return OUTFITS[0];
}

/* ================= 音效 ================= */
let audioCtx = null;
let soundOn = true;

function renderSoundBtn() {
  const b = $('soundBtn');
  if (!b) return;
  b.classList.toggle('muted', !soundOn);
  b.classList.toggle('on', soundOn);
  b.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
}

function renderAutoBtn() {
  const b = $('autoBtn');
  if (!b) return;
  const on = !!S.autopilot && S.autoLeft > 0;
  b.classList.toggle('on', on);
  const badge = $('autoBadge');
  if (badge) {
    badge.classList.toggle('show', on);
    badge.textContent = 'AUTO ×' + Math.max(0, S.autoLeft);
  }
  b.setAttribute('aria-label', on ? '关闭自动瞄准' : '开启自动瞄准');
}

function toggleAuto() {
  if (S.autoLeft <= 0) {
    el.hint.textContent = '本局 3 次已用完，下局恢复';
    return;
  }
  S.autopilot = !S.autopilot;
  renderAutoBtn();
  if (S.autopilot) {
    playTick();
    el.hint.textContent = '自动瞄准已开启 · 本局还剩 ' + S.autoLeft + ' 次';
  } else {
    el.hint.textContent = '自动瞄准已关闭 · 还剩 ' + S.autoLeft + ' 次';
  }
}

function toggleSound() {
  soundOn = !soundOn;
  renderSoundBtn();
  if (soundOn) {
    ensureAudio();
    playTick();
    el.hint.textContent = '音效已开启';
  } else {
    el.hint.textContent = '音效已静音';
  }
  saveSeenOutfits();
}

function ensureAudio() {
  if (!soundOn) return null;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

function playDing() {
  const ac = ensureAudio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.30, t0 + 0.014);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.92);
  master.connect(ac.destination);
  [
    { f: 1046.5, g: 0.55, d: 0.90 },
    { f: 1568.0, g: 0.26, d: 0.62 },
    { f: 2093.0, g: 0.11, d: 0.40 }
  ].forEach(function (part) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(part.f, t0);
    gain.gain.setValueAtTime(part.g, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + part.d);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + part.d + 0.02);
  });
}

function playTick() {
  const ac = ensureAudio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.005;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1318.5, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.10, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.24);
}

/* ================= 解锁弹窗 ================= */
const unlockQueue = [];
let unlockBusy = false;

function showUnlockToast(o, done) {
  const box = $('unlockToast');
  if (!box) { if (done) done(); return; }
  $('uDot').style.background = 'linear-gradient(180deg,' + o.body + ',' + o.glow + ')';
  $('uDot').style.boxShadow = '0 0 14px ' + o.glow;
  $('uName').textContent = o.name;
  $('uSub').textContent = o.unlock
    ? (o.unlock.kind === 'wins' ? '达成 ' + o.unlock.need + ' 场胜利' : '单局拿到 ' + o.unlock.need + ' 分')
    : '已解锁';
  box.classList.add('show');
  playDing();
  setTimeout(function () {
    box.classList.remove('show');
    setTimeout(function () { if (done) done(); }, 300);
  }, 2000);
}

function queueUnlock(o) {
  if (!o) return;
  unlockQueue.push(o);
  if (unlockBusy) return;
  unlockBusy = true;
  const next = function () {
    const item = unlockQueue.shift();
    if (!item) { unlockBusy = false; return; }
    showUnlockToast(item, next);
  };
  next();
}

function refreshUnlocks() {
  const fresh = [];
  OUTFITS.forEach(function (o) {
    if (isUnlocked(o) && !S.seenOutfits[o.id]) {
      S.seenOutfits[o.id] = true;
      if (o.unlock) fresh.push(o);
    }
  });
  if (fresh.length > 0) {
    saveSeenOutfits();
    fresh.forEach(queueUnlock);
  }
  return fresh;
}

function saveSeenOutfits() {
  if (!G) return;
  try {
    G.saveGame({
      best: S.best, wins: S.wins, outfit: S.outfit.id,
      seenOutfits: S.seenOutfits, sound: soundOn, autopilot: !!S.autopilot,
      devMode: !!S.devMode, at: Date.now()
    });
  } catch (e) {}
}

function hash(str) {
  let h = 2166136261;
  str = String(str || '');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}

const PERSONA_HINTS = [
  { re: /冷|沉默|寡言|理性|军人|特工|杀手|淡漠|疏离|禁欲|克制/, ids: ['frost', 'night', 'abyss'] },
  { re: /活泼|开朗|元气|热情|阳光|少女|少年|爱笑|可爱|欢脱|跳脱/, ids: ['sakura', 'amber', 'cyan'] },
  { re: /温柔|治愈|安静|柔软|乖巧|体贴|母性|姐姐|包容/, ids: ['jade', 'sky', 'cyan'] },
  { re: /强势|骄傲|女王|张扬|贵族|傲慢|霸气|皇帝|嚣张|自信/, ids: ['violet', 'gold', 'ember'] },
  { re: /成熟|沉稳|年长|沧桑|老练|严谨|复古|内敛|学者/, ids: ['amber', 'night', 'jade'] },
  { re: /神秘|诡异|邪|魔|妖|鬼|深渊|黑暗|疯|狂/, ids: ['abyss', 'violet', 'night'] }
];

function personaText() {
  let txt = (S.charObj && S.charObj.subtitle ? S.charObj.subtitle : '') + ' ';
  try {
    if (S.pkg && S.pkg.character) txt += JSON.stringify(S.pkg.character);
  } catch (e) {}
  return txt;
}

function foeOutfit(mine) {
  const txt = personaText();
  let pool = null;
  for (let i = 0; i < PERSONA_HINTS.length; i++) {
    if (PERSONA_HINTS[i].re.test(txt)) { pool = PERSONA_HINTS[i].ids; break; }
  }
  if (!pool) {
    const start = hash(S.foe.name || 'foe') % OUTFITS.length;
    pool = [];
    for (let i = 0; i < OUTFITS.length; i++) pool.push(OUTFITS[(start + i) % OUTFITS.length].id);
  }
  const mineId = mine ? mine.id : '';
  for (let i = 0; i < pool.length; i++) {
    if (pool[i] !== mineId) return outfitById(pool[i]);
  }
  return OUTFITS.find(function (o) { return o.id !== mineId; }) || OUTFITS[0];
}

/* ================= 方块 ================= */
function buildBlocks() {
  const arr = [];
  const L = LV;
  for (let i = 0; i < 70; i++) {
    let x = 0;
    const w = i === 0 ? 104 : Math.round(rand(L.w[0], L.w[1]));
    if (i > 0) {
      const gap = rand(L.gap[0], L.gap[1]) + Math.min(i * L.grow, 46);
      x = arr[i - 1].x + arr[i - 1].w + Math.round(gap);
    }
    arr.push({ x: x, w: w, seed: Math.random() });
  }
  S.blocks = arr;
}

function blockAt(x) {
  for (let i = 0; i < S.blocks.length; i++) {
    const b = S.blocks[i];
    if (x >= b.x - 2 && x <= b.x + b.w + 2) return i;
  }
  return -1;
}

function centerOf(i) {
  const b = S.blocks[i];
  return b ? b.x + b.w / 2 : 0;
}

function perfectPower(p) {
  if (!S.blocks.length) return 0.5;
  const target = centerOf(p.idx + 1);
  const need = (target - p.x - MIN_DIST) / (MAX_DIST - MIN_DIST);
  if (!isFinite(need)) return 0.5;
  return clamp(need, 0.06, 1);
}

/* ================= HUD ================= */
function hearts(n) { return n > 0 ? '♥'.repeat(n) : '✕'; }

function updateHUD() {
  el.nmMe.textContent = S.me.name + '  ' + hearts(S.me.lives);
  el.nmFoe.textContent = hearts(S.foe.lives) + '  ' + S.foe.name;
  el.scMe.textContent = S.me.score;
  el.scFoe.textContent = S.foe.score;
  const on = S.phase !== 'over' && S.phase !== 'pick';
  el.sideMe.classList.toggle('on', on && S.turn === 'me');
  el.sideFoe.classList.toggle('on', on && S.turn === 'foe');
  if (S.phase === 'pick') {
    el.tip.innerHTML = '选个对手，轮流跳';
  } else if (S.phase === 'over') {
    el.tip.textContent = '本局结束';
  } else if (S.turn === 'me') {
    el.tip.innerHTML = '轮到 <b>你</b> 了 · 按住蓄力';
  } else {
    el.tip.innerHTML = '<b>' + esc(S.foe.name) + '</b> 正在瞄准…';
  }
}

function setBtns(enabled) {
  el.tap.disabled = !enabled;
  el.tap.textContent = enabled ? '按住蓄力 · 松手起跳' : (S.turn === 'foe' ? '对手的回合' : '请稍候…');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function say(who, text, ms) {
  el.say.innerHTML = (who ? '<span class="who">' + esc(who) + '</span>' : '') + esc(text);
  el.say.classList.add('show');
  clearTimeout(say._t);
  say._t = setTimeout(function () { el.say.classList.remove('show'); }, ms || 2200);
}

function mark(text, sx, sy, cls) {
  const d = document.createElement('div');
  d.className = 'mark' + (cls ? ' ' + cls : '');
  d.textContent = text;
  d.style.left = sx + 'px';
  d.style.top = sy + 'px';
  el.float.appendChild(d);
  setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 950);
}

function setAvatar(node, name, url) {
  node.innerHTML = '';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.onerror = function () { node.textContent = (name || '?').slice(0, 1); };
    node.appendChild(img);
  } else {
    node.textContent = (name || '?').slice(0, 1);
  }
}

/* ================= 角色选择 ================= */
let chars = [], selId = null;

function renderChars() {
  if (!chars.length) {
    el.list.innerHTML = '<div class="empty">这台手机里还没读到角色。<br>可以先用下面的「自己练练手」，或先去创建一个角色。</div>';
    el.startBtn.disabled = true;
    return;
  }
  el.list.innerHTML = '';
  chars.forEach(function (c) {
    const card = document.createElement('div');
    card.className = 'card' + (c.id === selId ? ' sel' : '');
    const av = document.createElement('div');
    av.className = 'av';
    setAvatar(av, c.name, c.avatar);
    const t = document.createElement('div');
    t.className = 't';
    t.innerHTML = '<b>' + esc(c.name) + '</b><i>' + esc(c.subtitle || '和你一起玩') + '</i>';
    card.appendChild(av);
    card.appendChild(t);
    card.addEventListener('click', function () {
      selId = (selId === c.id) ? null : c.id;
      el.startBtn.disabled = !selId;
      renderChars();
    });
    el.list.appendChild(card);
  });
  el.startBtn.disabled = !selId;
}

function showLockToast(text) {
  const t = $('lockToast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showLockToast._t);
  showLockToast._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
}

function renderSkins() {
  const row = $('skinRow');
  if (!row) return;
  if (!isUnlocked(S.outfit)) {
    S.outfit = OUTFITS[0];
    S.me.skin = S.outfit;
  }
  const prog = $('skinProgress');
  if (prog) {
    prog.textContent = S.devMode
      ? '全部造型可试'
      : ('胜 ' + (S.wins || 0) + ' 场 · 最佳 ' + (S.best || 0) + ' 分');
  }
  const title = $('skinTitle');
  if (title) title.classList.toggle('dev', !!S.devMode);

  row.innerHTML = '';
  OUTFITS.forEach(function (o) {
    const on = o.id === S.outfit.id;
    const unlocked = isUnlocked(o);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin' + (on ? ' on' : '') + (unlocked ? '' : ' locked') + (o.premium ? ' premium' : '');
    b.style.borderColor = on ? o.body : 'rgba(140,170,255,.18)';
    if (o.premium && unlocked) {
      const pv = document.createElement('span');
      pv.className = 'pv';
      pv.textContent = '限定';
      b.appendChild(pv);
    }
    if (!unlocked) b.setAttribute('aria-disabled', 'true');

    const dot = document.createElement('i');
    dot.style.background = unlocked
      ? 'linear-gradient(180deg,' + o.body + ',' + o.glow + ')'
      : 'linear-gradient(180deg,#3a4160,#262c44)';
    dot.style.boxShadow = unlocked ? '0 0 10px ' + o.glow : 'none';
    b.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = unlocked ? o.name : '🔒 ' + o.name;
    b.appendChild(label);

    if (!unlocked) {
      const tip = document.createElement('em');
      tip.textContent = unlockText(o);
      b.appendChild(tip);
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        showLockToast('「' + o.name + '」还没解锁 · 需要' + unlockText(o));
      });
      row.appendChild(b);
      return;
    }

    b.addEventListener('click', function () {
      ensureAudio();
      if (!isUnlocked(o)) {
        showLockToast('「' + o.name + '」还没解锁 · 需要' + unlockText(o));
        return;
      }
      S.outfit = o;
      S.me.skin = o;
      renderSkins();
    });
    row.appendChild(b);
  });
}

async function initChars() {
  if (!G) { renderChars(); return; }
  try {
    chars = (await G.listAvailableCharacters()) || [];
  } catch (e) {
    chars = [];
  }
  renderChars();
}

function skillOf(c, pkg) {
  let txt = (c && c.subtitle ? c.subtitle : '') + ' ';
  try {
    if (pkg && pkg.character) txt += JSON.stringify(pkg.character);
  } catch (e) {}
  let s = 0.56 + (hash(c && (c.id || c.name)) % 29) / 100;
  if (/敏捷|灵活|运动员|擅长运动|身手|肢体|年轻|少年|机灵|利落|敏锐|活泼|反应快/.test(txt)) s += 0.07;
  if (/冷静|沉稳|精准|专注|自律|军人|特工|猎人|剑|射击/.test(txt)) s += 0.04;
  if (/迟钝|笨|懒|懒散|腿脚|笨拙|慢半拍|粗心|冒失|毛躁/.test(txt)) s -= 0.08;
  if (/年迈|老|体弱|病|伤|残疾|虚弱/.test(txt)) s -= 0.05;
  return clamp(s, 0.46, 0.90);
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) / 2.2;
}

function aiPower(f) {
  const need = (centerOf(f.idx + 1) - f.x - MIN_DIST) / (MAX_DIST - MIN_DIST);
  f.mood = clamp((f.mood || 0) * 0.72 + rand(-1, 1) * 0.55, -1, 1);
  let acc = f.skill * LV.aiMul + f.mood * 0.06;
  acc += Math.min(f.streak || 0, 5) * 0.005;
  acc = clamp(acc, 0.30, 0.96);
  let err = gauss() * (1 - acc) * 0.55;
  const pMiss = clamp(LV.missBase * (1.45 - acc), 0.03, 0.32);
  if (Math.random() < pMiss) {
    err += (Math.random() < 0.5 ? -1 : 1) * rand(0.08, 0.22);
  }
  return clamp(need + err, 0.06, 1);
}

async function startMatch(withFoe) {
  S.playerName = '我';
  S.pkg = null;
  S.charObj = null;
  S.me.avatar = '';

  if (G) {
    try {
      const p = await G.getPlayerProfile();
      if (p && p.name) S.playerName = p.name;
      if (p && p.avatar) S.me.avatar = p.avatar;
    } catch (e) {}
  }
  S.me.name = S.playerName;
  setAvatar(el.avMe, S.me.name, S.me.avatar);

  if (withFoe && selId) {
    const c = chars.filter(function (x) { return x.id === selId; })[0] || { id: selId, name: '对手' };
    S.charObj = c;
    S.foe.name = c.name;
    S.foe.avatar = c.avatar || '';
    if (G) { try { S.pkg = await G.getRoleLightPackage(selId); } catch (e) { S.pkg = null; } }
    S.foe.skill = skillOf(c, S.pkg);
  } else {
    S.foe.name = '影子';
    S.foe.avatar = '';
    S.foe.skill = 0.72;
  }
  setAvatar(el.avFoe, S.foe.name, S.foe.avatar);

  if (!isUnlocked(S.outfit)) S.outfit = OUTFITS[0];
  S.me.skin = S.outfit;
  S.foe.skin = foeOutfit(S.me.skin);

  S.chargeMs = LV.chargeMs;
  buildBlocks();
  ['me', 'foe'].forEach(function (k) {
    const p = S[k];
    p.idx = 0; p.lives = 3; p.score = 0; p.alive = true;
    p.squash = 0; p.alpha = 1; p.jumpY = 0; p.fallY = 0;
    p.mood = 0; p.streak = 0;
    p.x = centerOf(0);
  });
  S.autoLeft = AUTO_PER_MATCH;
  S.turn = 'me';
  S.jump = null; S.falling = null; S.aiHold = null; S.ended = false;
  S.cam = S.me.x - W * 0.34;
  S.camTarget = S.cam;
  S.phase = 'ready';

  el.pick.classList.add('hide');
  el.over.classList.add('hide');
  const lt = $('lockToast'); if (lt) lt.classList.remove('show');
  const bw = $('bubbleWrap'); if (bw) bw.classList.add('hide');
  el.bar.style.width = '0%';
  el.hint.textContent = LV.name + ' 关卡 · 跳到方块中央有额外加分';
  renderAutoBtn();
  updateHUD();
  setBtns(true);
  S.bank = { praise: [], taunt: [], selfMock: [], lead: [] };
  S.bankBusy = false;
  say('', LV.name + '关卡。你先来，按住不放蓄力，松手跳出去', 2200);
  prefetchLines();
  setTimeout(function () {
    if (!S.ended && S.phase === 'ready') foeSay('lead', 'start');
  }, 2800);
}

function backToPick() {
  S.phase = 'pick';
  S.autoLeft = AUTO_PER_MATCH;
  renderAutoBtn();
  S.jump = null; S.falling = null; S.aiHold = null;
  el.over.classList.add('hide');
  el.pick.classList.remove('hide');
  el.bar.style.width = '0%';
  el.tap.disabled = true;
  el.tap.textContent = '按住蓄力 · 松手起跳';
  el.say.classList.remove('show');
  updateHUD();
}

/* ================= 主循环 ================= */
let lastT = 0, raf = 0;

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
  lastT = now;
  update(dt, now);
  render(now);
}

function update(dt, now) {
  if (S.phase === 'charging') {
    const p = clamp((now - S.chargeStart) / S.chargeMs, 0, 1);
    el.bar.style.width = (p * 100).toFixed(1) + '%';
  }
  if (S.phase === 'ai' && S.aiHold && S.aiHold.t0) {
    const pr = clamp((now - S.aiHold.t0) / S.chargeMs, 0, 1);
    el.bar.style.width = (Math.min(pr, S.aiHold.target) * 100).toFixed(1) + '%';
    if (pr >= S.aiHold.target) {
      const pw = S.aiHold.target;
      S.aiHold = null;
      doJump(S.foe, pw);
    }
  }
  if (S.jump) {
    const j = S.jump, p = S[j.who];
    j.t += dt;
    const pr = Math.min(1, j.t / j.dur);
    p.x = lerp(j.from, j.to, pr);
    p.jumpY = Math.sin(Math.PI * pr) * j.peak;
    if (pr >= 1) {
      p.jumpY = 0;
      const to = j.to;
      S.jump = null;
      land(p, to);
    }
  }
  if (S.falling) {
    const f = S.falling, p = S[f.who];
    f.t += dt;
    p.fallY = (p.fallY || 0) + dt * dt * 2200 + dt * 90;
    p.alpha = clamp(1 - f.t * 1.1, 0, 1);
    if (f.t > 0.55) {
      S.falling = null;
      afterFall(p);
    }
  }
  ['me', 'foe'].forEach(function (k) {
    const p = S[k];
    if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 3.6);
  });
  const actor = S[S.turn] || S.me;
  S.camTarget = actor.x - W * 0.34;
  S.cam = lerp(S.cam, S.camTarget, Math.min(1, dt * 6));
}

function doJump(p, power) {
  const dist = MIN_DIST + power * (MAX_DIST - MIN_DIST);
  const to = p.x + dist;
  S.jump = { who: p.key, from: p.x, to: to, dur: 0.30 + dist / 900, t: 0, peak: 30 + dist * 0.17 };
  S.phase = 'jumping';
  el.bar.style.width = '0%';
  el.hint.textContent = '';
  setBtns(false);
}

function land(p, x) {
  const bi = blockAt(x);
  const expect = p.idx + 1;
  if (bi === expect) {
    p.idx = bi;
    p.streak = (p.streak || 0) + 1;
    const off = Math.abs(x - centerOf(bi));
    const bw = S.blocks[bi].w;
    const perfectAt = Math.max(4.5, bw * 0.13);
    const goodAt = Math.max(10, bw * 0.32);
    const isPerfect = off <= perfectAt;
    let bonus = 0, txt = '+1', cls = '';
    if (isPerfect) { bonus = 3; txt = '完美 +4'; cls = 'perfect'; }
    else if (off <= goodAt) { bonus = 1; txt = '不错 +2'; }
    p.score += 1 + bonus;
    p.squash = 1;
    updateHUD();
    mark(txt, p.x - S.cam, groundY - 62, cls);
    if (isPerfect) playTick();
    onLandGood(p, isPerfect);
    if (p.idx >= S.blocks.length - 1) { endGame('finish', p.key); return; }
    nextTurn();
  } else {
    p.lives = Math.max(0, p.lives - 1);
    p.streak = 0;
    p.mood = 0;
    updateHUD();
    mark(bi === p.idx ? '太近了' : '跳空了', p.x - S.cam, groundY - 62, 'bad');
    onLandBad(p, bi === p.idx);
    if (bi === p.idx) {
      p.x = centerOf(p.idx);
      afterFall(p);
    } else {
      S.falling = { who: p.key, t: 0 };
      S.phase = 'falling';
    }
  }
}

function afterFall(p) {
  p.jumpY = 0;
  p.alpha = 1;
  p.fallY = 0;
  p.squash = 1;
  if (p.lives <= 0) { endGame('out', p.key); return; }
  p.x = centerOf(p.idx);
  nextTurn();
}

function nextTurn() {
  if (S.ended) return;
  const other = S.turn === 'me' ? 'foe' : 'me';
  S.turn = other;
  S.phase = 'ready';
  updateHUD();
  setBtns(S.turn === 'me');
  if (S.turn === 'me') {
    el.hint.textContent = '按住按钮蓄力，松手起跳';
  } else {
    el.hint.textContent = S.foe.name + ' 正在瞄准…';
    startAI();
  }
}

function startAI() {
  if (S.ended) return;
  const power = aiPower(S.foe);
  S.phase = 'ai';
  S.aiHold = { t0: 0, target: power };
  const think = 320 + (1 - S.foe.skill) * 420 + rand(0, 220);
  setTimeout(function () {
    if (S.phase === 'ai' && S.aiHold) S.aiHold.t0 = performance.now();
  }, think);
}

/* ================= 角色台词 ================= */
const LINE = {
  start: ['来吧。', '先让你一局。', '准备好了吗。', '慢慢来。', '别紧张。', '我等着。', '开始吧。', '手别抖。'],
  player_perfect: ['正中。', '这一下挺准。', '有点意思。', '手很稳。', '还真敢跳。', '算你厉害。'],
  player_good: ['还行。', '跟上了。', '不错。', '勉强。', '有点样子。', '继续。'],
  player_miss: ['……掉了。', '差一点。', '脚下留神。', '别急。', '啧。', '再来吧。', '手抖了？'],
  foe_perfect: ['看到没。', '不偏不倚。', '就这样。', '学着点。', '稳得很。'],
  foe_miss: ['……失手。', '这块太窄了。', '再来。', '失误而已。', '不算。', '手滑。'],
  player_low: ['就剩一条命了。', '别慌。', '稳着点。', '还撑得住吗。'],
  foe_low: ['我还没输。', '别高兴太早。', '还有机会。']
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const usedLines = {};
function pickLine(key) {
  const pool = LINE[key] || LINE.player_good;
  const used = usedLines[key] || (usedLines[key] = []);
  let cands = pool.filter(function (t) { return used.indexOf(t) === -1; });
  if (cands.length === 0) { usedLines[key] = []; cands = pool.slice(); }
  const t = cands[Math.floor(Math.random() * cands.length)];
  usedLines[key].push(t);
  return t;
}

S.bank = { praise: [], taunt: [], selfMock: [], lead: [] };
S.bankBusy = false;

function bankTotal() {
  return S.bank.praise.length + S.bank.taunt.length + S.bank.selfMock.length + S.bank.lead.length;
}

function takeFromBank(tag) {
  const arr = S.bank[tag];
  if (!arr || !arr.length) return null;
  const t = arr.shift();
  if (bankTotal() <= 2) prefetchLines();
  return t;
}

function matchSituation() {
  const me = S.me, foe = S.foe;
  const lead = me.score > foe.score ? '你落后' : (me.score < foe.score ? '你领先' : '比分持平');
  return '当前：' + LV.name + '关卡，' + me.name + ' ' + me.score + ' 分 / ' + me.lives + ' 条命，' +
    foe.name + '（你） ' + foe.score + ' 分 / ' + foe.lives + ' 条命，' + lead + '。';
}

function parseLineBank(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}

async function prefetchLines() {
  if (!G || !S.charObj || !S.charObj.id || S.bankBusy) return;
  if (S.phase === 'pick') return;
  S.bankBusy = true;
  try {
    const r = await G.callLLM({
      characterId: S.charObj.id,
      messages: ((S.pkg && S.pkg.messages) || []).concat([
        { role: 'system', content: '你们正在玩手机小游戏《跳一跳》：轮流按住蓄力、松手跳到下一个方块上，跳空会掉下去，每人三条命。请你用自己一贯的身份、性格和说话习惯，为接下来的场面准备几句极短台词。要求：口语化、有你的个人语气、贴合你俩的关系，不超过16个字，不要动作描写、不要括号、不要引号，各类之间不要重复。只输出一段 JSON，不要解释。' },
        { role: 'user', content: '返回 JSON：{"praise":["对方跳得好时你说的3句"],"taunt":["对方失误时你说的3句"],"selfMock":["你自己失误时说的3句"],"lead":["你领先或跳得漂亮时说的2句"]}。' + matchSituation() }
      ])
    });
    const bank = parseLineBank(r && r.content ? String(r.content) : '');
    if (bank) {
      ['praise', 'taunt', 'selfMock', 'lead'].forEach(function (k) {
        if (!Array.isArray(bank[k])) return;
        bank[k].forEach(function (t) {
          if (typeof t === 'string' && t.trim()) {
            const clean = t.trim().replace(/^["“'「『]+|["”'」』]+$/g, '').slice(0, 24);
            if (clean && S.bank[k].indexOf(clean) === -1) S.bank[k].push(clean);
          }
        });
      });
    }
  } catch (e) {
  } finally {
    S.bankBusy = false;
  }
}

function foeSay(tag, fallbackKey) {
  if (S.phase === 'pick' || S.ended) return;
  const banked = takeFromBank(tag);
  if (banked) { say(S.foe.name, banked, 2400); return; }
  say(S.foe.name, pickLine(fallbackKey), 2400);
  prefetchLines();
}

function onLandGood(p, isPerfect) {
  if (!isPerfect) return;
  if (p.key === 'me') foeSay('praise', 'player_perfect');
  else foeSay('lead', 'foe_perfect');
}

function onLandBad(p, shortJump) {
  if (p.key === 'me') {
    foeSay('taunt', 'player_miss');
    if (S.me.lives === 1) setTimeout(function () { foeSay('taunt', 'player_low'); }, 1500);
  } else {
    foeSay('selfMock', 'foe_miss');
    if (S.foe.lives === 1) setTimeout(function () { foeSay('lead', 'foe_low'); }, 1500);
  }
}

/* ================= 结算 ================= */
function endGame(reason, outKey) {
  if (S.ended) return;
  S.ended = true;
  S.phase = 'over';
  S.jump = null;
  S.falling = null;
  S.aiHold = null;
  el.bar.style.width = '0%';
  setBtns(false);
  updateHUD();

  const me = S.me, foe = S.foe;
  let winner = null;
  if (reason === 'out') winner = outKey === 'me' ? 'foe' : 'me';
  else winner = me.score > foe.score ? 'me' : (foe.score > me.score ? 'foe' : 'tie');

  const iWin = winner === 'me';
  el.overTitle.textContent = iWin ? '你赢了' : (winner === 'tie' ? '平局' : '这局输了');
  el.bigScore.textContent = me.score + ' : ' + foe.score;
  el.winner.textContent = winner === 'tie'
    ? '势均力敌'
    : ((winner === 'me' ? me.name : foe.name) + ' 获胜');
  el.c1n.textContent = me.name;
  el.c1v.textContent = me.score;
  el.c2n.textContent = foe.name;
  el.c2v.textContent = foe.score;
  el.cmt.textContent = winner === 'tie' ? '跟着节奏走，下一局就能拉开差距。'
    : (iWin ? '你稳稳压住了节奏。' : foe.name + ' 落点更稳一些。');
  el.over.classList.remove('hide');

  if (me.score > S.best) S.best = me.score;
  if (iWin) S.wins += 1;
  renderSkins();
  refreshUnlocks();
  persist();
  writeMemory(winner).then(function (recorded) {
    afterGameChat(winner, recorded);
  });
}

async function persist() {
  if (!G) return;
  try {
    await G.saveGame({
      best: S.best, wins: S.wins, outfit: S.outfit.id, seenOutfits: S.seenOutfits, at: Date.now()
    });
  } catch (e) {}
}

function writeMemory(winner) {
  if (!G || !S.charObj || !S.charObj.id) return Promise.resolve(false);
  const me = S.me, foe = S.foe;
  const res = winner === 'tie' ? '打成平手' : (winner === 'me' ? me.name + '赢了' : foe.name + '赢了');
  const summary = me.name + '和' + foe.name + '在《跳一跳》的' + LV.name + '关卡玩了一局，比分 ' +
    me.score + ':' + foe.score + '，' + res + '。' + me.name + (winner === 'me'
      ? '跳得挺稳，最后笑着收下这一局。' : '有几跳手滑掉下去，输得不太服气，约好还要再来一局。') +
    '游戏结束后' + foe.name + '还发消息聊了几句这局。';
  S.previewOnly = false;
  return Promise.resolve(G.recordGameEvent({ characterIds: [S.charObj.id], summary: summary }))
    .then(function (r) {
      S.previewOnly = !!(r && r.preview);
      return !S.previewOnly;
    })
    .catch(function () { return false; });
}

const CHAT_FALLBACK = {
  win: ['……这局算你的。', '手感不错啊，下一局我不会输。', '行吧，我服一次。'],
  lose: ['赢了就跑？再来一局。', '你手滑那几下我可都看见了。', '这局我记下了。'],
  tie: ['平局，下次分个高下。']
};

function trySendToChat(text) {
  if (!G || !S.charObj || !S.charObj.id) return Promise.resolve(false);
  const cid = S.charObj.id;
  try {
    if (typeof G.sendChatMessage === 'function') {
      return Promise.resolve(G.sendChatMessage({ characterId: cid, text: text }))
        .then(function (r) { return !!(r && r.ok && r.delivered > 0); })
        .catch(function () { return false; });
    }
    if (typeof G.sendMessage === 'function') {
      G.sendMessage({ characterId: cid, text: text });
      return Promise.resolve(true);
    }
    if (G.chat && typeof G.chat.send === 'function') {
      G.chat.send({ characterId: cid, text: text });
      return Promise.resolve(true);
    }
  } catch (e) {}
  return Promise.resolve(false);
}

async function afterGameChat(winner, recorded) {
  const wrap = $('bubbleWrap'), bub = $('chatBubble'), who = $('bubbleWho');
  if (!wrap || !bub) return;
  if (!G || !S.charObj || !S.charObj.id) { wrap.classList.add('hide'); return; }

  const me = S.me, foe = S.foe;
  const resTxt = winner === 'me' ? me.name + ' 赢了' : (winner === 'foe' ? foe.name + ' 赢了' : '平局');
  const fbKey = winner === 'tie' ? 'tie' : (winner === 'me' ? 'win' : 'lose');

  who.textContent = foe.name + ' 发来一条消息';
  wrap.classList.remove('hide');
  bub.innerHTML = '<span class="loader"></span>正在组织语言…';

  let text = '';
  try {
    const r = await G.callLLM({
      characterId: S.charObj.id,
      messages: ((S.pkg && S.pkg.messages) || []).concat([
        { role: 'system', content: '你们刚在手机上玩完《跳一跳》小游戏：轮流按住蓄力、松手跳方块，跳空会掉下去，每人三条命。现在你主动给对方发一条消息聊这局。用你自己的身份和说话习惯，一到两句，40字以内，像日常聊天那样自然，可以吐槽落点、不服气、炫耀手感或约下次。只输出消息内容本身，不要引号、括号和旁白。' },
        { role: 'user', content: '本局：难度' + LV.name + '，' + me.name + ' ' + me.score + ' 分，你（' + foe.name + '）' + foe.score + ' 分，' + resTxt + '。' }
      ])
    });
    text = r && r.content ? String(r.content).trim() : '';
  } catch (e) { text = ''; }

  text = text.replace(/^["“'「『]+|["”'」』]+$/g, '')
    .split('\n').filter(function (s) { return s && s.trim(); })[0] || '';
  text = text.trim().slice(0, 120) || pick(CHAT_FALLBACK[fbKey]);
  bub.textContent = text;

  if (recorded === false || S.previewOnly) {
    who.textContent = foe.name + ' 说（本次未写入记忆）';
    if (!wrap.querySelector('.previewTip')) {
      const tip = document.createElement('div');
      tip.className = 'previewTip';
      tip.textContent = '这局没有写进角色记忆，可能没有启用高级游戏权限，或当前处于预览模式。';
      wrap.appendChild(tip);
    }
    return;
  }

  const delivered = await trySendToChat(text);
  if (delivered) {
    who.textContent = foe.name + ' 已发到聊天';
  } else {
    who.textContent = foe.name + ' 发来一条消息（回去聊天，它会接着这局说）';
  }
  try {
    G.saveGame({ best: S.best, wins: S.wins, outfit: S.outfit.id, lastChat: text, at: Date.now() });
  } catch (e) {}
}

/* ================= 渲染 ================= */
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBg(now) {
  const cam = S.cam * 0.3;
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const seed = (i * 977) % 1000;
    const px = (((seed * 1.7 - cam) % (W + 120)) + W + 120) % (W + 120) - 60;
    const py = (seed % 100) / 100 * groundY * 0.86;
    const tw = 0.35 + 0.35 * Math.sin(now / 900 + i);
    ctx.globalAlpha = 0.10 + tw * 0.22;
    ctx.fillStyle = i % 3 === 0 ? '#a78bfa' : '#6ee7ff';
    ctx.beginPath();
    ctx.arc(px, py, 1.1 + (seed % 7) / 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, groundY - 90, 0, groundY + 4);
  g.addColorStop(0, 'rgba(110,231,255,0)');
  g.addColorStop(1, 'rgba(110,231,255,.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, groundY - 90, W, 94);
  ctx.restore();
}

function drawBlock(b, sx, i) {
  const h = 72 + b.seed * 84;
  const x = Math.round(sx), w = b.w;
  const grad = ctx.createLinearGradient(0, groundY, 0, groundY + h);
  grad.addColorStop(0, 'rgba(80,110,200,.42)');
  grad.addColorStop(1, 'rgba(24,32,64,.16)');
  ctx.fillStyle = grad;
  roundRect(x, groundY, w, h + 200, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,185,255,.30)';
  roundRect(x, groundY, w, 4, 2);
  ctx.fill();
  const cx = x + w / 2;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.arc(cx, groundY + 1.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function wingSpread(p) {
  const lift = p.jumpY || 0;
  const peak = (S.jump && S.jump.who === p.key) ? S.jump.peak : 120;
  const t = clamp(lift / Math.max(40, peak), 0, 1);
  return Math.pow(t, 0.62);
}

function drawSeraphBody(p, skin, now, w, h, topY, headY, hr) {
  const px = p.x - S.cam;
  const spread = wingSpread(p);
  const flapPhase = now / 1000 * (5 + spread * 4);

  function drawAngelWing(dir, back, phase) {
    const sc = back ? 1.12 : 1;
    const L = (11 + spread * 23) * sc;
    const Hh = (7 + spread * 15) * sc;
    const lift = Math.sin(phase) * 1.1 * spread;
    const bx = px + dir * w * 0.10;
    const by = topY + h * 0.40;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(dir, 1);
    ctx.translate(0, -lift);

    ctx.fillStyle = back ? '#e4ecf9' : '#ffffff';
    ctx.globalAlpha = p.alpha * (back ? 0.55 : 0.95);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(L * 0.42, -Hh * 1.18, L, -Hh * 0.86);
    ctx.quadraticCurveTo(L * 0.94, -Hh * 0.34, L * 0.74, -Hh * 0.30);
    ctx.quadraticCurveTo(L * 0.84, -Hh * 0.06, L * 0.56, -Hh * 0.06);
    ctx.quadraticCurveTo(L * 0.62, Hh * 0.16, L * 0.34, Hh * 0.06);
    ctx.quadraticCurveTo(L * 0.34, Hh * 0.30, L * 0.08, Hh * 0.12);
    ctx.closePath();
    ctx.fill();

    if (!back) {
      ctx.globalAlpha = p.alpha * 0.9;
      ctx.fillStyle = '#dfe8f6';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.26, -Hh * 0.55, L * 0.52, -Hh * 0.40);
      ctx.quadraticCurveTo(L * 0.50, -Hh * 0.10, L * 0.30, Hh * 0.04);
      ctx.quadraticCurveTo(L * 0.18, Hh * 0.10, 0, 0);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = p.alpha * 0.55;
      ctx.strokeStyle = 'rgba(170,190,220,.85)';
      ctx.lineWidth = 0.8;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(L * 0.05, -Hh * 0.04);
        ctx.quadraticCurveTo(L * (0.40 + t * 0.18), -Hh * (0.20 + t * 0.44),
          L * (0.62 + t * 0.20), -Hh * (0.10 + t * 0.50));
        ctx.stroke();
      }
    }

    ctx.restore();
    ctx.globalAlpha = p.alpha;
  }

  drawAngelWing(-1, true, flapPhase);
  drawAngelWing(1, true, flapPhase + 1.2);
  drawAngelWing(-1, false, flapPhase + 0.6);
  drawAngelWing(1, false, flapPhase + 1.8);

  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = skin.body;
  roundRect(px - w / 2, topY, w, h, 7);
  ctx.fill();

  const headR = hr;
  ctx.beginPath();
  ctx.arc(px, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = p.alpha * 0.5;
  ctx.fillStyle = '#ffffff';
  roundRect(px - w / 2 + 2.5, topY + 3, 3, h - 7, 1.5);
  ctx.fill();
  ctx.globalAlpha = p.alpha;

  const bob = Math.sin(now / 460) * 1.4;
  ctx.strokeStyle = skin.glow;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(px, headY - headR - 4.6 + bob, 6.2, 2.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPawn(p, skin, active, now) {
  const x = p.x - S.cam;
  const gy = groundY;
  const baseY = gy + (p.fallY || 0);
  const sq = p.squash;
  const h = 21 * (1 - sq * 0.30);
  const w = 15 * (1 + sq * 0.22);
  const lift = p.jumpY || 0;
  const topY = baseY - h - lift;
  const color = skin.body;
  const hr = 6.2;
  const headY = topY - hr + 1;

  if (x < -80 || x > W + 80) return;
  ctx.save();
  ctx.globalAlpha = p.alpha;

  if (lift > 2 && S.jump && S.jump.who === p.key) {
    const j = S.jump;
    const pr = clamp(j.t / j.dur, 0, 1);
    const feathers = skin.hat === 'seraph';
    const count = feathers ? 9 : 3;
    for (let k = 1; k <= count; k++) {
      const kp = pr - k * (feathers ? 0.048 : 0.09);
      if (kp <= 0) continue;
      const fade = feathers ? Math.pow(1 - k / (count + 1), 1.8) : (0.26 - k * 0.06);
      const tx = lerp(j.from, j.to, kp) - S.cam + Math.sin(now / 420 + k * 1.7) * 3;
      const ty = gy - Math.sin(Math.PI * kp) * j.peak - h * 0.6 + Math.cos(now / 520 + k) * 2.5;
      ctx.globalAlpha = p.alpha * fade * 0.55;
      ctx.fillStyle = skin.glow;
      if (feathers) {
        const size = 2.6 * (1 - k / (count + 2));
        ctx.beginPath();
        ctx.ellipse(tx, ty, size, size * 0.52, Math.sin(now / 400 + k) * 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5 - k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = p.alpha;
  }

  if (p.alpha > 0.4) {
    const sh = clamp(1 - lift / 220, 0.25, 1);
    ctx.globalAlpha = p.alpha * 0.28 * sh;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, 11 * sh, 3.4 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = p.alpha;
  }

  if (active) {
    const pu = 0.55 + 0.45 * Math.sin(now / 320);
    ctx.strokeStyle = skin.glow;
    ctx.globalAlpha = p.alpha * 0.5 * pu;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, gy + 1, 15, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = p.alpha;
  }

  if (skin.hat === 'seraph') {
    drawSeraphBody(p, skin, now, w, h, topY, headY, hr);
    ctx.restore();
    return;
  }

  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 12 + skin.aura * 12;
  ctx.fillStyle = color;
  roundRect(x - w / 2, topY, w, h, 7);
  ctx.fill();

  if (skin.scarf) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = skin.scarf;
    roundRect(x - 7, topY - 2.5, 14, 4.2, 2.1);
    ctx.fill();
    ctx.fillStyle = color;
  }

  ctx.beginPath();
  ctx.arc(x, headY, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (skin.hat === 'tail') {
    const wave = Math.sin(now / 260 + (p.key === 'me' ? 0 : 1.7)) * 3;
    ctx.strokeStyle = skin.glow;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 1, topY + h * 0.55);
    ctx.quadraticCurveTo(x - w / 2 - 7, topY + h * 0.30 + wave, x - w / 2 - 5, topY - 2 + wave);
    ctx.stroke();
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(x - w / 2 - 5, topY - 2 + wave, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (skin.hat === 'wings') {
    const flap = 0.6 + 0.4 * Math.sin(now / 200 + (p.key === 'me' ? 0 : 2.1));
    ctx.fillStyle = skin.glow;
    ctx.globalAlpha = p.alpha * (0.45 + flap * 0.3);
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.moveTo(x + dir * (w / 2 - 1), topY + 5);
      ctx.quadraticCurveTo(x + dir * (w / 2 + 9), topY + 1 - flap * 3, x + dir * (w / 2 + 5), topY + 12);
      ctx.quadraticCurveTo(x + dir * (w / 2 + 3), topY + 9, x + dir * (w / 2 - 1), topY + 9);
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = p.alpha;
  }

  if (skin.hat === 'halo') {
    const bob = Math.sin(now / 420) * 1.2;
    ctx.strokeStyle = skin.glow;
    ctx.lineWidth = 2;
    ctx.globalAlpha = p.alpha * 0.85;
    ctx.beginPath();
    ctx.ellipse(x, headY - hr - 4.5 + bob, 7, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = p.alpha;
  }

  if (skin.hat === 'bow') {
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(x - 4.6, headY - hr + 1, 2.5, 0, Math.PI * 2);
    ctx.arc(x + 4.6, headY - hr + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.scarf || '#ffffff';
    ctx.beginPath();
    ctx.arc(x, headY - hr + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.hat === 'cap') {
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(x, headY - 1, hr + 0.6, Math.PI, Math.PI * 2);
    ctx.fill();
    roundRect(x - hr - 3.4, headY - 1.6, (hr + 3.4) * 2, 2.4, 1.2);
    ctx.fill();
  } else if (skin.hat === 'crown') {
    const by = headY - hr + 1;
    ctx.fillStyle = '#ffd479';
    ctx.beginPath();
    ctx.moveTo(x - 5, by);
    ctx.lineTo(x - 3.4, by - 4.4);
    ctx.lineTo(x - 1.2, by - 1.2);
    ctx.lineTo(x, by - 5.2);
    ctx.lineTo(x + 1.2, by - 1.2);
    ctx.lineTo(x + 3.4, by - 4.4);
    ctx.lineTo(x + 5, by);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = p.alpha * 0.5;
  ctx.fillStyle = '#ffffff';
  roundRect(x - w / 2 + 2.5, topY + 3, 3, h - 7, 1.5);
  ctx.fill();
  ctx.restore();
}

function render(now) {
  ctx.clearRect(0, 0, W, H);
  drawBg(now);

  for (let i = 0; i < S.blocks.length; i++) {
    const b = S.blocks[i];
    const sx = b.x - S.cam;
    if (sx > W + 80 || sx + b.w < -80) continue;
    drawBlock(b, sx, i);
  }

  const actor = S[S.turn] || S.me;
  const nb = S.blocks[actor.idx + 1];
  if (nb && S.phase !== 'pick' && S.phase !== 'over') {
    const sx = nb.x - S.cam;
    const pu = 0.35 + 0.35 * Math.sin(now / 380);
    ctx.save();
    ctx.globalAlpha = pu;
    ctx.strokeStyle = S.turn === 'me' ? '#6ee7ff' : '#a78bfa';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, groundY - 1);
    ctx.lineTo(sx + nb.w, groundY - 1);
    ctx.stroke();
    ctx.restore();
  }

  drawPawn(S.foe, S.foe.skin || OUTFITS[1], S.turn === 'foe' && S.phase !== 'over', now);
  drawPawn(S.me, S.me.skin || OUTFITS[0], S.turn === 'me' && S.phase !== 'over', now);
}

/* ================= 输入 ================= */
function pressDown(e) {
  if (e && e.cancelable) e.preventDefault();
  ensureAudio();
  if (S.phase !== 'ready' || S.turn !== 'me' || S.ended) return;
  S.phase = 'charging';
  S.chargeStart = performance.now();
  el.hint.textContent = '松手！';
  setBtns(true);
}

function pressUp(e) {
  if (S.phase !== 'charging') return;
  let power = clamp((performance.now() - S.chargeStart) / S.chargeMs, 0.05, 1);
  if (S.autopilot && S.autoLeft > 0) {
    power = perfectPower(S.me);
    S.autoLeft -= 1;
    if (S.autoLeft > 0) {
      mark('自动 ×' + S.autoLeft, W * 0.5, groundY - 96, 'perfect');
    } else {
      S.autopilot = false;
      mark('次数用完', W * 0.5, groundY - 96, 'bad');
    }
    renderAutoBtn();
  }
  el.bar.style.width = '0%';
  doJump(S.me, power);
}

el.tap.addEventListener('pointerdown', pressDown);
el.tap.addEventListener('touchstart', function (e) { e.preventDefault(); pressDown(e); }, { passive: false });
window.addEventListener('pointerup', pressUp);
window.addEventListener('pointercancel', pressUp);
window.addEventListener('blur', function () { if (S.phase === 'charging') pressUp(); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

window.addEventListener('keydown', function (e) {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); pressDown(); }
});
window.addEventListener('keyup', function (e) {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); pressUp(); }
});

/* ================= 按钮 ================= */
$('lvRow').addEventListener('click', function (e) {
  const b = e.target.closest ? e.target.closest('.lv') : null;
  if (!b) return;
  const key = b.getAttribute('data-lv');
  if (!LEVELS[key]) return;
  LV = LEVELS[key];
  Array.prototype.forEach.call($('lvRow').children, function (n) {
    n.classList.toggle('on', n === b);
  });
  $('lvDesc').textContent = LV.desc;
});

el.startBtn.addEventListener('click', function () { ensureAudio(); if (selId) startMatch(true); });
el.soloBtn.addEventListener('click', function () { ensureAudio(); startMatch(false); });
el.backBtn.addEventListener('click', backToPick);
el.againBtn.addEventListener('click', function () {
  if (!S.charObj) { backToPick(); return; }
  startMatch(true);
});

/* ================= 启动 ================= */
resize();
window.addEventListener('resize', function () { resize(); });
window.addEventListener('aiphone:safe-area-change', function () { setTimeout(resize, 60); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { setTimeout(resize, 60); });

if (G && G.setTitleBar) {
  try {
    G.setTitleBar({
      material: 'glass',
      background: 'rgba(10,14,30,.55)',
      color: '#eaf2ff',
      borderColor: 'rgba(140,170,255,.18)',
      buttonBackground: 'rgba(255,255,255,.08)',
      buttonColor: '#eaf2ff',
      buttonBorderColor: 'rgba(255,255,255,.14)',
      buttonRadius: '999px',
      iconOpacity: 1
    });
  } catch (e) {}
}

let devTapCount = 0, devTapTimer = null;
function bindDevTap() {
  const t = $('skinTitle');
  if (!t) return;
  t.addEventListener('click', function () {
    devTapCount += 1;
    clearTimeout(devTapTimer);
    devTapTimer = setTimeout(function () { devTapCount = 0; }, 900);
    if (devTapCount >= 3) {
      devTapCount = 0;
      S.devMode = !S.devMode;
      renderSkins();
      showLockToast(S.devMode ? '开发者模式已开启 · 全部造型可试' : '开发者模式已关闭');
      saveSeenOutfits();
    }
  });
}

setBtns(false);
updateHUD();
bindDevTap();
renderSkins();
renderSoundBtn();
renderAutoBtn();
$('soundBtn').addEventListener('click', function (e) {
  e.stopPropagation();
  ensureAudio();
  toggleSound();
});
$('autoBtn').addEventListener('click', function (e) {
  e.stopPropagation();
  ensureAudio();
  toggleAuto();
});
initChars();
loadSave();
raf = requestAnimationFrame(loop);

async function loadSave() {
  if (!G) return;
  try {
    const s = await G.loadGame();
    if (s && typeof s.best === 'number') S.best = s.best;
    if (s && typeof s.wins === 'number') S.wins = s.wins;
    if (s && s.seenOutfits && typeof s.seenOutfits === 'object') S.seenOutfits = s.seenOutfits;
    if (s && typeof s.sound === 'boolean') soundOn = s.sound;
    if (s && typeof s.autopilot === 'boolean') S.autopilot = s.autopilot;
    if (s && typeof s.devMode === 'boolean') S.devMode = s.devMode;
    S.autoLeft = AUTO_PER_MATCH;
    renderSoundBtn();
    renderAutoBtn();
    if (s && typeof s.outfit === 'string') {
      const picked = outfitById(s.outfit);
      S.outfit = isUnlocked(picked) ? picked : OUTFITS[0];
      S.me.skin = S.outfit;
    }
    renderSkins();
    refreshUnlocks();
    if (S.best > 0 && S.phase === 'pick') {
      el.hint.textContent = '你的最佳单局得分：' + S.best + ' · 累计胜场 ' + S.wins;
    }
  } catch (e) {}
}

})();
</script>
</body>
</html>`;
