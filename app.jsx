/* app.jsx — Drop-in replacement
   - Shared events + categories via SAVE_SERVICE_BASE
   - In-browser editing preserved (password gate)
   - Status indicator: Saving / Failed / Updated timestamp
   - No localStorage dependence
*/

const { useState, useMemo, useEffect, useRef, useContext, createContext } = React;

/* ============================
   CONFIG
   ============================ */

// Set this to your deployed Save Service base URL (Cloudflare Worker / Azure Function).
// Must implement:
//   GET  {base}/events  -> { updatedUtc, events: [...] }
//   PUT  {base}/events  (JSON body) with header X-Editor-Key
//   GET  {base}/cats    -> { ...catsObject... }
//   PUT  {base}/cats    (JSON body) with header X-Editor-Key
const SAVE_SERVICE_BASE = "https://evle-calendar-api.newbauer.workers.dev";

// Casual edit protection only (prevents accidental edits).
// Not a security boundary (view-source reveals it).
const EDIT_PASSWORD = "EVLE2026";

// Debounce (ms) for autosave after edits to prevent excessive commits.
const SAVE_DEBOUNCE_MS = 900;

// Timeline range (leave as-is unless your schedule range changes)
const TL_START = new Date(2026, 4, 1);   // May 1, 2026
const TL_END   = new Date(2027, 11, 31); // Dec 31, 2027

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
   DEFAULT CATEGORIES + SEED EVENTS
   ============================ */

const DEFAULT_CATS = {
  holiday:    { label: "Holiday",                 hex: "#64748b" },
  freeze:     { label: "File Freeze",             hex: "#ef4444" },
  disc_freeze:{ label: "Discipline Freeze",       hex: "#f97316" },
  milestone:  { label: "Milestone / Submittal",   hex: "#f59e0b" },
  rollplot:   { label: "Roll Plots",              hex: "#2563eb" },
  kh_review:  { label: "KH Consistency Review",   hex: "#10b981" },
  idr:        { label: "IDR Roll Plots / Memo",   hex: "#8b5cf6" },
  plans_qc:   { label: "Plans QC / QA",           hex: "#ec4899" },
  bod:        { label: "BOD",                     hex: "#a78bfa" },
  st_review:  { label: "ST Review",               hex: "#14b8a6" },
  comment:    { label: "Comment Resolution",      hex: "#6366f1" },
  row:        { label: "ROW",                     hex: "#94a3b8" },
  stn_wb:     { label: "Station Workbook / WP QC",hex: "#84cc16" },
  mor:        { label: "MOR Meetings / Memo",     hex: "#d97706" },
  meeting:    { label: "Meeting / Workshop",      hex: "#f43f5e" },
};

