'use strict';

const APP_VERSION='3.1.0-ui';
const DAY=86400000;

const CATEGORY_META={
  '食':{icon:'🍜',label:'食',sub:'餐飲'},
  '住':{icon:'🏠',label:'住',sub:'居住'},
  '行':{icon:'🚆',label:'行',sub:'交通'},
  '育':{icon:'📚',label:'學習',sub:'學習'},
  '樂':{icon:'🎮',label:'娛樂',sub:'娛樂'},
  '其他':{icon:'⋯',label:'其他',sub:'其他'},
  '衣':{icon:'👕',label:'衣',sub:'舊分類'}
};
const QUICK_CATEGORIES=['食','住','行','育','樂','其他'];
const KNOWN_CATEGORIES=['食','衣','住','行','育','樂','其他'];

const main=document.getElementById('appMain');
const dialog=document.getElementById('amountDialog');
const amountTitle=document.getElementById('amountTitle');
const amountInput=document.getElementById('amountInput');
const saveAmountButton=document.getElementById('saveAmount');
const otherDialog=document.getElementById('otherDialog');
const otherNote=document.getElementById('otherNote');
const saveOtherButton=document.getElementById('saveOther');

let route='entry';
let selectedCategory=null;
let showId=false;
let pendingOtherAmount=0;
let selectedOtherPreset='';

const nowIso=()=>new Date().toISOString();
const localDate=()=>dateKey(new Date());
const money=v=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(Math.round(Number(v)||0));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=(k,f)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch{return f}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const catMeta=k=>CATEGORY_META[k]||{icon:'•',label:k||'其他',sub:'其他'};

