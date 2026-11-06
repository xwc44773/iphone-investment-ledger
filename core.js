// Independent phone ledger. No Mac imports, migration seeds, or remote API.
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function day(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('日期格式不正确');const d=new Date(s+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('日期不存在');return s}
export const addDays=(s,n)=>{day(s);const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const diffDays=(a,b)=>Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/86400000);
export function money(s){if(!/^\d+(\.\d{1,2})?$/.test(String(s).trim()))throw Error('请输入非负金额，最多两位小数');const [a,b='']=String(s).trim().split('.');const x=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(x>9000000000000n)throw Error('金额超出可记录范围');return Number(x)}
export function amount(x){if(!Number.isSafeInteger(x)||x<0||x>9000000000000)throw Error('金额数据不正确');return x}
export const fmt=x=>x==null?'待补充':new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(x/100);
export const inputMoney=x=>`${Math.floor(x/100)}.${String(x%100).padStart(2,'0')}`;
export const yieldAmount=(p,rate)=>{amount(p);const bp=money(rate);if(bp>100000)throw Error('单期收益率不能超过1000%');return amount(Number((BigInt(p)*BigInt(bp)+5000n)/10000n))};
export const uid=()=>globalThis.crypto.randomUUID();
export const blank=()=>({format:'independent-phone-ledger',version:1,revision:0,target:50000000,batches:[],events:[],debts:[],plans:[],audit:[],scenario:{enabled:false,days:null,rate:null,debtFirst:true}});
export const clone=s=>structuredClone(s);
function checkDate(d,asOf){day(d);if(d>asOf)throw Error('实际记录不能晚于今天；未来投资请记为计划')}
export function wallet(s,asOf=today()){
 const lots=new Map();for(const e of [...s.events].filter(e=>e.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='credit'?-1:1)-(b.type==='credit'?-1:1)||a.id.localeCompare(b.id))){
 if(e.type==='credit')lots.set(e.id,{id:e.id,source:e.source,amount:e.amount,date:e.date});
 else {for(const use of e.uses){const l=lots.get(use.lotId);if(!l||l.amount<use.amount)throw Error('资金来源不足、日期提前或同一资金已被使用');l.amount-=use.amount}}
 }return [...lots.values()].filter(l=>l.amount>0)
}
export function take(s,source,value,date){let left=amount(value);const uses=[];for(const l of wallet(s,date).filter(l=>l.source===source)){const n=Math.min(left,l.amount);if(n){uses.push({lotId:l.id,amount:n});left-=n}if(!left)break}if(left)throw Error(({principal:'收回的本金',profit:'收到的收益',own:'已确认可用余额'})[source]+'不足，不能提前使用或重复使用');return uses}
export function summary(s,date=today()){
 const lots=wallet(s,date),cash=lots.reduce((a,l)=>a+l.amount,0),batches=s.batches.filter(b=>b.date<=date&&!s.events.some(e=>e.role==='release'&&e.batchId===b.id&&e.date<=date));
 const invested=batches.reduce((a,b)=>a+b.principal,0),profit=s.events.filter(e=>e.role==='receipt'&&e.date<=date).reduce((a,e)=>a+e.amount,0);
 const debts=s.debts.filter(d=>d.date<=date).map(d=>({...d,balance:d.initial-s.events.filter(e=>e.debtId===d.id&&e.role==='repayment'&&e.date<=date).reduce((a,e)=>a+e.amount,0)}));
 return {lots,cash,invested,profit,pool:invested+cash,batches,debts,debt:debts.length?debts.reduce((a,d)=>a+d.balance,0):null,percent:Math.min(100,Number(BigInt(invested+cash)*10000n/BigInt(s.target))/100)}
}
function commit(s,n,action,at){validate(n,at);n.audit.push({id:uid(),date:at,action,previousRevision:s.revision});n.revision=s.revision+1;return n}
export function invest(s,x,at=today()){
 const n=clone(s),id=x.id||uid();checkDate(x.date,at);day(x.end);day(x.start||x.date);if((x.start||x.date)<x.date||x.end<(x.start||x.date))throw Error('结束日期不能早于开始日期');if(x.expectedDate&&day(x.expectedDate)<x.date)throw Error('预计到账日不能早于投入日');
 const principal=Object.values(x.funding).reduce((a,v)=>a+amount(v),0);if(principal<500000||principal%500000)throw Error('每笔至少5,000元，且必须是5,000元的整数倍');
 const before=n.batches.find(b=>b.id===id),keepFunding=before&&x.date===before.date&&['newOwn','principal','profit','own'].every(k=>(before.funding[k]||0)===(x.funding[k]||0));if(before){n.audit.push({id:uid(),date:at,action:'更正前投资记录',before:clone(before)});if(!keepFunding)n.events=n.events.filter(e=>!(e.batchId===id&&['funding','external'].includes(e.role)));n.batches=n.batches.filter(b=>b.id!==id)}
 const b={id,name:x.name||`投资 ${n.batches.length+1}`,date:x.date,start:x.start||x.date,end:x.end,principal,expected:x.expected==null?null:amount(x.expected),expectedDate:x.expectedDate||null,rate:x.rate??null,note:x.note||'',funding:x.funding};
 if(keepFunding){n.batches.push(b);return commit(s,n,'更正投资信息（保留原资金关联）',at)}
 if(x.funding.newOwn)n.events.push({id:'external:'+id,date:x.date,type:'credit',role:'external',source:'own',amount:x.funding.newOwn,batchId:id});
 const uses=[];for(const [key,source] of [['newOwn','own'],['principal','principal'],['profit','profit'],['own','own']])if(x.funding[key]){const held=uses.reduce((a,u)=>{a[u.lotId]=(a[u.lotId]||0)+u.amount;return a},{});const remaining=clone(n);for(const e of remaining.events)if(e.type==='credit')e.amount-=held[e.id]||0;if(key==='principal'&&x.principalLot){const l=wallet(remaining,x.date).find(l=>l.id===x.principalLot&&l.source==='principal');if(!l||l.amount<x.funding[key])throw Error('所选这笔收回本金不足，不能重复使用');uses.push({lotId:l.id,amount:x.funding[key]})}else uses.push(...take(remaining,source,x.funding[key],x.date))}
 n.batches.push(b);n.events.push({id:'funding:'+id,date:x.date,type:'debit',role:'funding',amount:principal,batchId:id,uses});return commit(s,n,before?'更正投资（保留审计）':'新增投资',at)
}
export function receipt(s,id,value,date,correction=false,at=today()){
 const n=clone(s),b=n.batches.find(b=>b.id===id);if(!b)throw Error('投资不存在');checkDate(date,at);if(date<b.date)throw Error('到账日不能早于投入日');amount(value);const old=n.events.find(e=>e.id==='receipt:'+id);if(old&&!correction)throw Error('这笔收益已确认，请使用更正到账记录');
 if(old){n.audit.push({id:uid(),date:at,action:'更正前到账记录',before:clone(old)});old.amount=value;old.date=date}else n.events.push({id:'receipt:'+id,date,type:'credit',role:'receipt',source:'profit',amount:value,batchId:id});return commit(s,n,old?'更正收益到账':'确认收益到账',at)
}
export function release(s,id,value,date,at=today(),correction=false){
 const n=clone(s),b=n.batches.find(b=>b.id===id);if(!b)throw Error('投资不存在');checkDate(date,at);if(date<b.date)throw Error('收回日不能早于投入日');amount(value);const old=n.events.find(e=>e.id==='release:'+id);if(old&&!correction)throw Error('本金已经确认收回，请使用修改收回记录');if(correction&&!old)throw Error('本金收回记录不存在');
 if(old){n.audit.push({id:uid(),date:at,action:'更正前本金收回记录',before:clone(old)});old.amount=value;old.date=date}else n.events.push({id:'release:'+id,date,type:'credit',role:'release',source:'principal',amount:value,batchId:id});return commit(s,n,old?'更正本金收回（不新增一笔）':'确认本金收回（按实际金额结清本批）',at)
}
export function addDebt(s,x,at=today()){const n=clone(s);amount(x.initial);amount(x.monthly);if(!x.name.trim()||!x.initial)throw Error('请填写债务名称和欠款金额');const old=x.id?n.debts.find(d=>d.id===x.id):null;if(x.id&&!old)throw Error('欠款记录不存在');if(old)n.audit.push({id:uid(),date:at,action:'更正前欠款设置',before:clone(old)});const d={id:old?.id||uid(),name:x.name,initial:x.initial,monthly:x.monthly,payDay:x.payDay||28,date:old?.date||at};if(old)n.debts[n.debts.indexOf(old)]=d;else n.debts.push(d);return commit(s,n,old?'更正欠款设置':'新增债务',at)}
export function spend(s,x,at=today()){
 const n=clone(s);checkDate(x.date,at);if(!amount(x.amount))throw Error('请输入大于零的金额');if(!['repayment','expense'].includes(x.role))throw Error('请选择还款或生活支出');const old=x.id?n.events.find(e=>e.id===x.id&&['repayment','expense'].includes(e.role)):null;if(x.id&&!old)throw Error('原记录不存在');
 const id=old?.id||uid();if(old){const external=n.events.find(e=>e.id==='external:'+id);n.audit.push({id:uid(),date:at,action:'更正前还款或支出',before:clone(old),externalBefore:external?clone(external):null});n.events=n.events.filter(e=>e.id!==id&&e.id!=='external:'+id)}
 if(x.role==='repayment'){const d=summary(n,x.date).debts.find(d=>d.id===x.debtId)||(old&&old.debtId===x.debtId?n.debts.find(d=>d.id===x.debtId):null);if(!d||x.amount>d.balance)throw Error('还款不能超过该项剩余欠款');if(x.date<d.date&&!old)throw Error('还款日期不能早于本次欠款余额的建立日')}
 if(x.source==='newOwn')n.events.push({id:'external:'+id,type:'credit',role:'external',source:'own',amount:x.amount,date:x.date});
 const uses=take(n,x.source==='newOwn'?'own':x.source,x.amount,x.date);n.events.push({id,date:x.date,type:'debit',role:x.role,amount:x.amount,debtId:x.role==='repayment'?x.debtId:null,uses,note:x.note||''});return commit(s,n,old?'更正还款或支出（不新增一笔）':x.role==='repayment'?'记录实际还款':'记录生活支出',at)
}
export function addPlan(s,x,at=today()){const n=clone(s);day(x.date);day(x.end);if(x.date<=at)throw Error('未来投资计划请选择明天或之后；已投入的钱请记为新增投资');if(x.end<x.date||x.principal<500000||x.principal%500000)throw Error('计划日期或5,000元整数倍金额不正确');const old=x.id?n.plans.find(p=>p.id===x.id):null;if(x.id&&!old)throw Error('计划不存在');if(old){n.audit.push({id:uid(),date:at,action:'更正前投资计划',before:clone(old)});n.plans=n.plans.filter(p=>p.id!==old.id)}n.plans.push({id:old?.id||uid(),name:x.name||'投资计划',date:x.date,end:x.end,principal:amount(x.principal),expected:x.expected==null?null:amount(x.expected)});return commit(s,n,old?'更正未来计划':'建立未来计划',at)}
export function cancelPlan(s,id,at=today()){const n=clone(s);n.plans=n.plans.filter(p=>p.id!==id);return commit(s,n,'取消计划',at)}
export function settings(s,x,at=today()){const n=clone(s);if(x.target!=null){if(!amount(x.target))throw Error('目标需大于零');n.target=x.target}if(x.scenario)n.scenario={...x.scenario};return commit(s,n,'修改目标或试算设置',at)}
export function validate(s,at=today()){
 if(!s||s.format!=='independent-phone-ledger'||s.version!==1)throw Error('这不是兼容的手机版完整备份');for(const k of ['batches','events','debts','plans','audit'])if(!Array.isArray(s[k])||s[k].length>50000)throw Error('备份内容不完整或过大');amount(s.target);if(!s.target||!Number.isSafeInteger(s.revision)||s.revision<0)throw Error('目标或版本不正确');
 if(s.events.reduce((n,e)=>n+BigInt(amount(e.amount)),0n)>9000000000000n)throw Error('累计金额超出安全记录范围');
 const ids=new Set();for(const o of [...s.batches,...s.events,...s.debts,...s.plans,...s.audit]){if(typeof o.id!=='string'||!o.id||ids.has(o.id))throw Error('记录编号重复或缺失');ids.add(o.id)}
 for(const b of s.batches){amount(b.principal);day(b.date);day(b.start);day(b.end);if(b.date>at||b.start<b.date||b.end<b.start||b.principal<500000||b.principal%500000)throw Error('投资金额或日期不正确');if(b.expected!=null)amount(b.expected);if(b.expectedDate&&day(b.expectedDate)<b.date)throw Error('预计日期不正确');if(Object.values(b.funding).reduce((a,v)=>a+amount(v),0)!==b.principal)throw Error('投资来源合计不一致');const f=s.events.filter(e=>e.role==='funding'&&e.batchId===b.id);if(f.length!==1||f[0].amount!==b.principal||f[0].date!==b.date)throw Error('投资资金关联不完整');if(Object.keys(b.funding).some(k=>!['newOwn','own','principal','profit'].includes(k)))throw Error('投资来源类型不正确');const external=s.events.filter(e=>e.role==='external'&&e.batchId===b.id);if(b.funding.newOwn?external.length!==1||external[0].id!=='external:'+b.id||external[0].amount!==b.funding.newOwn||external[0].date!==b.date:external.length)throw Error('新增自有资金关联不一致');const used={own:0,principal:0,profit:0};for(const u of f[0].uses||[]){const credit=s.events.find(e=>e.id===u.lotId&&e.type==='credit');if(!credit||!(credit.source in used))throw Error('投资来源关联不存在');used[credit.source]+=amount(u.amount)}if(used.own!==(b.funding.newOwn||0)+(b.funding.own||0)||used.principal!==(b.funding.principal||0)||used.profit!==(b.funding.profit||0))throw Error('投资来源拆分与实际资金使用不一致')}
 for(const e of s.events){amount(e.amount);checkDate(e.date,at);if(e.batchId&&!s.batches.some(b=>b.id===e.batchId&&e.date>=b.date))throw Error('资金事件关联错误');if(e.type==='credit'){if(!['own','profit','principal'].includes(e.source)||!['external','receipt','release'].includes(e.role))throw Error('入账类型错误');if(e.source!==({external:'own',receipt:'profit',release:'principal'})[e.role])throw Error('资金来源类别与事件不一致');if(e.role!=='external'&&(!e.batchId||e.id!==e.role+':'+e.batchId))throw Error('到账记录重复或关联不正确')}else if(e.type==='debit'){if(!['funding','expense','repayment'].includes(e.role)||!Array.isArray(e.uses)||!e.uses.length)throw Error('资金用途错误');if(new Set(e.uses.map(u=>u.lotId)).size!==e.uses.length)throw Error('同一资金被重复引用');if(e.uses.reduce((a,u)=>a+amount(u.amount),0)!==e.amount)throw Error('资金使用合计不一致');if(e.role==='funding'&&(!e.batchId||e.id!=='funding:'+e.batchId))throw Error('投资资金缺少正确关联');if(e.role==='repayment'&&!s.debts.some(d=>d.id===e.debtId))throw Error('还款缺少债务关联')}else throw Error('资金事件类型错误')}
 for(const d of s.debts){amount(d.initial);amount(d.monthly);checkDate(d.date,at);if(!d.name||!Number.isInteger(d.payDay)||d.payDay<1||d.payDay>28)throw Error('债务资料不正确');if(s.events.filter(e=>e.debtId===d.id&&e.role==='repayment').reduce((a,e)=>a+e.amount,0)>d.initial)throw Error('还款超过欠款')}
 for(const p of s.plans){amount(p.principal);day(p.date);day(p.end);if(p.end<p.date||p.principal<500000||p.principal%500000)throw Error('计划资料错误');if(p.expected!=null)amount(p.expected)}
 if(!s.scenario||typeof s.scenario.enabled!=='boolean'||typeof s.scenario.debtFirst!=='boolean')throw Error('试算设置错误');if(s.scenario.days!=null&&(!Number.isInteger(s.scenario.days)||s.scenario.days<1||s.scenario.days>3650))throw Error('投资周期需为1至3650天');if(s.scenario.rate!=null)yieldAmount(10000,String(s.scenario.rate));wallet(s,at);return s
}
function remainingMonthlyPayment(s,d,date){const paid=s.events.filter(e=>e.role==='repayment'&&e.debtId===d.id&&e.date<=date&&e.date.slice(0,7)===date.slice(0,7)).reduce((n,e)=>n+e.amount,0);return Math.min(Math.max(0,d.monthly-paid),d.balance)}
export function reminders(s,at=today()){
 const list=[];for(const b of s.batches.filter(b=>b.date<=at)){if(b.end<=at&&!s.events.some(e=>e.role==='release'&&e.batchId===b.id&&e.date<=at))list.push({type:'release',id:b.id,title:'本金到期待确认',date:b.end,name:b.name});if(!s.events.some(e=>e.role==='receipt'&&e.batchId===b.id&&e.date<=at)&&b.expectedDate&&b.expectedDate<=at)list.push({type:'receipt',id:b.id,title:b.expectedDate<at?'分红逾期待确认':'今天分红应到账',date:b.expectedDate,name:b.name})}
 for(const d of summary(s,at).debts){const remaining=remainingMonthlyPayment(s,d,at);if(remaining&&Number(at.slice(8))>=d.payDay-3)list.push({type:'repayment',id:d.id,title:'本月还款待记录',name:d.name+' · 本月还需 '+fmt(remaining),date:at.slice(0,8)+String(d.payDay).padStart(2,'0')})}return list
}
export function forecast(s,at=today()){
 const base=summary(s,at),enabled=s.scenario.enabled,complete=s.scenario.days&&s.scenario.rate!=null,missing=[];
 if(!enabled||!complete)missing.push('打开试算并填写投资天数和单期收益率，才会估算后续新投资收益');
 const months=Array.from({length:12},(_,i)=>{const d=new Date(at.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+i);return {month:d.toISOString().slice(0,7),actual:0,planned:0,simulated:0,income:0,repayment:0,required:0,total:null,gap:0,candidate:0}});
 let cash={own:0,principal:0,profit:0};for(const l of base.lots)cash[l.source]+=l.amount;let invested=base.invested;months[0].total=base.pool;const debts=base.debts.map(d=>({...d}));let payoff=debts.length&&debts.every(d=>!d.balance)?at.slice(0,7):null;
 const queue=new Map();function schedule(date,e){if(date<=at){missing.push('有逾期未确认资金，实际到账时间待核对');return}if(date.slice(0,7)>months.at(-1).month)return;if(!queue.has(date))queue.set(date,[]);queue.get(date).push(e)}
 for(const b of base.batches)schedule(addDays(b.end,1),{kind:'release',amount:b.principal});
 for(const b of s.batches)if(!s.events.some(e=>e.role==='receipt'&&e.batchId===b.id)&&b.expected!=null){if(b.expectedDate)schedule(b.expectedDate,{kind:'profit',amount:b.expected});else missing.push('有预计收益未填写到账日，该收益未安排到具体月份')}
 for(const p of s.plans)if(p.date>at)schedule(p.date,{kind:'plan',plan:p});else missing.push('有今日或已过期投资计划待确认，请记录实际投资或取消计划');
 for(const m of months){m.actual=s.batches.filter(b=>b.date.slice(0,7)===m.month).reduce((a,b)=>a+b.principal,0)}
 const end=addDays(months.at(-1).month+'-01',32).slice(0,7)+'-01';
 function available(){return cash.own+cash.principal+cash.profit}function use(value,allowProfit=true){for(const k of ['principal','own',...(allowProfit?['profit']:[])]){const n=Math.min(cash[k],value);cash[k]-=n;value-=n}if(value)throw Error('预测资金不足')}
 for(let date=addDays(at,1);date<end;date=addDays(date,1)){
  const m=months.find(m=>m.month===date.slice(0,7));if(!m)break;
  for(const e of (queue.get(date)||[]).filter(e=>e.kind!=='plan')){if(e.kind==='release'){invested-=e.amount;cash.principal+=e.amount}else{cash.profit+=e.amount;m.income+=e.amount}}
  for(const d of debts)if(Number(date.slice(8))===d.payDay&&date>=d.date){const need=remainingMonthlyPayment(s,d,date);m.required+=need;const pay=Math.min(need,cash.profit);d.balance-=pay;cash.profit-=pay;m.repayment+=pay}
  const debtRemaining=debts.reduce((a,d)=>a+d.balance,0);if(debts.length&&!debtRemaining&&!payoff)payoff=date.slice(0,7);
  m.candidate=Math.max(m.candidate,Math.floor((cash.principal+cash.own+((!s.scenario.debtFirst||!debtRemaining)?cash.profit:0))/500000)*500000);
  for(const e of (queue.get(date)||[]).filter(e=>e.kind==='plan')){const p=e.plan;m.planned+=p.principal;if(available()<p.principal){m.gap+=p.principal-available();missing.push('已建投资计划资金不足，未执行该计划');continue}use(p.principal);invested+=p.principal;schedule(addDays(p.end,1),{kind:'release',amount:p.principal});if(p.expected!=null)schedule(addDays(p.end,1),{kind:'profit',amount:p.expected})}
  if(enabled&&complete){const reserved=s.plans.filter(p=>p.date>date&&p.date<=addDays(date,Number(s.scenario.days))).reduce((n,p)=>n+p.principal,0);const spendable=Math.max(0,cash.principal+cash.own+((!s.scenario.debtFirst||!debtRemaining)?cash.profit:0)-reserved);const p=Math.floor(spendable/500000)*500000;if(p){let gain;try{gain=yieldAmount(p,String(s.scenario.rate));if(gain+invested+available()>9000000000000)throw Error('上限')}catch{missing.push('试算增长超过安全上限，请缩小收益假设');break}use(p,!s.scenario.debtFirst||!debtRemaining);invested+=p;m.simulated+=p;const due=addDays(date,Number(s.scenario.days));schedule(due,{kind:'release',amount:p});schedule(due,{kind:'profit',amount:gain})}}
  if(invested+available()>9000000000000){missing.push('试算增长超过安全上限，请缩小收益假设');break}
  m.total=invested+available();
 }
 const uncertain=missing.some(x=>x.includes('逾期')||x.includes('计划资金不足')||x.includes('上限')||x.includes('计划待确认'));if(uncertain)for(const m of months)m.total=null;
 return {months,missing:[...new Set(missing)],payoff:uncertain?null:payoff,uncertain,complete:!!(enabled&&complete)}
}