const SEED = [
  {id:1,  label:"Draft Internal Roll Plots Due",          start:"2026-05-15",end:"2026-05-15",cat:"rollplot", crit:true},
  {id:2,  label:"O&M Meetings – ST Ops & Maintenance",    start:"2026-05-18",end:"2026-05-22",cat:"meeting"},
  {id:3,  label:"Memorial Day",                           start:"2026-05-25",end:"2026-05-25",cat:"holiday"},
  {id:4,  label:"O&M Meetings – ST Ops & Maintenance",    start:"2026-05-26",end:"2026-05-29",cat:"meeting"},
  {id:5,  label:"ST Roll Plots Due",                      start:"2026-06-12",end:"2026-06-12",cat:"rollplot"},
  {id:6,  label:"Juneteenth",                             start:"2026-06-19",end:"2026-06-19",cat:"holiday"},
  {id:7,  label:"Independence Day (observed)",            start:"2026-07-03",end:"2026-07-03",cat:"holiday"},
  {id:8,  label:"30% Track Input Freeze",                 start:"2026-07-13",end:"2026-07-17",cat:"freeze",  crit:true},
  {id:9,  label:"CATEX Approved",                         start:"2026-07-31",end:"2026-07-31",cat:"milestone",crit:true},
  {id:10, label:"30% Track Pencils Down",                 start:"2026-08-10",end:"2026-08-14",cat:"freeze",  crit:true},
  {id:11, label:"ST Roll Plots Due",                      start:"2026-08-18",end:"2026-08-18",cat:"rollplot"},
  {id:12, label:"Labor Day",                              start:"2026-09-07",end:"2026-09-07",cat:"holiday"},
  {id:13, label:"Publish DEIS",                           start:"2026-09-18",end:"2026-09-18",cat:"milestone",crit:true},
  {id:14, label:"ST Roll Plots Due",                      start:"2026-10-09",end:"2026-10-09",cat:"rollplot"},
  {id:15, label:"RFIF",                                   start:"2026-10-09",end:"2026-10-09",cat:"milestone"},
  {id:16, label:"Columbus Day",                           start:"2026-10-13",end:"2026-10-13",cat:"holiday"},
  {id:17, label:"Veterans Day",                           start:"2026-11-11",end:"2026-11-11",cat:"holiday"},
  {id:18, label:"ST Roll Plots Due",                      start:"2026-11-20",end:"2026-11-20",cat:"rollplot"},
  {id:19, label:"Thanksgiving",                           start:"2026-11-26",end:"2026-11-26",cat:"holiday"},
  {id:20, label:"30% Major Design Input Freeze",          start:"2026-12-04",end:"2026-12-04",cat:"freeze",  crit:true},
  {id:21, label:"ST Roll Plots Due",                      start:"2026-12-18",end:"2026-12-18",cat:"rollplot"},
  {id:22, label:"PM/CM On Board",                         start:"2026-12-18",end:"2026-12-18",cat:"milestone"},
  {id:23, label:"Christmas",                              start:"2026-12-25",end:"2026-12-25",cat:"holiday"},
  {id:24, label:"New Year's Day",                         start:"2027-01-01",end:"2027-01-01",cat:"holiday"},
  {id:25, label:"MLK Jr. Day",                            start:"2027-01-19",end:"2027-01-19",cat:"holiday"},
  {id:26, label:"All Full Parcel Acquisitions Known",     start:"2027-01-19",end:"2027-01-19",cat:"row",     crit:true},
  {id:27, label:"Board Confirms / IDs PA",                start:"2027-01-27",end:"2027-01-27",cat:"milestone",crit:true},
  {id:28, label:"Construction Packages Determined",       start:"2027-01-29",end:"2027-01-29",cat:"milestone",crit:true},
  {id:29, label:"30% Minor Design Input Freeze",          start:"2027-02-05",end:"2027-02-05",cat:"freeze",  crit:true},
  {id:30, label:"Presidents Day",                         start:"2027-02-15",end:"2027-02-15",cat:"holiday"},
  {id:31, label:"ST Roll Plots Due",                      start:"2027-02-19",end:"2027-02-19",cat:"rollplot"},
  {id:32, label:"All Discipline Preliminary PL Freeze",   start:"2027-02-26",end:"2027-02-26",cat:"freeze",  crit:true},
  {id:33, label:"Consistency Review Plans Due",           start:"2027-04-14",end:"2027-04-16",cat:"milestone",crit:true},
  {id:34, label:"ST Roll Plots Due",                      start:"2027-04-16",end:"2027-04-16",cat:"rollplot"},
  {id:35, label:"All Disciplines File Freeze (IDR)",      start:"2027-04-19",end:"2027-04-21",cat:"freeze",  crit:true},
  {id:36, label:"KH Consistency Review of Plans",         start:"2027-04-19",end:"2027-05-07",cat:"kh_review"},
  {id:37, label:"IDR Roll Plots Due – Virtual Review",    start:"2027-04-22",end:"2027-04-22",cat:"idr",     crit:true},
  {id:38, label:"Virtual IDR Review of Roll Plots",       start:"2027-04-26",end:"2027-04-30",cat:"idr"},
  {id:39, label:"Review IDR Comments / Travel",           start:"2027-05-03",end:"2027-05-04",cat:"idr"},
  {id:40, label:"In-Person IDR Workshop",                 start:"2027-05-05",end:"2027-05-07",cat:"meeting", crit:true},
  {id:41, label:"Survey Basefile Freeze",                 start:"2027-05-17",end:"2027-05-17",cat:"freeze",  crit:true},
  {id:42, label:"Ecosystems Freeze",                      start:"2027-05-24",end:"2027-05-24",cat:"disc_freeze"},
  {id:43, label:"Traffic Freeze",                         start:"2027-05-25",end:"2027-05-25",cat:"disc_freeze"},
  {id:44, label:"Utilities Freeze",                       start:"2027-05-26",end:"2027-05-26",cat:"disc_freeze"},
  {id:45, label:"Stations & Systems Freeze",              start:"2027-05-28",end:"2027-05-28",cat:"disc_freeze"},
  {id:46, label:"Memorial Day",                           start:"2027-05-31",end:"2027-05-31",cat:"holiday"},
  {id:47, label:"Drainage & Structures Freeze",           start:"2027-06-01",end:"2027-06-02",cat:"disc_freeze"},
  {id:48, label:"Roadway & Corridor Grading Freeze",      start:"2027-06-07",end:"2027-06-07",cat:"disc_freeze"},
  {id:49, label:"Demo Freeze",                            start:"2027-06-09",end:"2027-06-09",cat:"disc_freeze"},
  {id:50, label:"ST Roll Plots Due",                      start:"2027-06-11",end:"2027-06-11",cat:"rollplot"},
  {id:51, label:"All Temp & Partial Acquisitions Known",  start:"2027-06-17",end:"2027-06-17",cat:"row"},
  {id:52, label:"Juneteenth",                             start:"2027-06-19",end:"2027-06-19",cat:"holiday"},
  {id:53, label:"Demo Wipeout Freeze",                    start:"2027-06-21",end:"2027-06-21",cat:"disc_freeze"},
  {id:54, label:"Develop IDR Memo",                       start:"2027-06-23",end:"2027-06-30",cat:"idr"},
  {id:55, label:"Final ROW Freeze",                       start:"2027-06-25",end:"2027-06-25",cat:"freeze",  crit:true},
  {id:56, label:"QC Basefile & Sheet Index Freeze",       start:"2027-06-28",end:"2027-06-29",cat:"freeze",  crit:true},
  {id:57, label:"IDR Memo QA Review",                     start:"2027-06-28",end:"2027-07-02",cat:"idr"},
  {id:58, label:"BOD Input Due",                          start:"2027-07-01",end:"2027-07-02",cat:"bod",     crit:true},
  {id:59, label:"CAD to GIS / Revit Transfer",            start:"2027-07-02",end:"2027-07-02",cat:"milestone"},
  {id:60, label:"Independence Day",                       start:"2027-07-04",end:"2027-07-04",cat:"holiday"},
  {id:61, label:"BOD SME Final Input & Exhibits",         start:"2027-07-05",end:"2027-07-09",cat:"bod"},
  {id:62, label:"QC Plans Due & QC Packaging",            start:"2027-07-07",end:"2027-07-09",cat:"plans_qc",crit:true},
  {id:63, label:"QC Checker Onboarding",                  start:"2027-07-07",end:"2027-07-11",cat:"plans_qc"},
  {id:64, label:"Plans General / Title Block QC Check",   start:"2027-07-12",end:"2027-07-18",cat:"plans_qc"},
  {id:65, label:"BOD QC Check",                           start:"2027-07-12",end:"2027-07-18",cat:"bod"},
  {id:66, label:"GC/CM's On Board",                       start:"2027-07-16",end:"2027-07-16",cat:"milestone"},
  {id:67, label:"Plans Technical QC Check",               start:"2027-07-19",end:"2027-08-01",cat:"plans_qc"},
  {id:68, label:"BOD QC Back Check",                      start:"2027-07-25",end:"2027-07-25",cat:"bod"},
  {id:69, label:"BOD QC Correct",                         start:"2027-07-26",end:"2027-08-01",cat:"bod"},
  {id:70, label:"Plans QC Back Check",                    start:"2027-08-02",end:"2027-08-13",cat:"plans_qc"},
  {id:71, label:"BOD QC Format",                          start:"2027-08-02",end:"2027-08-08",cat:"bod"},
  {id:72, label:"Plans QC Rejected/Deferred Comments",    start:"2027-08-11",end:"2027-08-15",cat:"plans_qc"},
  {id:73, label:"BOD QC Verify",                          start:"2027-08-09",end:"2027-08-15",cat:"bod"},
  {id:74, label:"Plans QC Corrections",                   start:"2027-08-16",end:"2027-08-29",cat:"plans_qc"},
  {id:75, label:"BOD QA Review / Final Corrections",      start:"2027-08-16",end:"2027-08-22",cat:"bod"},
  {id:76, label:"Finalize Design Deviation Requests",     start:"2027-08-28",end:"2027-08-30",cat:"milestone"},
  {id:77, label:"BOD Packaging",                          start:"2027-08-23",end:"2027-08-29",cat:"bod"},
  {id:78, label:"Plans Verification",                     start:"2027-08-30",end:"2027-09-05",cat:"plans_qc"},
  {id:79, label:"Roll Plot QC Check / Back Check",        start:"2027-08-30",end:"2027-09-10",cat:"rollplot"},
  {id:80, label:"Labor Day",                              start:"2027-09-01",end:"2027-09-01",cat:"holiday"},
  {id:81, label:"Stations Workbook QC Review",            start:"2027-09-01",end:"2027-09-12",cat:"stn_wb"},
  {id:82, label:"MOR Memo Development",                   start:"2027-09-08",end:"2027-09-12",cat:"mor"},
  {id:83, label:"Plans QA Review / Final Corrections",    start:"2027-09-08",end:"2027-09-15",cat:"plans_qc"},
  {id:84, label:"Roll Plot Correct / Verify",             start:"2027-09-08",end:"2027-09-12",cat:"rollplot"},
  {id:85, label:"MOR QA Review",                          start:"2027-09-11",end:"2027-09-12",cat:"mor"},
  {id:86, label:"Plans Packaging",                        start:"2027-09-13",end:"2027-09-16",cat:"plans_qc"},
  {id:87, label:"Roll Plot QA & Packaging",               start:"2027-09-13",end:"2027-09-16",cat:"rollplot"},
  {id:88, label:"SUBMIT 30% Plans / BOD / Roll Plots / Workbook / Memos",start:"2027-09-17",end:"2027-09-17",cat:"milestone",crit:true},
  {id:89, label:"ST Review: 30% Submittal",               start:"2027-09-20",end:"2027-10-08",cat:"st_review"},
  {id:90, label:"ST 30% SME Review Comments Due",         start:"2027-10-08",end:"2027-10-08",cat:"milestone",crit:true},
  {id:91, label:"Columbus Day",                           start:"2027-10-13",end:"2027-10-13",cat:"holiday"},
  {id:92, label:"ST: Design Manager Review of Comments",  start:"2027-10-12",end:"2027-10-24",cat:"st_review"},
  {id:93, label:"Consultant: Draft Comment Responses",    start:"2027-10-13",end:"2027-10-22",cat:"plans_qc"},
  {id:94, label:"Responses & Flagged Comments Due",       start:"2027-10-22",end:"2027-10-22",cat:"milestone"},
  {id:95, label:"Comment Resolution Meetings (Major)",    start:"2027-10-22",end:"2027-11-05",cat:"comment"},
  {id:96, label:"ST: SME Reviewer Response Disposition",  start:"2027-10-22",end:"2027-11-12",cat:"st_review"},
  {id:97, label:"Veterans Day",                           start:"2027-11-11",end:"2027-11-11",cat:"holiday"},
  {id:98, label:"Comment Resolution Meetings (Minor)",    start:"2027-11-01",end:"2027-11-19",cat:"comment"},
  {id:99, label:"Publish FEIS",                           start:"2027-11-19",end:"2027-11-19",cat:"milestone",crit:true},
  {id:100,label:"Update Plans per Comment Resolution",    start:"2027-11-22",end:"2027-11-28",cat:"plans_qc"},
  {id:101,label:"Thanksgiving",                           start:"2027-11-25",end:"2027-11-25",cat:"holiday"},
  {id:102,label:"Checkers Review Updated Plans",          start:"2027-11-29",end:"2027-12-05",cat:"plans_qc"},
  {id:103,label:"Back Check Review & Implement Corrections",start:"2027-12-01",end:"2027-12-05",cat:"plans_qc"},
  {id:104,label:"Verify & Package for QA Review",         start:"2027-12-06",end:"2027-12-12",cat:"plans_qc"},
  {id:105,label:"QA Review & Final Corrections",          start:"2027-12-13",end:"2027-12-17",cat:"plans_qc"},
  {id:106,label:"Revise & Resubmit – Non-Compliance",     start:"2027-12-17",end:"2027-12-17",cat:"milestone"},
  {id:107,label:"Board Selects Project to Be Built",      start:"2027-12-21",end:"2027-12-21",cat:"milestone",crit:true},
  {id:108,label:"Christmas",                              start:"2027-12-25",end:"2027-12-25",cat:"holiday"},
];