function dateKey(v){
  const d=v instanceof Date?v:new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function makeLedgerId(){const b=new Uint8Array(16);crypto.getRandomValues(b);return'lg-'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
function ledgerId(){let id=localStorage.getItem('lazyLedgerId')||'';if(/^lg-[a-f0-9]{32}$/.test(id))return id;id=makeLedgerId();localStorage.setItem('lazyLedgerId',id);return id}
const cacheKey=(id=ledgerId())=>`lazyLedgerCache:${id}`;

function defaultConfig(){
  return{
    ledgerId:ledgerId(),
    allowanceInitial:8000,
    allowanceRemaining:0,
    allowanceCycle:0,
    allowanceActive:false,
    allowanceStartedAt:'',
    periodStartDay:1,
    recurring:[],
    updatedAt:nowIso()
  }
}

function normalizeState(raw){
  const base=(raw&&typeof raw==='object')?JSON.parse(JSON.stringify(raw)):{};
  const out={config:{...defaultConfig(),...(base.config||{})},transactions:Array.isArray(base.transactions)?base.transactions:[]};
  out.config.recurring=Array.isArray(out.config.recurring)?out.config.recurring:[];
  out.transactions=out.transactions
    .filter(x=>x&&String(x.category||'').trim()&&Number(x.amount)>0)
    .map((x,i)=>{
      const amount=Math.round(Number(x.amount)||0);
      const allowance=Math.max(0,Math.min(amount,Math.round(Number(x.allowanceAmount)||0)));
      return{
        ...x,
        id:String(x.id||`imported-${Date.now()}-${i}`),
        clientId:String(x.clientId||x.id||`imported-client-${Date.now()}-${i}`),
        timestamp:String(x.timestamp||nowIso()),
        category:String(x.category||'其他'),
        note:String(x.note||''),
        amount,
        allowanceAmount:allowance,
        selfPaidAmount:amount-allowance,
        source:x.source==='recurring'?'recurring':'manual',
        allowanceCycle:Math.max(0,Math.round(Number(x.allowanceCycle)||0)),
        createdAt:String(x.createdAt||x.timestamp||nowIso())
      };
    });
  return out;
}

let state=normalizeState(load(cacheKey(),{config:defaultConfig(),transactions:[]}));

function persist(){state.config.updatedAt=nowIso();save(cacheKey(),state)}
function snapshot(label){
  const rows=load('lazyLedgerGithubSnapshots',[]);
  rows.push({label,at:nowIso(),ledgerId:ledgerId(),state:JSON.parse(JSON.stringify(state))});
  save('lazyLedgerGithubSnapshots',rows.slice(-10))
}
function ensureUiCheckpoint(){
  const key='lazyLedgerUiV3Checkpoint';
  if(localStorage.getItem(key))return;
  snapshot('before-ui-v3');
  localStorage.setItem(key,nowIso());
}
function eligible(c){return c==='食'||c==='住'}
function activeAllowance(){return state.config.allowanceActive!==false}
function recompute(){
  const active=activeAllowance();
  const initial=Number(state.config.allowanceInitial)||8000;
  const cycle=Number(state.config.allowanceCycle)||0;
  const used=active?state.transactions
    .filter(x=>Number(x.allowanceCycle)===cycle)
    .reduce((s,x)=>s+Math.max(0,Math.min(Number(x.amount)||0,Number(x.allowanceAmount)||0)),0):0;
  state.config.allowanceRemaining=active?Math.max(0,initial-used):0
}
function toast(m){
  const h=document.getElementById('toastHost'),e=document.createElement('div');
  e.className='toast';e.textContent=m;h.appendChild(e);setTimeout(()=>e.remove(),2200)
}
function periodBounds(ref=new Date()){
  const day=clamp(Number(state.config.periodStartDay)||1,1,28);
  let y=ref.getFullYear(),m=ref.getMonth();
  if(ref.getDate()<day)m--;
  const start=new Date(y,m,day);
  const end=new Date(start.getFullYear(),start.getMonth()+1,day);
  return{start,end}
}
function periodKey(d){
  const s=periodBounds(d).start;
  return`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`
}
function periodLabel(s,e){
  const x=new Date(e.getTime()-DAY);
  return`${s.getMonth()+1}/${s.getDate()}–${x.getMonth()+1}/${x.getDate()}`
}
function currentRows(){
  const {start,end}=periodBounds();
  return state.transactions.filter(x=>{
    const t=Date.parse(x.timestamp);
    return t>=start.getTime()&&t<end.getTime()
  })
}
function totals(rows){
  const by=Object.fromEntries(KNOWN_CATEGORIES.map(k=>[k,0]));
  let total=0,allowance=0,self=0;
  rows.forEach(x=>{
    if(!(x.category in by))by[x.category]=0;
    by[x.category]+=x.amount;
    total+=x.amount;
    allowance+=x.allowanceAmount;
    self+=x.selfPaidAmount
  });
  return{by,total,allowance,self}
}
function latest(){return[...state.transactions].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))[0]}
function todayTotal(rows=state.transactions){const k=localDate();return rows.filter(x=>dateKey(x.timestamp)===k).reduce((s,x)=>s+x.amount,0)}
function daysLeftInPeriod(){
  const {end}=periodBounds();
  const today=new Date();
  const tomorrowStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
  return Math.max(1,Math.ceil((end-tomorrowStart)/DAY)+1)
}
function periodElapsedDays(){
  const {start}=periodBounds();
  const today=new Date();
  const t=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.max(1,Math.floor((t-start)/DAY)+1)
}
function periodTotalDays(){
  const {start,end}=periodBounds();
  return Math.max(1,Math.round((end-start)/DAY))
}
function quickCategoryTotals(rows){
  const sum=totals(rows);
  const knownQuick=new Set(QUICK_CATEGORIES);
  const extra=Object.entries(sum.by)
    .filter(([k])=>!knownQuick.has(k))
    .reduce((s,[,v])=>s+Number(v||0),0);
  return QUICK_CATEGORIES.map(k=>({
    k,
    amount:(sum.by[k]||0)+(k==='其他'?extra:0),
    ...catMeta(k)
  }))
}
function rangeTotal(rows,start,end){
  return rows.reduce((s,x)=>{
    const t=Date.parse(x.timestamp);
    return s+(t>=start&&t<end?x.amount:0)
  },0)
}
function applyRecurring(){
  const d=localDate(),ym=d.slice(0,7),day=Number(d.slice(8)),rules=state.config.recurring||[];
  for(const r of rules){
    if(r.enabled===false||day<Number(r.day)||r.lastAppliedKey===ym)continue;
    const key=`${r.id}:${ym}`;
    if(!state.transactions.some(x=>x.recurringKey===key)){
      const amount=Math.round(Number(r.amount)||0),cat=String(r.category||'其他');
      if(amount>0){
        const allow=activeAllowance()&&eligible(cat)?Math.min(state.config.allowanceRemaining,amount):0;
        state.transactions.unshift({
          id:`rec-${r.id}-${ym}`,
          clientId:`rec-${r.id}-${ym}`,
          timestamp:`${ym}-${String(r.day).padStart(2,'0')}T12:00:00+08:00`,
          category:cat,
          note:String(r.name||''),
          amount,
          allowanceAmount:allow,
          selfPaidAmount:amount-allow,
          source:'recurring',
          recurringKey:key,
          allowanceCycle:state.config.allowanceCycle,
          createdAt:nowIso()
        });
        recompute()
      }
    }
    r.lastAppliedKey=ym
  }
  persist()
}

