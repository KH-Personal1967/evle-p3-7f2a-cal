/* app.jsx — Drop-in replacement
   - Shared events + categories via SAVE_SERVICE_BASE
   - In-browser editing preserved (password gate)
   - Status indicator: Saving / Failed / Updated timestamp
   - No localStorage dependence
*/

import React, { useState, useMemo, useEffect, useRef, useContext, createContext } from "react";

/* ============================
   CONFIG
   ============================ */

// Set this to your deployed Save Service base URL (Cloudflare Worker).
// Must implement:
//   GET  {base}/events  -> { updatedUtc, events: [...] }
//   PUT  {base}/events  (JSON body) with header X-Editor-Key
//   GET  {base}/cats    -> { ...catsObject... }
//   PUT  {base}/cats    (JSON body) with header X-Editor-Key
const SAVE_SERVICE_BASE = "https://evle-calendar-api.newbauer.workers.dev";

// Debounce (ms) for autosave after edits to prevent excessive commits.
const SAVE_DEBOUNCE_MS = 900;

/* ============================
   THEME
   ============================ */

const TH = {
  light: {
    bg: "#f0f4f8", card: "#ffffff", card2: "#f8fafc", border: "#cbd5e1",
    text: "#1e3a5a", muted: "#64748b", sub: "#94a3b8",
    todayBg: "#dbeafe", todayBorder: "#3b82f6",
    wkndBg: "#f1f5f9", hdrBg: "#1e3a5a", hdrText: "#ffffff",
    wkHdrBg: "#e2eaf4", wkHdrText: "#475569", pillBg: "#e2eaf4",
    grid: "rgba(0,0,0,0.06)",
  },
  dark: {
    bg: "#07111e", card: "#0d1d30", card2: "#091523", border: "#1a3050",
    text: "#dde4ef", muted: "#4b6a8a", sub: "#7a9bb5",
    todayBg: "#0c2a4a", todayBorder: "#3b82f6",
    wkndBg: "#060e1b", hdrBg: "#060e1b", hdrText: "#5a8ab5",
    wkHdrBg: "#060e1b", wkHdrText: "#374e66", pillBg: "#112240",
    grid: "rgba(255,255,255,0.05)",
  }
};

/* ============================
   CATEGORIES CONTEXT
   ============================ */

const CatsCtx = createContext({});
const useCats = () => useContext(CatsCtx);
const useCatHex = () => { const cats = useCats(); return c => cats?.[c]?.hex ?? "#888"; };

/* ============================
   DATE UTILS (runtime "today")
   ============================ */

