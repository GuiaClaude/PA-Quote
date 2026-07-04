import { useState, useMemo, useEffect } from "react";

/* â”€â”€ BRAND â”€â”€ */
const T="#3BBFC8",PK="#E0295A",BG="#080c14",BG2="#0f1420",BG3="#161d2e",BG4="#1e2740",BD="#253050",TX="#e8eaf2",TX2="#7888aa",TX3="#b0bccc",FN="'Trebuchet MS','Segoe UI',Tahoma,sans-serif";

/* â”€â”€ LOGO â”€â”€ */
const Logo=({sz=32})=>(
  <svg width={sz} height={sz} viewBox="0 0 100 100" fill="none">
    {/* Outer hexagon background */}
    <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="#fff"/>
    {/* 6 triangles radiating from center â€” matching actual PrintAmplified logo */}
    {/* Top: Magenta/Pink */}
    <polygon points="50,50 50,5 93,28" fill="#E0245A"/>
    {/* Upper-right: Teal */}
    <polygon points="50,50 93,28 93,72" fill="#00AEBF"/>
    {/* Lower-right: Pink lighter */}
    <polygon points="50,50 93,72 50,95" fill="#E8457A"/>
    {/* Bottom: Teal medium */}
    <polygon points="50,50 50,95 7,72" fill="#3BBFC8"/>
    {/* Lower-left: Teal dark */}
    <polygon points="50,50 7,72 7,28" fill="#00AEBF" opacity=".75"/>
    {/* Upper-left: Pink medium */}
    <polygon points="50,50 7,28 50,5" fill="#D4185A" opacity=".85"/>
    {/* Thin inner dividers â€” very subtle, matching the faceted look */}
    <line x1="50" y1="5"  x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    <line x1="93" y1="28" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    <line x1="93" y1="72" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    <line x1="50" y1="95" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    <line x1="7"  y1="72" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    <line x1="7"  y1="28" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
    {/* Hexagon border */}
    <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="none" stroke="#fff" strokeWidth="2"/>
  </svg>
);
const Brand=({sz=16})=>(
  <span style={{fontSize:sz,fontFamily:FN,letterSpacing:-.5}}>
    <span style={{color:T,fontWeight:300}}>Print</span><span style={{color:PK,fontWeight:800}}>Amplified</span>
  </span>
);

/* â”€â”€ MACHINES â”€â”€ */
const MACH={komori:{l:"Komori (26\"Ã—19\")",w:26,h:19},kord:{l:"Kord (25\"Ã—18\")",w:25,h:18},mo:{l:"MO (26\"Ã—19\")",w:26,h:19},sord:{l:"Sord (25\"Ã—35\")",w:25,h:35},eneo:{l:"Eneo (40\"Ã—13\")",w:40,h:13}};
/* â”€â”€ TERMS & CONDITIONS â”€â”€ */
const TANDC=[
  {t:"Quotation",b:"Valid 15 days; prices may change due to costs, exchange rates, taxes, or supplier rates."},
  {t:"Order Start",b:"Begins only with approved quote, PO, final artwork, and required down payment; verbal instructions need written confirmation."},
  {t:"Artwork",b:"Client is fully responsible for accuracy; no liability for errors post-approval; revisions incur extra fees/delays."},
  {t:"Colors",b:"CMYK used; exact match only with specified PMS; up to 10\u201315% variation is acceptable; screen colors differ from print."},
  {t:"Proofs",b:"Available at extra cost unless quoted; waiving proofing removes liability for color issues."},
  {t:"Quantity",b:"Allowable variance: \u00b110% (<1k), \u00b15% (1k\u201310k), \u00b13% (>10k); pay for actual quantity."},
  {t:"Lead Time",b:"Starts after artwork/PO/payment; estimates: digital 3\u20137 days, offset 7\u201315 days, packaging 10\u201320 days; subject to delays beyond control."},
  {t:"Cancellation",b:"Before production: pay for completed work/materials; during/after: pay full or minimum 50% of value."},
  {t:"Delivery & Storage",b:"Risk transfers upon release; unclaimed goods after 30 days may incur fees, disposed after 90 days."},
  {t:"Claims",b:"Must be filed in writing within 5 days of receipt; no claims after use/distribution."},
  {t:"Liability",b:"Limited to defective portion value; no liability for indirect/lost profits."},
  {t:"IP & Payments",b:"Client guarantees no IP infringement; new clients pay 50% down, balance before delivery; late payments incur 2% monthly interest."},
  {t:"Force Majeure",b:"No liability for delays from uncontrollable events."},
  {t:"Packaging",b:"Minor variations in materials/finishing are acceptable."},
];

/* â”€â”€ SAVED QUOTES STORAGE â”€â”€ */
const QSK="pa_quotes_v2";
const getSaved=()=>{try{return JSON.parse(localStorage.getItem(QSK)||"[]");}catch{return[];}};
const saveQuote=(hdr,sets,grand,unit)=>{
  const arr=getSaved();
  const idx=arr.findIndex(q=>q.ceNum===hdr.ceNum);
  const e={id:idx>=0?arr[idx].id:Date.now(),ceNum:hdr.ceNum,
    clientName:hdr.clientName,projectName:hdr.projectName,
    qty:hdr.qty,qtyUnit:hdr.qtyUnit,date:hdr.date,grand,unit,
    savedAt:new Date().toISOString(),hdr:{...hdr},sets};
  if(idx>=0)arr[idx]=e;else arr.unshift(e);
  localStorage.setItem(QSK,JSON.stringify(arr));
};
const deleteQuote=(id)=>{localStorage.setItem(QSK,JSON.stringify(getSaved().filter(q=>q.id!==id)));};
const genClientCENum=(clientName)=>{
  const yr=new Date().getFullYear();
  const code=(clientName||"CLIENT").replace(/[^a-zA-Z0-9]/g,"").toUpperCase().slice(0,5)||"CLNT";
  const key=`pa_ce_${yr}_${code}`;
  const n=(parseInt(localStorage.getItem(key)||"0"))+1;
  localStorage.setItem(key,String(n));
  return `PA-CE-${yr}-${code}-${String(n).padStart(4,"0")}`;
};
/* â”€â”€ ADMIN: CUSTOM PAPERS (localStorage overrides) â”€â”€ */
const CP_KEY="pa_custom_papers";
const CR_KEY="pa_custom_rates";
const CC_KEY="pa_custom_clients";

const getCustomPapers=()=>{try{return JSON.parse(localStorage.getItem(CP_KEY)||"[]");}catch{return[];}};
const saveCustomPapers=(arr)=>localStorage.setItem(CP_KEY,JSON.stringify(arr));
const getCustomRates=()=>{try{return JSON.parse(localStorage.getItem(CR_KEY)||"{}");}catch{return{};}};
const saveCustomRates=(obj)=>localStorage.setItem(CR_KEY,JSON.stringify(obj));
const getCustomClients=()=>{try{return JSON.parse(localStorage.getItem(CC_KEY)||"[]");}catch{return[];}};
const saveCustomClients=(arr)=>localStorage.setItem(CC_KEY,JSON.stringify(arr));

/* Merge built-in + custom papers, custom takes priority */
const getAllPapers=()=>{
  const custom=getCustomPapers();
  if(!custom.length)return PAPERS;
  const keys=new Set(custom.map(p=>p.g+"|"+p.l));
  const base=PAPERS.filter(p=>!keys.has(p.g+"|"+p.l));
  return[...base,...custom];
};

/* Merge built-in + custom rates */
const getMergedDIG=()=>({...DIG,...(getCustomRates().DIG||{})});
const getMergedPRESS=()=>({...PRESS,...(getCustomRates().PRESS||{})});
const getMergedLAM=()=>({...LAM,...(getCustomRates().LAM||{})});