function txRow(x){
  const m=catMeta(x.category);
  const src=x.allowanceAmount>0&&x.selfPaidAmount>0
    ?`生活 ${money(x.allowanceAmount)} · 自費 ${money(x.selfPaidAmount)}`
    :x.allowanceAmount>0?'生活費':'自費';
  const time=new Date(x.timestamp).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const title=x.note?`${m.label} · ${esc(x.note)}`:m.label;
  return`<div class="recent-row">
    <div class="recent-main">
      <span class="recent-cat">${m.icon}</span>
      <div class="recent-copy">
        <strong>${title}</strong>
        <small>${time}${x.source==='recurring'?' · 自動':''}</small>
      </div>
    </div>
    <div class="recent-amount">
      <strong>− NT$ ${money(x.amount)}</strong>
      <small>${src}</small>
    </div>
    <button class="delete-tx" data-del="${esc(x.id)}" aria-label="刪除">×</button>
  </div>`
}
function grouped(rows){
  const m=new Map();
  [...rows].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).forEach(x=>{
    const k=dateKey(x.timestamp),a=m.get(k)||[];a.push(x);m.set(k,a)
  });
  return[...m.entries()].map(([k,a])=>`<section class="records-day">
    <div class="records-day-head"><span>${k}</span><b>${a.length} 筆 · NT$ ${money(totals(a).total)}</b></div>
    ${a.map(txRow).join('')}
  </section>`).join('')
}

function entryPage(){
  const rows=currentRows(),sum=totals(rows),{start,end}=periodBounds(),l=latest();
  const initial=Number(state.config.allowanceInitial)||8000;
  const remain=activeAllowance()?Number(state.config.allowanceRemaining)||0:0;
  const used=Math.max(0,initial-remain);
  const usedPct=activeAllowance()?clamp(Math.round(used/initial*100),0,100):0;
  const daysLeft=daysLeftInPeriod();
  const daily=activeAllowance()?Math.floor(remain/daysLeft):0;
  const today=todayTotal();
  return`<div class="page-stack">
    <section class="money-hero">
      <div class="hero-top">
        <p class="hero-label">${activeAllowance()?'本期生活費':'生活費尚未開始'}</p>
        <span class="hero-period">${periodLabel(start,end)}</span>
      </div>
      <div class="hero-money"><span>NT$</span><strong>${activeAllowance()?money(remain):'—'}</strong></div>
      <p class="hero-sub">${activeAllowance()?'剩餘可用':'收到生活費後開始計算'}</p>
      <div class="progress-track"><i style="width:${usedPct}%"></i></div>
      <div class="hero-caption"><span>${activeAllowance()?`已使用 ${usedPct}%`:'尚未起算'}</span><span>${daysLeft} 天</span></div>
      <div class="hero-stats">
        <div class="hero-stat"><span>剩餘日均可用</span><strong>${activeAllowance()?`NT$ ${money(daily)}`:'—'}</strong></div>
        <div class="hero-stat"><span>本期自費</span><strong>NT$ ${money(sum.self)}</strong></div>
        <div class="hero-stat"><span>今日已花</span><strong>NT$ ${money(today)}</strong></div>
      </div>
      ${activeAllowance()?'':'<button id="receiveAllowance" class="primary wide" style="margin-top:16px">我已收到第一筆 $8,000</button>'}
    </section>

    <section class="quick-card">
      <div class="quick-head">
        <div><h2>今天花多少？</h2><p>輸入金額後點分類，就完成。</p></div>
        <span class="badge">3 秒記帳</span>
      </div>
      <label class="quick-amount"><span>NT$</span><input id="quickAmount" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0"></label>
      <div class="category-grid">
        ${QUICK_CATEGORIES.map(k=>{
          const m=catMeta(k);
          return`<button class="category-btn" data-cat="${k}">
            <span class="cat-icon">${m.icon}</span><strong>${m.label}</strong><small>${m.sub}</small>
          </button>`
        }).join('')}
      </div>
      <div class="quick-actions">
        <button id="undoLast" class="secondary wide" ${l?'':'disabled'}>↶ 撤銷上一筆${l?` · ${catMeta(l.category).label} ${money(l.amount)}`:''}</button>
      </div>
    </section>

    <div class="section-head">
      <div><h3>最近紀錄</h3><p>本期 ${rows.length} 筆</p></div>
      <button class="ghost" id="goHistory">查看全部</button>
    </div>
    <section class="recent-list">
      ${rows.length?[...rows].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,3).map(txRow).join(''):'<div class="empty-card">本期還沒有支出。</div>'}
    </section>
  </div>`
}