function pad2(n){ return String(n).padStart(2,"0"); }
function toS(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function toD(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }

const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function dispDate(s){
  return toD(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function durLabel(s,e){
  if(s===e) return "";
  const d = Math.round((toD(e)-toD(s))/86400000)+1;
  return ` (${d} days)`;
}
function truncateText(value, maxLen=250){
  const text = String(value || "").trim();
  if(text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}
function eventTooltip(ev){
  const details = truncateText(ev.details || "", 250);
  return `${ev.label}${ev.start!==ev.end?durLabel(ev.start,ev.end):""}\n${dispDate(ev.start)}${ev.start!==ev.end?" - "+dispDate(ev.end):""}${details?`\n\n${details}`:""}`;
}
function sortedCatEntries(cats){
  return Object.entries(cats || {}).sort((a,b)=>String(a[1]?.label || a[0]).localeCompare(String(b[1]?.label || b[0])));
}
function monthStart(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function addMonthsDate(d,n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function monthCountInclusive(start,end){
  return (end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth()) + 1;
}
function advM({year,month},n){
  let m=month+n, y=year;
  while(m<0){ m+=12; y--; }
  while(m>11){ m-=12; y++; }
  return {year:y,month:m};
}

/* ============================
   SHARED STORE (SAVE SERVICE)
   ============================ */

async function fetchJson(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function putJson(url, payload, editorKey){
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Editor-Key": editorKey || ""
    },
    body: JSON.stringify(payload)
  });
  if(!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status}${t?`: ${t}`:""}`);
  }
  return r.json().catch(()=> ({}));
}

async function loadSharedEvents(){
  return fetchJson(`${SAVE_SERVICE_BASE}/events`);
}
async function loadSharedCats(){
  return fetchJson(`${SAVE_SERVICE_BASE}/cats`);
}
async function saveSharedEvents(payload, editorKey){
  return putJson(`${SAVE_SERVICE_BASE}/events`, payload, editorKey);
}
async function saveSharedCats(payload, editorKey){
  return putJson(`${SAVE_SERVICE_BASE}/cats`, payload, editorKey);
}
async function verifyEditorKey(editorKey){
  const r = await fetch(`${SAVE_SERVICE_BASE}/auth`, {
    method: "POST",
    headers: { "X-Editor-Key": editorKey || "" },
    cache: "no-store"
  });
  return r.ok;
}

/* ============================
   CALENDAR GRID HELPERS
   ============================ */

function buildWeeks(year,month, todayStr){
  const first = new Date(year,month,1).getDay();
  const days  = new Date(year,month+1,0).getDate();
  const total = Math.ceil((first+days)/7)*7;
  const cells = [];
  for(let i=0;i<total;i++){
    const n=i-first+1;
    const d=new Date(year,month,n);
    cells.push({
      n,
      inMonth:n>=1&&n<=days,
      ds:toS(d),
      dow:d.getDay(),
      isToday:toS(d)===todayStr
    });
  }
  const weeks=[];
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
  return weeks;
}

function findLastIdx(arr,fn){ for(let i=arr.length-1;i>=0;i--) if(fn(arr[i])) return i; return -1; }

function layoutWeek(week,events){
  const ws=week[0].ds, we=week[6].ds;
  const over = events
    .filter(e=>e.end>=ws && e.start<=we)
    .sort((a,b)=>{
      if(a.start!==b.start) return a.start<b.start?-1:1;
      return (toD(b.end)-toD(b.start)) - (toD(a.end)-toD(a.start));
    });

  const tracks=[]; const bars=[];
  over.forEach(ev=>{
    let t = tracks.findIndex(te=>te<ev.start);
    if(t===-1){ t=tracks.length; tracks.push(ev.end); }
    else tracks[t]=ev.end;

    const si = week.findIndex(d=>d.ds>=ev.start);
    const ei = findLastIdx(week, d=>d.ds<=ev.end);
    if(si===-1 || ei===-1) return;

    bars.push({
      ev,
      track:t,
      colStart:Math.max(0,si),
      colEnd:Math.min(6,ei),
      before:ev.start<ws,
      after:ev.end>we
    });
  });
  return { bars, lanes: tracks.length };
}

/* ============================
   CSV UTILS (kept)
   ============================ */

function parseCSV(text){
  const rows=[];
  let row=[];
  let cur="";
  let inQ=false;
  const src=String(text || "").replace(/^\uFEFF/, "");

  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(c==='"'){
      if(inQ && src[i+1]==='"'){
        cur+='"';
        i++;
      } else {
        inQ=!inQ;
      }
    } else if(c===',' && !inQ){
      row.push(cur);
      cur="";
    } else if((c==='\n' || c==='\r') && !inQ){
      if(c==='\r' && src[i+1]==='\n') i++;
      row.push(cur);
      if(row.some(v=>String(v).trim()!=="")) rows.push(row);
      row=[];
      cur="";
    } else {
      cur+=c;
    }
  }

  row.push(cur);
  if(row.some(v=>String(v).trim()!=="")) rows.push(row);
  return rows;
}

function normalizeCsvHeader(value){
  const key=String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases={
    event:"label",
    eventname:"label",
    name:"label",
    startdate:"start",
    enddate:"end",
    category:"cat",
    categorykey:"cat",
    critical:"crit",
    criticalmilestone:"crit",
    detail:"details",
    notes:"details"
  };
  return aliases[key] || key;
}

function normalizeImportDate(value){
  const raw=String(value || "").trim();
  if(!raw) return "";

  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const d=toD(raw);
    return toS(d)===raw ? raw : "";
  }

  const slash=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(slash){
    const m=Number(slash[1]);
    const d=Number(slash[2]);
    const y=Number(slash[3].length===2 ? `20${slash[3]}` : slash[3]);
    const dt=new Date(y,m-1,d);
    return dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d ? toS(dt) : "";
  }

  return "";
}

function normalizeImportCat(value, cats){
  const raw=String(value || "").trim();
  if(raw && cats?.[raw]) return raw;
  const match=Object.entries(cats || {}).find(([,v])=>String(v?.label || "").toLowerCase()===raw.toLowerCase());
  return match ? match[0] : "milestone";
}


function exportCSV(events){
  const hdr="id,label,start,end,cat,crit,details";
  const rows = events.map(e=>[
    e.id,
    `"${(e.label||"").replace(/"/g,'""')}"`,
    e.start,
    e.end,
    e.cat,
    e.crit?"TRUE":"FALSE",
    `"${(e.details||"").replace(/"/g,'""')}"`
  ].join(","));
  const blob = new Blob([[hdr,...rows].join("\r\n")], {type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="EVLE_Phase3_Calendar.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

function parseImportCSV(text, cats){
  const rows=parseCSV(text);
  if(rows[0]?.length===1 && /^sep=/i.test(String(rows[0][0] || "").trim())) rows.shift();
  if(rows.length<2) return null;

  const header=rows[0].map(normalizeCsvHeader);
  const hasNamedHeaders=header.includes("label") && header.includes("start");
  const indexOf=name=>header.indexOf(name);
  const get=(row,name,fallbackIndex)=>{
    const i=hasNamedHeaders ? indexOf(name) : -1;
    return String(row[i>=0 ? i : fallbackIndex] ?? "").trim();
  };

  const evs=[];
  const seenIds=new Set();
  let maxId=0;

  rows.slice(1).forEach(row=>{
    const idRaw=Number.parseInt(get(row,"id",0),10);
    const label=get(row,"label",1);
    const start=normalizeImportDate(get(row,"start",2));
    const endRaw=normalizeImportDate(get(row,"end",3)) || start;
    const cat=normalizeImportCat(get(row,"cat",4), cats);
    const critRaw=get(row,"crit",5).toLowerCase();
    const crit=["true","1","yes","y","x"].includes(critRaw);
    const details=get(row,"details",6);

    if(!label || !start) return;

    const id=Number.isFinite(idRaw) && idRaw>0 ? idRaw : null;
    if(id && id>maxId) maxId=id;

    evs.push({
      id,
      label,
      start,
      end: endRaw>=start ? endRaw : start,
      cat,
      crit,
      details
    });
  });

  evs.forEach(ev=>{
    if(!ev.id || seenIds.has(ev.id)){
      maxId+=1;
      ev.id=maxId;
    }
    seenIds.add(ev.id);
  });

  return evs.length>0 ? { evs, maxId } : null;
}

/* ============================
   UI CONSTANTS
   ============================ */

const LH=23, DAY_H=30, MAX_LANES=4;

/* ============================
   COMPONENTS
   ============================ */

function EventBar({bar,dark,onClick}){
  const catHex=useCatHex();
  const {ev,track,colStart,colEnd,before,after}=bar;
  const hex=catHex(ev.cat);
  const th=dark?TH.dark:TH.light;

  return (
    <div
      onClick={e=>{e.stopPropagation(); onClick(ev);}}
      title={eventTooltip(ev)}
      style={{
        position:"absolute",
        left: `${colStart * 100 / 7}%`,
        right: `${(6 - colEnd) * 100 / 7}%`,
        width: "auto",
        boxSizing: "border-box",
        top:track*LH,
        height:LH-2,
        background:dark?`${hex}2e`:`${hex}20`,
        borderLeft:before?"none":`3px solid ${hex}`,
        borderTop:`1px solid ${hex}44`,
        borderBottom:`1px solid ${hex}44`,
        borderRight:after?`1px dashed ${hex}77`:`1px solid ${hex}33`,
        borderRadius:before?(after?"0":"0 4px 4px 0"):(after?"4px 0 0 4px":"4px"),
        display:"flex",
        alignItems:"center",
        paddingLeft:before?5:7,
        paddingRight:4,
        overflow:"hidden",
        cursor:"pointer",
        zIndex:2
      }}
    >
      <span
        style={{
          fontSize:11,
          fontWeight:before?600:700,
          color:hex,
          whiteSpace:"nowrap",
          overflow:"hidden",
          textOverflow:"ellipsis",
          fontStyle:before?"italic":"normal",
          opacity:before?0.85:1
        }}
      >
        {before ? "↳ " : (ev.crit ? "⚡ " : "")}{ev.label}
      </span>
    </div>
  );
}

function WeekRow({week,events,dark,onSelect,editMode,onEdit}){
  const th=dark?TH.dark:TH.light;
  const {bars,lanes}=useMemo(()=>layoutWeek(week,events),[week,events]);
  const visible = bars.filter(b=>b.track<MAX_LANES);

  const overByCol={};
  bars.filter(b=>b.track>=MAX_LANES).forEach(b=>{
    for(let i=b.colStart;i<=b.colEnd;i++) overByCol[i]=(overByCol[i]||0)+1;
  });

  const eaH = Math.min(lanes,MAX_LANES)*LH;

  return(
    <div style={{borderBottom:`1px solid ${th.border}`,background:th.card,flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",flexShrink:0}}>
        {week.map((day,i)=>{
          const isWknd=day.dow===0 || day.dow===6;
          const ov=overByCol[i];
          return(
            <div
              key={i}
              style={{
                height:DAY_H,
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                padding:"0 6px",
                background:day.isToday
                  ? (dark?"rgba(59,130,246,0.12)":"rgba(59,130,246,0.09)")
                  : isWknd ? th.wkndBg : th.card,
                borderRight:`1px solid ${th.border}`,
                boxShadow:day.isToday ? "inset 0 0 0 1.5px rgba(59,130,246,0.45)" : "none"
              }}
            >
              <span style={{
                fontSize:13,
                fontWeight:day.isToday?800:(day.inMonth?400:300),
                color:day.isToday?"#3b82f6":(day.inMonth?(isWknd?th.muted:th.text):th.sub),
                opacity:day.inMonth?1:.3
              }}>
                {day.inMonth?day.n:""}
              </span>
              {ov && <span style={{fontSize:10,color:th.muted,background:th.pillBg,borderRadius:3,padding:"1px 4px"}}>+{ov}</span>}
            </div>
          );
        })}
      </div>

      <div style={{position:"relative",height:eaH,flexShrink:0,overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:"repeat(7,1fr)",zIndex:0,pointerEvents:"none"}}>
          {[0,1,2,3,4,5,6].map(i=>(
            <div key={i} style={{borderRight:`1px solid ${th.border}`}} />
          ))}
        </div>
        {visible.map(bar=>(
          <EventBar
            key={bar.ev.id+"-"+bar.colStart}
            bar={bar}
            dark={dark}
            onClick={ev=>editMode?onEdit(ev):onSelect(ev)}
          />
        ))}
      </div>

      <div style={{flex:1,position:"relative"}}>
        <div style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:"repeat(7,1fr)",pointerEvents:"none"}}>
          {[0,1,2,3,4,5,6].map(i=>(
            <div key={i} style={{borderRight:`1px solid ${th.border}`}} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({year,month,events,dark,onSelect,editMode,onEdit,todayStr}){
  const th=dark?TH.dark:TH.light;
  const weeks=useMemo(()=>buildWeeks(year,month,todayStr),[year,month,todayStr]);

  return(
    <div style={{
      background:th.card,
      border:`1px solid ${th.border}`,
      borderRadius:8,
      overflow:"hidden",
      display:"flex",
      flexDirection:"column",
      boxShadow:dark?"0 2px 12px rgba(0,0,0,.4)":"0 1px 6px rgba(0,0,0,.08)"
    }}>
      <div style={{background:th.hdrBg,padding:"9px 14px",flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:16,color:th.hdrText,letterSpacing:"-.01em"}}>
          {MN[month]} {year}
        </span>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:th.wkHdrBg,flexShrink:0}}>
        {DN.map(d=>(
          <div key={d} style={{
            textAlign:"center",
            padding:"5px 0",
            fontSize:11,
            fontWeight:700,
            color:th.wkHdrText,
            letterSpacing:".04em",
            borderRight:`1px solid ${th.border}`
          }}>{d}</div>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",flex:1}}>
        {weeks.map((wk,i)=>(
          <WeekRow
            key={i}
            week={wk}
            events={events}
            dark={dark}
            onSelect={onSelect}
            editMode={editMode}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function PasswordModal({onSuccess,onClose,dark}){
  const th=dark?TH.dark:TH.light;
  const [pw,setPw]=useState("");
  const [err,setErr]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const [checking,setChecking]=useState(false);
  const inp=useRef();

  useEffect(()=>{ setTimeout(()=>inp.current&&inp.current.focus(),60); },[]);

  async function attempt(){
    if(!pw.trim()){
      setErr(true);
      setTimeout(()=>setErr(false),1400);
      return;
    }
    setChecking(true);
    const ok = await onSuccess(pw);
    setChecking(false);
    if(!ok){
      setErr(true);
      setPw("");
      setTimeout(()=>setErr(false),1800);
    }
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${err?"#ef4444":th.border}`,borderRadius:10,padding:28,width:340,boxShadow:"0 20px 60px rgba(0,0,0,.4)",transition:"border-color .2s"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:22,marginBottom:6}}>🔐</div>
        <div style={{fontWeight:700,fontSize:16,color:th.text,marginBottom:4}}>Edit Access</div>
        <div style={{fontSize:13,color:th.muted,marginBottom:18,lineHeight:1.5}}>
          Enter the editor key to enable schedule editing.
        </div>
        <input
          ref={inp}
          type={showPw?"text":"password"}
          value={pw}
          onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&attempt()}
          placeholder="Password"
          style={{
            width:"100%",
            boxSizing:"border-box",
            background:th.card2,
            border:`1px solid ${err?"#ef4444":th.border}`,
            borderRadius:6,
            padding:"9px 12px",
            color:th.text,
            fontSize:14,
            outline:"none",
            marginBottom:8
          }}
        />
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:th.muted,marginBottom:err?6:14,cursor:"pointer"}}>
          <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} />
          Show password
        </label>
        {err && <div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>Incorrect editor key.</div>}
        <div style={{display:"flex",gap:9}}>
          <button onClick={attempt} disabled={checking} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"10px 0",color:"#fff",fontSize:13,fontWeight:700,opacity:checking ? 0.65 : 1}}>{checking?"Checking...":"Unlock"}</button>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"10px 14px",color:th.muted,fontSize:13}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EventDetailPopup({ev,onClose,onEdit,editMode,dark,todayD}){
  const th=dark?TH.dark:TH.light;
  const cats=useCats();
  const catHex=useCatHex();
  const hex=catHex(ev.cat);

  const d = Math.round((toD(ev.start) - todayD)/86400000);
  const urg = d<0 ? "#94a3b8" : d<=7 ? "#ef4444" : d<=21 ? "#f59e0b" : "#64748b";

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:450}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:12,padding:26,width:400,boxShadow:"0 20px 60px rgba(0,0,0,.35)",maxWidth:"94vw"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:11,fontWeight:800,color:hex,textTransform:"uppercase",letterSpacing:".1em",background:`${hex}1e`,border:`1px solid ${hex}55`,borderRadius:4,padding:"3px 9px"}}>
            {cats?.[ev.cat]?.label ?? ev.cat}
          </span>
          {d>=0 && <span style={{fontSize:12,fontWeight:800,color:urg,background:`${urg}18`,borderRadius:4,padding:"3px 9px"}}>{d===0?"TODAY":`${d}d away`}</span>}
          {d<0 && <span style={{fontSize:12,color:th.muted}}>{Math.abs(d)}d ago</span>}
        </div>

        <div style={{fontSize:17,fontWeight:700,color:th.text,lineHeight:1.35,marginBottom:12}}>
          {ev.crit && <span style={{color:"#f59e0b",marginRight:5}}>⚡</span>}{ev.label}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18,background:th.card2,borderRadius:7,padding:"10px 12px"}}>
          <div>
            <div style={{fontSize:10,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:2}}>
              {ev.start===ev.end?"Date":"Start"}
            </div>
            <div style={{fontSize:14,fontWeight:600,color:th.text}}>{dispDate(ev.start)}</div>
          </div>
          {ev.start!==ev.end && <>
            <div style={{color:th.border,fontSize:18,padding:"0 4px"}}>→</div>
            <div>
              <div style={{fontSize:10,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:2}}>End</div>
              <div style={{fontSize:14,fontWeight:600,color:th.text}}>{dispDate(ev.end)}</div>
            </div>
            <div style={{marginLeft:"auto",fontSize:12,fontWeight:700,color:hex,background:`${hex}18`,borderRadius:4,padding:"4px 9px"}}>
              {Math.round((toD(ev.end)-toD(ev.start))/86400000)+1}d
            </div>
          </>}
        </div>

        {ev.details && (
          <div style={{fontSize:13,color:th.text,lineHeight:1.45,background:th.card2,border:`1px solid ${th.border}`,borderRadius:7,padding:"10px 12px",marginBottom:18,whiteSpace:"pre-wrap"}}>
            {ev.details}
          </div>
        )}

        <div style={{display:"flex",gap:9}}>
          {editMode && <button onClick={()=>{onClose();onEdit(ev);}} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"9px 0",color:"#fff",fontSize:13,fontWeight:700}}>Edit Event</button>}
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"9px 0",color:th.muted,fontSize:13}}>Close</button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ev,onSave,onDelete,onClose,dark}){
  const th=dark?TH.dark:TH.light;
  const cats=useCats();

  const [label,setLabel]=useState(ev.label);
  const [start,setStart]=useState(ev.start);
  const [end,setEnd]=useState(ev.end);
  const [cat,setCat]=useState(ev.cat);
  const [crit,setCrit]=useState(!!ev.crit);
  const [details,setDetails]=useState(ev.details || "");

  const inp={
    background:th.card2,
    border:`1px solid ${th.border}`,
    borderRadius:6,
    padding:"8px 11px",
    color:th.text,
    fontSize:13,
    outline:"none",
    width:"100%",
    boxSizing:"border-box",
    minWidth:0
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:10,padding:26,width:410,boxShadow:"0 20px 60px rgba(0,0,0,.5)",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:17,color:th.text,marginBottom:18}}>{ev._new?"Add Event":"Edit Event"}</div>

        <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>Event Name</label>
        <input value={label} onChange={e=>setLabel(e.target.value)} style={{...inp,marginBottom:12}} />

        <div style={{
          display:"grid",
          gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",
          columnGap:14,
          rowGap:12,
          marginBottom:12,
          width:"100%",
          boxSizing:"border-box"
        }}>
          <div>
            <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>Start</label>
            <input type="date" value={start} onChange={e=>setStart(e.target.value)} style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>End</label>
            <input type="date" value={end} onChange={e=>setEnd(e.target.value)} style={inp}/>
          </div>
        </div>

        <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>Category</label>
        <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp,cursor:"pointer",marginBottom:14}}>
          {sortedCatEntries(cats).map(([k,v])=>(
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>Details</label>
        <textarea value={details} onChange={e=>setDetails(e.target.value)} rows={4} placeholder="Optional details..." style={{...inp,resize:"vertical",lineHeight:1.35,marginBottom:14}} />

        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:22}}>
          <input type="checkbox" id="mc" checked={crit} onChange={e=>setCrit(e.target.checked)} style={{accentColor:"#f59e0b",width:15,height:15}}/>
          <label htmlFor="mc" style={{fontSize:13,color:th.muted,cursor:"pointer"}}>⚡ Mark as Critical Milestone</label>
        </div>

        <div style={{display:"flex",gap:9}}>
          <button onClick={()=>onSave({...ev,label,start,end:end>=start?end:start,cat,crit,details:details.trim()})} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"10px 0",color:"#fff",fontSize:13,fontWeight:700}}>Save</button>
          {!ev._new && <button onClick={()=>{ if(window.confirm(`Delete "${ev.label}"? This cannot be undone.`)) onDelete(ev); }} style={{background:"#7f1d1d",border:"none",borderRadius:6,padding:"10px 14px",color:"#fca5a5",fontSize:13,fontWeight:700}}>Delete</button>}
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"10px 14px",color:th.muted,fontSize:13}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CategoryManager({cats,events,onSave,onClose,dark}){
  const th=dark?TH.dark:TH.light;

  const [draft,setDraft]=useState(()=>sortedCatEntries(cats).map(([k,v])=>({key:k,label:v.label,hex:v.hex,_orig:k})));
  const [newLabel,setNewLabel]=useState("");
  const [newHex,setNewHex]=useState("#3b82f6");

  const evCountByKey = useMemo(()=>{
    const m={}; (events||[]).forEach(e=>{ m[e.cat]=(m[e.cat]||0)+1; });
    return m;
  },[events]);

  function updateDraft(i,field,val){
    setDraft(d=>{
      const n=[...d];
      n[i]={...n[i],[field]:val};
      return n;
    });
  }

  function removeDraft(i){
    const k=draft[i].key;
    const count=evCountByKey[k]||0;
    if(count>0 && !window.confirm(`"${draft[i].label}" is used by ${count} event(s). They will show a fallback color until reassigned. Remove anyway?`)) return;
    setDraft(d=>d.filter((_,j)=>j!==i));
  }

  function addNew(){
    if(!newLabel.trim()) return;
    const key=newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const safe=draft.some(d=>d.key===key) ? key+"_"+Date.now() : key;
    setDraft(d=>[...d,{key:safe,label:newLabel.trim(),hex:newHex,_orig:null}]);
    setNewLabel(""); setNewHex("#3b82f6");
  }

  function commit(){
    const out={};
    draft.forEach(d=>{ out[d.key]={label:d.label,hex:d.hex}; });
    onSave(out);
  }

  const inp={background:th.card2,border:`1px solid ${th.border}`,borderRadius:6,padding:"6px 10px",color:th.text,fontSize:13,outline:"none"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:500,paddingTop:44,paddingBottom:44,overflowY:"auto"}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:12,width:"min(620px,96vw)",display:"flex",flexDirection:"column",maxHeight:"88vh",boxShadow:"0 24px 64px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${th.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16,color:th.text}}>Manage Categories</div>
            <div style={{fontSize:12,color:th.muted,marginTop:1}}>Edit labels, change colors, add or remove categories</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 11px",color:th.muted,fontSize:13}}>✕</button>
        </div>

        <div style={{overflowY:"auto",flex:1,padding:"14px 20px"}}>
          {draft.map((d,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${th.border}`}}>
              <input type="color" value={d.hex} onChange={e=>updateDraft(i,"hex",e.target.value)} title="Change color"
                style={{width:34,height:34,border:`2px solid ${th.border}`,borderRadius:6,cursor:"pointer",padding:2,background:"transparent"}}/>
              <input value={d.label} onChange={e=>updateDraft(i,"label",e.target.value)} style={{...inp,flex:1}}/>
              <span style={{fontSize:11,color:th.sub,minWidth:36,textAlign:"right"}}>{evCountByKey[d.key]||0}ev</span>
              <button onClick={()=>removeDraft(i)} title="Remove this category" style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:5,padding:"5px 9px",color:"#ef4444",fontSize:12}}>✕</button>
            </div>
          ))}

          <div style={{marginTop:16,padding:"14px",background:th.card2,borderRadius:8,border:`1px solid ${th.border}`}}>
            <div style={{fontSize:11,fontWeight:700,color:th.muted,textTransform:"uppercase",letterSpacing:".09em",marginBottom:10}}>Add New Category</div>
            <div style={{display:"flex",gap:9,alignItems:"center"}}>
              <input type="color" value={newHex} onChange={e=>setNewHex(e.target.value)} title="Pick color"
                style={{width:38,height:36,border:`2px solid ${th.border}`,borderRadius:6,cursor:"pointer",padding:2,background:"transparent",flexShrink:0}}/>
              <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNew()} placeholder="Category name…"
                style={{...inp,flex:1}}/>
              <button onClick={addNew} style={{background:"#1e40af",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",fontSize:13,fontWeight:700,flexShrink:0}}>Add</button>
            </div>
          </div>
        </div>

        <div style={{padding:"14px 20px",borderTop:`1px solid ${th.border}`,display:"flex",gap:9}}>
          <button onClick={commit} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"10px 0",color:"#fff",fontSize:13,fontWeight:700}}>Save Categories</button>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"10px 16px",color:th.muted,fontSize:13}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AdminTable({events,dark,onEdit,onAdd,onImport,onExport,onClose,onManageCats}){
  const th=dark?TH.dark:TH.light;
  const cats=useCats();
  const catHex=useCatHex();
  const [sort,setSort]=useState("start");
  const [q,setQ]=useState("");
  const fileRef=useRef();

  const filtered=[...(events||[])]
    .filter(e=>{
      const query=q.trim().toLowerCase();
      if(!query) return true;
      return String(e.label || "").toLowerCase().includes(query)
        || String(e.details || "").toLowerCase().includes(query)
        || String(cats?.[e.cat]?.label || "").toLowerCase().includes(query);
    })
    .sort((a,b)=>String(a[sort] ?? "")<String(b[sort] ?? "")?-1:1);

  const th2={fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:th.muted,padding:"8px 12px",background:th.card2,borderBottom:`1px solid ${th.border}`,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",textAlign:"left"};
  const td ={fontSize:13,color:th.text,padding:"7px 12px",borderBottom:`1px solid ${th.border}`,verticalAlign:"middle"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:350,paddingTop:44,paddingBottom:44,overflowY:"auto"}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:12,width:"min(1120px,96vw)",display:"flex",flexDirection:"column",maxHeight:"88vh",boxShadow:"0 24px 64px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${th.border}`,display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16,color:th.text}}>Event Editor</div>
            <div style={{fontSize:12,color:th.muted,marginTop:1}}>{filtered.length} of {events.length} events</div>
          </div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
            style={{background:th.card2,border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 11px",color:th.text,fontSize:13,outline:"none",width:180}} />
          <button onClick={onAdd} style={{background:"#1e40af",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",fontSize:13,fontWeight:700}}>+ Add Event</button>
          <button onClick={onManageCats} style={{background:dark?"#1a0c2e":"#ede9fe",border:"1px solid #8b5cf6",borderRadius:6,padding:"7px 14px",color:"#8b5cf6",fontSize:13,fontWeight:700}}>🎨 Manage Categories</button>
          <button onClick={onExport} style={{background:dark?"#0c2a0c":"#dcfce7",border:"1px solid #16a34a",borderRadius:6,padding:"7px 14px",color:"#16a34a",fontSize:13,fontWeight:700}}>↓ Export CSV</button>
          <button onClick={()=>fileRef.current.click()} style={{background:dark?"#1a1a0c":"#fefce8",border:"1px solid #ca8a04",borderRadius:6,padding:"7px 14px",color:"#ca8a04",fontSize:13,fontWeight:700}}>↑ Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}}
            onChange={e=>{const f=e.target.files[0]; if(f) onImport(f); e.target.value="";}} />
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 11px",color:th.muted,fontSize:13}}>✕</button>
        </div>

        <div style={{padding:"7px 20px",background:dark?"#0a1218":"#f0fdf4",borderBottom:`1px solid ${th.border}`,fontSize:11,color:dark?"#4b8a5a":"#166534",fontFamily:"'IBM Plex Mono',monospace"}}>
          CSV format: id, label, start (YYYY-MM-DD), end (YYYY-MM-DD), cat, crit (TRUE/FALSE), details
        </div>

        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead style={{position:"sticky",top:0,zIndex:2}}>
              <tr>
                <th style={{...th2,width:34,textAlign:"center"}} onClick={()=>setSort("crit")}>⚡</th>
                <th style={th2} onClick={()=>setSort("label")}>Event Name {sort==="label"?"↑":""}</th>
                <th style={{...th2,width:260}} onClick={()=>setSort("details")}>Details {sort==="details"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("start")}>Start {sort==="start"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("end")}>End {sort==="end"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("cat")}>Category {sort==="cat"?"↑":""}</th>
                <th style={{...th2,width:60,textAlign:"center"}}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev=>(
                <tr key={ev.id} onMouseEnter={e=>e.currentTarget.style.background=th.card2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{...td,textAlign:"center"}}>{ev.crit?"⚡":""}</td>
                  <td style={td}>{ev.label}</td>
                  <td style={{...td,maxWidth:260,color:ev.details?th.text:th.muted}}>
                    <span title={ev.details || ""} style={{display:"block",maxWidth:240,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {ev.details ? truncateText(ev.details, 90) : "—"}
                    </span>
                  </td>
                  <td style={{...td,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,whiteSpace:"nowrap"}}>{ev.start}</td>
                  <td style={{...td,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,whiteSpace:"nowrap",color:ev.start!==ev.end?th.text:th.muted}}>{ev.start!==ev.end?ev.end:"—"}</td>
                  <td style={td}>
                    <span style={{fontSize:11,fontWeight:700,color:catHex(ev.cat),background:`${catHex(ev.cat)}22`,border:`1px solid ${catHex(ev.cat)}55`,borderRadius:4,padding:"2px 8px"}}>
                      {cats?.[ev.cat]?.label ?? ev.cat}
                    </span>
                  </td>
                  <td style={{...td,textAlign:"center"}}>
                    <button onClick={()=>onEdit(ev)} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:4,padding:"4px 10px",color:th.muted,fontSize:12}}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

function Toast({msg,dark}){
  return(
    <div style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",background:dark?"#14532d":"#166534",color:"#fff",borderRadius:8,padding:"11px 22px",fontSize:13,fontWeight:600,zIndex:700,boxShadow:"0 4px 20px rgba(0,0,0,.3)",pointerEvents:"none",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

/* ============================
   TIMELINE SUPPORT
   ============================ */

const TL_BAR_H=22;
const TL_TRACK_H=TL_BAR_H+4;
const TL_PAD=10;
const TL_LABEL_W=170;
const TL_HDR_H=40;

const SWIM_LANE_DEFS = [
  {id:"milestones",  label:"Milestones",          cats:["milestone"]},
  {id:"freeze",      label:"File Freeze",         cats:["freeze"]},
  {id:"disc_freeze", label:"Discipline Freezes",  cats:["disc_freeze"]},
  {id:"row",         label:"ROW",                 cats:["row"]},
  {id:"idr",         label:"IDR / Reviews",       cats:["idr","kh_review"]},
  {id:"qc_qa",       label:"QC / QA",             cats:["plans_qc","bod"]},
  {id:"rollplot",    label:"Roll Plots",          cats:["rollplot"]},
  {id:"mor_mtg",     label:"MOR / Meetings",      cats:["mor","meeting"]},
  {id:"st_review",   label:"ST Review",           cats:["st_review","comment"]},
  {id:"stn_wb",      label:"Station Workbook",    cats:["stn_wb"]},
  {id:"holidays",    label:"Holidays",            cats:["holiday"]},
];

function layoutLane(events){
  const sorted=[...events].sort((a,b)=>{
    if(a.start!==b.start) return a.start<b.start?-1:1;
    return (toD(b.end)-toD(b.start))-(toD(a.end)-toD(a.start));
  });
  const tracks=[]; const bars=[];
  sorted.forEach(ev=>{
    let t=tracks.findIndex(te=>te<ev.start);
    if(t===-1){ t=tracks.length; tracks.push(ev.end); }
    else tracks[t]=ev.end;
    bars.push({ev,track:t});
  });
  return {bars, lanes:tracks.length};
}

function JumpTodayBtn({dark,onClick}){
  const th=dark?TH.dark:TH.light;
  const [hov,setHov]=useState(false);
  return(
    <button onClick={onClick} title="Jump to current month"
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:hov?(dark?"#0c2a4a":"#dbeafe"):(dark?th.card:"#ffffff"),
        border:`1px solid ${dark?"#1e4d82":"#93c5fd"}`,
        borderRadius:6,
        padding:"6px 16px",
        color:dark?"#60a5fa":"#1d4ed8",
        fontSize:13,
        fontWeight:700,
        transition:"background .15s",
        opacity:1
      }}
    >
      📅 Jump to Today
    </button>
  );
}

function TimelineView({events,dark,filters,onSelect,editMode,onEdit,todayD}){
  const th=dark?TH.dark:TH.light;
  const catHex=useCatHex();
  const [visibleMonths,setVisibleMonths]=useState(6);
  const scrollRef=useRef(null);
  const [timelineViewportW,setTimelineViewportW]=useState(1120);

  useEffect(()=>{
    const el=scrollRef.current;
    if(!el) return;
    const measure=()=>setTimelineViewportW(Math.max(360, el.clientWidth - TL_LABEL_W));
    measure();

    if(typeof ResizeObserver !== "undefined"){
      const ro=new ResizeObserver(measure);
      ro.observe(el);
      return ()=>ro.disconnect();
    }

    window.addEventListener("resize", measure);
    return ()=>window.removeEventListener("resize", measure);
  },[]);

  const range = useMemo(()=>{
    const dated = (events||[]).filter(e=>e.start && e.end);
    if(!dated.length){
      const s = monthStart(todayD);
      return {start:s, end:monthEnd(addMonthsDate(s,5)), totalMonths:6};
    }
    const minStart = dated.reduce((m,e)=>toD(e.start)<m?toD(e.start):m, toD(dated[0].start));
    const maxEnd = dated.reduce((m,e)=>toD(e.end)>m?toD(e.end):m, toD(dated[0].end));
    const start = monthStart(minStart);
    const end = monthEnd(maxEnd);
    return {start, end, totalMonths:Math.max(1, monthCountInclusive(start,end))};
  },[events,todayD]);

  useEffect(()=>{
    setVisibleMonths(v=>Math.min(Math.max(1,v), range.totalMonths));
  },[range.totalMonths]);

  const clampedVisibleMonths = Math.min(Math.max(1, visibleMonths), range.totalMonths);
  const days = Math.round((range.end - range.start)/86400000) + 1;
  const pxPerDay = Math.max(1.2, timelineViewportW / (clampedVisibleMonths * 30.4375));
  const totalW = Math.max(timelineViewportW, Math.ceil(days * pxPerDay));

  function zoomIn(){
    setVisibleMonths(v=>Math.max(1, v<=6 ? v-1 : 6));
  }
  function zoomOut(){
    setVisibleMonths(v=>Math.min(range.totalMonths, v<6 ? v+1 : v+3));
  }

  const monthTicks=useMemo(()=>{
    const ms=[];
    let d=new Date(range.start);
    while(d<=range.end){
      const next=addMonthsDate(d,1);
      const dim=Math.round((next-d)/86400000);
      ms.push({
        y:d.getFullYear(),
        m:d.getMonth(),
        left:Math.round((d-range.start)/86400000)*pxPerDay,
        width:dim*pxPerDay
      });
      d=next;
    }
    return ms;
  },[range.start, range.end, pxPerDay]);

  const todayX=Math.round((todayD - range.start)/86400000)*pxPerDay;

  const laneDefs = useMemo(()=>[...SWIM_LANE_DEFS].sort((a,b)=>a.label.localeCompare(b.label)),[]);

  const laneData=useMemo(()=>{
    return laneDefs.map(lane=>{
      const evs = events.filter(e=>lane.cats.includes(e.cat) && filters.has(e.cat));
      const {bars, lanes:numTracks} = layoutLane(evs);
      const height=Math.max(70, numTracks*TL_TRACK_H + TL_PAD*2 + 16);
      return {...lane, bars, numTracks, height};
    });
  },[events,filters,laneDefs]);

  const dateRangeLabel = `${MN[range.start.getMonth()]} ${range.start.getFullYear()} - ${MN[range.end.getMonth()]} ${range.end.getFullYear()}`;

  function diamondLabelVisible(label, x, y, placed){
    const w = Math.min(220, Math.max(50, String(label||"").length * 6 + 18));
    const h = 14;
    const box = {left:x - w/2, right:x + w/2, top:y - h - 8, bottom:y - 4};
    const overlap = placed.some(b=>!(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom));
    if(overlap) return null;
    placed.push(box);
    return box;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",minHeight:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 16px",background:th.card2,borderBottom:`1px solid ${th.border}`,flexShrink:0}}>
        <span style={{fontSize:11,fontWeight:700,color:th.muted,textTransform:"uppercase",letterSpacing:".09em"}}>Months shown:</span>
        <button onClick={()=>setVisibleMonths(1)} title="Show 1 month" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 9px",color:th.text,fontSize:12,fontWeight:700}}>Min</button>
        <button onClick={zoomIn} title="Show fewer months" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 10px",color:th.text,fontSize:14,fontWeight:700}}>−</button>
        <span style={{fontSize:12,fontWeight:600,color:th.text,minWidth:86,textAlign:"center"}}>
          {clampedVisibleMonths} of {range.totalMonths}
        </span>
        <button onClick={zoomOut} title="Show more months" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 10px",color:th.text,fontSize:14,fontWeight:700}}>+</button>
        <button onClick={()=>setVisibleMonths(range.totalMonths)} title="Show all months" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 9px",color:th.text,fontSize:12,fontWeight:700}}>Max</button>
        <div style={{marginLeft:8,height:16,width:1,background:th.border}}/>
        <span style={{fontSize:11,color:th.muted}}>{dateRangeLabel}</span>
        <span style={{marginLeft:"auto",fontSize:11,color:th.muted}}>Single-day events are diamonds. Multi-day events are bars.</span>
      </div>

      <div ref={scrollRef} style={{flex:1,overflow:"auto",minHeight:0,minWidth:0}}>
        <div style={{minWidth:TL_LABEL_W+totalW,position:"relative"}}>
          <div style={{position:"sticky",top:0,display:"flex",zIndex:20,borderBottom:`1px solid ${th.border}`,height:TL_HDR_H}}>
            <div style={{width:TL_LABEL_W,boxSizing:"border-box",flexShrink:0,position:"sticky",left:0,zIndex:21,background:th.hdrBg,display:"flex",alignItems:"center",padding:"0 14px",borderRight:`1px solid rgba(255,255,255,0.15)`}}>
              <span style={{fontSize:11,fontWeight:700,color:th.hdrText,textTransform:"uppercase",letterSpacing:".09em"}}>Swim Lane</span>
            </div>
            <div style={{position:"relative",flex:1,background:th.wkHdrBg,overflow:"hidden"}}>
              {monthTicks.map((mt,i)=>(
                <div key={i} style={{position:"absolute",left:mt.left,width:mt.width,height:"100%",display:"flex",alignItems:"center",paddingLeft:8,borderLeft:`1px solid ${th.border}`,overflow:"hidden"}}>
                  <span style={{fontSize:clampedVisibleMonths>12?9:11,fontWeight:700,color:th.wkHdrText,whiteSpace:"nowrap"}}>
                    {MN[mt.m].slice(0,clampedVisibleMonths>12?1:3)} {String(mt.y).slice(2)}
                  </span>
                </div>
              ))}
              {todayX>=0 && todayX<=totalW && (
                <div style={{position:"absolute",left:todayX,top:0,bottom:0,width:2,background:"#ef4444",zIndex:2}}>
                  <div style={{position:"absolute",top:4,left:4,fontSize:9,fontWeight:800,color:"#ef4444",whiteSpace:"nowrap",letterSpacing:".06em"}}>TODAY</div>
                </div>
              )}
            </div>
          </div>

          {laneData.map((lane,li)=>{
            const placedLabels=[];
            return(
              <div key={lane.id} style={{display:"flex",height:lane.height,borderBottom:`1px solid ${th.border}`,background:li%2===0?th.card:th.card2}}>
                <div style={{width:TL_LABEL_W,boxSizing:"border-box",flexShrink:0,position:"sticky",left:0,zIndex:10,background:li%2===0?th.card:th.card2,borderRight:`1px solid ${th.border}`,display:"flex",alignItems:"center",padding:"0 14px"}}>
                  <span style={{fontSize:13,fontWeight:600,color:th.text,lineHeight:1.3}}>{lane.label}</span>
                </div>

                <div style={{position:"relative",flex:1,overflow:"hidden"}}>
                  {monthTicks.map((mt,mi)=>(
                    <div key={mi} style={{position:"absolute",left:mt.left,top:0,bottom:0,width:1,background:th.grid,pointerEvents:"none"}} />
                  ))}
                  {todayX>=0 && todayX<=totalW && (
                    <div style={{position:"absolute",left:todayX,top:0,bottom:0,width:2,background:"rgba(239,68,68,0.45)",zIndex:3,pointerEvents:"none"}} />
                  )}

                  {lane.bars.map((bar,bi)=>{
                    const ev=bar.ev;
                    const hex=catHex(ev.cat);
                    const startX=Math.round((toD(ev.start)-range.start)/86400000)*pxPerDay;
                    const durationDays=Math.round((toD(ev.end)-toD(ev.start))/86400000)+1;
                    const y=TL_PAD+bar.track*TL_TRACK_H;
                    const isSingle=ev.start===ev.end;
                    const tooltip=eventTooltip(ev);

                    if(isSingle){
                      const cx=startX + Math.max(6, pxPerDay/2);
                      const cy=y + 15;
                      const labelBox = pxPerDay >= 7 ? diamondLabelVisible(ev.label, cx, cy, placedLabels) : null;
                      return(
                        <React.Fragment key={bi}>
                          {labelBox && (
                            <div style={{position:"absolute",left:labelBox.left,top:labelBox.top,width:labelBox.right-labelBox.left,height:14,textAlign:"center",fontSize:10,fontWeight:700,color:hex,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",zIndex:4,pointerEvents:"none"}}>
                              {ev.crit?"⚡ ":""}{ev.label}
                            </div>
                          )}
                          <div
                            onClick={()=>editMode?onEdit(ev):onSelect(ev)}
                            title={tooltip}
                            style={{
                              position:"absolute",
                              left:cx-6,
                              top:cy-6,
                              width:12,
                              height:12,
                              background:hex,
                              border:`1.5px solid ${dark?"#fff":"#fff"}`,
                              transform:"rotate(45deg)",
                              cursor:"pointer",
                              zIndex:5,
                              boxShadow:"0 1px 3px rgba(0,0,0,.25)"
                            }}
                          />
                        </React.Fragment>
                      );
                    }

                    const evW=Math.max(pxPerDay*durationDays, 6);
                    const showLabel=evW >= 34;
                    return(
                      <div
                        key={bi}
                        onClick={()=>editMode?onEdit(ev):onSelect(ev)}
                        title={tooltip}
                        style={{
                          position:"absolute",
                          left:startX,
                          width:evW,
                          boxSizing:"border-box",
                          top:y,
                          height:TL_BAR_H,
                          background:dark?`${hex}30`:`${hex}20`,
                          border:`1.5px solid ${hex}`,
                          borderRadius:5,
                          display:"flex",
                          alignItems:"center",
                          paddingLeft:5,
                          paddingRight:4,
                          overflow:"hidden",
                          cursor:"pointer",
                          zIndex:2
                        }}
                      >
                        {showLabel && (
                          <span style={{fontSize:10,fontWeight:700,color:hex,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                            {ev.crit?"⚡ ":""}{ev.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================
   MAIN APP
   ============================ */

function App(){
  const [dark,setDark]=useState(false);
  const [view,setView]=useState("calendar");
  const [span,setSpan]=useState(1);

  // runtime today
  const [todayD,setTodayD]=useState(()=>new Date());
  const todayStr = useMemo(()=>toS(todayD),[todayD]);

  // month view start
  const [vs,setVs]=useState(()=>({year: todayD.getFullYear(), month: todayD.getMonth()}));

  const [editMode,setEditMode]=useState(false);
  const [showPwModal,setShowPwModal]=useState(false);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showCatMgr,setShowCatMgr]=useState(false);
  const [showPanel,setShowPanel]=useState(true);
  const panelStateBeforeTimelineRef = useRef(true);

  const [cats,setCats]=useState({});
  const [filters,setFilters]=useState(new Set());
  const [isolatedCat,setIsolatedCat]=useState(null);
  const [preIsolateFilters,setPreIsolateFilters]=useState(null);

  const [events,setEvents]=useState([]);
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [nextId,setNextId]=useState(300);

  const [lookahead,setLookahead]=useState(30);
  const [toast,setToast]=useState(null);
  const toastRef=useRef();

  // Shared status
  const [sharedUpdatedUtc,setSharedUpdatedUtc]=useState(null);
  const [loadBusy,setLoadBusy]=useState(true);
  const [loadErr,setLoadErr]=useState("");
  const [saveBusy,setSaveBusy]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const editorKeyRef = useRef("");  // set after password unlock

  // Debounce refs
  const saveEventsTimerRef = useRef(null);
  const saveCatsTimerRef = useRef(null);
  const pendingEventsRef = useRef(null);
  const pendingCatsRef = useRef(null);

  const th=dark?TH.dark:TH.light;

  useEffect(()=>{
    // keep today ticking daily (optional). We update hourly to be safe.
    const t=setInterval(()=>setTodayD(new Date()), 60*60*1000);
    return ()=>clearInterval(t);
  },[]);

  function showToast(msg){
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current=setTimeout(()=>setToast(null),2600);
  }

  // Initial load: fail closed instead of rendering stale embedded fallback data.
  useEffect(()=>{
    (async ()=>{
      setLoadBusy(true);
      setLoadErr("");
      try{
        const [c, ev] = await Promise.all([loadSharedCats(), loadSharedEvents()]);
        if(!c || typeof c !== "object" || Array.isArray(c)) throw new Error("Invalid categories response.");
        if(!ev?.events || !Array.isArray(ev.events)) throw new Error("Invalid events response.");

        setCats(c);
        setFilters(new Set(Object.keys(c)));
        setEvents(ev.events);
        if(ev.updatedUtc) setSharedUpdatedUtc(ev.updatedUtc);

        const maxId = ev.events.reduce((m,x)=>Math.max(m, Number(x.id)||0), 0);
        setNextId(Math.max(300, maxId+1));
      }catch(e){
        setLoadErr(e?.message || String(e));
      }finally{
        setLoadBusy(false);
      }
    })();
  },[]);

   
// AUTO-REFRESH USEEFFECT
useEffect(() => {
  const base = SAVE_SERVICE_BASE.replace(/\/+$/, "");
  const intervalMs = 120000;

  const tick = async () => {
    if (editMode || editing || saveBusy) return;

    try {
      const ev = await fetchJson(`${base}/events`);
      if (ev?.events && ev.updatedUtc && (!sharedUpdatedUtc || new Date(ev.updatedUtc) > new Date(sharedUpdatedUtc))) {
        setEvents(ev.events);
        setSharedUpdatedUtc(ev.updatedUtc);

        const maxId = ev.events.reduce((m,x)=>Math.max(m, Number(x.id)||0), 0);
        setNextId(Math.max(300, maxId+1));
      }
    } catch {}

    try {
      const c = await fetchJson(`${base}/cats`);
      if (c && typeof c === "object") setCats(c);
    } catch {}
  };

  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}, [editMode, editing, saveBusy, sharedUpdatedUtc]);

  // Keep filters in sync with cats (add new keys)
  useEffect(()=>{
    setFilters(prev=>{
      const n=new Set(prev);
      Object.keys(cats||{}).forEach(k=>{ if(!n.has(k)) n.add(k); });
      return n;
    });
  },[cats]);

  // Derived filtered events
  const filteredEvs=useMemo(()=>events.filter(e=>filters.has(e.cat)),[events,filters]);

  const months=useMemo(()=>{
    const res=[]; let cur=vs;
    for(let i=0;i<span;i++){ res.push(cur); cur=advM(cur,1); }
    return res;
  },[vs,span]);

  /* -------- Filter pill logic with isolation -------- */
  function handleFilterClick(k, additive=false){
    if(additive){
      const n=new Set(filters);
      if(n.has(k)) n.delete(k); else n.add(k);
      setFilters(n);
      setIsolatedCat(null); setPreIsolateFilters(null);
      return;
    }
    if(isolatedCat===k){
      setFilters(preIsolateFilters || new Set(Object.keys(cats||{})));
      setIsolatedCat(null); setPreIsolateFilters(null);
    } else if(filters.has(k)){
      setPreIsolateFilters(new Set(filters));
      setFilters(new Set([k]));
      setIsolatedCat(k);
    } else {
      const n=new Set(filters); n.add(k); setFilters(n);
      setIsolatedCat(null); setPreIsolateFilters(null);
    }
  }

  /* -------- Edit mode with password -------- */
  function requestEditMode(){
    if(editMode){
      setEditMode(false);
      editorKeyRef.current = "";
      return;
    }
    setShowPwModal(true);
  }

  async function onPasswordSuccess(editorKey){
    try{
      const ok = await verifyEditorKey(editorKey);
      if(!ok) return false;
      editorKeyRef.current = editorKey;
      setEditMode(true);
      setShowPwModal(false);
      return true;
    }catch(e){
      return false;
    }
  }

  /* -------- Debounced persistence -------- */

  function schedulePersistEvents(nextEvents){
    const editorKey=editorKeyRef.current;
    if(!editorKey) return; // not authorized to write
    pendingEventsRef.current = nextEvents;

    clearTimeout(saveEventsTimerRef.current);
    saveEventsTimerRef.current = setTimeout(async ()=>{
      const payload = { updatedUtc: new Date().toISOString(), events: pendingEventsRef.current || [] };
      setSaveBusy(true); setSaveErr("");
      try{
        await saveSharedEvents(payload, editorKey);
        setSharedUpdatedUtc(payload.updatedUtc);
      }catch(e){
        setSaveErr(e?.message || String(e));
      }finally{
        setSaveBusy(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistEventsNow(nextEvents){
    const editorKey=editorKeyRef.current;
    if(!editorKey) return false;

    clearTimeout(saveEventsTimerRef.current);
    pendingEventsRef.current = nextEvents;

    const payload = { updatedUtc: new Date().toISOString(), events: nextEvents || [] };
    setSaveBusy(true); setSaveErr("");
    try{
      await saveSharedEvents(payload, editorKey);
      setSharedUpdatedUtc(payload.updatedUtc);
      return true;
    }catch(e){
      setSaveErr(e?.message || String(e));
      return false;
    }finally{
      setSaveBusy(false);
    }
  }

  function schedulePersistCats(nextCats){
    const editorKey=editorKeyRef.current;
    if(!editorKey) return;
    pendingCatsRef.current = nextCats;

    clearTimeout(saveCatsTimerRef.current);
    saveCatsTimerRef.current = setTimeout(async ()=>{
      setSaveBusy(true); setSaveErr("");
      try{
        await saveSharedCats(pendingCatsRef.current || {}, editorKey);
      }catch(e){
        setSaveErr(e?.message || String(e));
      }finally{
        setSaveBusy(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  /* -------- Event CRUD -------- */

  function handleSave(ev){
    let next;
    if(ev._new){
      const {_new, ...c} = ev;
      next = [...events, {...c, id: nextId}];
      setNextId(n=>n+1);
      showToast("Event added.");
    } else {
      next = events.map(e=>e.id===ev.id ? ev : e);
      showToast("Event updated.");
    }
    setEvents(next);
    schedulePersistEvents(next);
    setEditing(null);
    setSelected(null);
  }

  function handleDelete(ev){
    const next = events.filter(e=>e.id!==ev.id);
    setEvents(next);
    schedulePersistEvents(next);
    setEditing(null);
    setSelected(null);
    showToast("Event deleted.");
  }

  function handleExport(){
    exportCSV(events);
    showToast(`Exported ${events.length} events.`);
  }

  function handleImport(file){
    const r=new FileReader();
    r.onload=e=>{
      const res=parseImportCSV(e.target.result, cats);
      if(!res){ showToast("Import failed — check CSV format."); return; }
      if(window.confirm(`Replace all ${events.length} events with ${res.evs.length} imported events?`)){
        setEvents(res.evs);
        setNextId(res.maxId+1);
        persistEventsNow(res.evs).then(ok=>{
          showToast(ok ? `Imported and saved ${res.evs.length} events.` : `Imported ${res.evs.length} events, but save failed.`);
        });
      }
    };
    r.readAsText(file);
  }

  function handleSaveCats(newCats){
    setCats(newCats);
    schedulePersistCats(newCats);
    setShowCatMgr(false);
    showToast("Categories saved.");
  }

  const cols = span===1 ? "1fr" : span===2 ? "1fr 1fr" : "1fr 1fr 1fr";

  // Human-friendly today label in top bar
  const todayLabel = useMemo(()=>{
    const d=todayD;
    return `${MN[d.getMonth()].slice(0,3).toUpperCase()} ${String(d.getDate()).padStart(2,"0")} ${d.getFullYear()}`;
  },[todayD]);

  const updatedLabel = useMemo(()=>{
    if(!sharedUpdatedUtc) return "";
    try{
      return new Date(sharedUpdatedUtc).toLocaleString();
    }catch{
      return String(sharedUpdatedUtc);
    }
  },[sharedUpdatedUtc]);

  useEffect(()=>{
    if(view === "timeline"){
      panelStateBeforeTimelineRef.current = showPanel;
      setShowPanel(false);
    } else {
      setShowPanel(panelStateBeforeTimelineRef.current);
    }
  },[view]);

  if(loadBusy){
    return <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:th.bg,color:th.text}}>Loading calendar data...</div>;
  }

  if(loadErr){
    return (
      <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:th.bg,color:th.text,padding:24}}>
        <div style={{maxWidth:560,background:th.card,border:`1px solid ${th.border}`,borderRadius:12,padding:24,boxShadow:"0 12px 36px rgba(0,0,0,.18)"}}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:8,color:"#b91c1c"}}>Calendar data could not be loaded</div>
          <div style={{fontSize:14,lineHeight:1.5,color:th.text,marginBottom:12}}>The calendar did not load events or categories from the shared data source. To prevent stale information, no fallback schedule is being displayed.</div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:th.muted,background:th.card2,border:`1px solid ${th.border}`,borderRadius:6,padding:10,whiteSpace:"pre-wrap"}}>{loadErr}</div>
          <button onClick={()=>window.location.reload()} style={{marginTop:16,background:"#1e40af",border:"none",borderRadius:6,padding:"9px 14px",color:"#fff",fontSize:13,fontWeight:700}}>Retry</button>
        </div>
      </div>
    );
  }

  return(
    <CatsCtx.Provider value={cats}>
      <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",background:th.bg,color:th.text,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",fontSize:14}}>

        {/* TOPBAR */}
        <div className="noprint" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",background:th.card,borderBottom:`1px solid ${th.border}`,flexWrap:"wrap",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:13,flex:1,minWidth:300}}>
            <div style={{width:3,height:38,background:"linear-gradient(180deg,#3b82f6,#8b5cf6)",borderRadius:2,flexShrink:0}} />
            <div>
              <div style={{fontSize:10,letterSpacing:".16em",color:th.muted,fontWeight:700,textTransform:"uppercase"}}>
                EVLE — Phase 3 Production Calendar
              </div>
              <div style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",lineHeight:1.2}}>
                Everett Link Extension
              </div>
            </div>

            <div style={{background:dark?"#0c2a4a":"#dbeafe",border:`1px solid ${dark?"#1e4d82":"#93c5fd"}`,borderRadius:5,padding:"4px 10px",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:dark?"#60a5fa":"#1d4ed8",letterSpacing:".06em",flexShrink:0}}>
              TODAY&nbsp;&nbsp;{todayLabel}
            </div>

            {/* Status indicator */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {saveBusy && (
                <span style={{fontSize:11,fontWeight:700,color:dark?"#fbbf24":"#b45309",background:dark?"#1a1a0c":"#fefce8",border:`1px solid ${dark?"#92400e":"#f59e0b"}`,borderRadius:4,padding:"2px 8px"}}>
                  Saving…
                </span>
              )}
              {!!saveErr && (
                <span title={saveErr} style={{fontSize:11,fontWeight:700,color:"#b91c1c",background:"#fee2e2",border:"1px solid #ef4444",borderRadius:4,padding:"2px 8px"}}>
                  Save failed
                </span>
              )}
              {!!updatedLabel && !saveBusy && (
                <span style={{fontSize:11,color:th.muted}}>
                  Updated: {updatedLabel}
                </span>
              )}
            </div>
          </div>

          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:1,background:th.pillBg,borderRadius:6,padding:2}}>
              {[["📅 Calendar","calendar","Monthly calendar view"],["📊 Timeline","timeline","Swim-lane timeline view"]].map(([lbl,v,tip])=>(
                <button key={v} onClick={()=>setView(v)} title={tip} style={{background:view===v?(dark?"#1e40af":"#3b82f6"):"transparent",border:"none",borderRadius:4,padding:"5px 11px",color:view===v?"#fff":th.muted,fontSize:12,fontWeight:700}}>
                  {lbl}
                </button>
              ))}
            </div>

            {view==="calendar" && (
              <div style={{display:"flex",gap:1,background:th.pillBg,borderRadius:6,padding:2}}>
                {[["1mo",1],["2mo",2],["3mo",3]].map(([lbl,n])=>(
                  <button key={n} onClick={()=>setSpan(n)} title={`Show ${n} month(s)`} style={{background:span===n?(dark?"#1e40af":"#3b82f6"):"transparent",border:"none",borderRadius:4,padding:"5px 10px",color:span===n?"#fff":th.muted,fontSize:12,fontWeight:700}}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}

            <button onClick={()=>setDark(p=>!p)} title="Switch theme" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:5,padding:"6px 11px",color:th.muted,fontSize:12,fontWeight:600}}>
              {dark?"☀ Light":"🌙 Dark"}
            </button>

            <button onClick={requestEditMode} title={editMode?"Exit edit mode":"Unlock schedule for editing (password)"} style={{background:editMode?(dark?"#1e3a6e":"#dbeafe"):"transparent",border:`1px solid ${editMode?"#3b82f6":th.border}`,borderRadius:5,padding:"6px 11px",color:editMode?"#3b82f6":th.muted,fontSize:12,fontWeight:600}}>
              {editMode?"🔓 Editing":"✎ Edit"}
            </button>

            {editMode && (
              <button onClick={()=>setShowAdmin(true)} title="Open Event Editor" style={{background:dark?"#0c2a4a":"#eff6ff",border:"1px solid #3b82f6",borderRadius:5,padding:"6px 11px",color:"#3b82f6",fontSize:12,fontWeight:600}}>
                📋 Event Editor
              </button>
            )}

            <button onClick={handleExport} title="Download events as CSV" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:5,padding:"6px 11px",color:th.muted,fontSize:12,fontWeight:600}}>
              ↓ CSV
            </button>

            <button onClick={()=>window.print()} title="Print" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:5,padding:"6px 11px",color:th.muted,fontSize:12,fontWeight:600}}>
              🖨 Print
            </button>

            <button onClick={()=>setShowPanel(p=>!p)} title={showPanel?"Collapse panel":"Expand panel"} style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:5,padding:"6px 10px",color:th.muted,fontSize:12}}>
              {showPanel?"▶":"◀"}
            </button>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="noprint" style={{display:"flex",alignItems:"center",gap:5,padding:"7px 18px",background:th.card2,borderBottom:`1px solid ${th.border}`,flexWrap:"wrap",flexShrink:0}}>
          <span style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",marginRight:3}}>Filter:</span>
          <button onClick={()=>{setFilters(new Set(Object.keys(cats||{})));setIsolatedCat(null);setPreIsolateFilters(null);}} title="Show all" style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:20,padding:"3px 9px",fontSize:11,color:th.muted,fontWeight:600}}>All</button>
          <button onClick={()=>{setFilters(new Set());setIsolatedCat(null);setPreIsolateFilters(null);}} title="Hide all" style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:20,padding:"3px 9px",fontSize:11,color:th.muted,fontWeight:600}}>None</button>

          {sortedCatEntries(cats).map(([k,v])=>{
            const active=filters.has(k);
            const isIsolated=isolatedCat===k;
            return(
              <button key={k} onClick={e=>handleFilterClick(k, e.shiftKey)}
                title={isIsolated ? "Click again to restore previous filters. Hold Shift to toggle multiple categories." : active ? `Click to isolate and show only ${v.label}. Hold Shift to toggle multiple categories.` : `Click to show ${v.label}. Hold Shift to toggle multiple categories.`}
                style={{
                  background:active?`${v.hex}1e`:"transparent",
                  border:`${isIsolated?"2px":"1px"} solid ${active?v.hex:th.border}`,
                  borderRadius:20,
                  padding:"3px 9px",
                  fontSize:11,
                  fontWeight:600,
                  color:active?v.hex:th.muted,
                  boxShadow:isIsolated?`0 0 0 2px ${v.hex}44`:"none"
                }}
              >
                {v.label}
              </button>
            );
          })}

          {isolatedCat && <span style={{fontSize:11,color:th.muted,fontStyle:"italic",marginLeft:2}}>(isolated — click again to restore)</span>}
        </div>

        {/* BODY */}
        <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
          {view==="calendar" ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:"14px 16px",gap:12,minWidth:0}}>
              <div className="noprint" style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <button onClick={()=>setVs(p=>advM(p,-span))} title="Previous" style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:6,padding:"6px 16px",color:th.text,fontSize:13}}>
                  ← Prev
                </button>
                <JumpTodayBtn dark={dark} onClick={()=>setVs({year: todayD.getFullYear(), month: todayD.getMonth()})} />
                <button onClick={()=>setVs(p=>advM(p,span))} title="Next" style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:6,padding:"6px 16px",color:th.text,fontSize:13}}>
                  Next →
                </button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:cols,gap:14,flex:1,minHeight:0}}>
                {months.map(({year,month})=>(
                  <MonthGrid
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    events={filteredEvs}
                    dark={dark}
                    todayStr={todayStr}
                    onSelect={setSelected}
                    editMode={editMode}
                    onEdit={setEditing}
                  />
                ))}
              </div>
            </div>
          ) : (
            <TimelineView
              events={filteredEvs}
              dark={dark}
              filters={filters}
              todayD={todayD}
              onSelect={setSelected}
              editMode={editMode}
              onEdit={setEditing}
            />
          )}

          {showPanel && (
            <Panel
              events={filteredEvs}
              dark={dark}
              filters={filters}
              lookahead={lookahead}
              setLookahead={setLookahead}
              editMode={editMode}
              onEdit={setEditing}
              todayD={todayD}
            />
          )}
        </div>

        {/* Edit mode helper bar */}
        {editMode && (
          <div className="noprint" style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:th.card,border:"1px solid #3b82f6",borderRadius:8,padding:"9px 20px",display:"flex",alignItems:"center",gap:13,boxShadow:"0 8px 32px rgba(0,0,0,.2)",zIndex:100,whiteSpace:"nowrap"}}>
            <span style={{fontSize:13,color:th.muted}}>
              🔓 <strong style={{color:th.text}}>Edit mode</strong> — click any event to modify. Changes save automatically.
            </span>
            <button onClick={()=>{setEditMode(false); editorKeyRef.current="";}} title="Exit edit mode" style={{background:"#1e40af",border:"none",borderRadius:5,padding:"5px 14px",color:"#fff",fontSize:12,fontWeight:700}}>
              Exit Edit Mode
            </button>
          </div>
        )}

        {/* Modals */}
        {selected && !editing && (
          <EventDetailPopup
            ev={selected}
            dark={dark}
            editMode={editMode}
            todayD={todayD}
            onEdit={ev=>{setSelected(null);setEditing(ev);}}
            onClose={()=>setSelected(null)}
          />
        )}

        {editing && (
          <EditModal
            ev={editing}
            dark={dark}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={()=>setEditing(null)}
          />
        )}

        {showCatMgr && (
          <CategoryManager
            cats={cats}
            events={events}
            dark={dark}
            onSave={handleSaveCats}
            onClose={()=>setShowCatMgr(false)}
          />
        )}

        {showAdmin && (
          <AdminTable
            events={events}
            dark={dark}
            onEdit={ev=>setEditing(ev)}
            onAdd={()=>setEditing({_new:true,label:"",start:todayStr,end:todayStr,cat:"milestone",crit:false,details:""})}
            onExport={handleExport}
            onImport={handleImport}
            onClose={()=>setShowAdmin(false)}
            onManageCats={()=>setShowCatMgr(true)}
          />
        )}

        {showPwModal && (
          <PasswordModal
            dark={dark}
            onSuccess={onPasswordSuccess}
            onClose={()=>setShowPwModal(false)}
          />
        )}

        {toast && <Toast msg={toast} dark={dark} />}
      </div>
    </CatsCtx.Provider>
  );
}

/* ============================
   SIDE PANEL (uses runtime today)
   ============================ */

function Panel({events,dark,filters,lookahead,setLookahead,editMode,onEdit,todayD}){
  const th=dark?TH.dark:TH.light;
  const cats=useCats();
  const catHex=useCatHex();

  const upcoming=useMemo(()=>
    (events||[])
      .filter(e=>{
        const d = Math.round((toD(e.start) - todayD)/86400000);
        return d>=0 && d<=lookahead && filters.has(e.cat);
      })
      .sort((a,b)=>a.start.localeCompare(b.start)),
  [events,filters,lookahead,todayD]);

  const nextCrit=useMemo(()=>
    (events||[])
      .filter(e=>{
        const d = Math.round((toD(e.start) - todayD)/86400000);
        return e.crit && d>=0;
      })
      .sort((a,b)=>a.start.localeCompare(b.start))[0],
  [events,todayD]);

  const urg = d => d<=7 ? "#ef4444" : d<=21 ? "#f59e0b" : "#64748b";

  return(
    <div style={{width:278,display:"flex",flexDirection:"column",background:th.card,borderLeft:`1px solid ${th.border}`,flexShrink:0,overflow:"hidden"}}>

      {nextCrit && (
        <div style={{padding:"11px 15px",background:dark?"#1c0a00":"#fff7ed",borderBottom:`1px solid ${dark?"#7c2d12":"#fdba74"}`,flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:800,color:"#f97316",textTransform:"uppercase",letterSpacing:".13em",marginBottom:4}}>⚡ Next Critical</div>
          <div style={{fontSize:13,fontWeight:700,color:dark?"#fde68a":"#92400e",lineHeight:1.3,marginBottom:4}}>
            {nextCrit.label}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:11,color:dark?"#9a5c00":"#b45309"}}>{dispDate(nextCrit.start)}</span>
            <span style={{fontSize:11,fontWeight:800,background:"#c2410c",color:"#fff",borderRadius:3,padding:"1px 8px"}}>
              {Math.round((toD(nextCrit.start)-todayD)/86400000)}d
            </span>
          </div>
        </div>
      )}

      <div style={{padding:"11px 15px",borderBottom:`1px solid ${th.border}`,flexShrink:0}}>
        <div style={{fontSize:11,fontWeight:700,color:th.muted,textTransform:"uppercase",letterSpacing:".09em",marginBottom:7}}>Lookahead</div>
        <div style={{display:"flex",gap:5}}>
          {[14,30,60,90].map(d=>(
            <button key={d} onClick={()=>setLookahead(d)} title={`Show events in the next ${d} days`}
              style={{
                flex:1,
                background:lookahead===d?"#1e40af":"transparent",
                border:`1px solid ${lookahead===d?"#3b82f6":th.border}`,
                borderRadius:5,
                padding:"5px 0",
                color:lookahead===d?"#fff":th.muted,
                fontSize:12,
                fontWeight:700
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {upcoming.length===0 && <div style={{padding:28,color:th.muted,fontSize:13,textAlign:"center"}}>No events in this window</div>}
        {upcoming.map((ev,i)=>{
          const hex=catHex(ev.cat);
          const d=Math.round((toD(ev.start)-todayD)/86400000);
          return(
            <div key={i} style={{padding:"9px 15px",borderBottom:`1px solid ${th.border}`,cursor:"default"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                <span style={{fontSize:10,fontWeight:800,color:hex,textTransform:"uppercase",letterSpacing:".09em"}}>
                  {cats?.[ev.cat]?.label ?? ev.cat}
                </span>
                <span style={{fontSize:11,fontWeight:800,color:urg(d),background:`${urg(d)}18`,borderRadius:3,padding:"1px 6px"}}>
                  {d===0?"TODAY":`${d}d`}
                </span>
              </div>
              <div style={{fontSize:13,fontWeight:600,color:th.text,lineHeight:1.35,marginBottom:2}}>
                {ev.crit && "⚡ "}{ev.label}
              </div>
              <div style={{fontSize:11,color:th.muted}}>
                {dispDate(ev.start)}{ev.start!==ev.end?` – ${dispDate(ev.end)}`:""}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{borderTop:`1px solid ${th.border}`,padding:"10px 15px 12px",flexShrink:0,background:th.card2}}>
        <div style={{fontSize:10,fontWeight:700,color:th.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:7}}>Legend</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px 12px"}}>
          {sortedCatEntries(cats).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:9,height:9,background:v.hex,borderRadius:2,flexShrink:0}} />
              <span style={{fontSize:10,color:th.sub,whiteSpace:"nowrap"}}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {editMode && (
        <div style={{padding:"11px 15px",borderTop:`1px solid ${th.border}`,flexShrink:0}}>
          <button
            onClick={()=>onEdit({_new:true,label:"",start:toS(todayD),end:toS(todayD),cat:"milestone",crit:false,details:""})}
            title="Add a new event"
            style={{width:"100%",background:"#1e40af",border:"none",borderRadius:6,padding:"9px 0",color:"#fff",fontSize:13,fontWeight:700}}
          >
            + Add New Event
          </button>
        </div>
      )}

    </div>
  );
}

export default App;