/* Export entire database as JSON */
const exportDB=()=>{
  const data={
    version:"1.0",exportedAt:new Date().toISOString(),
    quotes:getSaved(),
    customPapers:getCustomPapers(),
    customRates:getCustomRates(),
    customClients:getCustomClients(),
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`PrintAmplified_DB_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),3000);
};

/* Import database from JSON */
const importDB=(file,onDone)=>{
  const r=new FileReader();
  r.onload=(e)=>{
    try{
      const d=JSON.parse(e.target.result);
      if(d.quotes)localStorage.setItem(QSK,JSON.stringify(d.quotes));
      if(d.customPapers)saveCustomPapers(d.customPapers);
      if(d.customRates)saveCustomRates(d.customRates);
      if(d.customClients)saveCustomClients(d.customClients);
      onDone("âœ… Database imported successfully! Refresh to see all data.");
    }catch{onDone("âŒ Invalid file format.");}
  };
  r.readAsText(file);
};



/* â”€â”€ ALL PAPERS â”€â”€ */
const PAPERS=[
  /* NAPPCO */
  {g:"NAPPCO Â· Foldcote",l:"#10 Sandwich",r:11,u:"kg"},{g:"NAPPCO Â· Foldcote",l:"#10 Solid",r:18,u:"kg"},
  {g:"NAPPCO Â· Foldcote",l:"#12 Sandwich",r:13,u:"kg"},{g:"NAPPCO Â· Foldcote",l:"#12 Solid",r:22.5,u:"kg"},
  {g:"NAPPCO Â· Foldcote",l:"#15 Sandwich",r:15,u:"kg"},{g:"NAPPCO Â· Foldcote",l:"#15 Solid",r:27.5,u:"kg"},
  {g:"NAPPCO Â· Foldcote",l:"#18 Sandwich",r:18,u:"kg"},{g:"NAPPCO Â· Foldcote",l:"#18 Solid",r:31.5,u:"kg"},
  {g:"NAPPCO Â· Foldcote",l:"#20 Sandwich",r:20.5,u:"kg"},{g:"NAPPCO Â· Foldcote",l:"#20 Solid",r:33.5,u:"kg"},
  {g:"NAPPCO Â· Claycoat/Carrier",l:"Claycoat KR/TW",r:9.5,u:"kg"},{g:"NAPPCO Â· Claycoat/Carrier",l:"Carrier All Kinds",r:13,u:"kg"},
  {g:"NAPPCO Â· C2S / Matte",l:"#55",r:29,u:"lb"},{g:"NAPPCO Â· C2S / Matte",l:"#60",r:29,u:"lb"},
  {g:"NAPPCO Â· C2S / Matte",l:"#70",r:28,u:"lb"},{g:"NAPPCO Â· C2S / Matte",l:"#80",r:28,u:"lb"},
  {g:"NAPPCO Â· C2S / Matte",l:"#100",r:28,u:"lb"},{g:"NAPPCO Â· C2S / Matte",l:"#120",r:7.5,u:"lb"},
  {g:"NAPPCO Â· C2S / Matte",l:"#140",r:8.5,u:"lb"},{g:"NAPPCO Â· C2S / Matte",l:"#160",r:10.5,u:"lb"},
  {g:"NAPPCO Â· C2S / Matte",l:"#180",r:11.5,u:"lb"},{g:"NAPPCO Â· C2S / Matte",l:"#220",r:14,u:"lb"},
  {g:"NAPPCO Â· C2S / Matte",l:"#240",r:17.5,u:"lb"},{g:"NAPPCO Â· C1S",l:"#120 C1S",r:32.5,u:"lb"},
  {g:"NAPPCO Â· Book",l:"#40 / 60gsm",r:31,u:"ream"},{g:"NAPPCO Â· Book",l:"#50 / 70gsm",r:29,u:"ream"},
  {g:"NAPPCO Â· Book",l:"#60 / 80gsm",r:29,u:"ream"},{g:"NAPPCO Â· Book",l:"#70 / 100gsm",r:29,u:"ream"},
  {g:"NAPPCO Â· Book",l:"Ivory/Cream Book",r:42,u:"ream"},{g:"NAPPCO Â· Book",l:"Pasteboard",r:2250,u:"bale"},
  {g:"NAPPCO Â· Book",l:"Chipboard",r:1950,u:"bale"},{g:"NAPPCO Â· Book",l:"Tissue",r:400,u:"ream"},
  {g:"NAPPCO Â· Book",l:"Parchment",r:14.5,u:"sht"},{g:"NAPPCO Â· Book",l:"Glassine",r:800,u:"ream"},
  {g:"NAPPCO Â· Bond",l:"BE 49gsm",r:24,u:"kg"},{g:"NAPPCO Â· Bond",l:"TE 48gsm",r:24.5,u:"kg"},
  {g:"NAPPCO Â· Bond",l:"MT 51gsm",r:26.5,u:"kg"},{g:"NAPPCO Â· Bond",l:"MT 54gsm",r:28,u:"kg"},
  {g:"NAPPCO Â· Bond",l:"MT 58gsm",r:29,u:"kg"},{g:"NAPPCO Â· Bond",l:"Colored Bond",r:40,u:"kg"},
  {g:"NAPPCO Â· Newsprint",l:"43gsm",r:750,u:"ream"},{g:"NAPPCO Â· Newsprint",l:"45gsm",r:780,u:"ream"},
  {g:"NAPPCO Â· Newsprint",l:"50gsm",r:850,u:"ream"},{g:"NAPPCO Â· Newsprint",l:"52gsm",r:910,u:"ream"},
  {g:"NAPPCO Â· Kraft (sht)",l:"#100",r:5.3,u:"sht"},{g:"NAPPCO Â· Kraft (sht)",l:"#110",r:6.0,u:"sht"},
  {g:"NAPPCO Â· Kraft (sht)",l:"#120",r:6.6,u:"sht"},{g:"NAPPCO Â· Kraft (sht)",l:"#140",r:7.4,u:"sht"},
  {g:"NAPPCO Â· Kraft (sht)",l:"#150",r:7.9,u:"sht"},{g:"NAPPCO Â· Kraft (sht)",l:"#170",r:8.9,u:"sht"},
  {g:"NAPPCO Â· Kraft (sht)",l:"#200",r:10.5,u:"sht"},{g:"NAPPCO Â· Kraft (sht)",l:"#250",r:13.1,u:"sht"},
  {g:"NAPPCO Â· Kraft (sht)",l:"#300",r:15.7,u:"sht"},
  /* IFEX Q1 2026 */
  {g:"IFEX Â· Arco Smooth 43Ã—31",l:"85gsm",r:13,u:"sht"},{g:"IFEX Â· Arco Smooth 43Ã—31",l:"115gsm",r:18,u:"sht"},
  {g:"IFEX Â· Arco Smooth 43Ã—31",l:"150gsm",r:24,u:"sht"},{g:"IFEX Â· Arco Smooth 43Ã—31",l:"200gsm",r:32,u:"sht"},
  {g:"IFEX Â· Arco Smooth 43Ã—31",l:"250gsm",r:39,u:"sht"},{g:"IFEX Â· Arco Smooth 43Ã—31",l:"300gsm",r:46,u:"sht"},
  {g:"IFEX Â· Astro 28.3Ã—39.75",l:"100gsm",r:24,u:"sht"},{g:"IFEX Â· Astro 28.3Ã—39.75",l:"130gsm",r:34,u:"sht"},
  {g:"IFEX Â· Astro 28.3Ã—39.75",l:"180gsm",r:39,u:"sht"},{g:"IFEX Â· Astro 28.3Ã—39.75",l:"240gsm",r:59,u:"sht"},
  {g:"IFEX Â· Astro 28.3Ã—39.75",l:"280gsm",r:64,u:"sht"},{g:"IFEX Â· Astro 28.3Ã—39.75",l:"320gsm",r:74,u:"sht"},
  {g:"IFEX Â· Blackgold",l:"120gsm",r:43,u:"sht"},{g:"IFEX Â· Blackgold",l:"290gsm",r:86,u:"sht"},
  {g:"IFEX Â· Cannon Laid 34Ã—22",l:"85gsm",r:15,u:"sht"},{g:"IFEX Â· Cannon Laid 34Ã—22",l:"185gsm",r:29,u:"sht"},
  {g:"IFEX Â· Centennial Pre-Colonial 31Ã—43",l:"120gsm",r:26,u:"sht"},{g:"IFEX Â· Centennial Pre-Colonial 31Ã—43",l:"200gsm",r:43,u:"sht"},
  {g:"IFEX Â· Centennial Japanese 31Ã—43",l:"120gsm",r:26,u:"sht"},{g:"IFEX Â· Centennial Japanese 31Ã—43",l:"200gsm",r:43,u:"sht"},
  {g:"IFEX Â· Chroma by Ichiban 25Ã—38",l:"90gsm White",r:9.5,u:"sht"},{g:"IFEX Â· Chroma by Ichiban 25Ã—38",l:"105gsm",r:10.75,u:"sht"},
  {g:"IFEX Â· Chroma by Ichiban 25Ã—38",l:"120gsm",r:13.75,u:"sht"},{g:"IFEX Â· Chroma by Ichiban 25Ã—38",l:"140gsm",r:17.75,u:"sht"},
  {g:"IFEX Â· Chroma by Ichiban 26Ã—40",l:"190gsm",r:19.75,u:"sht"},{g:"IFEX Â· Chroma by Ichiban 26Ã—40",l:"200gsm",r:25.25,u:"sht"},
  {g:"IFEX Â· Chroma by Ichiban 26Ã—40",l:"240gsm",r:28.75,u:"sht"},{g:"IFEX Â· Chroma by Ichiban 26Ã—40",l:"290gsm",r:34.75,u:"sht"},
  {g:"IFEX Â· Conqueror Smooth",l:"90gsm",r:22,u:"sht"},{g:"IFEX Â· Conqueror Smooth",l:"120gsm",r:58,u:"sht"},{g:"IFEX Â· Conqueror Smooth",l:"250gsm",r:120,u:"sht"},
  {g:"IFEX Â· Curious Metallics",l:"135gsm",r:59,u:"sht"},{g:"IFEX Â· Curious Metallics",l:"220gsm",r:110,u:"sht"},
  {g:"IFEX Â· Curious Metallics",l:"300gsm",r:150,u:"sht"},{g:"IFEX Â· Curious Metallics",l:"320gsm",r:195,u:"sht"},
  {g:"IFEX Â· Keaykolour",l:"90gsm",r:55,u:"sht"},{g:"IFEX Â· Keaykolour",l:"270gsm",r:144,u:"sht"},
  {g:"IFEX Â· Leatherlike",l:"80gsm",r:55,u:"sht"},{g:"IFEX Â· Leatherlike",l:"110gsm",r:75,u:"sht"},
  {g:"IFEX Â· Leatherlike",l:"145gsm",r:105,u:"sht"},{g:"IFEX Â· Leatherlike",l:"180gsm",r:130,u:"sht"},
  {g:"IFEX Â· Magno Matt 25Ã—38",l:"100gsm",r:8.75,u:"sht"},{g:"IFEX Â· Magno Matt 25Ã—38",l:"150gsm",r:13.75,u:"sht"},
  {g:"IFEX Â· Magno Matt 25Ã—38",l:"200gsm",r:16.5,u:"sht"},{g:"IFEX Â· Magno Matt 25Ã—38",l:"300gsm",r:28.75,u:"sht"},
  {g:"IFEX Â· Mohawk Superfine Smooth 25Ã—38",l:"104gsm Ultra White",r:35,u:"sht"},{g:"IFEX Â· Mohawk Superfine Smooth 25Ã—38",l:"216gsm Ultra White",r:49,u:"sht"},
  {g:"IFEX Â· Mohawk Superfine Smooth 25Ã—38",l:"270gsm Ultra White",r:85,u:"sht"},{g:"IFEX Â· Mohawk Superfine Smooth 25Ã—38",l:"352gsm Ultra White",r:120,u:"sht"},
  {g:"IFEX Â· Mohawk Options 26Ã—40",l:"110gsm",r:25,u:"sht"},{g:"IFEX Â· Mohawk Options 26Ã—40",l:"160gsm",r:35,u:"sht"},
  {g:"IFEX Â· Mohawk Options 26Ã—40",l:"280gsm",r:74,u:"sht"},{g:"IFEX Â· Mohawk Options 26Ã—40",l:"350gsm",r:89,u:"sht"},
  {g:"IFEX Â· Neenah Classic Crest 26Ã—40",l:"118gsm",r:33,u:"sht"},{g:"IFEX Â· Neenah Classic Crest 26Ã—40",l:"216gsm",r:79,u:"sht"},{g:"IFEX Â· Neenah Classic Crest 26Ã—40",l:"270gsm",r:100,u:"sht"},
  {g:"IFEX Â· Olin 28.8Ã—40.1",l:"140gsm High White",r:70,u:"sht"},{g:"IFEX Â· Plike 27.5Ã—39.4",l:"140gsm",r:70,u:"sht"},
  {g:"IFEX Â· Rives 27.5Ã—39.4",l:"90gsm",r:40,u:"sht"},{g:"IFEX Â· Rives 27.5Ã—39.4",l:"120gsm",r:75,u:"sht"},
  {g:"IFEX Â· Rives 27.5Ã—39.4",l:"230gsm",r:90,u:"sht"},{g:"IFEX Â· Rives 27.5Ã—39.4",l:"360gsm",r:140,u:"sht"},
  {g:"IFEX Â· Stardream 2.0",l:"120gsm",r:120,u:"sht"},{g:"IFEX Â· Stardream 2.0",l:"285gsm",r:170,u:"sht"},
  {g:"IFEX Â· Toccata 26Ã—40",l:"125gsm",r:19,u:"sht"},{g:"IFEX Â· Toccata 26Ã—40",l:"155gsm",r:24,u:"sht"},
  {g:"IFEX Â· Toccata 26Ã—40",l:"250gsm",r:39,u:"sht"},{g:"IFEX Â· Toccata 26Ã—40",l:"310gsm",r:49,u:"sht"},
  {g:"IFEX Â· Wild 28.3Ã—40.2",l:"150gsm",r:61,u:"sht"},{g:"IFEX Â· Wild 28.3Ã—40.2",l:"300gsm",r:139,u:"sht"},
  {g:"IFEX Â· Wild 28.3Ã—40.2",l:"450gsm",r:172,u:"sht"},{g:"IFEX Â· Wild 28.3Ã—40.2",l:"850gsm White",r:300,u:"sht"},
  {g:"IFEX Â· Worx Planner 25Ã—38",l:"80gsm",r:7.75,u:"sht"},{g:"IFEX Â· Worx Planner 25Ã—38",l:"100gsm",r:9.25,u:"sht"},
  {g:"IFEX Â· Saraprint White Matte 13Ã—19",l:"175gsm 125mic",r:38.5,u:"sht"},{g:"IFEX Â· Saraprint White Matte 13Ã—19",l:"280gsm 200mic",r:59,u:"sht"},
  {g:"IFEX Â· Saraprint White Matte 13Ã—19",l:"350gsm 250mic",r:80.75,u:"sht"},{g:"IFEX Â· Saraprint Silver PET 13Ã—19",l:"175gsm 125mic",r:41.75,u:"sht"},
  /* CROSSPOINT Silang Cavite 2025 */
  {g:"Crosspoint Â· Book 40# 60gsm",l:"22Ã—34 / 34Ã—22 ream",r:880,u:"ream"},{g:"Crosspoint Â· Book 40# 60gsm",l:"34Ã—28 ream",r:1127.5,u:"ream"},
  {g:"Crosspoint Â· Book 40# 60gsm",l:"25Ã—38 ream",r:1100,u:"ream"},{g:"Crosspoint Â· Book 40# 60gsm",l:"per sheet",r:26,u:"sht"},
  {g:"Crosspoint Â· Book 50# 70gsm",l:"34Ã—22 ream",r:1040,u:"ream"},{g:"Crosspoint Â· Book 50# 70gsm",l:"34Ã—28 ream",r:1326,u:"ream"},{g:"Crosspoint Â· Book 50# 70gsm",l:"25Ã—38 ream",r:1300,u:"ream"},
  {g:"Crosspoint Â· Book 60# 80gsm",l:"34Ã—22 ream",r:1224,u:"ream"},{g:"Crosspoint Â· Book 60# 80gsm",l:"34Ã—28 ream",r:1555.5,u:"ream"},{g:"Crosspoint Â· Book 60# 80gsm",l:"25Ã—38 ream",r:1530,u:"ream"},
  {g:"Crosspoint Â· Book 60# 80gsm",l:"22Ã—34 per sheet",r:25.5,u:"sht"},
  {g:"Crosspoint Â· Book 70# 100gsm",l:"34Ã—22 ream",r:1428,u:"ream"},{g:"Crosspoint Â· Book 70# 100gsm",l:"34Ã—28 ream",r:1810.5,u:"ream"},{g:"Crosspoint Â· Book 70# 100gsm",l:"25Ã—38 ream",r:1785,u:"ream"},{g:"Crosspoint Â· Book 70# 100gsm",l:"per sheet",r:26,u:"sht"},
  {g:"Crosspoint Â· Book 80# 120gsm",l:"34Ã—22 ream",r:1664,u:"ream"},{g:"Crosspoint Â· Book 80# 120gsm",l:"34Ã—28 ream",r:2106,u:"ream"},{g:"Crosspoint Â· Book 80# 120gsm",l:"25Ã—38 ream",r:2080,u:"ream"},
  {g:"Crosspoint Â· Newsprint 52gsm",l:"24Ã—36",r:730,u:"ream"},{g:"Crosspoint Â· Newsprint 52gsm",l:"34Ã—28",r:804.35,u:"ream"},{g:"Crosspoint Â· Newsprint 52gsm",l:"34Ã—22",r:632,u:"ream"},
  {g:"Crosspoint Â· Newsprint 48.8gsm",l:"24Ã—36",r:698.83,u:"ream"},{g:"Crosspoint Â· Newsprint 48.8gsm",l:"34Ã—28",r:770,u:"ream"},{g:"Crosspoint Â· Newsprint 48.8gsm",l:"34Ã—22",r:605,u:"ream"},
  /* PRESTIGE PAPER PRODUCTS MNL 2025.12.03 */
  {g:"Prestige Â· Acquerello Fedrigoni 28.3Ã—39.75",l:"390gsm",r:102,u:"sht"},{g:"Prestige Â· Acquerello Fedrigoni 28.3Ã—39.75",l:"300gsm",r:77,u:"sht"},
  {g:"Prestige Â· Acquerello Fedrigoni 28.3Ã—39.75",l:"240gsm",r:60,u:"sht"},{g:"Prestige Â· Acquerello Fedrigoni 28.3Ã—39.75",l:"160gsm",r:40,u:"sht"},{g:"Prestige Â· Acquerello Fedrigoni 28.3Ã—39.75",l:"120gsm",r:30,u:"sht"},
  {g:"Prestige Â· Alga Carta Favini 27.5Ã—39.3",l:"250gsm",r:45,u:"sht"},{g:"Prestige Â· Alga Carta Favini 27.5Ã—39.3",l:"200gsm",r:36,u:"sht"},
  {g:"Prestige Â· Alga Carta Favini 27.5Ã—39.3",l:"160gsm",r:29,u:"sht"},{g:"Prestige Â· Alga Carta Favini 27.5Ã—39.3",l:"120gsm",r:22,u:"sht"},{g:"Prestige Â· Alga Carta Favini 27.5Ã—39.3",l:"90gsm",r:16.5,u:"sht"},
  {g:"Prestige Â· Arena Smooth Fedrigoni 28.3Ã—40",l:"250gsm",r:45,u:"sht"},{g:"Prestige Â· Arena Smooth Fedrigoni 28.3Ã—40",l:"120gsm Ivory",r:22,u:"sht"},{g:"Prestige Â· Arena Smooth Fedrigoni 28.3Ã—40",l:"80gsm",r:14.5,u:"sht"},
  {g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"340gsm White",r:66,u:"sht"},{g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"300gsm",r:55,u:"sht"},
  {g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"270gsm",r:50,u:"sht"},{g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"230gsm",r:43,u:"sht"},
  {g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"160gsm",r:30,u:"sht"},{g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"115gsm White",r:21,u:"sht"},{g:"Prestige Â· Bevania Fedrigoni 28Ã—39.3",l:"85gsm",r:15.5,u:"sht"},
  {g:"Prestige Â· Biotop Color 17.7Ã—25.2",l:"160gsm Pastel",r:17.5,u:"sht"},{g:"Prestige Â· Biotop Color 17.7Ã—25.2",l:"160gsm Black",r:23,u:"sht"},
  {g:"Prestige Â· Biotop Color 17.7Ã—25.2",l:"80gsm Pastel",r:6.5,u:"sht"},{g:"Prestige Â· Biotop Color 17.7Ã—25.2",l:"80gsm Black",r:10.5,u:"sht"},
  {g:"Prestige Â· Buffalo New Indo 31Ã—43",l:"220gsm",r:45,u:"sht"},
  {g:"Prestige Â· Constellation Snow Fedrigoni",l:"280gsm",r:75,u:"sht"},{g:"Prestige Â· Constellation Snow Fedrigoni",l:"240gsm",r:58,u:"sht"},{g:"Prestige Â· Constellation Snow Fedrigoni",l:"170gsm",r:40,u:"sht"},{g:"Prestige Â· Constellation Snow Fedrigoni",l:"130gsm",r:31,u:"sht"},
  {g:"Prestige Â· Constellation Jade Fedrigoni",l:"300gsm",r:86,u:"sht"},{g:"Prestige Â· Constellation Jade Fedrigoni",l:"215gsm",r:66,u:"sht"},{g:"Prestige Â· Constellation Jade Fedrigoni",l:"115gsm",r:35,u:"sht"},
  {g:"Prestige Â· Crush Favini 31Ã—43",l:"280gsm",r:63,u:"sht"},{g:"Prestige Â· Crush Favini 31Ã—43",l:"220gsm",r:53,u:"sht"},{g:"Prestige Â· Crush Favini 31Ã—43",l:"120gsm",r:29,u:"sht"},{g:"Prestige Â· Crush Favini 31Ã—43",l:"100gsm",r:22,u:"sht"},
  {g:"Prestige Â· Freelife Cento Fedrigoni 27.5Ã—39.3",l:"170gsm White Recycled",r:36,u:"sht"},
  {g:"Prestige Â· Life Fabriano 43Ã—31",l:"200gsm White/Ivory",r:45,u:"sht"},
  {g:"Prestige Â· Linen Fino Korea",l:"180gsm White",r:52,u:"sht"},{g:"Prestige Â· Linen Fino Korea",l:"180gsm Moss/Peony",r:53,u:"sht"},{g:"Prestige Â· Linen Fino Korea",l:"180gsm Cerulean",r:57,u:"sht"},
  {g:"Prestige Â· Materica Fedrigoni",l:"250gsm",r:62,u:"sht"},{g:"Prestige Â· Materica Fedrigoni",l:"180gsm",r:52,u:"sht"},{g:"Prestige Â· Materica Fedrigoni",l:"120gsm",r:29,u:"sht"},
  {g:"Prestige Â· Nettuno Fedrigoni 28.3Ã—39.75",l:"280gsm Blue Navy",r:100,u:"sht"},
  {g:"Prestige Â· Old Mill Fedrigoni 26Ã—40",l:"350gsm",r:80,u:"sht"},{g:"Prestige Â· Old Mill Fedrigoni 26Ã—40",l:"300gsm",r:68,u:"sht"},{g:"Prestige Â· Old Mill Fedrigoni 26Ã—40",l:"250gsm",r:57,u:"sht"},{g:"Prestige Â· Old Mill Fedrigoni 26Ã—40",l:"190gsm",r:42,u:"sht"},{g:"Prestige Â· Old Mill Fedrigoni 26Ã—40",l:"130gsm",r:26,u:"sht"},
  {g:"Prestige Â· Sirio Plain Fedrigoni 27.5Ã—39.3",l:"230gsm",r:62,u:"sht"},{g:"Prestige Â· Sirio Plain Fedrigoni 27.5Ã—39.3",l:"100gsm",r:23,u:"sht"},
  {g:"Prestige Â· Sirio Pearl Fedrigoni 27.5Ã—39.3",l:"300gsm",r:107,u:"sht"},{g:"Prestige Â· Sirio Pearl Fedrigoni 27.5Ã—39.3",l:"200gsm",r:70,u:"sht"},{g:"Prestige Â· Sirio Pearl Fedrigoni 27.5Ã—39.3",l:"100gsm",r:35,u:"sht"},
  {g:"Prestige Â· Sirio Ultra Fedrigoni 28.3Ã—39.75",l:"680gsm",r:294,u:"sht"},{g:"Prestige Â· Sirio Ultra Fedrigoni 28.3Ã—39.75",l:"460gsm",r:215,u:"sht"},
  {g:"Prestige Â· Stucco Tintoretto Fedrigoni",l:"320gsm",r:80,u:"sht"},{g:"Prestige Â· Stucco Tintoretto Fedrigoni",l:"210gsm",r:52,u:"sht"},{g:"Prestige Â· Stucco Tintoretto Fedrigoni",l:"150gsm",r:37,u:"sht"},{g:"Prestige Â· Stucco Tintoretto Fedrigoni",l:"120gsm",r:25,u:"sht"},
  {g:"Prestige Â· Symbol Pearl Fedrigoni 28.3Ã—40",l:"350gsm",r:92,u:"sht"},{g:"Prestige Â· Symbol Pearl Fedrigoni 28.3Ã—40",l:"250gsm",r:70,u:"sht"},{g:"Prestige Â· Symbol Pearl Fedrigoni 28.3Ã—40",l:"140gsm",r:34,u:"sht"},
  {g:"Prestige Â· Tintoretto Ceylon Fedrigoni 27.5Ã—39.3",l:"250gsm",r:63,u:"sht"},{g:"Prestige Â· Tintoretto Ceylon Fedrigoni 27.5Ã—39.3",l:"170gsm",r:38,u:"sht"},
  {g:"Prestige Â· Tree Free Bamboo Favini 27.5Ã—39.3",l:"250gsm",r:45,u:"sht"},{g:"Prestige Â· Tree Free Bamboo Favini 27.5Ã—39.3",l:"115gsm",r:22,u:"sht"},
  {g:"Prestige Â· Woodstock Fedrigoni 27.5Ã—39.3",l:"140gsm Betulla",r:34,u:"sht"},
  {g:"Prestige Â· X-per Fedrigoni 28.3Ã—40",l:"300gsm",r:76,u:"sht"},{g:"Prestige Â· X-per Fedrigoni 28.3Ã—40",l:"200gsm",r:47,u:"sht"},{g:"Prestige Â· X-per Fedrigoni 28.3Ã—40",l:"120gsm",r:29,u:"sht"},{g:"Prestige Â· X-per Fedrigoni 28.3Ã—40",l:"90gsm",r:22,u:"sht"},
  {g:"Prestige Â· Zanzibar Korea 27.5Ã—39.3",l:"250gsm",r:45,u:"sht"},{g:"Prestige Â· Zanzibar Korea 27.5Ã—39.3",l:"170gsm",r:31.5,u:"sht"},{g:"Prestige Â· Zanzibar Korea 27.5Ã—39.3",l:"115gsm",r:22,u:"sht"},
  {g:"Prestige Â· Parchment EC 25Ã—38",l:"85gsm",r:23,u:"sht"},
  /* STAR PAPER CORP Luzon Jul 2025 */
  {g:"Star Paper Â· Bond CIS 25Ã—38",l:"CIS 120gsm",r:13.25,u:"sht"},{g:"Star Paper Â· Bond CIS 25Ã—38",l:"CIS 90gsm",r:9.59,u:"sht"},
  {g:"Star Paper Â· Bond CIS 25Ã—38",l:"CIS 80gsm",r:8.82,u:"sht"},{g:"Star Paper Â· Bond CIS 25Ã—38",l:"CIS 70gsm",r:7.85,u:"sht"},
  {g:"Star Paper Â· C2S Luzon 25Ã—38",l:"200gsm",r:25.38,u:"sht"},{g:"Star Paper Â· C2S Luzon 25Ã—38",l:"150gsm",r:19.24,u:"sht"},
  {g:"Star Paper Â· C2S Luzon 25Ã—38",l:"115gsm",r:14.60,u:"sht"},{g:"Star Paper Â· C2S Luzon 25Ã—38",l:"100gsm",r:12.44,u:"sht"},
  {g:"Star Paper Â· Matte Luzon 25Ã—38",l:"200gsm",r:25.38,u:"sht"},{g:"Star Paper Â· Matte Luzon 25Ã—38",l:"150gsm",r:19.24,u:"sht"},
  {g:"Star Paper Â· Matte Luzon 25Ã—38",l:"115gsm",r:14.60,u:"sht"},{g:"Star Paper Â· Matte Luzon 25Ã—38",l:"100gsm",r:12.44,u:"sht"},
  {g:"Star Paper Â· Colored Bond 25Ã—38",l:"Assorted Colors",r:13.75,u:"sht"},
  /* June 2026 Pricelist */
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#220 Sheet",r:12.5,u:"sht"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#180 Sheet",r:10.5,u:"sht"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#160 Sheet",r:9.5,u:"sht"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#140 Sheet",r:8,u:"sht"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#120 Sheet",r:7,u:"sht"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#100 Ream",r:2700,u:"ream"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#80 Ream",r:2160,u:"ream"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#70 Ream",r:1890,u:"ream"},
  {g:"NAPPCO Â· C2S 38Ã—25 (Jun26)",l:"#60 Ream",r:1680,u:"ream"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#220 Sheet",r:12.55,u:"sht"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#180 Sheet",r:10.46,u:"sht"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#170 Sheet",r:10.1,u:"sht"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#160 Sheet",r:8.87,u:"sht"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#100 Ream",r:2576,u:"ream"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#80 Ream",r:2264.8,u:"ream"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#70 Ream",r:1892.1,u:"ream"},
  {g:"STARPAPER Â· C2S 38Ã—25 (Jun26)",l:"#60 Ream",r:1802,u:"ream"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#220 Sheet",r:13,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#180 Sheet",r:11,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#160 Sheet",r:10,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#140 Sheet",r:9,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#120 Sheet",r:8,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#80 Sheet",r:26.5,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#70 Sheet",r:26.5,u:"sht"},
  {g:"Fil-Anchor Â· C2S 38Ã—25 (Jun26)",l:"#60 Sheet",r:28.5,u:"sht"},
  {g:"NAPPCO Â· Book 25Ã—38 (Jun26)",l:"#80 Ream",r:2160,u:"ream"},
  {g:"NAPPCO Â· Book 25Ã—38 (Jun26)",l:"#70 Ream",r:1890,u:"ream"},
  {g:"NAPPCO Â· Book 25Ã—38 (Jun26)",l:"#60 Ream",r:1620,u:"ream"},
  {g:"STARPAPER Â· Book 25Ã—38 (Jun26)",l:"#80 Ream",r:2366.4,u:"ream"},
  {g:"STARPAPER Â· Book 25Ã—38 (Jun26)",l:"#70 Ream",r:2070.6,u:"ream"},
  {g:"STARPAPER Â· Book 25Ã—38 (Jun26)",l:"#60 Ream",r:1652.4,u:"ream"},
  {g:"Fil-Anchor Â· Book 25Ã—38 (Jun26)",l:"#80 Sheet",r:26.5,u:"sht"},
  {g:"Fil-Anchor Â· Book 25Ã—38 (Jun26)",l:"#70 Sheet",r:26.5,u:"sht"},
  {g:"Fil-Anchor Â· Book 25Ã—38 (Jun26)",l:"#60 Sheet",r:26.5,u:"sht"},
  {g:"NAPPCO Â· Matt (Jun26)",l:"#100 25Ã—38 Ream",r:2700,u:"ream"},
  {g:"NAPPCO Â· Matt (Jun26)",l:"#120 38Ã—25 Sheet",r:7,u:"sht"},
  {g:"NAPPCO Â· Matt (Jun26)",l:"#140 38Ã—25 Sheet",r:8,u:"sht"},
  {g:"STARPAPER Â· Matt (Jun26)",l:"#100 25Ã—38 Ream",r:2601,u:"ream"},
  {g:"Fil-Anchor Â· Matt (Jun26)",l:"#100 25Ã—38 Sheet",r:8,u:"sht"},
  {g:"NAPPCO Â· Vellum 22.5Ã—28.5 (Jun26)",l:"#74 120gsm Sheet",r:3.5,u:"sht"},
  {g:"NAPPCO Â· Vellum 22.5Ã—28.5 (Jun26)",l:"#120 230gsm Sheet",r:8,u:"sht"},
  {g:"NAPPCO Â· Vellum (Jun26)",l:"#120 22.5Ã—28.5 (alt)",r:8.5,u:"sht"},
  {g:"PRESTIGE Â· Vellum (Jun26)",l:"#74 22.5Ã—28.5",r:5.25,u:"sht"},
  {g:"NAPPCO Â· Foldcote SW 31Ã—43 (Jun26)",l:"#10 Sheet",r:10,u:"sht"},
  {g:"NAPPCO Â· Foldcote SW 31Ã—43 (Jun26)",l:"#12 215gsm Sheet",r:11,u:"sht"},
  {g:"NAPPCO Â· Foldcote SW 31Ã—43 (Jun26)",l:"#15 Sheet",r:13,u:"sht"},
  {g:"NAPPCO Â· Foldcote SW 31Ã—43 (Jun26)",l:"#18 Sheet",r:15.5,u:"sht"},
  {g:"STARPAPER Â· Foldcote SW 31Ã—43 (Jun26)",l:"#10 Sheet",r:11.02,u:"sht"},
  {g:"STARPAPER Â· Foldcote SW 31Ã—43 (Jun26)",l:"#12 Sheet",r:11.42,u:"sht"},
  {g:"STARPAPER Â· Foldcote SW 31Ã—43 (Jun26)",l:"#15 Sheet",r:14.03,u:"sht"},
  {g:"STARPAPER Â· Foldcote SW 31Ã—43 (Jun26)",l:"#18 Sheet",r:16.58,u:"sht"},
  {g:"Fil-Anchor Â· Foldcote SW 31Ã—43 (Jun26)",l:"#10 Sheet",r:10,u:"sht"},
  {g:"Fil-Anchor Â· Foldcote SW 31Ã—43 (Jun26)",l:"#12 Sheet",r:11,u:"sht"},
  {g:"Fil-Anchor Â· Foldcote SW 31Ã—43 (Jun26)",l:"#15 Sheet",r:12.5,u:"sht"},
  {g:"Fil-Anchor Â· Foldcote SW 31Ã—43 (Jun26)",l:"#18 Sheet",r:14.5,u:"sht"},
  {g:"NAPPCO Â· Foldcote Solid 31Ã—43 (Jun26)",l:"#18 Solid",r:31.5,u:"kg"},
  {g:"NAPPCO Â· Kraft 46Ã—60 (Jun26)",l:"#125 Pambalot Sheet",r:10.54,u:"sht"},
  {g:"Fil-Anchor Â· Kraft 46Ã—60 (Jun26)",l:"#125 Ream of 480sh",r:2900,u:"ream"},
  {g:"IFEX Â· KPP Translucent (Jun26)",l:"145gsm Sheet",r:105,u:"sht"},
  {g:"PAPERTREE Â· Diamond Translucent (Jun26)",l:"100gsm Sheet",r:33,u:"sht"},
  {g:"NAPPCO Â· Satin Sticker 36Ã—24 (Jun26)",l:"Yellow Backing 80gsm",r:12,u:"sht"},
  {g:"NAPPCO Â· Chipboard (Jun26)",l:"#60 .86-.89mm (120's)",r:1950,u:"bale"},
  {g:"NAPPCO Â· Chipboard (Jun26)",l:"#50 1mm (100's)",r:1950,u:"bale"},
  {g:"NAPPCO Â· Pasteboard (Jun26)",l:"#30 (60's pad)",r:2250,u:"bale"},
];

/* â”€â”€ RATES â”€â”€ */
const DIG={fc1s:{l:"Full Color 1-Side â‚±20",r:20},fc1s15:{l:"Full Color 1-Side â‚±15",r:15},fc1s12:{l:"Full Color 1-Side â‚±12",r:12},fc2s:{l:"Full Color 2-Sides â‚±35",r:35},fc2s25:{l:"Full Color 2-Sides â‚±25",r:25},fc2s18:{l:"Full Color 2-Sides â‚±18",r:18},c1s1:{l:"1-Color 1-Side",r:8},c1s2:{l:"1-Color 2-Sides",r:15},varFC:{l:"Variable Full Color",r:22},var1C:{l:"Variable 1-Color",r:10}};
const PRESS={kord:{l:"Kord",f:450,fq:1000,s:250,sq:1000},komori:{l:"Komori/MO",f:650,fq:1000,s:350,sq:1000},sord:{l:"Sord",f:1500,fq:500,s:500,sq:500},jobOut:{l:"Offset Job-Out",f:1500,fq:1000,s:500,sq:1000}};
const LAM={uvLam:{l:"UV Lam",r:.0035},plasticWet:{l:"Plastic Lam (Wet)",r:.0095},matteWet:{l:"Matte Lam (Wet)",r:.016},plasticTh:{l:"Plastic Lam (Thermal)",r:.02},matteTh:{l:"Matte Lam (Thermal)",r:.02},spot3D:{l:"Spot 3D Lam",r:.04},spotVarnish:{l:"Spot Varnish",r:.0065}};
const PRE={ctpKord:{l:"CTP â€“ Kord",r:350,u:"plate"},ctpSord:{l:"CTP â€“ Sord",r:1000,u:"plate"},ctpKomori:{l:"CTP â€“ Komori/MO",r:450,u:"plate"},mockupSoft:{l:"Mockup â€“ Softbound",r:1500,u:"pc"},mockupHard:{l:"Mockup â€“ Hardbound",r:4000,u:"pc"},mockupCTB:{l:"Mockup â€“ CTB/Multipage",r:1250,u:"pc"},designFlyer:{l:"Design â€“ Flyer A5-A4",r:3000,u:"pc"},designPkg:{l:"Design â€“ Packaging",r:5000,u:"pc"},designText:{l:"Design â€“ Multipage text",r:100,u:"page"},designFull:{l:"Design â€“ Multipage full color",r:500,u:"page"},designForm:{l:"Design â€“ Business Forms/Cards",r:1000,u:"form"}};
const CLBL={paper:"Paper",digital:"Digital Print",press:"Offset Press",ctp:"CTP Plates",lam:"Lamination",die:"Diecutting/Scoring",blade:"Blade Die Mold",foil:"Foil Stamping",emboss:"Embossing",spotUV:"Spot UV Blanket",round:"Round Cornering",cut:"Cutting",fold:"Folding",saddle:"Saddle Stitching",pb:"Perfect Binding",wire:"Wire Binding",glue:"Gluing",gather:"Gathering",serial:"Serial Numbering",perf:"Perforation",deliv:"Delivery",pack:"Packing",kit:"Kitting",design:"Design/FA",proof:"Color Proofing",mockup:"Mockup"};

/* â”€â”€ HELPERS â”€â”€ */
const fp=n=>`\u20b1${(+n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today=()=>{const d=new Date();return`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;};
const TERMS=["50% DP / 50% Balance","30 Days upon Receipt","15 Days upon Receipt","COD","Full Payment on Delivery","Net 30 Days"];
const QUNITS=["Piece/s","Box/es","Set/s","Ream/s","Pad/s","Lot/s","Sheet/s","Roll/s","Pack/s"];

/* â”€â”€ SET FACTORY â”€â”€ */
let _id=0;
const mkSet=n=>({_id:++_id,name:n||"Component 1",
  paperOn:false,paperKey:"",paperRate:"",paperPer:"sht",paperSheets:"",paperWastage:"5",
  digitalOn:false,digitalType:"fc2s",digitalSheets:"",pressOn:false,pressType:"kord",pressLoads:"",
  ctpOn:false,ctpType:"ctpKord",ctpPlates:"",lamOn:false,lamType:"uvLam",lamSqIn:"",lamLoads:"",lamSides:"1",lamBlanket:false,
  dieOn:false,dieQty:"",bladeOn:false,bladeType:"manual",bladeSqIn:"",foilOn:false,foilSqIn:"",
  embossOn:false,embossSqIn:"",spotUVOn:false,spotUVQty:"1",roundOn:false,roundQty:"",roundCorners:"4",
  cutOn:false,cutChops:"",cutRate:"3.50",foldOn:false,foldType:"machine",foldQty:"",foldFolds:"1",
  saddleOn:false,saddleType:"s2",saddleQty:"",pbOn:false,pbSize:"a5",pbQty:"",
  wireOn:false,wireQty:"",glueOn:false,glueType:"small",glueQty:"",gatherOn:false,gatherLot:"",
  serialOn:false,serialSrc:"inhouse",serialQty:"",perfOn:false,perfQty:"",
  delivOn:false,delivCost:"2000",packOn:false,packPacks:"",kitOn:false,kitQty:"",
  designOn:false,designType:"designFlyer",designQty:"1",proofOn:false,proofQty:"",
  mockupOn:false,mockupType:"mockupSoft",mockupQty:"1",otherCosts:[],
  _op:{paper:false,print:false,fin:false,bind:false,pre:false,other:false},
  _layout:{mach:"komori",fw:"",fh:"",blOn:true,bl:"0.125",grip:"0.5",
    qty:"",waste:"5",pSrch:"",pKey:"",sw:"",sh:"",rate:"",selL:0}
});

/* â”€â”€ COST CALC â”€â”€ */
function calcSet(s){
  const c={};
  const DRATES=getMergedDIG();
  const PRATES=getMergedPRESS();
  const LRATES=getMergedLAM();
  if(s.paperOn&&s.paperRate&&s.paperSheets)c.paper=+s.paperSheets*(1+(+s.paperWastage||5)/100)*(+s.paperRate);
  if(s.digitalOn&&s.digitalSheets)c.digital=+s.digitalSheets*(DRATES[s.digitalType]?.r||0);
  if(s.pressOn&&s.pressLoads){const p=PRATES[s.pressType];if(p){const l=+s.pressLoads;c.press=p.f+Math.max(0,Math.ceil((l-p.fq)/p.sq))*p.s;}}
  if(s.ctpOn&&s.ctpPlates)c.ctp=+s.ctpPlates*(PRE[s.ctpType]?.r||0);
  if(s.lamOn){c.lam=(+s.lamSqIn||0)*(LRATES[s.lamType]?.r||0)*(+s.lamLoads||1)*(+s.lamSides||1);if(s.lamBlanket)c.lam+=2500;}
  if(s.dieOn&&s.dieQty)c.die=Math.max(1000,1000+Math.max(0,Math.ceil((+s.dieQty-350)/1000))*500);
  if(s.bladeOn&&s.bladeSqIn){const r=s.bladeType==="laser"?18:12;c.blade=Math.max(500,+s.bladeSqIn*r);}
  if(s.foilOn&&s.foilSqIn)c.foil=Math.max(500,+s.foilSqIn*.4);
  if(s.embossOn&&s.embossSqIn)c.emboss=+s.embossSqIn*.4;
  if(s.spotUVOn)c.spotUV=(+s.spotUVQty||1)*2500;
  if(s.roundOn&&s.roundQty)c.round=+s.roundQty*(+s.roundCorners||4)*.25;
  if(s.cutOn&&s.cutChops)c.cut=+s.cutChops*(+s.cutRate||3.5);
  if(s.foldOn&&s.foldQty){const q=+s.foldQty,f=+s.foldFolds||1;c.fold=s.foldType==="machine"?(q/1000)*65*f+650:Math.max(600,q*f*.25);}
  if(s.saddleOn&&s.saddleQty)c.saddle=+s.saddleQty*(s.saddleType==="s3"?2:1.5);
  if(s.pbOn&&s.pbQty){const m=s.pbSize==="a4"?{r:45,mn:5000}:{r:30,mn:4000};c.pb=Math.max(m.mn,+s.pbQty*m.r);}
  if(s.wireOn&&s.wireQty)c.wire=+s.wireQty*8;
  if(s.glueOn&&s.glueQty){const rm={small:.5,medium:1,big:1.5,rigid_sm:100,rigid_big:120};c.glue=+s.glueQty*(rm[s.glueType]||.5);}
  if(s.gatherOn&&s.gatherLot)c.gather=+s.gatherLot||0;
  if(s.serialOn&&s.serialQty){const rv=s.serialSrc==="outsourced"?{f:650,v:400}:{f:450,v:300};c.serial=rv.f+Math.max(0,Math.ceil((+s.serialQty-1000)/1000))*rv.v;}
  if(s.perfOn&&s.perfQty)c.perf=Math.max(1000,1000+Math.max(0,Math.ceil((+s.perfQty-350)/1000))*500);
  if(s.delivOn)c.deliv=Math.max(2000,+s.delivCost||2000);
  if(s.packOn&&s.packPacks)c.pack=+s.packPacks*50;
  if(s.kitOn&&s.kitQty)c.kit=+s.kitQty*30;
  if(s.designOn&&s.designQty)c.design=+s.designQty*(PRE[s.designType]?.r||0);
  if(s.proofOn&&s.proofQty)c.proof=+s.proofQty*100;
  if(s.mockupOn)c.mockup=(+s.mockupQty||1)*(PRE[s.mockupType]?.r||1500);
  (s.otherCosts||[]).forEach((o,i)=>{if(o.amount)c[`oth${i}`]=+o.amount||0;});
  return c;
}
function totals(sets,hdr){
  const sub=sets.reduce((a,s)=>a+Object.values(calcSet(s)).reduce((x,y)=>x+y,0),0);
  const mk=sub*(+hdr.markup/100);const bv=sub+mk;
  const vat=hdr.vatExempt?0:bv*(+hdr.vatRate/100);
  const dv=parseFloat(hdr.discountVal)||0;
  const rawGrand=bv+vat;
  const disc=dv>0?(hdr.discountType==="pct"?rawGrand*(dv/100):dv):0;
  const computedGrand=rawGrand-disc;
  const computedUnit=computedGrand/(+hdr.qty||1);
  const ou=parseFloat(hdr.overrideUnit)||0;
  const grand=ou>0?ou*(+hdr.qty||1):computedGrand;
  const unit=ou>0?ou:computedUnit;
  return{sub,mk,bv,vat,disc,computedGrand,computedUnit,grand,unit,overridden:ou>0};
}

/* â”€â”€ CE TEXT â”€â”€ */
function buildCE(hdr,sets,tot){
  const fp2=fp;
  const rows=sets.flatMap(s=>{
    const bd=calcSet(s);if(!Object.keys(bd).length)return[];
    return[`  -- ${s.name.toUpperCase()} --`,...Object.entries(bd).map(([k,v])=>`    ${(k.startsWith("oth")?(s.otherCosts[parseInt(k.slice(3))]?.label||"Other"):(CLBL[k]||k)).padEnd(22)}${fp2(v)}`),`    ${"Subtotal".padEnd(22)}${fp2(Object.values(bd).reduce((a,b)=>a+b,0))}`,""];
  });
  return["=======================================","         PrintAmplified","  Whs 14 Lagsa Compound Brgy Nueva","  San Pedro, Laguna","  09175277771 / 09999923319","  guiam.printamplified@gmail.com","=======================================","         COST ESTIMATE (C.E.)","",
    `C.E. #  : ${hdr.ceNum}`,`Date    : ${hdr.date}`,"",`CLIENT  : ${hdr.clientName||"â€”"}`,hdr.clientAddr?`ADDRESS : ${hdr.clientAddr}`:"",`PROJECT : ${hdr.projectName||"â€”"}`,"",
    "---------------------------------------",`QTY  : ${hdr.qty||"â€”"} ${hdr.qtyUnit}`,hdr.size?`SIZE : ${hdr.size}`:"",hdr.colors?`CLR  : ${hdr.colors}`:"",hdr.pages?`PGS  : ${hdr.pages}`:"",hdr.specs?`SPEC : ${hdr.specs}`:"","",
    "---------------------------------------","  COST BREAKDOWN:","",...rows,
    "---------------------------------------",`  ${"Subtotal".padEnd(26)}${fp2(tot.sub)}`,`  ${"Markup ("+hdr.markup+"%)".padEnd(26)}${fp2(tot.mk)}`,
    ...(hdr.vatExempt?["  VAT: Exempt"]:[`  ${"VAT ("+hdr.vatRate+"%)".padEnd(26)}${fp2(tot.vat)}`]),"",
    `  UNIT PRICE   : ${fp2(tot.unit)}`,`  TOTAL AMOUNT : ${fp2(tot.grand)}`,"",
    "---------------------------------------",`TERMS : ${hdr.paymentTerms}`,`VALID : ${hdr.validity||30} days`,hdr.notes?`NOTES : ${hdr.notes}`:"","","=======================================","*Prices subject to change without notice","=======================================",
  ].filter(x=>x!=null).join("\n");
}

/* â”€â”€ CE PRINT VIEW (modal + window.print) â”€â”€ */
function CEPrintView({hdr,sets,tot,onClose}){
  const [showBD,setShowBD]=useState(false);
  const printCSS=`
    @media print{
      body>*{display:none!important;}
      #ce-print-root{display:block!important;position:static!important;overflow:visible!important;}
      .nop{display:none!important;}
      @page{margin:.5cm;size:A4 portrait;}
    }
  `;
  const bdSets=sets.map(s=>{
    const bd=calcSet(s);
    const sub=Object.values(bd).reduce((a,b)=>a+b,0);
    return{...s,bd,sub};
  });
  return(
    <div id="ce-print-root" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#fff",
      zIndex:9999,overflowY:"auto",fontFamily:"'Trebuchet MS','Segoe UI',Tahoma,sans-serif",
      color:"#111",fontSize:11}}>
      <style>{printCSS}</style>
      {/* Action bar */}
      <div className="nop" style={{display:"flex",flexWrap:"wrap",gap:7,padding:"10px 14px",background:"#f0f0f0",
        borderBottom:"2px solid #E0295A",position:"sticky",top:0,zIndex:10,alignItems:"center"}}>
        <button onClick={()=>window.print()} style={{padding:"9px 16px",background:"#E0295A",color:"#fff",
          border:"none",borderRadius:6,cursor:"pointer",fontWeight:800,fontSize:13,display:"flex",
          alignItems:"center",gap:6}}><span style={{fontSize:18}}>ðŸ“„</span> Print / Save as PDF</button>
        <button onClick={()=>setShowBD(p=>!p)} style={{padding:"9px 14px",background:showBD?"#1a4a2a":"#2a3550",color:showBD?"#2ecc71":"#7888aa",
          border:`1px solid ${showBD?"#27ae60":"#253050"}`,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12}}>
          {showBD?"ðŸ™ˆ Hide Breakdown":"ðŸ‘ Show Breakdown"}
        </button>
        <button onClick={onClose} style={{padding:"9px 14px",background:"#333",color:"#fff",
          border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12}}>âœ• Close</button>
        <span style={{fontSize:9,color:"#666",marginLeft:2}}>Select <b>Save as PDF</b> in print dialog.</span>
      </div>
      {/* CE Document */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"24px 32px 40px"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
              <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="#fff"/>
              <polygon points="50,50 50,5 93,28" fill="#E0245A"/>
              <polygon points="50,50 93,28 93,72" fill="#00AEBF"/>
              <polygon points="50,50 93,72 50,95" fill="#E8457A"/>
              <polygon points="50,50 50,95 7,72" fill="#3BBFC8"/>
              <polygon points="50,50 7,72 7,28" fill="#00AEBF" opacity=".75"/>
              <polygon points="50,50 7,28 50,5" fill="#D4185A" opacity=".85"/>
              <line x1="50" y1="5" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <line x1="93" y1="28" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <line x1="93" y1="72" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <line x1="50" y1="95" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <line x1="7" y1="72" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <line x1="7" y1="28" x2="50" y2="50" stroke="#fff" strokeWidth="1" opacity=".5"/>
              <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="none" stroke="#fff" strokeWidth="2"/>
            </svg>
            <div>
              <div style={{fontSize:22,lineHeight:1}}>
                <span style={{color:"#3BBFC8",fontWeight:300}}>Print</span>
                <span style={{color:"#E0295A",fontWeight:800}}>Amplified</span>
              </div>
              <div style={{fontSize:9.5,color:"#555",lineHeight:1.8,marginTop:2}}>
                Warehouse 14, Lagsa Compound, Brgy. Nueva<br/>
                San Pedro, Laguna 4023<br/>
                &#9742; 09175277771 &nbsp;/&nbsp; 09999923319 &nbsp;&nbsp; &#9993; guiam.printamplified@gmail.com
              </div>
            </div>
          </div>
          <div style={{textAlign:"right",fontSize:9.5,color:"#555",lineHeight:1.9}}>
            <div style={{fontSize:15,fontWeight:900,color:"#E0295A",letterSpacing:1}}>{hdr.ceNum}</div>
            <div><b>Date:</b> {hdr.date}</div>
            <div><b>Valid:</b> {hdr.validity||30} days</div>
          </div>
        </div>
        {/* Rule */}
        <div style={{height:3,background:"linear-gradient(90deg,#E0295A,#3BBFC8)",borderRadius:2,margin:"8px 0"}}/>
        <div style={{textAlign:"center",fontSize:18,fontWeight:900,color:"#E0295A",letterSpacing:2,margin:"4px 0 2px"}}>COST ESTIMATE</div>
        <div style={{textAlign:"center",fontSize:9,color:"#999",marginBottom:10}}>Computer-generated &bull; Prices subject to change without prior notice</div>
        {/* Meta */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:8}}>
          {[
            ["Client",hdr.clientName||"\u2014"],
            ["Project / Job",hdr.projectName||"\u2014"],
            ...(hdr.clientAddr?[["Address",hdr.clientAddr]]:[]),
            ["Quantity",`${hdr.qty||"\u2014"} ${hdr.qtyUnit}`],
            ["Payment Terms",hdr.paymentTerms],
          ].map(([k,v],i)=>(
            <div key={i} style={{gridColumn:k==="Address"?"1/-1":"auto",background:"#f5f5f5",borderRadius:4,padding:"4px 9px"}}>
              <div style={{fontSize:7.5,color:"#888",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:1}}>{k}</div>
              <div style={{fontSize:11,color:"#111",fontWeight:600,wordBreak:"break-word"}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Specs */}
        {(hdr.size||hdr.colors||hdr.pages||hdr.specs)&&(
          <div style={{borderLeft:"3px solid #3BBFC8",background:"#f8f9ff",padding:"6px 12px",marginBottom:8,fontSize:10.5,lineHeight:1.9}}>
            {hdr.size&&<span><b>Size:</b> {hdr.size}&nbsp;&nbsp;</span>}
            {hdr.colors&&<span><b>Colors:</b> {hdr.colors}&nbsp;&nbsp;</span>}
            {hdr.pages&&<span><b>Pages:</b> {hdr.pages}&nbsp;&nbsp;</span>}
            {hdr.specs&&<><br/>{hdr.specs}</>}
          </div>
        )}
        {/* Cost Breakdown â€” toggled */}
        <div onClick={()=>setShowBD(p=>!p)} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",
          fontSize:8.5,fontWeight:700,color:"#3BBFC8",textTransform:"uppercase",letterSpacing:1.5,
          margin:"8px 0 4px",paddingBottom:2,borderBottom:"1px solid #cce9f0"}}>
          <span>Cost Breakdown â€” {sets.length} Component{sets.length>1?"s":""}</span>
          <span style={{fontSize:10,background:"#e8f8fb",borderRadius:4,padding:"1px 7px",letterSpacing:0}}>{showBD?"â–² Hide":"â–¼ Show"}</span>
        </div>
        {showBD&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:6,fontSize:11}}>
          <tbody>
            {bdSets.map((s,si)=>(
              Object.keys(s.bd).length===0?null:(
                <React.Fragment key={si}>
                  <tr>
                    <td colSpan={2} style={{background:"#f0f8fb",color:"#3BBFC8",fontWeight:800,
                      fontSize:10,padding:"5px 7px",textTransform:"uppercase",letterSpacing:.5,
                      borderBottom:"2px solid #cce9f0",borderTop:si>0?"3px solid #e0f5f8":"none"}}>
                      &#9658; {s.name}
                    </td>
                  </tr>
                  {Object.entries(s.bd).map(([k,v])=>{
                    const lbl=k.startsWith("oth")
                      ?(s.otherCosts[parseInt(k.slice(3))]?.label||"Other")
                      :(CLBL[k]||k);
                    return(
                      <tr key={k} style={{borderBottom:"1px solid #f0f0f0"}}>
                        <td style={{padding:"3px 7px 3px 18px",color:"#333"}}>{lbl}</td>
                        <td style={{padding:"3px 7px",textAlign:"right",fontWeight:600,whiteSpace:"nowrap"}}>{fp(v)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{background:"#f5f0ff"}}>
                    <td style={{padding:"4px 7px",fontWeight:700,color:"#7046a0"}}>Subtotal â€” {s.name}</td>
                    <td style={{padding:"4px 7px",textAlign:"right",fontWeight:700,color:"#7046a0",whiteSpace:"nowrap"}}>{fp(s.sub)}</td>
                  </tr>
                  <tr><td colSpan={2} style={{padding:"3px 0",border:"none"}}></td></tr>
                </React.Fragment>
              )
            ))}
            <tr><td colSpan={2} style={{borderTop:"2.5px solid #ddd",padding:"2px 0"}}></td></tr>
            <tr style={{fontWeight:700}}>
              <td style={{padding:"4px 7px"}}>Combined Subtotal</td>
              <td style={{padding:"4px 7px",textAlign:"right",whiteSpace:"nowrap"}}>{fp(tot.sub)}</td>
            </tr>
            <tr style={{color:"#555"}}>
              <td style={{padding:"3px 7px"}}>Markup ({hdr.markup}%)</td>
              <td style={{padding:"3px 7px",textAlign:"right",whiteSpace:"nowrap"}}>{fp(tot.mk)}</td>
            </tr>
            <tr style={{color:"#555"}}>
              <td style={{padding:"3px 7px"}}>VAT ({hdr.vatExempt?"Exempt":hdr.vatRate+"%"})</td>
              <td style={{padding:"3px 7px",textAlign:"right",whiteSpace:"nowrap"}}>{hdr.vatExempt?"Exempt":fp(tot.vat)}</td>
            </tr>
          </tbody>
        </table>
        }
        {/* Total Box */}
        <div style={{border:"2.5px solid #E0295A",borderRadius:8,padding:"12px 16px",
          background:"linear-gradient(135deg,#fff8f8,#fff)",display:"flex",
          justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
          <div>
            <div style={{fontSize:8,color:"#888",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Total Amount â€” VAT {hdr.vatExempt?"Exempt":"Inclusive"}</div>
            <div style={{fontSize:28,fontWeight:900,color:"#E0295A",lineHeight:1}}>{fp(tot.grand)}</div>
            {tot.overridden&&<div style={{fontSize:8,color:"#aaa",textDecoration:"line-through"}}>Computed: {fp(tot.computedGrand)}</div>}
            <div style={{fontSize:9,color:"#aaa",marginTop:2}}>{hdr.vatExempt?"VAT Exempt":hdr.vatRate+"% VAT Inclusive"}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:8,color:"#888",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{tot.overridden?"Adjusted ":""}Unit Price / {hdr.qtyUnit}</div>
            <div style={{fontSize:18,fontWeight:900,color:"#3BBFC8"}}>{fp(tot.unit)}</div>
            {tot.overridden&&<div style={{fontSize:8,color:"#aaa",textDecoration:"line-through"}}>{fp(tot.computedUnit)} computed</div>}
            <div style={{fontSize:9,color:"#aaa"}}>{hdr.qty||"â€”"} {hdr.qtyUnit}</div>
          </div>
        </div>
        {/* Terms */}
        <div style={{background:"#f8f8f8",borderRadius:4,padding:"7px 12px",fontSize:10.5,lineHeight:1.9,marginBottom:12}}>
          <b>Payment Terms:</b> {hdr.paymentTerms}
          {hdr.notes&&<> &bull; <b>Notes:</b> {hdr.notes}</>}
        </div>
                {/* T&C Section */}
        <div style={{margin:"12px 0 8px",borderTop:"2px solid #3BBFC8",paddingTop:10}}>
          <div style={{fontSize:10,fontWeight:800,color:"#3BBFC8",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Terms & Conditions</div>
          {TANDC.map((item,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:5,fontSize:9.5,lineHeight:1.6}}>
              <span style={{color:"#27ae60",flexShrink:0}}>âœ…</span>
              <div><b style={{color:"#222"}}>{item.t}:</b> <span style={{color:"#444"}}>{item.b}</span></div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{fontSize:8.5,color:"#bbb",textAlign:"center",borderTop:"1px solid #eee",paddingTop:6,lineHeight:1.8}}>
          <b style={{color:"#999"}}>PrintAmplified</b> &bull; Warehouse 14, Lagsa Compound, Brgy. Nueva, San Pedro, Laguna &bull; guiam.printamplified@gmail.com<br/>
          This is a computer-generated cost estimate. All prices are subject to change without prior notice.<br/>
          C.E. {hdr.ceNum} &bull; Generated {new Date().toLocaleString("en-PH")}
        </div>
      </div>
    </div>
  );
}


/* â”€â”€ LAYOUT ENGINE â”€â”€ */
function calcLayouts(fw,fh,sw,sh,mw,mh,bl=0.125,grip=0.5){
  if(!fw||!fh||!sw||!sh||fw<=0||fh<=0||sw<=0||sh<=0)return[];
  const bw=fw+bl*2,bh=fh+bl*2;
  const res=[],seen=new Set();
  for(let nx=1;nx<=8;nx++)for(let ny=1;ny<=8;ny++){
    const pw=sw/nx,ph=sh/ny;
    if(pw>mw+.01||ph>mh+.01)continue;
    const av=ph-grip;if(av<=.1)continue;
    const aX=Math.floor(pw/bw+1e-9),aY=Math.floor(av/bh+1e-9),oA=aX*aY;
    const bX=Math.floor(pw/bh+1e-9),bY=Math.floor(av/bw+1e-9),oB=bX*bY;
    if(!oA&&!oB)continue;
    const rot=oB>oA,outs=rot?oB:oA,cols=rot?bX:aX,rows=rot?bY:aY;
    const cw=rot?bh:bw,ch=rot?bw:bh;
    const pps=nx*ny,total=outs*pps;
    if(!total)continue;
    const key=`${cols}x${rows}-${rot}-${nx}x${ny}`;
    if(seen.has(key))continue;seen.add(key);
    const eff=Math.round(total*fw*fh/(sw*sh)*100);
    res.push({nx,ny,pw,ph,pps,outs,total,cols,rows,cw,ch,rot,eff,grip,wR:pw-cols*cw,wT:av-rows*ch});
  }
  return res.sort((a,b)=>b.total-a.total||a.pps-b.pps).slice(0,12);
}

/* â”€â”€ SVG CUTTING DIAGRAM â”€â”€ */
function CutDiagram({lay,pw,ph}){
  if(!lay)return null;
  const grip=lay.grip||.5;
  const sc=Math.min(300/pw,220/ph);
  const dW=pw*sc,dH=ph*sc,dG=grip*sc,avH=(ph-grip)*sc;
  const dCW=lay.cw*sc,dCH=lay.ch*sc;
  const fs=Math.max(5,Math.min(9,dCW/5,dCH/3.5));
  const pieces=[];
  for(let r=0;r<lay.rows;r++)for(let c=0;c<lay.cols;c++)pieces.push({x:c*dCW,y:r*dCH,n:r*lay.cols+c+1});
  return(
    <svg width="100%" viewBox={`-30 -20 ${dW+48} ${dH+28}`} style={{overflow:"visible",maxWidth:340,display:"block",margin:"0 auto"}}>
      <rect x={0} y={0} width={dW} height={dH} fill={BG} stroke={T} strokeWidth={1.5} rx={2}/>
      <rect x={0} y={0} width={dW} height={avH} fill="#0a1f1f" opacity={.5}/>
      <rect x={0} y={avH} width={dW} height={dG} fill={PK} opacity={.15}/>
      {pieces.map(p=>(
        <g key={p.n}>
          <rect x={p.x+.8} y={p.y+.8} width={dCW-1.6} height={dCH-1.6} fill={T} opacity={.15} stroke={T} strokeWidth={.7}/>
          {dCW>16&&dCH>11&&<text x={p.x+dCW/2} y={p.y+dCH/2} textAnchor="middle" dominantBaseline="middle" fill={T} fontSize={fs} fontWeight="700">{p.n}</text>}
        </g>
      ))}
      {Array.from({length:lay.cols+1},(_,i)=><line key={`v${i}`} x1={i*dCW} y1={0} x2={i*dCW} y2={avH} stroke="#fff" strokeWidth={i===0||i===lay.cols?.8:.4} strokeDasharray={i===0||i===lay.cols?"":"4,3"} opacity={.3}/>)}
      {Array.from({length:lay.rows+1},(_,i)=><line key={`h${i}`} x1={0} y1={i*dCH} x2={dW} y2={i*dCH} stroke="#fff" strokeWidth={i===0||i===lay.rows?.8:.4} strokeDasharray={i===0||i===lay.rows?"":"4,3"} opacity={.3}/>)}
      {lay.wR*sc>2&&<rect x={lay.cols*dCW} y={0} width={lay.wR*sc} height={avH} fill={PK} opacity={.1}/>}
      <text x={dW/2} y={avH+dG/2} textAnchor="middle" dominantBaseline="middle" fill={PK} fontSize={6} fontWeight="700" opacity={.8}>GRIPPER {grip}"</text>
      <line x1={0} y1={-9} x2={dW} y2={-9} stroke="#fff" strokeWidth={.7} opacity={.5}/>
      <text x={dW/2} y={-12} textAnchor="middle" fill="#fff" fontSize={7} opacity={.8}>{pw.toFixed(2)}"</text>
      <line x1={-9} y1={0} x2={-9} y2={dH} stroke="#fff" strokeWidth={.7} opacity={.5}/>
      <text x={-13} y={dH/2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={7} opacity={.8} transform={`rotate(-90,-13,${dH/2})`}>{ph.toFixed(2)}"</text>
      {dCW>20&&<><line x1={0} y1={dH+10} x2={dCW} y2={dH+10} stroke={T} strokeWidth={.7} opacity={.6}/><text x={dCW/2} y={dH+18} textAnchor="middle" fill={T} fontSize={6.5} opacity={.8}>{lay.cw.toFixed(3)}"</text></>}
      {dCH>14&&<><line x1={dW+9} y1={0} x2={dW+9} y2={dCH} stroke={T} strokeWidth={.7} opacity={.6}/><text x={dW+19} y={dCH/2} textAnchor="middle" dominantBaseline="middle" fill={T} fontSize={6.5} opacity={.8} transform={`rotate(90,${dW+19},${dCH/2})`}>{lay.ch.toFixed(3)}"</text></>}
    </svg>
  );
}

/* â”€â”€ STYLES â”€â”€ */
const S={
  app:{fontFamily:FN,background:BG,minHeight:"100vh",color:TX,maxWidth:480,margin:"0 auto"},
  hdr:{background:BG2,borderBottom:`2px solid ${PK}`,padding:"11px 13px"},
  tabs:{display:"flex",background:BG2,borderBottom:`1px solid ${BD}`},
  tab:{flex:1,padding:"9px 2px",border:"none",background:"none",color:TX2,fontSize:10,cursor:"pointer",fontFamily:FN,fontWeight:700,letterSpacing:.3,whiteSpace:"nowrap"},
  tabA:{color:T,borderBottom:`2px solid ${T}`},
  body:{padding:"9px 9px 90px"},
  card:{background:BG3,borderRadius:7,marginBottom:7,overflow:"hidden",border:`1px solid ${BD}`},
  chdr:{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"10px 13px",background:"none",border:"none",cursor:"pointer",color:TX},
  lbl:{display:"block",fontSize:10,color:TX2,marginBottom:3,letterSpacing:1,textTransform:"uppercase",fontWeight:700},
  inp:{width:"100%",background:"#050810",border:`1px solid ${BD}`,borderRadius:5,padding:"8px 9px",color:TX,fontSize:13,boxSizing:"border-box",fontFamily:FN},
  sel:{width:"100%",background:"#050810",border:`1px solid ${BD}`,borderRadius:5,padding:"8px 9px",color:TX,fontSize:12,boxSizing:"border-box",fontFamily:FN},
  r2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7},
  r3:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7},
  srow:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${BD}`,fontSize:12},
  grand:{background:`linear-gradient(135deg,${BG3},${BG2})`,border:`1px solid ${PK}`,borderRadius:9,padding:13,margin:"9px 0"},
  btn:{padding:"10px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700},
  btnP:{background:PK,color:"#fff"},
  btnT:{background:T,color:"#fff"},
  btnO:{background:"transparent",border:`1px solid ${T}`,color:T},
  btnD:{background:"#5a0a0a",color:"#fff"},
};

/* â”€â”€ UI ATOMS â”€â”€ */
const F=({label,hint,ch})=>(<div style={{marginBottom:9}}><label style={S.lbl}>{label}{hint&&<span style={{color:"#444",fontStyle:"italic",textTransform:"none",fontWeight:400,letterSpacing:0}}> Â· {hint}</span>}</label>{ch}</div>);
const I=({v,oc,type="text",ph=""})=>(<input type={type} value={v} placeholder={ph} onChange={e=>oc(e.target.value)} style={S.inp}/>);
const Sl=({v,oc,opts})=>(<select value={v} onChange={e=>oc(e.target.value)} style={S.sel}>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>);
const Tog=({lbl,on,oc,col=T})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><button onClick={()=>oc(!on)} style={{width:34,height:19,borderRadius:10,border:"none",cursor:"pointer",background:on?col:BD,position:"relative",transition:"background .2s",flexShrink:0}}><div style={{width:13,height:13,borderRadius:7,background:"#fff",position:"absolute",top:3,left:on?17:3,transition:"left .2s"}}/></button><span style={{fontSize:12,color:on?col:TX2,fontWeight:on?"700":"400"}}>{lbl}</span></div>);
const Sec=({title,icon,open,tog,acc=T,ch})=>(<div style={{...S.card,marginBottom:0,borderTop:`1px solid ${BD}`}}><button onClick={tog} style={S.chdr}><span>{icon}</span><span style={{flex:1,textAlign:"left",fontWeight:700,fontSize:11.5,color:open?acc:TX3,letterSpacing:.3}}>{title}</span><span style={{color:TX2,fontSize:10}}>{open?"â–²":"â–¼"}</span></button>{open&&<div style={{padding:"9px 13px 13px"}}>{ch}</div>}</div>);

/* â”€â”€ PAPER SELECTOR â”€â”€ */
function PaperSel({s,up}){
  const[q,setQ]=useState("");
  const allP=useMemo(()=>getAllPapers(),[]);
  const fp2=useMemo(()=>{if(!q)return allP;const lq=q.toLowerCase();return allP.filter(p=>(p.g+" "+p.l).toLowerCase().includes(lq));},[q,allP]);
  const grps=useMemo(()=>{const m={};fp2.forEach(p=>{if(!m[p.g])m[p.g]=[];m[p.g].push(p);});return m;},[fp2]);
  return(<>
    <F label="Search Paper" ch={<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filter by name, gsm, brandâ€¦" style={S.inp}/>}/>
    <F label="Select Paper" ch={<select value={s.paperKey} onChange={e=>{up("paperKey",e.target.value);const[g,l]=e.target.value.split("|Â§|");const f=PAPERS.find(p=>p.g===g&&p.l===l);if(f){up("paperRate",String(f.r));up("paperPer",f.u);}}} style={S.sel}><option value="">â€” Select â€”</option>{Object.entries(grps).map(([g,items])=>(<optgroup key={g} label={g}>{items.map((p,i)=>(<option key={i} value={`${p.g}|Â§|${p.l}`}>{p.l} â€” â‚±{p.r}/{p.u}</option>))}</optgroup>))}</select>}/>
    <div style={S.r3}>
      <F label="Rate â‚±" ch={<I type="number" v={s.paperRate} oc={v=>up("paperRate",v)} ph="0"/>}/>
      <F label="Per" ch={<Sl v={s.paperPer} oc={v=>up("paperPer",v)} opts={["sht","kg","lb","ream","bale","pc"].map(x=>({v:x,l:x}))}/>}/>
      <F label="Qty/Units" ch={<I type="number" v={s.paperSheets} oc={v=>up("paperSheets",v)} ph="0"/>}/>
    </div>
    <F label="Wastage %" hint="default 5%" ch={<I type="number" v={s.paperWastage} oc={v=>up("paperWastage",v)}/>}/>
    {s.paperRate&&s.paperSheets&&<div style={{fontSize:11,color:T,fontWeight:700,marginTop:2}}>Est. Paper Cost: {fp(+s.paperSheets*(1+(+s.paperWastage||5)/100)*(+s.paperRate))}</div>}
  </>);
}

/* â”€â”€ SET EDITOR â”€â”€ */
function SetEd({s,up}){
  const tog=k=>up("_op",{...s._op,[k]:!s._op[k]});
  const bd=calcSet(s);const st=Object.values(bd).reduce((a,b)=>a+b,0);
  return(<div style={{background:BG4,borderRadius:8,overflow:"hidden",border:`1px solid ${BD}`}}>
    <Sec title="PAPER" icon="ðŸ“„" open={s._op.paper} tog={()=>tog("paper")} acc={T} ch={<><Tog lbl="Include Paper Cost" on={s.paperOn} oc={v=>up("paperOn",v)}/>{s.paperOn&&<PaperSel s={s} up={up}/>}</>}/>
    <Sec title="PRINTING" icon="ðŸ–¨ï¸" open={s._op.print} tog={()=>tog("print")} acc={T} ch={<>
      <Tog lbl="Digital Printing" on={s.digitalOn} oc={v=>up("digitalOn",v)}/>{s.digitalOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.digitalType} oc={v=>up("digitalType",v)} opts={Object.entries(getMergedDIG()).map(([k,d])=>({v:k,l:`${d.l} â€” â‚±${d.r}/sht`}))}/>}/><F label="Sheets" ch={<I type="number" v={s.digitalSheets} oc={v=>up("digitalSheets",v)} ph="0"/>}/></div>}
      <Tog lbl="Offset Press Run" on={s.pressOn} oc={v=>up("pressOn",v)}/>{s.pressOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Machine" ch={<Sl v={s.pressType} oc={v=>up("pressType",v)} opts={Object.entries(getMergedPRESS()).map(([k,d])=>({v:k,l:d.l}))}/>}/><F label="Total Loads" hint="press sheets" ch={<I type="number" v={s.pressLoads} oc={v=>up("pressLoads",v)} ph="0"/>}/></div>}
      <Tog lbl="CTP Plates" on={s.ctpOn} oc={v=>up("ctpOn",v)}/>{s.ctpOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Machine" ch={<Sl v={s.ctpType} oc={v=>up("ctpType",v)} opts={["ctpKord","ctpSord","ctpKomori"].map(k=>({v:k,l:`${PRE[k].l} â‚±${PRE[k].r}/plate`}))}/>}/><F label="No. of Plates" ch={<I type="number" v={s.ctpPlates} oc={v=>up("ctpPlates",v)} ph="0"/>}/></div>}
    </>}/>
    <Sec title="FINISHING & POST-PRESS" icon="âœ¨" open={s._op.fin} tog={()=>tog("fin")} acc={PK} ch={<>
      <Tog lbl="Lamination" on={s.lamOn} oc={v=>up("lamOn",v)} col={PK}/>{s.lamOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.lamType} oc={v=>up("lamType",v)} opts={Object.entries(getMergedLAM()).map(([k,d])=>({v:k,l:`${d.l} â‚±${d.r}/sq.in`}))}/>}/><div style={S.r3}><F label="Sq.In" ch={<I type="number" v={s.lamSqIn} oc={v=>up("lamSqIn",v)} ph="0"/>}/><F label="Loads" ch={<I type="number" v={s.lamLoads} oc={v=>up("lamLoads",v)} ph="1"/>}/><F label="Sides" ch={<Sl v={s.lamSides} oc={v=>up("lamSides",v)} opts={[{v:"1",l:"1"},{v:"2",l:"2"}]}/>}/></div><Tog lbl="+ Blanket â‚±2,500" on={s.lamBlanket} oc={v=>up("lamBlanket",v)} col={PK}/></div>}
      <Tog lbl="Diecutting / Scoring" on={s.dieOn} oc={v=>up("dieOn",v)} col={PK}/>{s.dieOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Qty" hint="â‚±1k/350 min" ch={<I type="number" v={s.dieQty} oc={v=>up("dieQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Blade Die Mold" on={s.bladeOn} oc={v=>up("bladeOn",v)} col={PK}/>{s.bladeOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.bladeType} oc={v=>up("bladeType",v)} opts={[{v:"manual",l:"Manual â‚±12/sq.in min â‚±500"},{v:"laser",l:"Laser â‚±18/sq.in min â‚±500"}]}/>}/><F label="Sq.Inches" ch={<I type="number" v={s.bladeSqIn} oc={v=>up("bladeSqIn",v)} ph="0"/>}/></div>}
      <Tog lbl="Foil Stamping" on={s.foilOn} oc={v=>up("foilOn",v)} col={PK}/>{s.foilOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Sq.In" hint="â‚±0.40/sq.in min â‚±500" ch={<I type="number" v={s.foilSqIn} oc={v=>up("foilSqIn",v)} ph="0"/>}/></div>}
      <Tog lbl="Embossing" on={s.embossOn} oc={v=>up("embossOn",v)} col={PK}/>{s.embossOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Sq.In" hint="â‚±0.40/sq.in" ch={<I type="number" v={s.embossSqIn} oc={v=>up("embossSqIn",v)} ph="0"/>}/></div>}
      <Tog lbl="Spot UV Lam Blanket" on={s.spotUVOn} oc={v=>up("spotUVOn",v)} col={PK}/>{s.spotUVOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Qty" hint="â‚±2,500 ea" ch={<I type="number" v={s.spotUVQty} oc={v=>up("spotUVQty",v)} ph="1"/>}/></div>}
      <Tog lbl="Round Cornering" on={s.roundOn} oc={v=>up("roundOn",v)} col={PK}/>{s.roundOn&&<div style={{paddingLeft:12,marginBottom:8}}><div style={S.r2}><F label="Pieces" ch={<I type="number" v={s.roundQty} oc={v=>up("roundQty",v)} ph="0"/>}/><F label="Corners/pc" ch={<I type="number" v={s.roundCorners} oc={v=>up("roundCorners",v)} ph="4"/>}/></div></div>}
      <Tog lbl="Cutting" on={s.cutOn} oc={v=>up("cutOn",v)} col={PK}/>{s.cutOn&&<div style={{paddingLeft:12,marginBottom:8}}><div style={S.r2}><F label="Chops" ch={<I type="number" v={s.cutChops} oc={v=>up("cutChops",v)} ph="0"/>}/><F label="Rate/Chop â‚±" ch={<I type="number" v={s.cutRate} oc={v=>up("cutRate",v)} ph="3.50"/>}/></div></div>}
      <Tog lbl="Perforation" on={s.perfOn} oc={v=>up("perfOn",v)} col={PK}/>{s.perfOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Qty" hint="â‚±1k/350 min" ch={<I type="number" v={s.perfQty} oc={v=>up("perfQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Serial Numbering" on={s.serialOn} oc={v=>up("serialOn",v)} col={PK}/>{s.serialOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Source" ch={<Sl v={s.serialSrc} oc={v=>up("serialSrc",v)} opts={[{v:"inhouse",l:"In-house â‚±450/1k+â‚±300 suc."},{v:"outsourced",l:"Outsourced â‚±650/1k+â‚±400 suc."}]}/>}/><F label="Qty" ch={<I type="number" v={s.serialQty} oc={v=>up("serialQty",v)} ph="0"/>}/></div>}
    </>}/>
    <Sec title="BINDERY" icon="ðŸ“Ž" open={s._op.bind} tog={()=>tog("bind")} acc={T} ch={<>
      <Tog lbl="Folding" on={s.foldOn} oc={v=>up("foldOn",v)}/>{s.foldOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Method" ch={<Sl v={s.foldType} oc={v=>up("foldType",v)} opts={[{v:"machine",l:"Machine â‚±65/1k+â‚±650 setup"},{v:"manual",l:"Manual â‚±0.25/fold min â‚±600"}]}/>}/><div style={S.r2}><F label="Qty" ch={<I type="number" v={s.foldQty} oc={v=>up("foldQty",v)} ph="0"/>}/><F label="Folds/Sheet" ch={<I type="number" v={s.foldFolds} oc={v=>up("foldFolds",v)} ph="1"/>}/></div></div>}
      <Tog lbl="Saddle Stitching" on={s.saddleOn} oc={v=>up("saddleOn",v)}/>{s.saddleOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Stitches" ch={<Sl v={s.saddleType} oc={v=>up("saddleType",v)} opts={[{v:"s2",l:"2 Stitches â‚±1.50/pc"},{v:"s3",l:"3 Stitches â‚±2.00/pc"}]}/>}/><F label="Qty" ch={<I type="number" v={s.saddleQty} oc={v=>up("saddleQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Perfect Binding" on={s.pbOn} oc={v=>up("pbOn",v)}/>{s.pbOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Size" ch={<Sl v={s.pbSize} oc={v=>up("pbSize",v)} opts={[{v:"a5",l:"A5 â‚±30/pc min â‚±4k"},{v:"a4",l:"A4 â‚±45/pc min â‚±5k"}]}/>}/><F label="Qty" ch={<I type="number" v={s.pbQty} oc={v=>up("pbQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Wire Binding" on={s.wireOn} oc={v=>up("wireOn",v)}/>{s.wireOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Qty" hint="â‚±8/pc" ch={<I type="number" v={s.wireQty} oc={v=>up("wireQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Gluing" on={s.glueOn} oc={v=>up("glueOn",v)}/>{s.glueOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.glueType} oc={v=>up("glueType",v)} opts={[{v:"small",l:"Small Box â‚±0.50/pc"},{v:"medium",l:"Medium â‚±1/pc"},{v:"big",l:"Big â‚±1.50/pc"},{v:"rigid_sm",l:"Rigid S/M â‚±100/pc"},{v:"rigid_big",l:"Rigid Big â‚±120/pc"}]}/>}/><F label="Qty" ch={<I type="number" v={s.glueQty} oc={v=>up("glueQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Gathering" on={s.gatherOn} oc={v=>up("gatherOn",v)}/>{s.gatherOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Cost â‚±" hint="job-out or manual" ch={<I type="number" v={s.gatherLot} oc={v=>up("gatherLot",v)} ph="0"/>}/></div>}
    </>}/>
    <Sec title="PREPRESS" icon="ðŸŽ¨" open={s._op.pre} tog={()=>tog("pre")} acc={PK} ch={<>
      <Tog lbl="Design / FA" on={s.designOn} oc={v=>up("designOn",v)} col={PK}/>{s.designOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.designType} oc={v=>up("designType",v)} opts={["designFlyer","designPkg","designText","designFull","designForm"].map(k=>({v:k,l:`${PRE[k].l} â‚±${PRE[k].r}/${PRE[k].u}`}))}/>}/><F label={`Qty (${PRE[s.designType]?.u||"pc"})`} ch={<I type="number" v={s.designQty} oc={v=>up("designQty",v)} ph="1"/>}/></div>}
      <Tog lbl="Color Proofing" on={s.proofOn} oc={v=>up("proofOn",v)} col={PK}/>{s.proofOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="A3 Proofs" hint="â‚±100/A3" ch={<I type="number" v={s.proofQty} oc={v=>up("proofQty",v)} ph="0"/>}/></div>}
      <Tog lbl="Mockup" on={s.mockupOn} oc={v=>up("mockupOn",v)} col={PK}/>{s.mockupOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Type" ch={<Sl v={s.mockupType} oc={v=>up("mockupType",v)} opts={["mockupSoft","mockupHard","mockupCTB"].map(k=>({v:k,l:`${PRE[k].l} â‚±${PRE[k].r}`}))}/>}/><F label="Qty" ch={<I type="number" v={s.mockupQty} oc={v=>up("mockupQty",v)} ph="1"/>}/></div>}
    </>}/>
    <Sec title="OTHER COSTS" icon="âž•" open={s._op.other} tog={()=>tog("other")} acc={T} ch={<>
      <Tog lbl="Delivery" on={s.delivOn} oc={v=>up("delivOn",v)}/>{s.delivOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Cost â‚±" hint="min â‚±2,000" ch={<I type="number" v={s.delivCost} oc={v=>up("delivCost",v)} ph="2000"/>}/></div>}
      <Tog lbl="Packing" on={s.packOn} oc={v=>up("packOn",v)}/>{s.packOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Packs" hint="â‚±50/pack" ch={<I type="number" v={s.packPacks} oc={v=>up("packPacks",v)} ph="0"/>}/></div>}
      <Tog lbl="Kitting" on={s.kitOn} oc={v=>up("kitOn",v)}/>{s.kitOn&&<div style={{paddingLeft:12,marginBottom:8}}><F label="Items" hint="â‚±30/item" ch={<I type="number" v={s.kitQty} oc={v=>up("kitQty",v)} ph="0"/>}/></div>}
      <div style={{borderTop:`1px solid ${BD}`,paddingTop:9,marginTop:3}}>
        <div style={{fontSize:10,color:TX2,fontWeight:700,letterSpacing:1,marginBottom:5}}>CUSTOM LINE ITEMS</div>
        {(s.otherCosts||[]).map((oc,i)=>(<div key={i} style={{display:"flex",gap:5,marginBottom:5}}><input value={oc.label} placeholder="Description" onChange={e=>{const a=[...s.otherCosts];a[i]={...a[i],label:e.target.value};up("otherCosts",a);}} style={{...S.inp,flex:2}}/><input type="number" value={oc.amount} placeholder="â‚±0" onChange={e=>{const a=[...s.otherCosts];a[i]={...a[i],amount:e.target.value};up("otherCosts",a);}} style={{...S.inp,flex:1}}/><button style={{...S.btn,...S.btnD,padding:"7px 9px",fontSize:10}} onClick={()=>up("otherCosts",s.otherCosts.filter((_,j)=>j!==i))}>âœ•</button></div>))}
        <button style={{...S.btn,...S.btnO,width:"100%",padding:7,fontSize:10,marginTop:3}} onClick={()=>up("otherCosts",[...(s.otherCosts||[]),{label:"",amount:""}])}>+ Add Line Item</button>
      </div>
    </>}/>
    {st>0&&<div style={{padding:"8px 13px",background:BG2,borderTop:`1px solid ${BD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:10,color:TX2,fontWeight:700}}>SET SUBTOTAL</span><span style={{fontSize:14,fontWeight:800,color:T}}>{fp(st)}</span></div>}
  </div>);
}

/* â”€â”€ PAPER LAYOUT CALCULATOR â”€â”€ */
function LayoutCalc({lay,upL,onApply,compName}){
  /* lay = set._layout, upL = (k,v)=>void */
  const M=MACH[lay.mach]||MACH.komori;
  const fp2=useMemo(()=>{if(!lay.pSrch)return PAPERS;const q=lay.pSrch.toLowerCase();return PAPERS.filter(p=>(p.g+" "+p.l).toLowerCase().includes(q));},[lay.pSrch]);
  const grps=useMemo(()=>{const m={};fp2.forEach(p=>{if(!m[p.g])m[p.g]=[];m[p.g].push(p);});return m;},[fp2]);
  const handleP=val=>{
    upL("pKey",val);if(!val)return;
    const[g,l]=val.split("|Â§|");const p=PAPERS.find(x=>x.g===g&&x.l===l);
    if(!p)return;upL("rate",String(p.r));
    const m=(g+" "+l).match(/(\d+\.?\d*)\s*[Ã—x]\s*(\d+\.?\d*)/);
    if(m){const a=parseFloat(m[1]),b=parseFloat(m[2]);if(a>0&&b>0){upL("sw",String(Math.max(a,b)));upL("sh",String(Math.min(a,b)));}}
  };
  const layouts=useMemo(()=>calcLayouts(parseFloat(lay.fw),parseFloat(lay.fh),parseFloat(lay.sw),parseFloat(lay.sh),M.w,M.h,lay.blOn?parseFloat(lay.bl)||0:0,parseFloat(lay.grip)||.5),[lay.fw,lay.fh,lay.sw,lay.sh,lay.mach,lay.blOn,lay.bl,lay.grip]);
  const best=layouts[Math.min(lay.selL||0,layouts.length-1)]||null;
  const sheetsNeeded=useMemo(()=>{if(!best||!lay.qty)return 0;return Math.ceil((parseInt(lay.qty)||0)/best.total*(1+(parseInt(lay.waste)||5)/100));},[best,lay.qty,lay.waste]);
  const paperCost=sheetsNeeded*(parseFloat(lay.rate)||0);
  const costPer=lay.qty>0?paperCost/(parseInt(lay.qty)||1):0;
  const swN=parseFloat(lay.sw)||0,shN=parseFloat(lay.sh)||0;
  return(<div style={S.body}>
    <div style={{...S.card,padding:13,marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:4,textTransform:"uppercase"}}>ðŸ“ Layout â€” {compName}</div>
      <div style={{fontSize:9,color:TX2,marginBottom:10}}>Computes outs and paper cost for this component</div>
      <F label="Press Machine" ch={<select value={lay.mach} onChange={e=>upL("mach",e.target.value)} style={S.sel}>{Object.entries(MACH).map(([k,m])=>(<option key={k} value={k}>{m.l} â€” max {m.w}"Ã—{m.h}"</option>))}</select>}/>
      <div style={{background:BG4,borderRadius:5,padding:"7px 10px",marginBottom:9,fontSize:11,display:"flex",gap:16}}>
        <span><span style={{color:TX2}}>Max Sheet: </span><b style={{color:T}}>{M.w}"Ã—{M.h}"</b></span>
        <span><span style={{color:TX2}}>Area: </span><b style={{color:T}}>{(M.w*M.h).toFixed(0)} sq.in</b></span>
      </div>
      <div style={S.r2}>
        <F label='Finished Width (")' ch={<input type="number" value={lay.fw} onChange={e=>upL("fw",e.target.value)} placeholder="e.g. 3.5" style={S.inp}/>}/>
        <F label='Finished Height (")' ch={<input type="number" value={lay.fh} onChange={e=>upL("fh",e.target.value)} placeholder="e.g. 2" style={S.inp}/>}/>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:9}}>
        <Tog lbl={`Bleed (${lay.bl}" per side)`} on={lay.blOn} oc={v=>upL("blOn",v)} col={PK}/>
        {lay.blOn&&<input type="number" value={lay.bl} onChange={e=>upL("bl",e.target.value)} style={{...S.inp,width:65,flexShrink:0}} placeholder="0.125"/>}
      </div>
      <div style={S.r3}>
        <F label='Gripper (")' hint='0.5"' ch={<input type="number" value={lay.grip} onChange={e=>upL("grip",e.target.value)} style={S.inp} placeholder="0.5"/>}/>
        <F label="Job Quantity" ch={<input type="number" value={lay.qty} onChange={e=>upL("qty",e.target.value)} style={S.inp} placeholder="1000"/>}/>
        <F label="Waste %" hint="5%" ch={<input type="number" value={lay.waste} onChange={e=>upL("waste",e.target.value)} style={S.inp}/>}/>
      </div>
    </div>
    <div style={{...S.card,padding:13,marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Paper Stock</div>
      <F label="Search Paper" ch={<input value={lay.pSrch} onChange={e=>upL("pSrch",e.target.value)} placeholder="Filter by name, gsm, brandâ€¦" style={S.inp}/>}/>
      <F label="Select Paper" ch={<select value={lay.pKey} onChange={e=>handleP(e.target.value)} style={S.sel}><option value="">â€” Select Paper â€”</option>{Object.entries(grps).map(([g,items])=>(<optgroup key={g} label={g}>{items.map((p,i)=>(<option key={i} value={`${p.g}|Â§|${p.l}`}>{p.l} â€” â‚±{p.r}/{p.u}</option>))}</optgroup>))}</select>}/>
      <div style={S.r3}>
        <F label='Sheet W (")' ch={<input type="number" value={lay.sw} onChange={e=>upL("sw",e.target.value)} placeholder="25" style={S.inp}/>}/>
        <F label='Sheet H (")' ch={<input type="number" value={lay.sh} onChange={e=>upL("sh",e.target.value)} placeholder="38" style={S.inp}/>}/>
        <F label="Rate/Sheet â‚±" ch={<input type="number" value={lay.rate} onChange={e=>upL("rate",e.target.value)} placeholder="0" style={S.inp}/>}/>
      </div>
      {swN>0&&shN>0&&<div style={{background:BG4,borderRadius:5,padding:"6px 9px",fontSize:11}}>
        <span style={{color:TX2}}>Stock: </span><b style={{color:T}}>{swN}"Ã—{shN}" </b>
        {swN>M.w||shN>M.h?<span style={{color:PK,fontSize:10}}>âš  Larger than machine â€” needs cutting</span>:<span style={{color:"#5a5",fontSize:10}}>âœ“ Fits machine directly</span>}
      </div>}
    </div>
    {layouts.length>0&&<>
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:PK,letterSpacing:1,marginBottom:4,textTransform:"uppercase"}}>ðŸ† Best Layout â€” {best?.outs} Outs/Press Sheet</div>
        <div style={{fontSize:10,color:TX2,marginBottom:8}}>{best?.cols}Ã—{best?.rows} grid Â· {best?.pps} press sheets/stock Â· <b style={{color:T}}>{best?.total} pcs per stock sheet</b></div>
        {best&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
          {[["Press Sheet",`${best.pw.toFixed(3)}"Ã—${best.ph.toFixed(3)}"`],["Stock Cuts",`${best.nx}Ã—${best.ny}=${best.pps} sheets`],["Piece Size",`${best.cw.toFixed(3)}"Ã—${best.ch.toFixed(3)}"${best.rot?" â†º":""}`],["Efficiency",`${best.eff}%`]].map(([k,v])=>(<div key={k} style={{background:BG4,borderRadius:5,padding:"6px 9px"}}><div style={{fontSize:8,color:TX2,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:11,fontWeight:700}}>{v}</div></div>))}
        </div>}
        {lay.qty&&lay.rate&&best&&<div style={{background:`linear-gradient(135deg,${BG3},${BG2})`,border:`1px solid ${PK}`,borderRadius:8,padding:11,marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
            {[["Outs/Stock Sheet",`${best.total} pcs`,""],["Sheets Needed",`${sheetsNeeded}`,""],["Total Paper Cost",fp(paperCost),PK],["Cost/Piece",fp(costPer),T]].map(([k,v,col])=>(<div key={k}><div style={{fontSize:8,color:TX2,fontWeight:700,letterSpacing:.8,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:col?16:13,fontWeight:800,color:col||TX}}>{v}</div></div>))}
          </div>
          {onApply&&<button onClick={()=>onApply({sheets:sheetsNeeded,rate:parseFloat(lay.rate)||0,paperKey:lay.pKey})} style={{width:"100%",padding:"11px",background:T,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontFamily:FN,fontWeight:800,fontSize:13,letterSpacing:.5}}>
            â†’ Apply to "{compName}" Component
          </button>}
        </div>}
      </div>
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:3,textTransform:"uppercase"}}>Cutting Diagram</div>
        <div style={{fontSize:10,color:TX2,marginBottom:8}}>{best?.outs} outs of {best?.cw.toFixed(3)}"Ã—{best?.ch.toFixed(3)}" on {best?.pw.toFixed(3)}"Ã—{best?.ph.toFixed(3)}" press sheet</div>
        {best&&<CutDiagram lay={best} pw={best.pw} ph={best.ph}/>}
      </div>
      {layouts.length>1&&<div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:TX2,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Alternative Layouts</div>
        {layouts.slice(0,8).map((l,i)=>(<button key={i} onClick={()=>upL("selL",i)} style={{width:"100%",textAlign:"left",background:i===(lay.selL||0)?BG2:BG4,border:`1px solid ${i===(lay.selL||0)?T:BD}`,borderRadius:6,padding:"8px 10px",marginBottom:5,cursor:"pointer",color:TX,fontFamily:FN}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><span style={{fontSize:12,fontWeight:700,color:i===(lay.selL||0)?T:TX3}}>{l.outs} outs </span><span style={{fontSize:10,color:TX2}}>{l.cols}Ã—{l.rows} on {l.pw.toFixed(1)}"Ã—{l.ph.toFixed(1)}" ({l.nx}Ã—{l.ny} cuts)</span></div>
            <span style={{fontSize:10,color:i===0?PK:TX2,fontWeight:700}}>{l.eff}%{i===0?" â˜…":""}</span>
          </div>
          {i===(lay.selL||0)&&lay.qty&&lay.rate&&<div style={{fontSize:10,color:T,marginTop:3}}>{Math.ceil((parseInt(lay.qty)||0)/l.total*(1+(parseInt(lay.waste)||5)/100))} sheets Â· {fp(Math.ceil((parseInt(lay.qty)||0)/l.total*(1+(parseInt(lay.waste)||5)/100))*(parseFloat(lay.rate)||0))}</div>}
        </button>))}
      </div>}
    </>}
    {!layouts.length&&lay.fw&&lay.fh&&lay.sw&&lay.sh&&<div style={{...S.card,padding:20,textAlign:"center",color:TX2,fontSize:12}}>âš ï¸ No valid layouts found. Check sizes vs machine max.</div>}
  </div>);
}



/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ADMIN PANEL COMPONENT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AdminPanel({onToast}){
  const[sec,setSec]=useState("papers");
  const[papers,setPapers]=useState(()=>getCustomPapers());
  const[rates,setRates]=useState(()=>{const r=getCustomRates();return{DIG:{...DIG,...(r.DIG||{})},PRESS:{...PRESS,...(r.PRESS||{})},LAM:{...LAM,...(r.LAM||{})}};});
  const[clients,setClients]=useState(()=>{
    const qClients=[...new Map(getSaved().filter(q=>q.clientName).map(q=>[q.clientName,{name:q.clientName,addr:q.hdr?.clientAddr||"",quotes:(getSaved().filter(s=>s.clientName===q.clientName)).length}])).values()];
    const custom=getCustomClients();
    const names=new Set(qClients.map(c=>c.name));
    return[...qClients,...custom.filter(c=>!names.has(c.name))];
  });
  const[newPaper,setNewPaper]=useState({g:"",l:"",r:"",u:"sht"});
  const[newClient,setNewClient]=useState({name:"",addr:"",phone:"",email:""});
  const[importMsg,setImportMsg]=useState("");

  const savePapers=arr=>{setPapers(arr);saveCustomPapers(arr);};
  const saveRates=r=>{setRates(r);saveCustomRates({DIG:r.DIG,PRESS:r.PRESS,LAM:r.LAM});};

  const SECS=[["papers","ðŸ“„ Papers"],["rates","ðŸ’² Rates"],["clients","ðŸ‘¥ Clients"],["backup","ðŸ’¾ Backup"]];

  return(<div style={S.body}>
    {/* Section Tabs */}
    <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
      {SECS.map(([k,lbl])=>(
        <button key={k} onClick={()=>setSec(k)} style={{
          padding:"8px 12px",borderRadius:6,border:`1px solid ${sec===k?T:BD}`,
          background:sec===k?BG2:BG4,color:sec===k?T:TX2,
          fontSize:11,fontWeight:700,fontFamily:FN,cursor:"pointer"
        }}>{lbl}</button>
      ))}
    </div>

    {/* â”€â”€â”€ PAPER PRICE LIST EDITOR â”€â”€â”€ */}
    {sec==="papers"&&(<>
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ“„ Paper Price List â€” Custom Entries</div>
        <div style={{fontSize:10,color:TX2,marginBottom:10,lineHeight:1.7}}>
          Add your own papers below. They appear in the paper selector alongside built-in prices.
          Custom entries with the same <b style={{color:T}}>Group + Label</b> as a built-in entry will override it.
        </div>
        {/* Add New Paper Form */}
        <div style={{background:BG4,borderRadius:7,padding:10,marginBottom:10,border:`1px solid ${T}`}}>
          <div style={{fontSize:10,color:T,fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:1}}>+ Add New Paper</div>
          <F label="Supplier / Group Name" ch={<I v={newPaper.g} oc={v=>setNewPaper(p=>({...p,g:v}))} ph="e.g. NAPPCO Â· Bond 25Ã—38"/>}/>
          <div style={S.r3}>
            <F label="Description / Label" ch={<I v={newPaper.l} oc={v=>setNewPaper(p=>({...p,l:v}))} ph="e.g. 80gsm"/>}/>
            <F label="Rate â‚±" ch={<I type="number" v={newPaper.r} oc={v=>setNewPaper(p=>({...p,r:v}))} ph="0"/>}/>
            <F label="Per" ch={<Sl v={newPaper.u} oc={v=>setNewPaper(p=>({...p,u:v}))} opts={["sht","kg","lb","ream","bale"].map(x=>({v:x,l:x}))}/>}/>
          </div>
          <button onClick={()=>{
            if(!newPaper.g||!newPaper.l||!newPaper.r){onToast("âŒ Fill in all fields");return;}
            const entry={g:newPaper.g.trim(),l:newPaper.l.trim(),r:parseFloat(newPaper.r),u:newPaper.u};
            const updated=[...papers,entry];
            savePapers(updated);
            setNewPaper({g:"",l:"",r:"",u:"sht"});
            onToast("âœ… Paper added: "+entry.g+" "+entry.l);
          }} style={{...S.btn,...S.btnT,width:"100%",padding:9,fontSize:12}}>+ Add to Price List</button>
        </div>
        {/* Custom Papers List */}
        <div style={{fontSize:10,color:TX2,fontWeight:700,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>
          Custom Entries ({papers.length})
        </div>
        {papers.length===0&&<div style={{textAlign:"center",padding:16,color:TX3,fontSize:11}}>No custom papers yet. Built-in list has {getAllPapers().length} papers.</div>}
        {papers.map((p,i)=>(
          <div key={i} style={{background:BG4,borderRadius:6,padding:"8px 10px",marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:TX2,fontWeight:700}}>{p.g}</div>
              <div style={{fontSize:12,color:TX,fontWeight:600}}>{p.l} â€” <span style={{color:T}}>â‚±{p.r}/{p.u}</span></div>
            </div>
            <button onClick={()=>{const up=papers.filter((_,j)=>j!==i);savePapers(up);onToast("ðŸ—‘ Removed: "+p.l);}}
              style={{...S.btn,...S.btnD,padding:"5px 10px",fontSize:12,flexShrink:0}}>âœ•</button>
          </div>
        ))}
        <div style={{marginTop:10,fontSize:10,color:TX2,textAlign:"center"}}>
          Total papers available in selector: <b style={{color:T}}>{getAllPapers().length}</b>
        </div>
      </div>
    </>)}

    {/* â”€â”€â”€ RATES EDITOR â”€â”€â”€ */}
    {sec==="rates"&&(<>
      {/* Digital Print Rates */}
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ–¨ï¸ Digital Print Rates (â‚±/sheet)</div>
        {Object.entries(rates.DIG).map(([k,d])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{flex:2,fontSize:11,color:TX3}}>{d.l}</div>
            <input type="number" value={d.r} onChange={e=>{
              const nr={...rates,DIG:{...rates.DIG,[k]:{...d,r:parseFloat(e.target.value)||0}}};
              saveRates(nr);
            }} style={{...S.inp,flex:1,padding:"6px 8px",fontSize:12}}/>
          </div>
        ))}
      </div>
      {/* Press Rates */}
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ­ Offset Press Rates (â‚±)</div>
        {Object.entries(rates.PRESS).map(([k,p])=>(
          <div key={k} style={{background:BG4,borderRadius:6,padding:"8px 10px",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:700,color:TX3,marginBottom:5}}>{p.l}</div>
            <div style={S.r2}>
              <F label={`First â‚± / ${p.fq} loads`} ch={<input type="number" value={p.f} onChange={e=>{
                const nr={...rates,PRESS:{...rates.PRESS,[k]:{...p,f:parseFloat(e.target.value)||0}}};
                saveRates(nr);
              }} style={{...S.inp,padding:"6px 8px",fontSize:12}}/>}/>
              <F label={`Suc. â‚± / ${p.sq} loads`} ch={<input type="number" value={p.s} onChange={e=>{
                const nr={...rates,PRESS:{...rates.PRESS,[k]:{...p,s:parseFloat(e.target.value)||0}}};
                saveRates(nr);
              }} style={{...S.inp,padding:"6px 8px",fontSize:12}}/>}/>
            </div>
          </div>
        ))}
      </div>
      {/* Lamination Rates */}
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>âœ¨ Lamination Rates (â‚±/sq.in)</div>
        {Object.entries(rates.LAM).map(([k,d])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{flex:2,fontSize:11,color:TX3}}>{d.l}</div>
            <input type="number" value={d.r} step="0.0001" onChange={e=>{
              const nr={...rates,LAM:{...rates.LAM,[k]:{...d,r:parseFloat(e.target.value)||0}}};
              saveRates(nr);
            }} style={{...S.inp,flex:1,padding:"6px 8px",fontSize:12}}/>
          </div>
        ))}
      </div>
      <div style={{...S.card,padding:12,textAlign:"center"}}>
        <div style={{fontSize:10,color:TX2,marginBottom:8}}>All rate changes save instantly to this device's storage.</div>
        <button onClick={()=>{saveCustomRates({});setRates({DIG:{...DIG},PRESS:{...PRESS},LAM:{...LAM}});onToast("âœ… Rates reset to defaults");}}
          style={{...S.btn,background:"#5a0a0a",color:"#fff",border:"1px solid #c0392b",fontSize:11,padding:"8px 14px"}}>â†º Reset All Rates to Default</button>
      </div>
    </>)}

    {/* â”€â”€â”€ CLIENT DATABASE â”€â”€â”€ */}
    {sec==="clients"&&(<>
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ‘¥ Client Database</div>
        <div style={{fontSize:10,color:TX2,marginBottom:10,lineHeight:1.7}}>
          Built automatically from saved quotes. Add clients manually here.
        </div>
        {/* Add new client */}
        <div style={{background:BG4,borderRadius:7,padding:10,marginBottom:10,border:`1px solid ${T}`}}>
          <div style={{fontSize:10,color:T,fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:1}}>+ Add New Client</div>
          <F label="Client / Company Name" ch={<I v={newClient.name} oc={v=>setNewClient(p=>({...p,name:v}))} ph="Company name"/>}/>
          <F label="Address" ch={<I v={newClient.addr} oc={v=>setNewClient(p=>({...p,addr:v}))} ph="Full address"/>}/>
          <div style={S.r2}>
            <F label="Phone" ch={<I v={newClient.phone} oc={v=>setNewClient(p=>({...p,phone:v}))} ph="09XX XXX XXXX"/>}/>
            <F label="Email" ch={<I v={newClient.email} oc={v=>setNewClient(p=>({...p,email:v}))} ph="email@domain.com"/>}/>
          </div>
          <button onClick={()=>{
            if(!newClient.name){onToast("âŒ Enter client name");return;}
            const entry={...newClient,addedAt:new Date().toISOString(),source:"manual"};
            const updated=[...clients.filter(c=>c.name!==newClient.name),entry];
            setClients(updated);saveCustomClients(updated.filter(c=>c.source==="manual"));
            setNewClient({name:"",addr:"",phone:"",email:""});
            onToast("âœ… Client saved: "+newClient.name);
          }} style={{...S.btn,...S.btnT,width:"100%",padding:9,fontSize:12}}>+ Save Client</button>
        </div>
        {/* Client list */}
        {clients.length===0&&<div style={{textAlign:"center",padding:16,color:TX3,fontSize:11}}>No clients yet. Clients are added when you save quotes.</div>}
        {clients.map((c,i)=>(
          <div key={i} style={{background:BG4,borderRadius:6,padding:"9px 11px",marginBottom:5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:TX}}>{c.name}</div>
                {c.addr&&<div style={{fontSize:10,color:TX2,marginTop:1}}>{c.addr}</div>}
                {c.phone&&<div style={{fontSize:10,color:TX2}}>ðŸ“ž {c.phone}</div>}
                {c.email&&<div style={{fontSize:10,color:TX2}}>âœ‰ {c.email}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                {c.quotes&&<div style={{fontSize:10,color:T,fontWeight:700}}>{c.quotes} quote{c.quotes>1?"s":""}</div>}
                <div style={{fontSize:9,color:TX3}}>{c.source==="manual"?"Manual":"From quotes"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>)}

    {/* â”€â”€â”€ BACKUP & RESTORE â”€â”€â”€ */}
    {sec==="backup"&&(<>
      <div style={{...S.card,padding:13,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ’¾ Backup & Restore Database</div>
        <div style={{fontSize:11,color:TX2,lineHeight:1.8,marginBottom:12}}>
          Export all your data â€” quotes, custom papers, rates, clients â€” as a single JSON file.
          Use this to backup, transfer to another device, or share with team members.
        </div>
        <button onClick={()=>{exportDB();onToast("ðŸ“¦ Database exported as JSON file");}}
          style={{...S.btn,...S.btnT,width:"100%",padding:12,fontSize:13,marginBottom:10}}>
          ðŸ“¤ Export Full Database (JSON)
        </button>
        <div style={{borderTop:`1px solid ${BD}`,paddingTop:12,marginTop:6}}>
          <div style={{fontSize:11,color:TX2,marginBottom:8}}>Restore from a previously exported JSON file:</div>
          <label style={{display:"block",padding:"12px",background:BG4,border:`2px dashed ${BD}`,
            borderRadius:7,textAlign:"center",cursor:"pointer",color:TX2,fontSize:11}}>
            ðŸ“‚ Tap to select JSON backup file
            <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
              if(e.target.files[0])importDB(e.target.files[0],msg=>{setImportMsg(msg);onToast(msg);});
            }}/>
          </label>
          {importMsg&&<div style={{marginTop:8,padding:"8px 10px",background:BG2,borderRadius:5,
            fontSize:11,color:importMsg.includes("âœ…")?T:PK}}>{importMsg}</div>}
        </div>
      </div>
      <div style={{...S.card,padding:13}}>
        <div style={{fontSize:11,fontWeight:700,color:TX2,marginBottom:8}}>Database Summary</div>
        {[
          ["Saved Quotes",getSaved().length+" quotes"],
          ["Custom Papers",getCustomPapers().length+" entries (built-in: "+PAPERS.length+")"],
          ["Custom Rates",Object.keys(getCustomRates()).length>0?"Modified":"Using defaults"],
          ["Clients",getCustomClients().length+" manual"],
        ].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",
            borderBottom:`1px solid ${BD}`,fontSize:11}}>
            <span style={{color:TX2}}>{k}</span><span style={{color:T,fontWeight:700}}>{v}</span>
          </div>
        ))}
      </div>
    </>)}
  </div>);
}

/* â”€â”€ MAIN APP â”€â”€ */
const IH={ceNum:"PA-CE-0000-0001",date:today(),clientName:"",clientAddr:"",projectName:"",qty:"",qtyUnit:"Piece/s",size:"",colors:"",pages:"",specs:"",markup:"20",vatExempt:false,vatRate:"12",overrideUnit:"",paymentTerms:"50% DP / 50% Balance",validity:"30",notes:""};

export default function App(){
  const[hdr,setHdr]=useState(IH);
  const[showPDF,setShowPDF]=useState(false);
  const[layoutIdx,setLayoutIdx]=useState(0);
  const[srchQ,setSrchQ]=useState("");
  const[sets,setSets]=useState([mkSet("Component 1")]);
  const[actIdx,setActIdx]=useState(0);
  const[tab,setTab]=useState("quote");
  const[hOp,setHOp]=useState({cl:true,sp:false,fn:false});
  const[toast,setToast]=useState("");

  const uh=(k,v)=>setHdr(p=>({...p,[k]:v}));
  const thOp=k=>setHOp(p=>({...p,[k]:!p[k]}));
  const upSet=(id,k,v)=>setSets(p=>p.map(s=>s._id===id?{...s,[k]:v}:s));
  const upLayout=(id,k,v)=>setSets(p=>p.map(s=>s._id===id?{...s,_layout:{...s._layout,[k]:v}}:s));
  const showT=m=>{setToast(m);setTimeout(()=>setToast(""),2800);};

  useEffect(()=>{
    (async()=>{
      try{
        const res=await window.storage.get("pa_ce_counter");
        const n=(res?parseInt(res.value):0)+1;
        await window.storage.set("pa_ce_counter",String(n));
        const d=new Date();
        uh("ceNum",`PA-CE-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}-${String(n).padStart(4,"0")}`);
      }catch{
        const d=new Date();
        uh("ceNum",`PA-CE-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}-${String(Math.floor(Math.random()*9000)+1000)}`);
      }
    })();
  },[]);

  const tot=useMemo(()=>totals(sets,hdr),[sets,hdr]);
  const ceText=useMemo(()=>buildCE(hdr,sets,tot),[hdr,sets,tot]);
  const actS=sets[actIdx]||sets[0];

  const addSet=()=>{if(sets.length>=6){showT("Max 6 components");return;}const n=mkSet(`Component ${sets.length+1}`);setSets(p=>[...p,n]);setActIdx(sets.length);};
  const rmSet=i=>{if(sets.length<=1){showT("Need at least 1 component");return;}setSets(p=>p.filter((_,j)=>j!==i));setActIdx(Math.max(0,i-1));setLayoutIdx(prev=>Math.min(prev,sets.length-2));};

  const doShare=async method=>{
    const cl=(hdr.clientName||"Client").trim();
    const pr=(hdr.projectName||"Print Job").trim();
    const subj=`CE \u2013 ${cl} \u2013 ${pr} (${hdr.ceNum})`;
    const enc=encodeURIComponent;

    if(method==="pdf"){
      /* Open CE modal â€” user clicks Print / Save as PDF inside */
      setShowPDF(true);
      return;
    }

    if(method==="gmail"){
      /* Build a self-contained HTML string for the CE */
      const safe=s=>s.replace(/[\/\\:*?"<>|]/g,"-");
      const fn=`CE-${hdr.ceNum}-${safe(cl)}.html`;

      /* Inline the full CE as a standalone HTML document */
      const ceHTML=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${subj}</title>
<style>
body{font-family:'Trebuchet MS','Segoe UI',sans-serif;color:#111;padding:20px 28px;font-size:11px;line-height:1.5;max-width:720px;margin:0 auto}
.brand-p{color:#3BBFC8;font-size:19px;font-weight:300}.brand-a{color:#E0295A;font-size:19px;font-weight:800}
.rule{height:3px;background:linear-gradient(90deg,#E0295A,#3BBFC8);margin:7px 0;border-radius:2px}
.ct{text-align:center;font-size:16px;font-weight:900;color:#E0295A;letter-spacing:2px;margin:4px 0 2px}
.cs{text-align:center;font-size:8.5px;color:#999;margin-bottom:8px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:6px 0}
.mc{background:#f5f5f5;border-radius:3px;padding:3px 8px}
.mk{font-size:7px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.mv{font-size:10.5px;font-weight:600}
.sec{font-size:8px;font-weight:700;color:#3BBFC8;text-transform:uppercase;letter-spacing:1.5px;margin:7px 0 3px;border-bottom:1px solid #cce9f0;padding-bottom:2px}
table{width:100%;border-collapse:collapse}
td{padding:2.5px 6px;font-size:10.5px;border-bottom:1px solid #f0f0f0}
.sh td{background:#f0f8fb;color:#3BBFC8;font-weight:800;font-size:9.5px;padding:4px 6px;text-transform:uppercase;border-bottom:2px solid #cce9f0}
.sub td{font-weight:700;color:#7046a0;background:#f5f0ff}
.ca{text-align:right;white-space:nowrap;font-weight:600}
.tot{border:2px solid #E0295A;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;margin:8px 0}
.grand{font-size:22px;font-weight:900;color:#E0295A}
.unit{font-size:14px;font-weight:800;color:#3BBFC8;text-align:right}
.footer{font-size:8px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:5px;margin-top:8px}
@media print{@page{margin:.5cm;size:A4}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
<div style="display:flex;align-items:center;gap:10px">
<svg width="40" height="40" viewBox="0 0 100 100" fill="none"><polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="#fff"/><polygon points="50,50 50,5 93,28" fill="#E0245A"/><polygon points="50,50 93,28 93,72" fill="#00AEBF"/><polygon points="50,50 93,72 50,95" fill="#E8457A"/><polygon points="50,50 50,95 7,72" fill="#3BBFC8"/><polygon points="50,50 7,72 7,28" fill="#00AEBF" opacity=".75"/><polygon points="50,50 7,28 50,5" fill="#D4185A" opacity=".85"/><line x1="50" y1="5" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><line x1="93" y1="28" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><line x1="93" y1="72" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><line x1="50" y1="95" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><line x1="7" y1="72" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><line x1="7" y1="28" x2="50" y2="50" stroke="#fff" stroke-width="1" opacity=".5"/><polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="none" stroke="#fff" stroke-width="2"/></svg>
<div><div><span class="brand-p">Print</span><span class="brand-a">Amplified</span></div>
<div style="font-size:9px;color:#555;line-height:1.8">Warehouse 14, Lagsa Compound, Brgy. Nueva<br>San Pedro, Laguna &nbsp;&#9742; 09175277771 &nbsp;&#9993; guiam.printamplified&#64;gmail.com</div></div></div>
<div style="text-align:right;font-size:9px;color:#555;line-height:1.9">
<div style="font-size:14px;font-weight:900;color:#E0295A">${hdr.ceNum}</div>
<div>Date: ${hdr.date}</div><div>Valid: ${hdr.validity||30} days</div></div></div>
<div class="rule"></div><div class="ct">COST ESTIMATE</div>
<div class="cs">Computer-generated &bull; Prices subject to change without prior notice</div>
<div class="meta">
<div class="mc"><div class="mk">Client</div><div class="mv">${hdr.clientName||"\u2014"}</div></div>
<div class="mc"><div class="mk">Project</div><div class="mv">${hdr.projectName||"\u2014"}</div></div>
${hdr.clientAddr?`<div class="mc" style="grid-column:1/-1"><div class="mk">Address</div><div class="mv">${hdr.clientAddr}</div></div>`:""}
<div class="mc"><div class="mk">Quantity</div><div class="mv">${hdr.qty||"\u2014"} ${hdr.qtyUnit}</div></div>
<div class="mc"><div class="mk">Payment Terms</div><div class="mv">${hdr.paymentTerms}</div></div>
</div>
${hdr.size||hdr.colors||hdr.pages||hdr.specs?`<div style="border-left:3px solid #3BBFC8;background:#f8f9ff;padding:5px 10px;font-size:10.5px;margin:5px 0;line-height:1.9">${hdr.size?`<b>Size:</b> ${hdr.size} `:""}${hdr.colors?`<b>Colors:</b> ${hdr.colors} `:""}${hdr.pages?`<b>Pages:</b> ${hdr.pages} `:""}${hdr.specs?`<br>${hdr.specs}`:""}</div>`:""}
<div class="sec">Cost Breakdown \u2014 ${sets.length} Component${sets.length>1?"s":""}</div>
<table><tbody>${
  sets.map(s=>{
    const bd=calcSet(s);if(!Object.keys(bd).length)return"";
    const lines=Object.entries(bd).map(([k,v])=>`<tr><td style="padding-left:16px;color:#333">${k.startsWith("oth")?(s.otherCosts[parseInt(k.slice(3))]?.label||"Other"):(CLBL[k]||k)}</td><td class="ca">${fp(v)}</td></tr>`).join("");
    const sub=Object.values(bd).reduce((a,b)=>a+b,0);
    return`<tr class="sh"><td colspan="2">&#9658; ${s.name.toUpperCase()}</td></tr>${lines}<tr class="sub"><td style="padding-left:6px">Subtotal \u2014 ${s.name}</td><td class="ca">${fp(sub)}</td></tr><tr><td colspan="2" style="padding:3px;border:none"></td></tr>`;
  }).join("")
}
<tr><td colspan="2" style="border-top:2px solid #ddd;padding:2px 0"></td></tr>
<tr style="font-weight:700"><td style="padding:4px 6px">Combined Subtotal</td><td class="ca" style="padding:4px 6px">${fp(tot.sub)}</td></tr>
<tr style="color:#555"><td style="padding:3px 6px">Markup (${hdr.markup}%)</td><td class="ca" style="padding:3px 6px">${fp(tot.mk)}</td></tr>
<tr style="color:#555"><td style="padding:3px 6px">VAT (${hdr.vatExempt?"Exempt":hdr.vatRate+"%"})</td><td class="ca" style="padding:3px 6px">${hdr.vatExempt?"Exempt":fp(tot.vat)}</td></tr>
</tbody></table>
<div class="tot">
<div><div style="font-size:8px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px">Total Amount \u2014 VAT ${hdr.vatExempt?"Exempt":"Inclusive"}</div>
<div class="grand">${fp(tot.grand)}</div>
<div style="font-size:8.5px;color:#aaa">${hdr.vatExempt?"VAT Exempt":hdr.vatRate+"% VAT Inclusive"}</div></div>
<div><div style="font-size:8px;color:#888;font-weight:700;text-align:right;text-transform:uppercase;letter-spacing:1px">Unit Price / ${hdr.qtyUnit}</div>
<div class="unit">${fp(tot.unit)}</div>
<div style="font-size:8.5px;color:#aaa;text-align:right">${hdr.qty||"\u2014"} ${hdr.qtyUnit}</div></div></div>
<div style="background:#f8f8f8;border-radius:4px;padding:6px 10px;font-size:10.5px;line-height:1.9;margin-bottom:8px"><b>Payment Terms:</b> ${hdr.paymentTerms}${hdr.notes?` &bull; <b>Notes:</b> ${hdr.notes}`:""}</div>
<div style="border-top:2px solid #3BBFC8;margin:10px 0 6px;padding-top:8px">
  <div style="font-size:9px;font-weight:700;color:#3BBFC8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">Terms & Conditions</div>
  ${TANDC.map(item=>`<div style="display:flex;gap:6px;margin-bottom:4px;font-size:8.5px;line-height:1.6"><span style="color:#27ae60;flex-shrink:0">&#x2705;</span><div><b style="color:#222">${item.t}:</b> <span style="color:#555">${item.b}</span></div></div>`).join("")}
</div>
<div class="footer"><b>PrintAmplified</b> &bull; San Pedro, Laguna &bull; guiam.printamplified&#64;gmail.com<br>Computer-generated cost estimate. Prices subject to change without prior notice. C.E. ${hdr.ceNum}</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/script>
</body></html>`;

      /* Try Web Share API with file (mobile native share â†’ choose Gmail) */
      if(navigator.share){
        try{
          const file=new File([new Blob([ceHTML],{type:"text/html"})],fn,{type:"text/html"});
          const canShare=!navigator.canShare||navigator.canShare({files:[file]});
          if(canShare){await navigator.share({files:[file],title:subj});return;}
        }catch(err){if(err.name==="AbortError")return;}
      }

      /* Desktop fallback: download HTML file + open Gmail compose */
      const dlUrl=URL.createObjectURL(new Blob([ceHTML],{type:"text/html"}));
      const dl=document.createElement("a");
      dl.href=dlUrl;dl.download=fn;
      document.body.appendChild(dl);dl.click();document.body.removeChild(dl);
      setTimeout(()=>URL.revokeObjectURL(dlUrl),5000);

      const body=`Hi,\n\nPlease find attached the Cost Estimate.\n\nC.E. #: ${hdr.ceNum}\nClient: ${hdr.clientName||"\u2014"}\nProject: ${hdr.projectName||"\u2014"}\nTotal: ${fp(tot.grand)}\nUnit Price: ${fp(tot.unit)}\n\nThank you!\nPrintAmplified`;
      setTimeout(()=>{
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${enc(subj)}&body=${enc(body)}`,"_blank");
      },700);
      showT(`\u{1F4CE} "${fn}" saved \u2014 Gmail opening with subject pre-filled. Attach the file.`);
    }
  };

  const newQ=()=>{
    if(!confirm("Start a new quote? All current data will be cleared."))return;
    const yn=new Date().getFullYear();
    const n=(parseInt(localStorage.getItem(`pa_ce_${yn}`)||"0"))+1;
    localStorage.setItem(`pa_ce_${yn}`,String(n));
    const ceNum=`PA-CE-${yn}-${String(n).padStart(4,"0")}`;
    setHdr({...IH,ceNum,date:today()});
    setSets([mkSet("Component 1")]);setActIdx(0);setLayoutIdx(0);setTab("quote");
    showT("âœ… New quote started â€” "+ceNum);
  };

  return(<div style={S.app}>
    {showPDF&&<CEPrintView hdr={hdr} sets={sets} tot={tot} onClose={()=>setShowPDF(false)}/>}
    {/* Toast */}
    {toast&&<div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",background:BG4,border:`1px solid ${T}`,color:TX,padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.5)",whiteSpace:"nowrap",maxWidth:"90vw",textAlign:"center"}}>{toast}</div>}

    {/* Header */}
    <div style={S.hdr}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Logo sz={36}/>
          <div>
            <Brand sz={16}/>
            <div style={{fontSize:9,color:TX2,letterSpacing:1.5,marginTop:1,fontWeight:700}}>COST ESTIMATOR & CE BUILDER</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:9,color:T,fontWeight:700}}>{hdr.ceNum}</div>
          <div style={{fontSize:9,color:TX2}}>{hdr.date}</div>
        </div>
      </div>
    </div>

    {/* Tabs */}
    <div style={S.tabs}>
      {[["quote","ðŸ“ QUOTE"],["summary","ðŸ’° COST"],["share","ðŸ“¤ SHARE"],["saved","ðŸ“ SAVED"],["layout","ðŸ“ LAYOUT"],["admin","âš™ï¸ ADMIN"]].map(([id,lbl])=>(
        <button key={id} onClick={()=>setTab(id)} style={{...S.tab,...(tab===id?S.tabA:{})}}>{lbl}</button>
      ))}
    </div>

    {/* â•â•â• QUOTE TAB â•â•â• */}
    {tab==="quote"&&<div style={S.body}>
      {/* Client */}
      <Sec title="CLIENT & PROJECT" icon="ðŸ‘¤" open={hOp.cl} tog={()=>thOp("cl")} acc={PK} ch={<>
        <F label="Client Name" ch={<div style={{display:"flex",gap:6}}><I v={hdr.clientName} oc={v=>uh("clientName",v)} ph="Company / Person"/><button onClick={()=>{if(hdr.clientName){const n=genClientCENum(hdr.clientName);uh("ceNum",n);showT("CE# generated: "+n);}else showT("Enter client name first");}} style={{...S.btn,background:BG4,border:`1px solid ${T}`,color:T,padding:"8px 10px",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>ðŸ”¢ Gen CE#</button></div>}/>
        <div style={S.r2}><F label="C.E. Number" ch={<I v={hdr.ceNum} oc={v=>uh("ceNum",v)}/>}/><F label="Date" ch={<I v={hdr.date} oc={v=>uh("date",v)}/>}/></div>
        <F label="Client Address" ch={<I v={hdr.clientAddr} oc={v=>uh("clientAddr",v)} ph="Full address (optional)"/>}/>
        <F label="Project / Job Name" ch={<I v={hdr.projectName} oc={v=>uh("projectName",v)} ph="Product or job description"/>}/>
        <div style={S.r2}><F label="Quantity" ch={<I type="number" v={hdr.qty} oc={v=>uh("qty",v)} ph="0"/>}/><F label="Unit" ch={<Sl v={hdr.qtyUnit} oc={v=>uh("qtyUnit",v)} opts={QUNITS.map(x=>({v:x,l:x}))}/>}/></div>
      </>}/>
      {/* Specs */}
      <Sec title="JOB SPECIFICATIONS" icon="ðŸ“‹" open={hOp.sp} tog={()=>thOp("sp")} acc={T} ch={<>
        <F label="Finished Size" ch={<I v={hdr.size} oc={v=>uh("size",v)} ph='e.g. 3.5" Ã— 2" or A4'/>}/>
        <div style={S.r2}><F label="Colors" ch={<I v={hdr.colors} oc={v=>uh("colors",v)} ph="4C/0, FC/1C"/>}/><F label="Pages" ch={<I type="number" v={hdr.pages} oc={v=>uh("pages",v)} ph="0"/>}/></div>
        <F label="Additional Specs" ch={<textarea value={hdr.specs} onChange={e=>uh("specs",e.target.value)} rows={2} placeholder="Substrate, binding, finishingâ€¦" style={{...S.inp,resize:"vertical"}}/>}/>
      </>}/>
      {/* Component Sets */}
      <div style={{...S.card,overflow:"visible"}}>
        <div style={{display:"flex",alignItems:"center",background:BG2,borderBottom:`1px solid ${BD}`,overflowX:"auto",minHeight:38}}>
          {sets.map((s,i)=>{
            const st=Object.values(calcSet(s)).reduce((a,b)=>a+b,0);
            return(<button key={s._id} onClick={()=>setActIdx(i)} style={{padding:"6px 10px",border:"none",background:"none",cursor:"pointer",borderBottom:`2px solid ${actIdx===i?T:"transparent"}`,color:actIdx===i?T:TX2,fontSize:10,fontWeight:700,fontFamily:FN,whiteSpace:"nowrap",flexShrink:0}}>
              {s.name}{st>0&&<span style={{color:T,marginLeft:4,fontSize:9}}>{fp(st)}</span>}
            </button>);
          })}
          {sets.length<6&&<button onClick={addSet} style={{padding:"6px 10px",border:"none",background:"none",cursor:"pointer",color:PK,fontSize:15,fontWeight:700,flexShrink:0}}>+</button>}
        </div>
        <div style={{padding:"8px 12px",background:BG3,borderBottom:`1px solid ${BD}`,display:"flex",gap:8,alignItems:"center"}}>
          <input value={sets[actIdx]?.name||""} onChange={e=>upSet(sets[actIdx]._id,"name",e.target.value)} placeholder="Component nameâ€¦" style={{...S.inp,flex:1,fontSize:12,padding:"5px 8px",background:BG4}}/>
          {sets.length>1&&<button onClick={()=>rmSet(actIdx)} style={{...S.btn,...S.btnD,padding:"5px 9px",fontSize:10}}>ðŸ—‘ Remove</button>}
        </div>
        <div style={{padding:10}}>{actS&&<SetEd s={actS} up={(k,v)=>upSet(actS._id,k,v)}/>}</div>
      </div>
      {/* Financial */}
      <Sec title="FINANCIAL SETTINGS" icon="ðŸ’°" open={hOp.fn} tog={()=>thOp("fn")} acc={PK} ch={<>
        <div style={S.r2}><F label="Markup %" ch={<I type="number" v={hdr.markup} oc={v=>uh("markup",v)}/>}/><F label="VAT Rate %" ch={<I type="number" v={hdr.vatRate} oc={v=>uh("vatRate",v)}/>}/></div>
        <Tog lbl="VAT Exempt" on={hdr.vatExempt} oc={v=>uh("vatExempt",v)} col={PK}/>
        <div style={S.r2}><F label="Payment Terms" ch={<Sl v={hdr.paymentTerms} oc={v=>uh("paymentTerms",v)} opts={TERMS.map(x=>({v:x,l:x}))}/>}/><F label="Validity (days)" ch={<I type="number" v={hdr.validity} oc={v=>uh("validity",v)}/>}/></div>
        <F label="CE Notes" ch={<textarea value={hdr.notes} onChange={e=>uh("notes",e.target.value)} rows={2} placeholder="Special instructions, inclusionsâ€¦" style={{...S.inp,resize:"vertical"}}/>}/>
        <div style={{background:BG4,borderRadius:7,padding:"10px 12px",border:`1px solid ${T}`,marginTop:4}}>
          <div style={{fontSize:10,color:T,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>ðŸ’² Adjust Selling Price</div>
          <div style={{fontSize:10,color:TX2,marginBottom:8,lineHeight:1.6}}>Override the computed unit price. Leave blank to use the auto-computed price.</div>
          <F label="Override Unit Price â‚± / piece (leave blank to use computed)" ch={<div style={{display:"flex",gap:6,alignItems:"center"}}>
            <I type="number" v={hdr.overrideUnit} oc={v=>uh("overrideUnit",v)} ph={`Computed: ${fp(tot.computedUnit||0)}`}/>
            {hdr.overrideUnit&&<button onClick={()=>uh("overrideUnit","")} style={{...S.btn,background:"#5a0a0a",color:"#fff",padding:"8px 10px",fontSize:10,flexShrink:0}}>âœ• Clear</button>}
          </div>}/>
          {hdr.overrideUnit&&parseFloat(hdr.overrideUnit)>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:4}}>
            <div style={{background:BG2,borderRadius:5,padding:"6px 9px"}}>
              <div style={{fontSize:8,color:TX2,fontWeight:700,textTransform:"uppercase"}}>Computed Unit</div>
              <div style={{fontSize:12,fontWeight:700,color:TX2,textDecoration:"line-through"}}>{fp(tot.computedUnit||0)}</div>
            </div>
            <div style={{background:BG2,borderRadius:5,padding:"6px 9px",border:`1px solid ${T}`}}>
              <div style={{fontSize:8,color:T,fontWeight:700,textTransform:"uppercase"}}>Adjusted Unit</div>
              <div style={{fontSize:12,fontWeight:700,color:T}}>{fp(parseFloat(hdr.overrideUnit)||0)}</div>
            </div>
            <div style={{background:BG2,borderRadius:5,padding:"6px 9px"}}>
              <div style={{fontSize:8,color:TX2,fontWeight:700,textTransform:"uppercase"}}>Computed Total</div>
              <div style={{fontSize:12,fontWeight:700,color:TX2,textDecoration:"line-through"}}>{fp(tot.computedGrand||0)}</div>
            </div>
            <div style={{background:BG2,borderRadius:5,padding:"6px 9px",border:`1px solid ${PK}`}}>
              <div style={{fontSize:8,color:PK,fontWeight:700,textTransform:"uppercase"}}>Adjusted Total</div>
              <div style={{fontSize:13,fontWeight:800,color:PK}}>{fp(tot.grand||0)}</div>
            </div>
          </div>}
        </div>
      </>}/>
      {/* Sticky Total */}
      <div style={{...S.grand,position:"sticky",bottom:8,boxShadow:"0 8px 32px rgba(0,0,0,.7)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:7}}>
          <div><div style={{fontSize:9,color:TX2,fontWeight:700,letterSpacing:1.5}}>GRAND TOTAL</div><div style={{fontSize:24,fontWeight:800,color:PK,lineHeight:1}}>{fp(tot.grand)}</div><div style={{fontSize:9,color:TX2,marginTop:1}}>{sets.length} component{sets.length>1?"s":""}</div></div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:TX2}}>{tot.overridden?"Adjusted":"Computed"} Unit Price</div>
            <div style={{fontSize:15,fontWeight:800,color:tot.overridden?PK:T}}>{fp(tot.unit)}</div>
            {tot.overridden&&<div style={{fontSize:9,color:TX2,textDecoration:"line-through"}}>{fp(tot.computedUnit)}</div>}
            <div style={{fontSize:9,color:TX2}}>{hdr.qty||"â€”"} {hdr.qtyUnit}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5}}>
          <button style={{...S.btn,...S.btnP,flex:1.5,padding:"9px 6px",fontSize:11}} onClick={()=>setTab("share")}>ðŸ“¤ SHARE CE</button>
          <button style={{...S.btn,...S.btnT,flex:1,padding:"9px 6px",fontSize:11}} onClick={()=>setTab("summary")}>ðŸ“Š COST</button>
          <button style={{...S.btn,background:"#1a4a2a",border:"1px solid #27ae60",color:"#2ecc71",padding:"9px 6px",fontSize:10,fontWeight:800}} onClick={newQ}>ðŸ”„ NEW</button>
          <button style={{...S.btn,background:"#1a3a4a",border:"1px solid #2980b9",color:"#3498db",padding:"9px 6px",fontSize:10,fontWeight:800}} onClick={()=>{saveQuote(hdr,sets,tot.grand,tot.unit);showT("ðŸ’¾ Quote saved â€” "+hdr.ceNum);}}>ðŸ’¾ SAVE</button>
        </div>
      </div>
    </div>}

    {/* â•â•â• COST SUMMARY TAB â•â•â• */}
    {tab==="summary"&&<div style={S.body}>
      {sets.map(s=>{
        const bd=calcSet(s);const st=Object.values(bd).reduce((a,b)=>a+b,0);
        if(!Object.keys(bd).length)return null;
        return(<div key={s._id} style={{...S.card,padding:12,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{s.name}</div>
          {Object.entries(bd).map(([k,v])=>{const raw=k.startsWith("oth")?(s.otherCosts[parseInt(k.slice(3))]?.label||"Other"):(CLBL[k]||k);return(<div key={k} style={S.srow}><span style={{color:TX3}}>{raw}</span><span style={{fontWeight:600}}>{fp(v)}</span></div>);})}
          <div style={{...S.srow,color:T,fontWeight:700,fontSize:13,paddingTop:6}}><span>Subtotal</span><span>{fp(st)}</span></div>
        </div>);
      }).filter(Boolean)}
      <div style={S.grand}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:7}}>
          <div><div style={{fontSize:9,color:TX2,fontWeight:700,letterSpacing:1.5}}>GRAND TOTAL</div><div style={{fontSize:26,fontWeight:800,color:PK}}>{fp(tot.grand)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:9,color:TX2}}>Unit Price</div><div style={{fontSize:17,fontWeight:800,color:T}}>{fp(tot.unit)}</div><div style={{fontSize:9,color:TX2}}>{hdr.qty||"â€”"} {hdr.qtyUnit}</div></div>
        </div>
        <div style={{height:1,background:BD,marginBottom:7}}/>
        {[["C.E. #",hdr.ceNum],["Client",hdr.clientName||"â€”"],["Project",hdr.projectName||"â€”"],["Components",`${sets.length} set(s)`],["Markup",hdr.markup+"%"],["VAT",hdr.vatExempt?"Exempt":hdr.vatRate+"%"],["Payment",hdr.paymentTerms]].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:10,color:TX2}}>{k}</span><span style={{fontSize:10,color:TX3,textAlign:"right",maxWidth:"62%"}}>{v}</span></div>))}
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <button style={{...S.btn,...S.btnP,flex:1,padding:"9px 6px",fontSize:11}} onClick={()=>setTab("share")}>ðŸ“¤ SHARE CE</button>
          <button style={{...S.btn,background:BG4,border:`1px solid ${BD}`,color:TX2,padding:"9px 6px",fontSize:10}} onClick={newQ}>ðŸ”„ NEW QUOTE</button>
        </div>
      </div>
    </div>}

    {/* â•â•â• SHARE TAB â•â•â• */}
    {tab==="share"&&<div style={S.body}>
      {/* Logo card */}
      <div style={{...S.card,padding:14,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <Logo sz={38}/>
          <div>
            <Brand sz={14}/>
            <div style={{fontSize:9,color:TX2,marginTop:1}}>Warehouse 14, Lagsa Compound, Brgy. Nueva, San Pedro, Laguna</div>
            <div style={{fontSize:9,color:TX2}}>ðŸ“ž 09175277771 | âœ‰ guiam.printamplified@gmail.com</div>
          </div>
        </div>
        <div style={{height:2,background:`linear-gradient(90deg,${PK},${T})`,borderRadius:2,marginBottom:10}}/>
        <div style={{fontSize:13,fontWeight:800,color:PK,textAlign:"center",letterSpacing:2,marginBottom:3}}>COST ESTIMATE</div>
        <div style={{fontSize:9,color:TX2,textAlign:"center",marginBottom:8}}>C.E. # {hdr.ceNum} Â· {hdr.date}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
          {[["Client",hdr.clientName||"â€”"],["Project",hdr.projectName||"â€”"],["Qty",`${hdr.qty||"â€”"} ${hdr.qtyUnit}`],["Components",`${sets.length} set(s)`]].map(([k,v])=>(<div key={k} style={{background:BG,borderRadius:4,padding:"5px 8px"}}><div style={{fontSize:8,color:TX2,fontWeight:700,letterSpacing:1}}>{k.toUpperCase()}</div><div style={{fontSize:11,fontWeight:600,wordBreak:"break-word"}}>{v}</div></div>))}
        </div>
      </div>
      {/* Total */}
      <div style={{...S.grand,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div><div style={{fontSize:9,color:TX2,fontWeight:700,letterSpacing:1.5}}>TOTAL AMOUNT</div><div style={{fontSize:24,fontWeight:800,color:PK}}>{fp(tot.grand)}</div><div style={{fontSize:9,color:TX2}}>VAT {hdr.vatExempt?"Exempt":`Inclusive (${hdr.vatRate}%)`}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:9,color:TX2}}>UNIT PRICE</div><div style={{fontSize:17,fontWeight:800,color:T}}>{fp(tot.unit)}</div><div style={{fontSize:9,color:TX2}}>{hdr.qty||"â€”"} {hdr.qtyUnit}</div></div>
        </div>
      </div>
      {/* Share buttons â€“ PDF + Gmail only */}
      <div style={{...S.card,padding:14,marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:700,color:TX2,letterSpacing:1.5,marginBottom:12,textTransform:"uppercase"}}>Send / Export This C.E.</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>doShare("pdf")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"16px 18px",background:"linear-gradient(135deg,#c0392b,#e74c3c)",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:800,fontFamily:FN,boxShadow:"0 4px 16px rgba(192,57,43,.5)",letterSpacing:.5}}>
            <span style={{fontSize:26}}>ðŸ“„</span>
            <div style={{textAlign:"left"}}><div>View & Export CE as PDF</div><div style={{fontSize:10,fontWeight:400,opacity:.85}}>Opens branded CE â€” print or save as PDF</div></div>
          </button>
          <button onClick={()=>doShare("gmail")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"16px 18px",background:"linear-gradient(135deg,#c23321,#EA4335)",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:800,fontFamily:FN,boxShadow:"0 4px 16px rgba(234,67,53,.5)",letterSpacing:.5}}>
            <span style={{fontSize:26}}>ðŸ“§</span>
            <div style={{textAlign:"left"}}><div>Send CE via Gmail</div><div style={{fontSize:10,fontWeight:400,opacity:.85}}>Mobile: share sheet with CE attached &bull; Desktop: downloads + opens Gmail</div></div>
          </button>
        </div>
        <div style={{fontSize:10,color:TX2,marginTop:12,lineHeight:1.9,textAlign:"center",padding:"0 4px"}}>
          <b style={{color:T}}>View & Export PDF</b> â€” opens the full branded CE inside the app. Tap <b>Print / Save as PDF</b> to export.<br/>
          <b style={{color:PK}}>Send via Gmail</b> â€” on mobile, opens your native share sheet with CE attached; choose Gmail. On desktop, downloads CE file and opens Gmail compose with subject: <b style={{color:T,fontSize:9}}>CE â€“ {hdr.clientName||"Client"} â€“ {hdr.projectName||"Project"} ({hdr.ceNum})</b>
        </div>
      </div>
      {/* Plain text preview */}
      <div style={{fontSize:10,color:TX2,fontWeight:700,letterSpacing:1.5,marginBottom:5,textTransform:"uppercase"}}>Plain Text Preview</div>
      <div style={{background:"#fff",color:"#111",borderRadius:7,padding:13,fontFamily:"'Courier New',monospace",fontSize:10,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word",border:`1px solid ${BD}`}}>{ceText}</div>
    </div>}

    {/* â•â•â• LAYOUT TAB â•â•â• */}
    {tab==="saved"&&(<div style={S.body}>
      <div style={{...S.card,padding:12,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:T,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>ðŸ“ Saved Quotes</div>
        <input value={srchQ} onChange={e=>setSrchQ(e.target.value)} placeholder="Search by client, project, or CE#â€¦" style={S.inp}/>
      </div>
      {(()=>{
        const all=getSaved();
        const q=srchQ.toLowerCase();
        const filtered=q?all.filter(s=>(s.clientName||"").toLowerCase().includes(q)||(s.projectName||"").toLowerCase().includes(q)||(s.ceNum||"").toLowerCase().includes(q)):all;
        if(!filtered.length)return(<div style={{textAlign:"center",padding:30,color:TX2,fontSize:12}}>{all.length?"No matches found.":"No saved quotes yet. Fill a quote and tap ðŸ’¾ SAVE."}</div>);
        return filtered.map(sq=>(
          <div key={sq.id} style={{...S.card,padding:12,marginBottom:7}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:T,fontWeight:700}}>{sq.ceNum}</div>
                <div style={{fontSize:13,fontWeight:800,color:TX,marginTop:1}}>{sq.clientName||"â€”"}</div>
                <div style={{fontSize:11,color:TX2}}>{sq.projectName||"â€”"}</div>
                <div style={{fontSize:9,color:TX3,marginTop:2}}>Saved {new Date(sq.savedAt).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,fontWeight:800,color:PK}}>{fp(sq.grand||0)}</div>
                <div style={{fontSize:10,color:TX2}}>{sq.qty||""} {sq.qtyUnit||""}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{
                let loaded=JSON.parse(JSON.stringify(sq));
                setHdr(loaded.hdr);
                let restoredSets=loaded.sets.map((s,i)=>({...s,_id:Date.now()+i}));
                setSets(restoredSets);setActIdx(0);setLayoutIdx(0);setTab("quote");
                showT("âœ… Loaded: "+sq.ceNum);
              }} style={{...S.btn,...S.btnT,flex:1,padding:"8px 6px",fontSize:11}}>âœï¸ Open & Edit</button>
              <button onClick={()=>{if(confirm("Delete "+sq.ceNum+"?")){deleteQuote(sq.id);setSrchQ(p=>p);showT("ðŸ—‘ Deleted "+sq.ceNum);}}} style={{...S.btn,...S.btnD,padding:"8px 12px",fontSize:13}}>ðŸ—‘</button>
            </div>
          </div>
        ));
      })()}
    </div>)}
        {tab==="admin"&&<AdminPanel onToast={showT}/>}
        {tab==="layout"&&<div>
      {/* Component sub-tabs */}
      <div style={{display:"flex",background:BG2,borderBottom:`1px solid ${BD}`,overflowX:"auto",minHeight:38}}>
        {sets.map((s,i)=>{
          const hasData=!!(s._layout?.fw&&s._layout?.sw);
          return(<button key={s._id} onClick={()=>setLayoutIdx(i)}
            style={{padding:"6px 11px",border:"none",background:"none",cursor:"pointer",
              borderBottom:`2px solid ${layoutIdx===i?T:"transparent"}`,
              color:layoutIdx===i?T:TX2,fontSize:10,fontWeight:700,fontFamily:FN,
              whiteSpace:"nowrap",flexShrink:0}}>
            ðŸ“ {s.name}{hasData&&<span style={{color:T,marginLeft:4,fontSize:9}}>âœ“</span>}
          </button>);
        })}
      </div>
      {/* Layout calculator for selected component */}
      {sets[layoutIdx]&&<LayoutCalc
        lay={sets[layoutIdx]._layout||{}}
        upL={(k,v)=>upLayout(sets[layoutIdx]._id,k,v)}
        compName={sets[layoutIdx].name}
        onApply={({sheets,rate,paperKey})=>{
          const s=sets[layoutIdx];
          upSet(s._id,"paperOn",true);
          upSet(s._id,"paperSheets",String(sheets));
          upSet(s._id,"paperRate",String(rate));
          if(paperKey){upSet(s._id,"paperKey",paperKey);}
          /* Also store qty back into layout for reference */
          showT(`âœ… ${sheets} sheets @ â‚±${rate}/sheet â†’ applied to "${s.name}" paper cost`);
          /* Switch to quote tab so user sees the result */
          setTab("quote");
          setActIdx(layoutIdx);
        }}
      />}
    </div>}
  </div>);
}