function periodPage(){
  const rows=currentRows(),sum=totals(rows),cats=quickCategoryTotals(rows),max=Math.max(1,...cats.map(x=>x.amount));
  const {start,end}=periodBounds();
  const now=Date.now(),todayStart=new Date().setHours(0,0,0,0);
  const last7Start=todayStart-6*DAY,prev7Start=todayStart-13*DAY;
  const last7=rangeTotal(state.transactions,last7Start,now+DAY);
  const prev7=rangeTotal(state.transactions,prev7Start,last7Start);
  const diff=prev7?Math.round((last7-prev7)/prev7*100):null;
  const elapsed=periodElapsedDays(),totalDays=periodTotalDays(),avg=sum.total/elapsed,forecast=Math.round(avg*totalDays);
  const daysLeft=daysLeftInPeriod();
  const dailyRemain=activeAllowance()?Math.floor((Number(state.config.allowanceRemaining)||0)/daysLeft):0;
  return`<div class="page-stack">
    <div class="page-title-row">
      <div><h2>分析</h2><p>${periodLabel(start,end)}</p></div>
      <span class="badge">本期</span>
    </div>

    <section class="analysis-hero">
      <p>本期已花</p>
      <h2>NT$ ${money(sum.total)}</h2>
      <p>${rows.length} 筆支出</p>
    </section>

    <section class="metric-grid">
      <div class="metric-card">
        <span>最近 7 天</span>
        <strong>NT$ ${money(last7)}</strong>
        <small>${diff===null?'前 7 天無資料':`${diff>=0?'↑':'↓'} ${Math.abs(diff)}% 較前 7 天`}</small>
      </div>
      <div class="metric-card">
        <span>本期預估</span>
        <strong>NT$ ${money(forecast)}</strong>
        <small>依目前日均推算</small>
      </div>
      <div class="metric-card">
        <span>生活費支出</span>
        <strong class="positive">NT$ ${money(sum.allowance)}</strong>
        <small>食、住優先扣抵</small>
      </div>
      <div class="metric-card">
        <span>自費支出</span>
        <strong class="${sum.self>sum.allowance?'warning':''}">NT$ ${money(sum.self)}</strong>
        <small>${sum.total?Math.round(sum.self/sum.total*100):0}% 本期支出</small>
      </div>
    </section>

    <div class="section-head"><div><h3>花在哪裡？</h3><p>六類支出分布</p></div></div>
    <section class="bar-card">
      ${cats.map(x=>`<div class="bar-row">
        <div class="bar-label"><span>${x.icon} ${x.label}</span><b>NT$ ${money(x.amount)}</b></div>
        <div class="bar-track"><i style="width:${Math.round(x.amount/max*100)}%"></i></div>
        <small>${sum.total?Math.round(x.amount/sum.total*100):0}%</small>
      </div>`).join('')}
    </section>

    <div class="section-head"><div><h3>錢從哪裡出？</h3><p>生活費與自費拆分</p></div></div>
    <section class="source-grid">
      <div class="card"><span>生活費</span><strong>NT$ ${money(sum.allowance)}</strong><small>${sum.total?Math.round(sum.allowance/sum.total*100):0}%</small></div>
      <div class="card"><span>自費</span><strong>NT$ ${money(sum.self)}</strong><small>${sum.total?Math.round(sum.self/sum.total*100):0}%</small></div>
    </section>

    <section class="forecast-card">
      <div class="forecast-line"><span>本期已過</span><strong>${elapsed} / ${totalDays} 天</strong></div>
      <div class="forecast-line"><span>目前日均支出</span><strong>NT$ ${money(avg)}</strong></div>
      <div class="forecast-line"><span>剩餘生活費日均</span><strong>${activeAllowance()?`NT$ ${money(dailyRemain)}`:'—'}</strong></div>
    </section>
  </div>`
}