/* ============================
   CATEGORIES CONTEXT
   ============================ */

const CatsCtx = createContext(DEFAULT_CATS);
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

function parseCSVLine(line){
  const res=[]; let cur="", inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(inQ && line[i+1]==='"'){ cur+='"'; i++; }
      else inQ=!inQ;
    } else if(c===',' && !inQ){
      res.push(cur); cur="";
    } else cur+=c;
  }
  res.push(cur);
  return res;
}

function exportCSV(events){
  const hdr="id,label,start,end,cat,crit";
  const rows = events.map(e=>[
    e.id,
    `"${(e.label||"").replace(/"/g,'""')}"`,
    e.start,
    e.end,
    e.cat,
    e.crit?"TRUE":"FALSE"
  ].join(","));
  const blob = new Blob([[hdr,...rows].join("\r\n")], {type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="EVLE_Phase3_Calendar.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

function parseImportCSV(text, cats){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return null;
  const evs=[]; let maxId=0;
  lines.slice(1).forEach((line,i)=>{
    const f=parseCSVLine(line); if(f.length<5) return;
    const id = parseInt(f[0]) || (Date.now()+i);
    const label = (f[1]||"").replace(/^"|"$/g,"").replace(/""/g,'"').trim();
    const start = (f[2]||"").trim();
    const end   = ((f[3]||"").trim() || start);
    const cat   = (f[4]||"milestone").trim();
    const crit  = (f[5]||"").trim().toUpperCase()==="TRUE" || (f[5]||"").trim()==="1";

    if(!label || !start.match(/^\d{4}-\d{2}-\d{2}$/)) return;
    if(id>maxId) maxId=id;
    evs.push({
      id,
      label,
      start,
      end: end>=start ? end : start,
      cat: cats?.[cat] ? cat : "milestone",
      crit
    });
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
      title={ev.label+(ev.start!==ev.end?durLabel(ev.start,ev.end):"")}
      style={{
        position:"absolute",
        left:`${colStart*100/7}%`,
        width:`${(colEnd-colStart+1)*100/7}%`,
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
            <div key={i} style={{borderRight:`1px solid ${th.grid}`}} />
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
            <div key={i} style={{borderRight:`1px solid ${th.grid}`}} />
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
  const inp=useRef();

  useEffect(()=>{ setTimeout(()=>inp.current&&inp.current.focus(),60); },[]);

  function attempt(){
    if(pw===EDIT_PASSWORD) onSuccess();
    else{
      setErr(true); setPw("");
      setTimeout(()=>setErr(false),1400);
    }
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${err?"#ef4444":th.border}`,borderRadius:10,padding:28,width:340,boxShadow:"0 20px 60px rgba(0,0,0,.4)",transition:"border-color .2s"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:22,marginBottom:6}}>🔐</div>
        <div style={{fontWeight:700,fontSize:16,color:th.text,marginBottom:4}}>Edit Access</div>
        <div style={{fontSize:13,color:th.muted,marginBottom:18,lineHeight:1.5}}>
          Enter the edit password to enable schedule editing.
        </div>
        <input
          ref={inp}
          type="password"
          value={pw}
          onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&attempt()}
          placeholder="Password"
          style={{
            width:"100%",
            background:th.card2,
            border:`1px solid ${err?"#ef4444":th.border}`,
            borderRadius:6,
            padding:"9px 12px",
            color:th.text,
            fontSize:14,
            outline:"none",
            marginBottom:err?6:14
          }}
        />
        {err && <div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>Incorrect password. Try again.</div>}
        <div style={{display:"flex",gap:9}}>
          <button onClick={attempt} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"10px 0",color:"#fff",fontSize:13,fontWeight:700}}>Unlock</button>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"10px 14px",color:th.muted,fontSize:13}}>Cancel</button>
        </div>
        <div style={{marginTop:14,fontSize:11,color:th.sub,lineHeight:1.5}}>
          Tip: this is casual access control to prevent accidental edits.
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

  const inp={
    background:th.card2,
    border:`1px solid ${th.border}`,
    borderRadius:6,
    padding:"8px 11px",
    color:th.text,
    fontSize:13,
    outline:"none",
    width:"100%"
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:10,padding:26,width:410,boxShadow:"0 20px 60px rgba(0,0,0,.5)",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:17,color:th.text,marginBottom:18}}>{ev._new?"Add Event":"Edit Event"}</div>

        <label style={{fontSize:11,color:th.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",display:"block",marginBottom:5}}>Event Name</label>
        <input value={label} onChange={e=>setLabel(e.target.value)} style={{...inp,marginBottom:12}} />

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
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
          {Object.entries(cats||{}).map(([k,v])=>(
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:22}}>
          <input type="checkbox" id="mc" checked={crit} onChange={e=>setCrit(e.target.checked)} style={{accentColor:"#f59e0b",width:15,height:15}}/>
          <label htmlFor="mc" style={{fontSize:13,color:th.muted,cursor:"pointer"}}>⚡ Mark as Critical Milestone</label>
        </div>

        <div style={{display:"flex",gap:9}}>
          <button onClick={()=>onSave({...ev,label,start,end:end>=start?end:start,cat,crit})} style={{flex:1,background:"#1e40af",border:"none",borderRadius:6,padding:"10px 0",color:"#fff",fontSize:13,fontWeight:700}}>Save</button>
          {!ev._new && <button onClick={()=>onDelete(ev)} style={{background:"#7f1d1d",border:"none",borderRadius:6,padding:"10px 14px",color:"#fca5a5",fontSize:13,fontWeight:700}}>Delete</button>}
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"10px 14px",color:th.muted,fontSize:13}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CategoryManager({cats,events,onSave,onClose,dark}){
  const th=dark?TH.dark:TH.light;

  const [draft,setDraft]=useState(()=>Object.entries(cats||{}).map(([k,v])=>({key:k,label:v.label,hex:v.hex,_orig:k})));
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

function AdminTable({events,dark,onEdit,onAdd,onImport,onExport,onReset,onClose,onManageCats}){
  const th=dark?TH.dark:TH.light;
  const cats=useCats();
  const catHex=useCatHex();
  const [sort,setSort]=useState("start");
  const [q,setQ]=useState("");
  const [confirmReset,setConfirmReset]=useState(false);
  const fileRef=useRef();

  const filtered=[...(events||[])]
    .filter(e=>!q || e.label.toLowerCase().includes(q.toLowerCase()) || (cats?.[e.cat]?.label||"").toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>String(a[sort])<String(b[sort])?-1:1);

  const th2={fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:th.muted,padding:"8px 12px",background:th.card2,borderBottom:`1px solid ${th.border}`,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"};
  const td ={fontSize:13,color:th.text,padding:"7px 12px",borderBottom:`1px solid ${th.border}`,verticalAlign:"middle"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:350,paddingTop:44,paddingBottom:44,overflowY:"auto"}} onClick={onClose}>
      <div style={{background:th.card,border:`1px solid ${th.border}`,borderRadius:12,width:"min(980px,96vw)",display:"flex",flexDirection:"column",maxHeight:"88vh",boxShadow:"0 24px 64px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${th.border}`,display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16,color:th.text}}>Admin Table</div>
            <div style={{fontSize:12,color:th.muted,marginTop:1}}>{filtered.length} of {events.length} events</div>
          </div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
            style={{background:th.card2,border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 11px",color:th.text,fontSize:13,outline:"none",width:180}} />
          <button onClick={onAdd} style={{background:"#1e40af",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",fontSize:13,fontWeight:700}}>+ Add Event</button>
          <button onClick={onManageCats} style={{background:dark?"#1a0c2e":"#ede9fe",border:"1px solid #8b5cf6",borderRadius:6,padding:"7px 14px",color:"#8b5cf6",fontSize:13,fontWeight:700}}>🎨 Categories</button>
          <button onClick={onExport} style={{background:dark?"#0c2a0c":"#dcfce7",border:"1px solid #16a34a",borderRadius:6,padding:"7px 14px",color:"#16a34a",fontSize:13,fontWeight:700}}>↓ Export CSV</button>
          <button onClick={()=>fileRef.current.click()} style={{background:dark?"#1a1a0c":"#fefce8",border:"1px solid #ca8a04",borderRadius:6,padding:"7px 14px",color:"#ca8a04",fontSize:13,fontWeight:700}}>↑ Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}}
            onChange={e=>{const f=e.target.files[0]; if(f) onImport(f); e.target.value="";}} />
          {!confirmReset
            ? <button onClick={()=>setConfirmReset(true)} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 12px",color:th.muted,fontSize:13}}>Reset</button>
            : <button onClick={()=>{onReset();setConfirmReset(false);}} style={{background:"#7f1d1d",border:"none",borderRadius:6,padding:"7px 12px",color:"#fca5a5",fontSize:13,fontWeight:700}}>Confirm Reset</button>
          }
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${th.border}`,borderRadius:6,padding:"7px 11px",color:th.muted,fontSize:13}}>✕</button>
        </div>

        <div style={{padding:"7px 20px",background:dark?"#0a1218":"#f0fdf4",borderBottom:`1px solid ${th.border}`,fontSize:11,color:dark?"#4b8a5a":"#166534",fontFamily:"'IBM Plex Mono',monospace"}}>
          CSV format: id, label, start (YYYY-MM-DD), end (YYYY-MM-DD), cat, crit (TRUE/FALSE)
        </div>

        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead style={{position:"sticky",top:0,zIndex:2}}>
              <tr>
                <th style={{...th2,width:34}} onClick={()=>setSort("crit")}>⚡</th>
                <th style={th2} onClick={()=>setSort("label")}>Event Name {sort==="label"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("start")}>Start {sort==="start"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("end")}>End {sort==="end"?"↑":""}</th>
                <th style={th2} onClick={()=>setSort("cat")}>Category {sort==="cat"?"↑":""}</th>
                <th style={{...th2,width:60}}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev=>(
                <tr key={ev.id} onMouseEnter={e=>e.currentTarget.style.background=th.card2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{...td,textAlign:"center"}}>{ev.crit?"⚡":""}</td>
                  <td style={td}>{ev.label}</td>
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

const TL_DAYS = Math.round((TL_END - TL_START)/86400000) + 1;
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
  const [zoom,setZoom]=useState(3);
  const totalW=TL_DAYS*zoom;

  const monthTicks=useMemo(()=>{
    const ms=[];
    let d=new Date(TL_START);
    while(d<=TL_END){
      const dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
      ms.push({
        y:d.getFullYear(),
        m:d.getMonth(),
        left:Math.round((d-TL_START)/86400000)*zoom,
        width:dim*zoom
      });
      d=new Date(d.getFullYear(),d.getMonth()+1,1);
    }
    return ms;
  },[zoom]);

  const todayX=Math.round((todayD - TL_START)/86400000)*zoom;

  const laneData=useMemo(()=>{
    return SWIM_LANE_DEFS.map(lane=>{
      const evs = events.filter(e=>lane.cats.includes(e.cat) && filters.has(e.cat));
      const {bars, lanes:numTracks} = layoutLane(evs);
      const height=Math.max(52, numTracks*TL_TRACK_H + TL_PAD*2);
      return {...lane, bars, numTracks, height};
    });
  },[events,filters]);

  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",minHeight:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 16px",background:th.card2,borderBottom:`1px solid ${th.border}`,flexShrink:0}}>
        <span style={{fontSize:11,fontWeight:700,color:th.muted,textTransform:"uppercase",letterSpacing:".09em"}}>Zoom:</span>
        <button onClick={()=>setZoom(z=>Math.max(1,z-1))} title="Zoom out" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 10px",color:th.text,fontSize:14,fontWeight:700}}>−</button>
        <span style={{fontSize:12,fontWeight:600,color:th.text,minWidth:50,textAlign:"center"}}>
          {zoom<=2?"Overview":zoom<=4?"Month":zoom<=7?"Detail":"Fine"} ({zoom}×)
        </span>
        <button onClick={()=>setZoom(z=>Math.min(10,z+1))} title="Zoom in" style={{background:th.pillBg,border:`1px solid ${th.border}`,borderRadius:4,padding:"3px 10px",color:th.text,fontSize:14,fontWeight:700}}>+</button>
        <div style={{marginLeft:8,height:16,width:1,background:th.border}}/>
        <span style={{fontSize:11,color:th.muted}}>May 2026 – Dec 2027</span>
        <span style={{marginLeft:"auto",fontSize:11,color:th.muted}}>Click any event to view details</span>
      </div>

      <div style={{flex:1,overflow:"auto",minHeight:0,minWidth:0}}>
        <div style={{minWidth:TL_LABEL_W+totalW,position:"relative"}}>
          <div style={{position:"sticky",top:0,display:"flex",zIndex:20,borderBottom:`1px solid ${th.border}`,height:TL_HDR_H}}>
            <div style={{width:TL_LABEL_W,flexShrink:0,position:"sticky",left:0,zIndex:21,background:th.hdrBg,display:"flex",alignItems:"center",padding:"0 14px",borderRight:`1px solid rgba(255,255,255,0.15)`}}>
              <span style={{fontSize:11,fontWeight:700,color:th.hdrText,textTransform:"uppercase",letterSpacing:".09em"}}>Workflow Category</span>
            </div>
            <div style={{position:"relative",flex:1,background:th.wkHdrBg,overflow:"hidden"}}>
              {monthTicks.map((mt,i)=>(
                <div key={i} style={{position:"absolute",left:mt.left,width:mt.width,height:"100%",display:"flex",alignItems:"center",paddingLeft:8,borderLeft:`1px solid ${th.border}`,overflow:"hidden"}}>
                  {(zoom>=2||i%3===0) && (
                    <span style={{fontSize:zoom<3?9:11,fontWeight:700,color:th.wkHdrText,whiteSpace:"nowrap"}}>
                      {MN[mt.m].slice(0,zoom<3?1:3)} {String(mt.y).slice(2)}
                    </span>
                  )}
                </div>
              ))}
              {todayX>=0 && todayX<=totalW && (
                <div style={{position:"absolute",left:todayX,top:0,bottom:0,width:2,background:"#ef4444",zIndex:2}}>
                  <div style={{position:"absolute",top:4,left:4,fontSize:9,fontWeight:800,color:"#ef4444",whiteSpace:"nowrap",letterSpacing:".06em"}}>TODAY</div>
                </div>
              )}
            </div>
          </div>

          {laneData.map((lane,li)=>(
            <div key={lane.id} style={{display:"flex",height:lane.height,borderBottom:`1px solid ${th.border}`,background:li%2===0?th.card:th.card2}}>
              <div style={{width:TL_LABEL_W,flexShrink:0,position:"sticky",left:0,zIndex:10,background:li%2===0?th.card:th.card2,borderRight:`1px solid ${th.border}`,display:"flex",alignItems:"center",padding:"0 14px"}}>
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
                  const evL=Math.round((toD(ev.start)-TL_START)/86400000)*zoom;
                  const evW=Math.max(zoom*2,Math.round((toD(ev.end)-toD(ev.start))/86400000+1)*zoom);
                  const showLabel=evW>Math.max(30,zoom*5);
                  return(
                    <div
                      key={bi}
                      onClick={()=>editMode?onEdit(ev):onSelect(ev)}
                      title={`${ev.label}${ev.start!==ev.end?durLabel(ev.start,ev.end):""}\n${dispDate(ev.start)}${ev.start!==ev.end?" - "+dispDate(ev.end):""}`}
                      style={{
                        position:"absolute",
                        left:evL,width:evW,
                        top:TL_PAD+bar.track*TL_TRACK_H,
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
          ))}
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
  const [editAuthorized,setEditAuthorized]=useState(false);
  const [showPwModal,setShowPwModal]=useState(false);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showCatMgr,setShowCatMgr]=useState(false);
  const [showPanel,setShowPanel]=useState(true);

  const [cats,setCats]=useState(DEFAULT_CATS);
  const [filters,setFilters]=useState(new Set(Object.keys(DEFAULT_CATS)));
  const [isolatedCat,setIsolatedCat]=useState(null);
  const [preIsolateFilters,setPreIsolateFilters]=useState(null);

  const [events,setEvents]=useState(SEED);
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [nextId,setNextId]=useState(300);

  const [lookahead,setLookahead]=useState(30);
  const [toast,setToast]=useState(null);
  const toastRef=useRef();

  // Shared status
  const [sharedUpdatedUtc,setSharedUpdatedUtc]=useState(null);
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

  // Initial load (cats then events)
  useEffect(()=>{
    (async ()=>{
      try{
        const c = await loadSharedCats();
        if(c && typeof c === "object") setCats(c);
      }catch(e){
        // fallback: DEFAULT_CATS
      }
      try{
        const ev = await loadSharedEvents();
        if(ev?.events && Array.isArray(ev.events)){
          setEvents(ev.events);
          if(ev.updatedUtc) setSharedUpdatedUtc(ev.updatedUtc);
          // set nextId safely
          const maxId = ev.events.reduce((m,x)=>Math.max(m, Number(x.id)||0), 0);
          setNextId(Math.max(300, maxId+1));
        }
      }catch(e){
        // fallback: SEED
        const maxId = SEED.reduce((m,x)=>Math.max(m, Number(x.id)||0), 0);
        setNextId(Math.max(300, maxId+1));
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
  function handleFilterClick(k){
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
    if(editMode){ setEditMode(false); return; }
    if(editAuthorized){ setEditMode(true); }
    else { setShowPwModal(true); }
  }

  function onPasswordSuccess(){
    setEditAuthorized(true);
    setEditMode(true);
    setShowPwModal(false);
    // editor key for save service
    editorKeyRef.current = EDIT_PASSWORD;
  }

  /* -------- Debounced persistence -------- */

  function schedulePersistEvents(nextEvents){
    if(!editorKeyRef.current) return; // not authorized to write
    pendingEventsRef.current = nextEvents;

    clearTimeout(saveEventsTimerRef.current);
    saveEventsTimerRef.current = setTimeout(async ()=>{
      const payload = { updatedUtc: new Date().toISOString(), events: pendingEventsRef.current || [] };
      setSaveBusy(true); setSaveErr("");
      try{
        await saveSharedEvents(payload, editorKeyRef.current);
        setSharedUpdatedUtc(payload.updatedUtc);
      }catch(e){
        setSaveErr(e?.message || String(e));
      }finally{
        setSaveBusy(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function schedulePersistCats(nextCats){
    if(!editorKeyRef.current) return;
    pendingCatsRef.current = nextCats;

    clearTimeout(saveCatsTimerRef.current);
    saveCatsTimerRef.current = setTimeout(async ()=>{
      setSaveBusy(true); setSaveErr("");
      try{
        await saveSharedCats(pendingCatsRef.current || {}, editorKeyRef.current);
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
        schedulePersistEvents(res.evs);
        showToast(`Imported ${res.evs.length} events.`);
      }
    };
    r.readAsText(file);
  }

  function handleReset(){
    setEvents(SEED);
    setCats(DEFAULT_CATS);
    setNextId(300);
    setFilters(new Set(Object.keys(DEFAULT_CATS)));
    setIsolatedCat(null); setPreIsolateFilters(null);
    schedulePersistCats(DEFAULT_CATS);
    schedulePersistEvents(SEED);
    showToast("Reset to original schedule.");
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

  return(
    <CatsCtx.Provider value={cats}>
      <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",background:th.bg,color:th.text,height:"100%",display:"flex",flexDirection:"column",fontSize:14}}>

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

            <button onClick={requestEditMode} title={editMode?"Lock schedule":"Unlock schedule for editing (password)"} style={{background:editMode?(dark?"#1e3a6e":"#dbeafe"):"transparent",border:`1px solid ${editMode?"#3b82f6":th.border}`,borderRadius:5,padding:"6px 11px",color:editMode?"#3b82f6":th.muted,fontSize:12,fontWeight:600}}>
              {editMode?"🔓 Editing":"🔒 View"}
            </button>

            {editMode && (
              <button onClick={()=>setShowAdmin(true)} title="Open Admin Table" style={{background:dark?"#0c2a4a":"#eff6ff",border:"1px solid #3b82f6",borderRadius:5,padding:"6px 11px",color:"#3b82f6",fontSize:12,fontWeight:600}}>
                📋 Admin Table
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

          {Object.entries(cats||{}).map(([k,v])=>{
            const active=filters.has(k);
            const isIsolated=isolatedCat===k;
            return(
              <button key={k} onClick={()=>handleFilterClick(k)}
                title={isIsolated ? "Click again to restore previous filters" : active ? `Click to isolate — show only ${v.label}` : `Click to show ${v.label}`}
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
            <button onClick={()=>setEditMode(false)} title="Lock" style={{background:"#1e40af",border:"none",borderRadius:5,padding:"5px 14px",color:"#fff",fontSize:12,fontWeight:700}}>
              Lock
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
            onAdd={()=>setEditing({_new:true,label:"",start:todayStr,end:todayStr,cat:"milestone",crit:false})}
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
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
          {Object.entries(cats||{}).map(([k,v])=>(
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
            onClick={()=>onEdit({_new:true,label:"",start:toS(todayD),end:toS(todayD),cat:"milestone",crit:false})}
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

/* ============================
   BOOTSTRAP
   ============================ */

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
