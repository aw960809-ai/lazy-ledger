'use strict';

/* v3.1 compact + clarity */
function iconSvg(k){
  const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const icons={
    '食':`<svg ${common}><path d="M4 11h16c0 5-3.6 8-8 8s-8-3-8-8-8Z"/><path d="M7 7c0-2 2-2 2-4M12 7c0-2 2-2 2-4M17 7c0-2 2-2 2-4"/></svg>`,
    '住':`<svg ${common}><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
    '行':`<svg ${common}><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M8 8h8M8 13h.01M16 13h.01M8 21l2-3m4 0 2 3"/></svg>`,
    '育':`<svg ${common}><path d="M4 4h6a2 2 0 0 1 2 2v14a3 3 0 0 0-3-3H4Z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a3 3 0 0 1 3-3h5Z"/></svg>`,
    '樂':`<svg ${common}><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M8 12h4M10 10v4M16.5 10.5h.01M18.5 13.5h.01"/></svg>`,
    '其他':`<svg ${common}><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>`,
    '衣':`<svg ${common}><path d="M9 4c.4 1.2 1.4 2 3 2s2.6-.8 3-2l5 3-2 4-2-1v10H8V10l-2 1-2-4Z"/></svg>`
  };
  return icons[k]||icons['其他']
}
function shortMD(v){
  const d=v instanceof Date?v:new Date(v);
  return `${d.getMonth()+1}/${d.getDate()}`
}
function txRow(x){
  const m=catMeta(x.category);
  const src=x.allowanceAmount>0&&x.selfPaidAmount>0
    ?`生活 ${money(x.allowanceAmount)} · 自費 ${money(x.selfPaidAmount)}`
    :x.allowanceAmount>0?'生活費':'自費';
  const time=new Date(x.timestamp).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  const title=x.note?`${m.label} · ${esc(x.note)}`:m.label;
  return`<div class="recent-row">
    <div class="recent-main">
      <span class="recent-cat">${iconSvg(x.category)}</span>
      <div class="recent-copy"><strong>${title}</strong><small>${time}${x.source==='recurring'?' · 自動':''}</small></div>
    </div>
    <div class="recent-amount"><strong>− NT$ ${money(x.amount)}</strong><small>${src}</small></div>
    <button class="delete-tx" data-del="${esc(x.id)}" aria-label="刪除">×</button>
  </div>`
}
function grouped(rows){
  const m=new Map();
  [...rows].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).forEach(x=>{
    const k=dateKey(x.timestamp),a=m.get(k)||[];a.push(x);m.set(k,a)
  });
  return[...m.entries()].map(([k,a])=>{
    const label=k===localDate()?`今天 · ${shortMD(new Date(`${k}T00:00:00`))}`:shortMD(new Date(`${k}T00:00:00`));
    return`<section class="records-day"><div class="records-day-head"><span>${label}</span><b>${a.length} 筆 · NT$ ${money(totals(a).total)}</b></div>${a.map(txRow).join('')}</section>`
  }).join('')
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
  const allowanceState=!activeAllowance()?'尚未開始':remain<=0?`第 ${state.config.allowanceCycle} 期 · 已使用完畢`:`第 ${state.config.allowanceCycle} 期 · 已使用 ${usedPct}%`;
  return`<div class="page-stack">
    <section class="money-hero compact-hero">
      <div class="hero-top"><p class="hero-label">${activeAllowance()?'目前生活費餘額':'生活費尚未開始'}</p><span class="hero-period">記帳期 ${periodLabel(start,end)}</span></div>
      <div class="hero-money"><span>NT$</span><strong>${activeAllowance()?money(remain):'—'}</strong></div>
      <p class="hero-sub">${allowanceState}</p>
      <div class="progress-track"><i style="width:${usedPct}%"></i></div>
      <div class="hero-caption"><span>${activeAllowance()?`已使用 ${money(used)} / ${money(initial)}`:'尚未起算'}</span><span>記帳期剩 ${daysLeft} 天</span></div>
      <div class="hero-stats">
        <div class="hero-stat"><span>生活費每日可用</span><strong>${activeAllowance()?`NT$ ${money(daily)}`:'—'}</strong></div>
        <div class="hero-stat"><span>本期自費</span><strong>NT$ ${money(sum.self)}</strong></div>
        <div class="hero-stat"><span>今日已花</span><strong>NT$ ${money(today)}</strong></div>
      </div>
      ${!activeAllowance()
        ?'<button id="receiveAllowance" class="primary wide hero-action">我已收到第一筆 NT$ 8,000</button>'
        :remain<=0
          ?'<button id="receiveAllowance" class="allowance-refill">＋ 已收到下一筆 NT$ 8,000</button>'
          :''}
    </section>

    <section class="quick-card compact-quick">
      <div class="quick-head"><div><h2>今天花多少？</h2><p>輸入金額後點分類，就完成。</p></div><span class="badge">3 秒記帳</span></div>
      <label class="quick-amount"><span>NT$</span><input id="quickAmount" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0"></label>
      <div class="category-grid">${QUICK_CATEGORIES.map(k=>{const m=catMeta(k);return`<button class="category-btn" data-cat="${k}"><span class="cat-icon">${iconSvg(k)}</span><strong>${m.label}</strong></button>`}).join('')}</div>
      <div class="quick-actions"><button id="undoLast" class="secondary wide" ${l?'':'disabled'}>↶ 撤銷上一筆${l?` · ${catMeta(l.category).label} ${money(l.amount)}`:''}</button></div>
    </section>

    <div class="section-head"><div><h3>最近紀錄</h3><p>本期 ${rows.length} 筆</p></div><button class="ghost compact-link" id="goHistory">查看全部</button></div>
    <section class="recent-list">${rows.length?[...rows].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,3).map(txRow).join(''):'<div class="empty-card">本期還沒有支出。</div>'}</section>
  </div>`
}
function periodPage(){
  const rows=currentRows(),sum=totals(rows),cats=quickCategoryTotals(rows),max=Math.max(1,...cats.map(x=>x.amount));
  const {start,end}=periodBounds();
  const now=Date.now(),todayStart=new Date().setHours(0,0,0,0);
  const last7Start=todayStart-6*DAY,prev7Start=todayStart-13*DAY;
  const last7=rangeTotal(state.transactions,last7Start,now+DAY);
  const prev7=rangeTotal(state.transactions,prev7Start,last7Start);
  const elapsed=periodElapsedDays(),totalDays=periodTotalDays(),avg=sum.total/elapsed,forecast=Math.round(avg*totalDays);
  const daysLeft=daysLeftInPeriod();
  const dailyRemain=activeAllowance()?Math.floor((Number(state.config.allowanceRemaining)||0)/daysLeft):0;
  const last7Range=`${shortMD(new Date(last7Start))}–${shortMD(new Date(todayStart))}`;
  const crossesPeriod=last7Start<start.getTime();
  const forecastReady=elapsed>=7;
  return`<div class="page-stack">
    <div class="page-title-row"><div><h2>分析</h2><p>${periodLabel(start,end)}</p></div><span class="badge">本期</span></div>
    <section class="analysis-hero compact-analysis-hero"><p>本期已花</p><h2>NT$ ${money(sum.total)}</h2><p>${rows.length} 筆支出</p></section>
    <section class="metric-grid">
      <div class="metric-card"><span>近 7 日支出</span><strong>NT$ ${money(last7)}</strong><small>${last7Range}${crossesPeriod?' · 跨記帳期間':''}</small></div>
      <div class="metric-card"><span>${forecastReady?'本期預估':'本期日均'}</span><strong>NT$ ${money(forecastReady?forecast:avg)}</strong><small>${forecastReady?'依目前日均推算':`${elapsed} 天資料 · 滿 7 天後提供預估`}</small></div>
      <div class="metric-card"><span>生活費支出</span><strong class="positive">NT$ ${money(sum.allowance)}</strong><small>本記帳期內由生活費支付</small></div>
      <div class="metric-card"><span>自費支出</span><strong class="${sum.self>sum.allowance?'warning':''}">NT$ ${money(sum.self)}</strong><small>${sum.total?Math.round(sum.self/sum.total*100):0}% 本期支出</small></div>
    </section>
    <div class="section-head"><div><h3>花在哪裡？</h3><p>六類支出分布</p></div></div>
    <section class="bar-card">${cats.map(x=>`<div class="bar-row"><div class="bar-label"><span class="bar-name"><i class="bar-icon">${iconSvg(x.k)}</i>${x.label}</span><b>NT$ ${money(x.amount)}</b></div><div class="bar-track"><i style="width:${Math.round(x.amount/max*100)}%"></i></div><small>${sum.total?Math.round(x.amount/sum.total*100):0}%</small></div>`).join('')}</section>
    <div class="section-head"><div><h3>錢從哪裡出？</h3><p>生活費與自費拆分</p></div></div>
    <section class="source-grid"><div class="card"><span>生活費</span><strong>NT$ ${money(sum.allowance)}</strong><small>${sum.total?Math.round(sum.allowance/sum.total*100):0}%</small></div><div class="card"><span>自費</span><strong>NT$ ${money(sum.self)}</strong><small>${sum.total?Math.round(sum.self/sum.total*100):0}%</small></div></section>
    <section class="forecast-card"><div class="forecast-line"><span>本期已過</span><strong>${elapsed} / ${totalDays} 天</strong></div><div class="forecast-line"><span>目前日均支出</span><strong>NT$ ${money(avg)}</strong></div><div class="forecast-line"><span>生活費餘額 ÷ 記帳期剩餘天數</span><strong>${activeAllowance()?`NT$ ${money(dailyRemain)}`:'—'}</strong></div></section>
  </div>`
}
function settingsPage(){
  const lastSnapshot=(load('lazyLedgerGithubSnapshots',[]).slice(-1)[0]||{}).at;
  const snapshotText=lastSnapshot?new Date(lastSnapshot).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚無';
  const allowanceText=activeAllowance()?state.config.allowanceRemaining<=0?'已使用完畢':`剩餘 NT$ ${money(state.config.allowanceRemaining)}`:'尚未起算';
  return`<div class="page-stack">
    <div class="page-title-row"><div><h2>設定</h2><p>資料、週期與固定支出</p></div><span class="badge">v${APP_VERSION}</span></div>
    <section class="card settings-card allowance-settings compact-settings">
      <div class="setting-title"><div><span class="eyebrow">ALLOWANCE</span><h3>${activeAllowance()?`生活費第 ${state.config.allowanceCycle} 期`:'生活費尚未開始'}</h3></div><strong>${activeAllowance()?`${money(state.config.allowanceRemaining)} / ${money(state.config.allowanceInitial||8000)}`:'—'}</strong></div>
      <p class="allowance-state">${allowanceText}</p>
      <details class="rules-details"><summary>ⓘ 資金來源規則</summary><p>只有「食」與「住」會扣生活費；每筆付款當下即鎖定資金來源，不因之後收到生活費或刪除其他紀錄而回溯改列。</p></details>
      ${!activeAllowance()?'<button id="receiveAllowance" class="primary wide">我已收到第一筆 $8,000</button>':state.config.allowanceRemaining<=0?'<button id="receiveAllowance" class="primary wide">已收到下一筆 $8,000</button>':'<button class="secondary wide" disabled>生活費用完後才可領下一筆</button>'}
    </section>
    <section class="card settings-card compact-settings"><h3>記帳週期</h3><label class="setting"><span>每月起算日</span><input id="periodStartDay" type="number" min="1" max="28" value="${state.config.periodStartDay}"></label><button id="savePeriod" class="secondary wide">儲存起算日</button></section>
    <section class="card settings-card compact-settings"><div class="setting-title"><div><span class="eyebrow">AUTOMATION</span><h3>固定花費</h3></div><span class="badge">${state.config.recurring.length} 項</span></div><div class="rule-list">${state.config.recurring.length?state.config.recurring.map(r=>`<div class="rule-row"><div><strong>${esc(r.name)}</strong><small>${catMeta(r.category).label} · 每月 ${r.day} 日 · NT$ ${money(r.amount)}</small></div><button class="ghost danger" data-rule-del="${esc(r.id)}">刪除</button></div>`).join(''):'<p class="muted">沒有固定支出。</p>'}</div><form id="ruleForm" class="rule-form"><input id="ruleName" placeholder="名稱，例如：電費"><div class="two-col"><select id="ruleCategory">${QUICK_CATEGORIES.map(k=>`<option value="${k}">${catMeta(k).label}</option>`).join('')}</select><input id="ruleAmount" type="number" min="1" placeholder="金額"></div><div class="two-col"><input id="ruleDay" type="number" min="1" max="28" value="1"><button class="primary" type="submit">新增固定花費</button></div></form></section>
    <section class="card settings-card compact-settings"><div class="setting-title"><div><span class="eyebrow">DATA SAFE</span><h3>資料狀態</h3></div><span class="badge">本機</span></div><div class="data-status"><div><span>交易筆數</span><strong>${state.transactions.length} 筆</strong></div><div><span>最近快照</span><strong>${snapshotText}</strong></div><div><span>帳本資料</span><strong>正常</strong></div><div><span>資料版本</span><strong>v3.1</strong></div></div></section>
    <section class="card settings-card compact-settings"><div class="setting-title"><div><span class="eyebrow">BACKUP</span><h3>完整備份／匯入</h3></div><span class="badge">JSON</span></div><p class="muted">匯出包含目前帳本與安全快照；匯入前會再建立一份本機快照。</p><div class="actions"><button id="exportBackup" class="primary">匯出完整備份</button></div><input id="importBackupFile" class="file-input" type="file" accept=".json,application/json"><button id="importBackup" class="secondary wide">匯入備份</button></section>
    <section class="card settings-card compact-settings"><div class="setting-title"><div><span class="eyebrow">LOCAL ID</span><h3>帳本識別碼</h3></div></div><p class="muted">${showId?esc(ledgerId()):'lg-••••••••••••••••••••••••••••••••'}</p><button id="toggleId" class="ghost">${showId?'隱藏':'顯示'}</button></section>
  </div>`
}

const v31CheckpointKey='lazyLedgerUiV31Checkpoint';
if(!localStorage.getItem(v31CheckpointKey)){
  snapshot('before-ui-v3.1');
  localStorage.setItem(v31CheckpointKey,nowIso())
}
render();