function historyPage(){
  const rows=currentRows(),{start,end}=periodBounds();
  const g=new Map();
  state.transactions.forEach(x=>{
    const k=periodKey(new Date(x.timestamp)),a=g.get(k)||[];a.push(x);g.set(k,a)
  });
  const currentKey=periodKey(new Date());
  const keys=[...g.keys()].filter(k=>k!==currentKey).sort().reverse().slice(0,12);
  return`<div class="page-stack">
    <div class="page-title-row">
      <div><h2>明細</h2><p>每筆支出都保留原始資金來源</p></div>
      <span class="badge">${state.transactions.length} 筆</span>
    </div>

    <div class="section-head"><div><h3>本期</h3><p>${periodLabel(start,end)}</p></div><span class="badge">NT$ ${money(totals(rows).total)}</span></div>
    <section class="recent-list">
      ${rows.length?grouped(rows):'<div class="empty-card">本期還沒有支出。</div>'}
    </section>

    <div class="section-head"><div><h3>過往期間</h3><p>依起算日自動分期</p></div></div>
    <section class="history-list">
      ${keys.length?keys.map(k=>{
        const r=g.get(k),sum=totals(r),s=new Date(`${k}T00:00:00`),e=new Date(s.getFullYear(),s.getMonth()+1,state.config.periodStartDay||1);
        const cats=quickCategoryTotals(r);
        return`<details class="history-card">
          <summary><div><small>${periodLabel(s,e)}</small><strong>NT$ ${money(sum.total)}</strong></div><span>${r.length} 筆</span></summary>
          <div class="history-body">
            ${cats.map(x=>`<div><span>${x.label}</span><b>${money(x.amount)}</b></div>`).join('')}
            <hr>
            <div><span>生活費</span><b>${money(sum.allowance)}</b></div>
            <div><span>自費</span><b>${money(sum.self)}</b></div>
          </div>
        </details>`
      }).join(''):'<div class="empty-card">尚無歷史資料。</div>'}
    </section>
  </div>`
}

