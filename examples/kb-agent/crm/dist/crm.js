"use strict";(()=>{var r=e=>{let n=document.getElementById(e);if(n===null)throw new Error(`#${e} missing`);return n},a=e=>String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"),c=e=>`\xA5${String(Math.round(e*100)/100)}`,$=new URLSearchParams(new URL(document.baseURI).search),b="CRM_TOKEN";$.get("token")!==null&&$.get("token")!==""&&localStorage.setItem(b,$.get("token")??"");var E=()=>localStorage.getItem(b)??"",g="",u=null,T=[],f=[],h=[],p=e=>{let n=r("error");n.textContent=e,n.style.display="block",window.setTimeout(()=>{n.style.display="none"},12e3)},S=e=>{let n=r("ok");n.textContent=e,n.style.display="block",window.setTimeout(()=>{n.style.display="none"},8e3)},m=async(e,n,t)=>{let s=await fetch(e,{method:n,headers:{...t===void 0?{}:{"content-type":"application/json"},authorization:`Bearer ${E()}`},body:t===void 0?void 0:JSON.stringify(t)}),o=await s.json().catch(()=>({ok:!1,error:`HTTP ${String(s.status)}`}));if(s.status===401)throw y(),new Error(o.error??"\u672A\u7B7E\u5230\u6216\u4F1A\u8BDD\u8FC7\u671F\u2014\u2014\u8BF7\u5148\u7B7E\u5230");if(!s.ok||o.ok===!1)throw new Error(o.error??`HTTP ${String(s.status)}`);return o},y=()=>{for(let e of["pipe-view","cust-view","quote-view"])r(e).classList.remove("on");r("login-view").classList.add("on"),r("auth-btn").textContent="\u7B7E\u5230"},_=()=>{let e=r("who"),n=r("auth-btn");if(g===""){e.textContent="",n.textContent="\u7B7E\u5230";return}e.textContent=`\u9500\u552E\u5DE5\u4F5C\u53F0\uFF1A${g}`,n.textContent="\u9000\u51FA"};r("auth-btn").addEventListener("click",()=>{localStorage.removeItem(b),g="",_(),y()});r("login-btn").addEventListener("click",async()=>{let e=(r("login-account").value??"").trim(),n=r("login-password").value??"";if(e===""||n===""){p("\u7B7E\u5230\u9700\u8981\u8D26\u53F7\u4E0E\u5BC6\u7801");return}try{let t=await fetch("/terminal/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account:e,password:n})}),s=await t.json().catch(()=>({ok:!1,error:`HTTP ${String(t.status)}`}));if(!t.ok||s.ok!==!0)throw new Error(s.error??"\u7B7E\u5230\u5931\u8D25");localStorage.setItem(b,s.token??""),g=s.username??e,_(),await k()}catch(t){p(t.message)}});for(let e of Array.from(r("nav").querySelectorAll("button")))e.addEventListener("click",()=>{for(let t of Array.from(r("nav").querySelectorAll("button")))t.classList.toggle("active",t===e);let n=String(e.dataset.view??"");for(let t of["pipe-view","cust-view","quote-view"])r(t).classList.toggle("on",t===n)});var k=async()=>{r("login-view").classList.remove("on"),r("pipe-view").classList.add("on"),await q(),await Promise.all([C(),x(),j()])},q=async()=>{let e=await m("/crm/pipe.json","GET");u=e,e.operator!==void 0&&e.operator!==""&&(g=e.operator),_(),P()},P=()=>{if(u===null)return;r("pipe-stats").innerHTML=`
    <div class="stat"><span>\u5728\u9014\u5546\u673A\uFF08\u8BE2\u4EF7/\u62A5\u4EF7/\u8C08\u5224\uFF09</span><b>${String(u.cards.filter(t=>["inquiry","quote","negotiation"].includes(t.stage)).length)}</b></div>
    <div class="stat"><span>\u5728\u9014\u603B\u91D1\u989D</span><b>${a(c(u.open_amount))}</b></div>
    <div class="stat hl"><span>\u52A0\u6743\u7BA1\u9053 \u03A3(\u91D1\u989D\xD7\u6982\u7387)</span><b>${a(c(u.weighted_total))}</b></div>
    <div class="stat"><span>\u7D2F\u8BA1\u8D62\u5355</span><b>${String(u.won_count)}</b></div>`;let e=new Map(u.probability_legend.map(t=>[t.key,t.probability])),n=r("board");n.innerHTML="";for(let t of u.columns){let s=document.createElement("section");s.className="col",s.dataset.stage=t.key,s.innerHTML=`
      <h3><span>${a(t.label)} <span class="n">${String(t.count)}</span></span><span class="hint">${String(e.get(t.key)??0)}%</span></h3>
      <div class="sum">\u03A3\u91D1\u989D ${a(c(t.amount_sum))} \xB7 \u52A0\u6743 ${a(c(t.weighted))}</div>`;for(let o of u.cards.filter(l=>l.stage===t.key)){let l=document.createElement("article");l.className="kcard",l.draggable=!0,l.dataset.dealId=String(o.id);let i=o.dwell_days===null?"":`<span class="dwell ${o.dwell_days>=14?"old":""}">\u6EDE\u7559 ${String(o.dwell_days)} \u5929</span>`;l.innerHTML=`
        <div class="name">${a(o.name)}</div>
        <div class="cust">${a(o.customer)}</div>
        <div class="amount">${a(c(o.amount))}</div>
        <div class="meta"><span>\u8D1F\u8D23\u4EBA ${a(o.owner)}</span><span>\u9884\u8BA1\u6210\u4EA4 ${a(o.expected_close_date===""?"\u2014":o.expected_close_date)}</span>${i}</div>`,l.addEventListener("dragstart",M=>{let L=M;L.dataTransfer?.setData("text/deal-id",String(o.id)),L.dataTransfer?.setData("text/plain",String(o.id)),l.classList.add("dragging")}),l.addEventListener("dragend",()=>{l.classList.remove("dragging")}),s.append(l)}s.addEventListener("dragover",o=>{o.preventDefault(),s.classList.add("over")}),s.addEventListener("dragleave",()=>{s.classList.remove("over")}),s.addEventListener("drop",o=>{o.preventDefault(),s.classList.remove("over");let l=o,i=Number(l.dataTransfer?.getData("text/deal-id")??l.dataTransfer?.getData("text/plain")??"0");!Number.isInteger(i)||i<=0||N(i,t.key)}),n.append(s)}},N=async(e,n)=>{try{let t=await m("/crm/move","POST",{deal_id:e,to_stage:n});S(`\u5546\u673A ${String(e)} \u5DF2\u8FC1\u79FB ${t.from_stage} \u2192 ${t.to_stage}\uFF08\u6982\u7387\u56DE\u5199 ${String(t.probability)}%\uFF0C\u5BA1\u8BA1\u5DF2\u843D crm_stage_audit\uFF09`),await q()}catch(t){p(t.message)}},C=async()=>{T=(await m("/crm/customers.json","GET")).customers;let n=r("cust-picker");n.innerHTML=T.map(t=>`<option value="${String(t.id)}">${a(t.name)}\uFF08${a(t.level)} \u7EA7 \xB7 \u5728\u9014 ${String(t.open_deals)}\uFF09</option>`).join("")};r("cust-load").addEventListener("click",()=>{H(Number(r("cust-picker").value||"0"))});r("cust-picker").addEventListener("change",()=>{H(Number(r("cust-picker").value||"0"))});var H=async e=>{if(!(!Number.isInteger(e)||e<=0))try{let n=await m(`/crm/customer.json?id=${String(e)}`,"GET");A(n)}catch(n){p(n.message)}},v=e=>`<span class="chip ${{approved:"green",shipped:"green",converted:"blue",accepted:"green",received:"green",fulfilled:"green",pending_level1:"orange",pending_level2:"orange",pending_approval:"orange",sent:"blue",draft:"",pending:"orange",rejected:"red",void:"red",cancelled:"red",lost:"red"}[e]??""}">${a(e)}</span>`,A=e=>{let n=e.customer,t=e.deals.length===0?'<div class="hint">\u65E0\u5728\u9014\u5546\u673A</div>':e.deals.map(i=>`<div class="row"><span>${a(i.name)} ${v(i.stage==="won"||i.stage==="lost"?i.stage:"")}</span><span class="r">${a(c(i.amount))} \xB7 ${a(i.stage)} \xB7 ${a(i.owner)} \xB7 \u9884\u8BA1 ${a(i.expected_close_date===""?"\u2014":i.expected_close_date)}</span></div>`).join(""),s=e.orders.length===0?'<div class="hint">\u65E0\u8BA2\u5355</div>':e.orders.map(i=>`<div class="row"><span>${a(i.code)} ${v(i.doc_status)}${i.shipped_at===""?"":v("shipped")}</span><span class="r">${a(c(i.amount))} \xB7 \u4EA4\u671F ${a(i.need_date===""?"\u2014":i.need_date)}</span></div>`).join(""),o=e.quotes.length===0?'<div class="hint">\u65E0\u62A5\u4EF7</div>':e.quotes.map(i=>`<div class="row"><span>${a(i.quote_number)} ${v(i.status)}</span><span class="r">${a(c(i.total))}${i.converted_so_code===""?"":` \u2192 \u5DF2\u8F6C ${a(i.converted_so_code)}`}</span></div>`).join(""),l=e.timeline.length===0?'<li><span class="hint">\u6682\u65E0\u53EF\u8FFD\u6EAF\u8282\u70B9\uFF08\u62A5\u4EF7/\u8BA2\u5355/\u53D1\u8D27/\u6536\u6B3E\u5747\u9700\u771F\u5B9E\u65E5\u671F\u5217\uFF09</span></li>':e.timeline.map(i=>`<li class="k-${a(i.kind)}"><div class="d">${a(i.date)} \xB7 ${a(i.label)}</div><div class="x">${a(i.detail)}</div></li>`).join("");r("cust-detail").innerHTML=`
  <div class="statrow">
    <div class="stat"><span>\u5728\u9014\u5546\u673A</span><b>${String(e.counts.deals_open)} \xB7 ${a(c(e.counts.deals_amount))}</b></div>
    <div class="stat"><span>\u8BA2\u5355\u6570\uFF08\u5168\u90E8\u72B6\u6001\uFF09</span><b>${String(e.counts.orders)}</b></div>
    <div class="stat hl"><span>\u5E94\u6536\u4F59\u989D\uFF08ar_overdue \u53E3\u5F84\uFF09</span><b>${a(c(e.ar_balance))}</b></div>
    <div class="stat"><span>\u5DF2\u56DE\u6B3E\u5408\u8BA1</span><b>${a(c(e.received_total))}</b></div>
    <div class="stat"><span>\u62A5\u4EF7\uFF08\u73B0\u884C\u7248\uFF09</span><b>${String(e.counts.quotes)}</b></div>
  </div>
  <div class="grid2">
    <div>
      <div class="card">
        <h4>\u57FA\u672C\u4FE1\u606F</h4>
        <div class="kv">
          <b>\u5BA2\u6237\u540D\u79F0</b><span>${a(n.name)}</span>
          <b>\u7C7B\u578B / \u884C\u4E1A / \u5730\u533A</b><span>${a(n.type)} / ${a(n.industry)} / ${a(n.country)}</span>
          <b>\u7B49\u7EA7 / \u72B6\u6001</b><span><span class="chip blue">${a(n.level)} \u7EA7</span><span class="chip ${n.status==="active"?"green":""}">${a(n.status)}</span></span>
        </div>
      </div>
      <div class="card">
        <h4>\u5728\u9014\u5546\u673A</h4>
        ${t}
      </div>
      <div class="card">
        <h4>\u5386\u53F2\u8BA2\u5355\uFF08so_orders\uFF09</h4>
        ${s}
      </div>
      <div class="card">
        <h4>\u62A5\u4EF7\u5386\u53F2</h4>
        ${o}
      </div>
    </div>
    <div class="card">
      <h4>\u4EA4\u5F80\u65F6\u95F4\u7EBF\uFF08\u62A5\u4EF7 \u2192 \u8BA2\u5355 \u2192 \u53D1\u8D27 \u2192 \u6536\u6B3E\uFF09</h4>
      <ul class="tl">
        ${l}
      </ul>
    </div>
  </div>`},x=async()=>{f=(await m("/crm/quotes.json","GET")).quotes,D()},j=async()=>{h=(await m("/crm/products.json","GET")).products},D=()=>{r("quote-list").innerHTML=`
  <div class="hint" style="margin-bottom:10px">\u8F6C\u5355\u8D70\u670D\u52A1\u7AEF\u53D1\u53F7\uFF08SO-YYYY-NNNN\uFF09\u5E76\u6309\u914D\u7F6E\u63D0\u4EA4\u9500\u552E\u8BA2\u5355\u5BA1\u6279\u6D41\uFF1B\u4E00\u5F20\u62A5\u4EF7\u53EA\u80FD\u8F6C\u4E00\u6B21\uFF08converted_so_code \u5E42\u7B49\u95F8\uFF09\uFF0C\u91CD\u590D\u8F6C\u5355\u4F1A\u88AB\u62D2\u7EDD\u5E76\u56DE\u663E\u5DF2\u8F6C\u5355\u53F7\u3002</div>
  ${f.map(e=>{let n=e.valid_until===""?"":` \xB7 \u6709\u6548\u671F\u81F3 ${a(e.valid_until)}`,t=e.converted_so_code!==""?`<span class="chip blue">\u5DF2\u8F6C ${a(e.converted_so_code)}</span>`:e.convertible?'<button class="go" type="button">\u4E00\u952E\u8F6C\u9500\u552E\u8BA2\u5355</button>':'<span class="chip red">\u4E0D\u53EF\u8F6C\uFF08\u72B6\u6001\uFF09</span>';return`
  <div class="qcard" data-quote-id="${String(e.id)}">
    <span class="no">${a(e.quote_number)}</span>
    ${v(e.status)}
    <span class="meta">${a(e.customer)}${e.deal===""?"":` \xB7 ${a(e.deal)}`} \xB7 ${a(c(e.total))}${n}</span>
    ${t}
  </div>`}).join("")}`;for(let e of Array.from(r("quote-list").querySelectorAll("button.go")))e.addEventListener("click",()=>{let n=e.closest(".qcard"),t=Number(n?.dataset.quoteId??"0"),s=f.find(o=>o.id===t);s!==void 0&&I(s)})},d=null,I=e=>{d={quote:e,needDate:e.valid_until===""?"":e.valid_until,lines:[],busy:!1},w()},w=()=>{let e=d;if(e===null)return;let n=e.lines.length>0?e.lines.reduce((s,o)=>s+(Number(o.qty)||0)*(Number(o.unit_price)||0),0):e.quote.total;r("dlg-mount").innerHTML=`
  <div class="dialog" id="cv-dlg">
    <div class="box card" style="margin-bottom:0">
      <h4>\u62A5\u4EF7\u8F6C\u9500\u552E\u8BA2\u5355 \u2014\u2014 ${a(e.quote.quote_number)}\uFF08${a(e.quote.customer)}\uFF09</h4>
      <div class="kv" style="margin-bottom:8px">
        <b>\u62A5\u4EF7\u91D1\u989D</b><span>${a(c(e.quote.total))}</span>
        <b>\u9700\u6C42\u65E5\u671F need_date</b><span><input id="cv-need" type="date" value="${a(e.needDate)}" /></span>
      </div>
      <div class="hint" style="margin-bottom:6px">\u4EA7\u54C1\u884C\uFF08\u53EF\u9009\u2014\u2014\u7559\u7A7A\u5219\u6309\u62A5\u4EF7\u603B\u989D\u751F\u6210\u5355\u5934\uFF1B\u586B\u5199\u5219\u91D1\u989D=\u03A3\u6570\u91CF\xD7\u5355\u4EF7\uFF09\uFF1A</div>
      <div id="cv-lines">${e.lines.map((s,o)=>`
        <div class="lrow" data-i="${String(o)}">
          <select class="cv-p" style="flex:1 1 220px">${h.map(l=>`<option value="${String(l.id)}" ${l.id===s.product_id?"selected":""}>${a(l.name)}</option>`).join("")}</select>
          <input class="cv-q" type="number" min="0" step="any" placeholder="\u6570\u91CF" value="${a(s.qty)}" style="width:110px" />
          <input class="cv-u" type="number" min="0" step="any" placeholder="\u5355\u4EF7" value="${a(s.unit_price)}" style="width:110px" />
          <button class="ghost" type="button" data-del="${String(o)}">\u5220\u884C</button>
        </div>`).join("")}</div>
      <div class="actions" style="display:flex;gap:8px;margin-top:8px">
        <button class="ghost" type="button" id="cv-add">\uFF0B \u52A0\u4E00\u884C</button>
        <button class="primary" type="button" id="cv-go" ${e.busy?"disabled":""}>\u786E\u8BA4\u8F6C\u5355\uFF08\u91D1\u989D ${a(c(n))}\uFF09</button>
        <button class="ghost" type="button" id="cv-cancel">\u53D6\u6D88</button>
      </div>
      <div class="hint" style="margin-top:8px">\u8F6C\u5355\u540E\uFF1A\u62A5\u4EF7\u6807\u8BB0 converted\uFF08\u5DF2\u8F6C\u5355\u53F7\u56DE\u5199\uFF09\u3001\u751F\u6210 so_orders \u8349\u7A3F\u5E76\u6309\u914D\u7F6E\u63D0\u4EA4\u5BA1\u6279\u6D41\uFF1B\u540C\u5355\u4E8C\u6B21\u8F6C\u5355\u5C06\u88AB\u5E42\u7B49\u62D2\u7EDD\u3002</div>
    </div>
  </div>`;let t=()=>{if(d!==null)for(let s of Array.from(r("cv-lines").querySelectorAll(".lrow"))){let o=Number(s.dataset.i),l=d.lines[o];l!==void 0&&(l.product_id=Number(s.querySelector(".cv-p")?.value??"0"),l.qty=s.querySelector(".cv-q")?.value??"",l.unit_price=s.querySelector(".cv-u")?.value??"")}};r("cv-add").addEventListener("click",()=>{t();let s=h[0];d?.lines.push({product_id:s===void 0?0:s.id,qty:"",unit_price:""}),w()});for(let s of Array.from(r("dlg-mount").querySelectorAll("button[data-del]")))s.addEventListener("click",()=>{t();let o=Number(s.dataset.del);d!==null&&(d.lines=d.lines.filter((l,i)=>i!==o)),w()});r("cv-need").addEventListener("change",()=>{d!==null&&(d.needDate=(r("cv-need").value??"").trim())}),r("cv-cancel").addEventListener("click",()=>{r("dlg-mount").innerHTML="",d=null}),r("cv-go").addEventListener("click",()=>{O()})},O=async()=>{let e=d;if(e===null||e.busy)return;R();let n=e.lines.map(t=>({product_id:t.product_id,qty:Number(t.qty),unit_price:Number(t.unit_price)})).filter(t=>t.qty>0);e.busy=!0,r("cv-go").disabled=!0;try{let t=await m("/crm/quote-to-so","POST",{quote_id:e.quote.id,need_date:e.needDate,lines:n});t.refused?p(`\u62D2\u7EDD\u8F6C\u5355\uFF1A${t.duplicate?`\u8BE5\u62A5\u4EF7\u5DF2\u8F6C\u5355\uFF08${t.existing_so_code===""?"\u5DF2 converted":t.existing_so_code}\uFF09\u2014\u2014\u5E42\u7B49\u95F8\u751F\u6548\uFF0C\u672A\u91CD\u590D\u751F\u6210 SO`:"\u72B6\u6001\u4E0D\u53EF\u8F6C"}`):S(`\u5DF2\u751F\u6210\u9500\u552E\u8BA2\u5355 ${t.so_code??""}\uFF08\u91D1\u989D ${c(t.amount??0)}${(t.lines??0)>0?` \xB7 \u4EA7\u54C1\u884C ${String(t.lines??0)}`:""}\uFF09${t.submitted_to===void 0?" \xB7 \u5BA1\u6279\u6D41\u672A\u914D\u7F6E\uFF0C\u4FDD\u7559\u8349\u7A3F":` \xB7 \u5DF2\u63D0\u4EA4\u5BA1\u6279\uFF08\u5F53\u524D\u6001 ${t.submitted_to}\uFF09`}`),r("dlg-mount").innerHTML="",d=null,await x()}catch(t){p(t.message),d!==null&&(d.busy=!1);let s=document.getElementById("cv-go");s!==null&&(s.disabled=!1)}},R=()=>{let e=d;if(e!==null)for(let n of Array.from(document.querySelectorAll("#cv-lines .lrow"))){let t=Number(n.dataset.i),s=e.lines[t];s!==void 0&&(s.product_id=Number(n.querySelector(".cv-p")?.value??"0"),s.qty=n.querySelector(".cv-q")?.value??"",s.unit_price=n.querySelector(".cv-u")?.value??"")}};_();E()===""?y():k().catch(e=>{p(e.message),y()});})();