function backupObject(){
  const keys={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith('lazyLedger'))keys[k]=localStorage.getItem(k)
  }
  return{schema:'lazy-ledger-github-backup-v1',version:APP_VERSION,exportedAt:nowIso(),keys}
}
function downloadBackup(){
  const blob=new Blob([JSON.stringify(backupObject(),null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`lazy-ledger-backup-${localDate()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
function parseBackupObject(obj){
  if(obj&&obj.keys&&typeof obj.keys==='object')return obj.keys;
  if(obj&&obj.config&&Array.isArray(obj.transactions)){
    const id=String(obj.config.ledgerId||ledgerId());
    return{lazyLedgerId:id,[`lazyLedgerCache:${id}`]:JSON.stringify(obj)}
  }
  throw new Error('備份格式不符')
}
function importBackup(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const obj=JSON.parse(String(r.result||'')),keys=parseBackupObject(obj);
      let idRaw=keys.lazyLedgerId,id='';
      try{id=JSON.parse(idRaw)}catch{id=String(idRaw||'').replace(/^"|"$/g,'')}
      if(!/^lg-[a-f0-9]{32}$/.test(id))throw new Error('帳本識別碼不正確');
      const primary=`lazyLedgerCache:${id}`,raw=keys[primary];
      if(!raw)throw new Error('找不到主要帳本交易資料');
      const probe=normalizeState(typeof raw==='string'?JSON.parse(raw):raw);
      for(const x of probe.transactions){
        if(x.allowanceAmount+x.selfPaidAmount!==x.amount)throw new Error('交易資金拆分不一致')
      }
      snapshot('before-import');
      Object.entries(keys).forEach(([k,v])=>{
        if(k.startsWith('lazyLedger'))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v))
      });
      localStorage.setItem('lazyLedgerId',id);
      state=normalizeState(load(primary,probe));
      recompute();persist();toast(`匯入完成 · ${state.transactions.length} 筆`);render()
    }catch(e){
      console.error(e);toast(`匯入失敗：${e.message||e}`)
    }
  };
  r.readAsText(file)
}

function settingsPage(){
  const lastSnapshot=(load('lazyLedgerGithubSnapshots',[]).slice(-1)[0]||{}).at;
  const snapshotText=lastSnapshot?new Date(lastSnapshot).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚無';
  return`<div class="page-stack">
    <div class="page-title-row">
      <div><h2>設定</h2><p>資料、週期與固定支出</p></div>
      <span class="badge">v${APP_VERSION}</span>
    </div>

    <section class="card settings-card">
      <div class="setting-title">
        <div><span class="eyebrow">ALLOWANCE</span><h3>${activeAllowance()?`生活費第 ${state.config.allowanceCycle} 期`:'生活費尚未開始'}</h3></div>
        <strong>${activeAllowance()?`${money(state.config.allowanceRemaining)} / ${money(state.config.allowanceInitial||8000)}`:'尚未起算'}</strong>
      </div>
      <p class="muted">只有「食」與「住」會扣生活費；每筆付款當下即鎖定資金來源，不因之後收到生活費或刪除其他紀錄而回溯改列。</p>
      ${!activeAllowance()
        ?'<button id="receiveAllowance" class="primary wide">我已收到第一筆 $8,000</button>'
        :state.config.allowanceRemaining<=0
          ?'<button id="receiveAllowance" class="primary wide">已收到下一筆 $8,000</button>'
          :'<button class="secondary wide" disabled>生活費用完後才可領下一筆</button>'}
    </section>

    <section class="card settings-card">
      <h3>記帳週期</h3>
      <label class="setting"><span>每月起算日</span><input id="periodStartDay" type="number" min="1" max="28" value="${state.config.periodStartDay}"></label>
      <button id="savePeriod" class="secondary wide">儲存起算日</button>
    </section>

    <section class="card settings-card">
      <div class="setting-title">
        <div><span class="eyebrow">AUTOMATION</span><h3>固定花費</h3></div>
        <span class="badge">${state.config.recurring.length} 項</span>
      </div>
      <div class="rule-list">
        ${state.config.recurring.length?state.config.recurring.map(r=>`<div class="rule-row">
          <div><strong>${esc(r.name)}</strong><small>${catMeta(r.category).label} · 每月 ${r.day} 日 · NT$ ${money(r.amount)}</small></div>
          <button class="ghost danger" data-rule-del="${esc(r.id)}">刪除</button>
        </div>`).join(''):'<p class="muted">沒有固定支出。</p>'}
      </div>
      <form id="ruleForm" class="rule-form">
        <input id="ruleName" placeholder="名稱，例如：電費">
        <div class="two-col">
          <select id="ruleCategory">${QUICK_CATEGORIES.map(k=>`<option value="${k}">${catMeta(k).label}</option>`).join('')}</select>
          <input id="ruleAmount" type="number" min="1" placeholder="金額">
        </div>
        <div class="two-col">
          <input id="ruleDay" type="number" min="1" max="28" value="1">
          <button class="primary" type="submit">新增固定花費</button>
        </div>
      </form>
    </section>

    <section class="card settings-card">
      <div class="setting-title">
        <div><span class="eyebrow">DATA SAFE</span><h3>資料狀態</h3></div>
        <span class="badge">本機</span>
      </div>
      <div class="data-status">
        <div><span>交易筆數</span><strong>${state.transactions.length} 筆</strong></div>
        <div><span>最近快照</span><strong>${snapshotText}</strong></div>
        <div><span>帳本資料</span><strong>正常</strong></div>
        <div><span>資料版本</span><strong>v3</strong></div>
      </div>
    </section>

    <section class="card settings-card">
      <div class="setting-title">
        <div><span class="eyebrow">BACKUP</span><h3>完整備份／匯入</h3></div>
        <span class="badge">JSON</span>
      </div>
      <p class="muted">匯出包含目前帳本與安全快照；匯入前會再建立一份本機快照。</p>
      <div class="actions"><button id="exportBackup" class="primary">匯出完整備份</button></div>
      <input id="importBackupFile" class="file-input" type="file" accept=".json,application/json">
      <button id="importBackup" class="secondary wide">匯入備份</button>
    </section>

    <section class="card settings-card">
      <div class="setting-title"><div><span class="eyebrow">LOCAL ID</span><h3>帳本識別碼</h3></div></div>
      <p class="muted">${showId?esc(ledgerId()):'lg-••••••••••••••••••••••••••••••••'}</p>
      <button id="toggleId" class="ghost">${showId?'隱藏':'顯示'}</button>
    </section>
  </div>`
}

function setRoute(next){
  route=next;
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.route===next));
  render();
  window.scrollTo({top:0,left:0,behavior:'instant'})
}
function render(){
  main.innerHTML=route==='entry'?entryPage():route==='period'?periodPage():route==='history'?historyPage():settingsPage();
  bind()
}
function bind(){
  document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>handleCategoryTap(b.dataset.cat));
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteTx(b.dataset.del));
  document.querySelector('#undoLast')?.addEventListener('click',undoLast);
  document.querySelector('#goHistory')?.addEventListener('click',()=>setRoute('history'));
  document.querySelector('#receiveAllowance')?.addEventListener('click',receiveAllowance);
  document.querySelector('#savePeriod')?.addEventListener('click',()=>{
    state.config.periodStartDay=clamp(Number(document.querySelector('#periodStartDay').value)||1,1,28);
    persist();render();toast('起算日已儲存')
  });
  document.querySelector('#ruleForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const name=document.querySelector('#ruleName').value.trim();
    const cat=document.querySelector('#ruleCategory').value;
    const amount=Math.round(Number(document.querySelector('#ruleAmount').value));
    const day=Math.round(Number(document.querySelector('#ruleDay').value));
    if(!name||amount<=0||day<1||day>28)return toast('請填有效固定支出');
    state.config.recurring.push({
      id:`r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,category:cat,amount,day,enabled:true,createdAt:nowIso()
    });
    persist();render();toast('已新增固定支出')
  });
  document.querySelectorAll('[data-rule-del]').forEach(b=>b.onclick=()=>{
    state.config.recurring=state.config.recurring.filter(x=>x.id!==b.dataset.ruleDel);
    persist();render()
  });
  document.querySelector('#exportBackup')?.addEventListener('click',downloadBackup);
  document.querySelector('#importBackup')?.addEventListener('click',()=>{
    const f=document.querySelector('#importBackupFile').files?.[0];
    if(!f)return toast('請先選擇備份 JSON');
    importBackup(f)
  });
  document.querySelector('#toggleId')?.addEventListener('click',()=>{showId=!showId;render()});
}

function handleCategoryTap(cat){
  const quick=document.querySelector('#quickAmount');
  const amount=Math.round(Number(quick?.value));
  if(amount>0){
    if(cat==='其他'){
      openOtherSheet(amount);
      return
    }
    commitExpense(cat,amount,'');
    if(quick)quick.value='';
    return
  }
  openAmount(cat)
}
function openAmount(cat){
  selectedCategory=cat;
  const m=catMeta(cat);
  amountTitle.textContent=`${m.label}${cat==='住'?' · 居住':''}`;
  amountInput.value='';
  saveAmountButton.textContent=`記下 · ${m.label}`;
  dialog.showModal();
  setTimeout(()=>amountInput.focus(),80)
}
function addExpense(){
  if(!selectedCategory)return;
  const amount=Math.round(Number(amountInput.value));
  if(amount<=0)return toast('請輸入金額');
  if(selectedCategory==='其他'){
    pendingOtherAmount=amount;
    dialog.close();
    selectedCategory=null;
    setTimeout(()=>openOtherSheet(amount),100);
    return
  }
  const cat=selectedCategory;
  commitExpense(cat,amount,'');
  dialog.close();
  selectedCategory=null
}
function openOtherSheet(amount){
  pendingOtherAmount=Math.round(Number(amount)||0);
  selectedOtherPreset='';
  otherNote.value='';
  document.querySelectorAll('[data-other-preset]').forEach(x=>x.classList.remove('selected'));
  saveOtherButton.textContent=`記下 · NT$ ${money(pendingOtherAmount)}`;
  otherDialog.showModal()
}
function saveOther(){
  if(pendingOtherAmount<=0)return toast('請先輸入金額');
  const note=otherNote.value.trim()||selectedOtherPreset;
  commitExpense('其他',pendingOtherAmount,note);
  const quick=document.querySelector('#quickAmount');
  if(quick)quick.value='';
  pendingOtherAmount=0;selectedOtherPreset='';
  otherDialog.close()
}
function commitExpense(category,amount,note=''){
  amount=Math.round(Number(amount));
  if(amount<=0)return toast('請輸入金額');
  const allow=activeAllowance()&&eligible(category)?Math.min(state.config.allowanceRemaining,amount):0;
  const id=`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.transactions.unshift({
    id,clientId:id,timestamp:nowIso(),category,note:String(note||''),
    amount,allowanceAmount:allow,selfPaidAmount:amount-allow,
    source:'manual',allowanceCycle:state.config.allowanceCycle,createdAt:nowIso()
  });
  recompute();persist();render();
  toast(`已記錄 NT$ ${money(amount)} · ${catMeta(category).label}`)
}
function deleteTx(id,skipConfirm=false){
  const x=state.transactions.find(t=>t.id===id);
  if(!x)return;
  if(!skipConfirm&&!confirm(`確定刪除「${catMeta(x.category).label} NT$ ${money(x.amount)}」？`))return;
  snapshot('before-delete');
  state.transactions=state.transactions.filter(t=>t.id!==id);
  recompute();persist();render();toast('已刪除')
}
function undoLast(){const x=latest();if(!x)return;deleteTx(x.id,true)}
function receiveAllowance(){
  const first=!activeAllowance();
  if(!first&&state.config.allowanceRemaining>0)return toast('目前生活費尚未用完');
  state.config.allowanceActive=true;
  state.config.allowanceCycle=first?1:(Number(state.config.allowanceCycle)||0)+1;
  state.config.allowanceRemaining=Number(state.config.allowanceInitial)||8000;
  state.config.allowanceStartedAt=nowIso();
  persist();render();toast(first?'第 1 期生活費已開始':'已開始下一期生活費')
}

saveAmountButton.onclick=addExpense;
amountInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addExpense()}});
dialog.addEventListener('close',()=>{selectedCategory=null;amountInput.value=''});

document.querySelectorAll('[data-other-preset]').forEach(b=>b.onclick=()=>{
  selectedOtherPreset=b.dataset.otherPreset||'';
  document.querySelectorAll('[data-other-preset]').forEach(x=>x.classList.toggle('selected',x===b))
});
saveOtherButton.onclick=saveOther;
otherDialog.addEventListener('close',()=>{pendingOtherAmount=0;selectedOtherPreset='';otherNote.value=''});

document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));

ensureUiCheckpoint();
recompute();
persist();
applyRecurring();
render();
