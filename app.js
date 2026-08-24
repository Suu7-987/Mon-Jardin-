const DB_NAME="mon-jardin-db", DB_VERSION=1;
let db, route="dashboard";

const ENTRY_TYPES={
  watering:["💧","Arrosage"],
  nutrition:["🧪","Nutrition"],
  measurement:["📏","Mesure"],
  observation:["👀","Observation"],
  intervention:["✂️","Intervention"],
  pest:["🐛","Ravageur / maladie"],
  harvest:["🧺","Récolte"],
  photo:["📷","Photo"]
};

const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
const fmtDate=v=>v?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(v)):"—";
const fmtDateTime=v=>v?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v)):"—";
const uid=()=>crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains("plants")){
        const s=d.createObjectStore("plants",{keyPath:"id"}); s.createIndex("name","name");
      }
      if(!d.objectStoreNames.contains("entries")){
        const s=d.createObjectStore("entries",{keyPath:"id"});
        s.createIndex("plantId","plantId"); s.createIndex("date","date"); s.createIndex("type","type");
      }
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function all(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function getOne(store,id){return new Promise((res,rej)=>{const r=tx(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,"readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

async function blobToDataURL(file){
  if(!file) return null;
  if(file.size>3.5*1024*1024) throw new Error("Photo trop lourde (max ~3,5 Mo).");
  return await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(file)});
}
function showToast(msg){
  const t=qs("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove("show"),2200);
}
function setRoute(r){
  route=r;
  qsa(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.route===r));
  render();
}
qsa(".nav-item").forEach(b=>b.addEventListener("click",()=>setRoute(b.dataset.route)));
qs("#quickAddBtn").addEventListener("click",()=>showQuickAdd());

function ageDays(start){if(!start)return null;return Math.max(0,Math.floor((Date.now()-new Date(start))/(86400000)))}
function severityStatus(entries,plantId){
  const cutoff=Date.now()-7*86400000;
  const sev=entries.filter(e=>e.plantId===plantId && new Date(e.date).getTime()>=cutoff).reduce((m,e)=>Math.max(m,+e.severity||0),0);
  return sev>=4?"danger":sev>=2?"warn":"ok";
}
function latestFor(entries,plantId,field){
  return entries.filter(e=>e.plantId===plantId && e[field]!=="" && e[field]!=null).sort((a,b)=>new Date(b.date)-new Date(a.date))[0]?.[field];
}
function plantPhotoHTML(p){
  return `<div class="plant-photo">${p.photo?`<img src="${p.photo}" alt="">`:"🌱"}</div>`;
}

async function render(){
  const app=qs("#app");
  const titles={dashboard:"Mon Jardin",plants:"Mes plantes",journal:"Journal",stats:"Statistiques",settings:"Réglages"};
  qs("#pageTitle").textContent=titles[route]||"Mon Jardin";
  if(route==="dashboard") return renderDashboard(app);
  if(route==="plants") return renderPlants(app);
  if(route==="journal") return renderJournal(app);
  if(route==="stats") return renderStats(app);
  if(route==="settings") return renderSettings(app);
}

async function renderDashboard(app){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const week=Date.now()-7*86400000, recent=entries.filter(e=>new Date(e.date).getTime()>=week);
  const temps=recent.map(e=>+e.temp).filter(Number.isFinite), hrs=recent.map(e=>+e.humidity).filter(Number.isFinite);
  const water=recent.reduce((s,e)=>s+(+e.water||0),0);
  const attention=plants.filter(p=>severityStatus(entries,p.id)!=="ok").length;

  app.innerHTML=`
    <section class="hero">
      <h2>${plants.length?`Tu suis ${plants.length} plante${plants.length>1?"s":""} 🌿`:"Ton journal est prêt 🌿"}</h2>
      <p>${plants.length?"Ajoute tes observations au fil des jours : les tendances apparaîtront automatiquement.":"Commence par créer ta première plante. Tes données restent dans ton navigateur."}</p>
      <div class="actions" style="margin-top:16px">
        <button class="primary" id="dashAddPlant">＋ Ajouter une plante</button>
        <button class="secondary" id="dashAddEntry" ${plants.length?"":"disabled"}>＋ Entrée rapide</button>
      </div>
    </section>
    <section class="grid">
      <div class="metric"><div class="label">PLANTES</div><div class="value">${plants.length}</div><div class="sub">actives dans le journal</div></div>
      <div class="metric"><div class="label">À SURVEILLER</div><div class="value">${attention}</div><div class="sub">signalement ≥ 2/5 sur 7 j</div></div>
      <div class="metric"><div class="label">TEMP. MOY. 7 J</div><div class="value">${temps.length?(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1)+"°":"—"}</div><div class="sub">${temps.length} mesure${temps.length>1?"s":""}</div></div>
      <div class="metric"><div class="label">EAU 7 J</div><div class="value">${water?water.toFixed(1)+" L":"—"}</div><div class="sub">total enregistré</div></div>
    </section>
    <section>
      <div class="section-title"><h2>Plantes</h2><button id="seePlants">Tout voir</button></div>
      <div class="card-list" style="margin-top:10px">${plants.length?plants.slice(0,4).map(p=>plantCard(p,entries)).join(""):`<div class="empty">Aucune plante pour le moment.</div>`}</div>
    </section>
    <section>
      <div class="section-title"><h2>Dernières entrées</h2><button id="seeJournal">Journal</button></div>
      <div class="card-list" style="margin-top:10px">${entries.length?(await Promise.all(entries.slice(0,4).map(e=>entryCard(e,plants)))).join(""):`<div class="empty">Les observations, arrosages et mesures apparaîtront ici.</div>`}</div>
    </section>`;
  qs("#dashAddPlant").onclick=()=>showPlantForm();
  qs("#dashAddEntry").onclick=()=>plants.length&&showEntryForm();
  qs("#seePlants").onclick=()=>setRoute("plants"); qs("#seeJournal").onclick=()=>setRoute("journal");
  bindPlantCards(); bindEntryCards();
}

function plantCard(p,entries){
  const st=severityStatus(entries,p.id), h=latestFor(entries,p.id,"height"), d=ageDays(p.startDate);
  return `<button class="plant-card" data-plant="${p.id}" style="width:100%;text-align:left;color:inherit">
    ${plantPhotoHTML(p)}
    <div><h3>${esc(p.name)}</h3><p>${esc([p.species,p.variety].filter(Boolean).join(" • ")||"Plante")}</p>
    <div class="badges">${p.stage?`<span class="badge">${esc(p.stage)}</span>`:""}${d!=null?`<span class="badge">J+${d}</span>`:""}${h?`<span class="badge">${esc(h)} cm</span>`:""}</div></div>
    <span class="status-dot ${st==="ok"?"":st}"></span>
  </button>`;
}
async function entryCard(e,plants){
  const p=plants.find(x=>x.id===e.plantId), t=ENTRY_TYPES[e.type]||["•",e.type];
  const chips=[];
  if(e.temp)chips.push(`🌡️ ${esc(e.temp)} °C`);
  if(e.humidity)chips.push(`💧 ${esc(e.humidity)} %`);
  if(e.vpd)chips.push(`VPD ${esc(e.vpd)}`);
  if(e.water)chips.push(`Arrosage ${esc(e.water)} L`);
  if(e.height)chips.push(`📏 ${esc(e.height)} cm`);
  if(e.ph)chips.push(`pH ${esc(e.ph)}`);
  if(e.ec)chips.push(`EC ${esc(e.ec)}`);
  if(e.severity)chips.push(`Niveau ${esc(e.severity)}/5`);
  return `<button class="entry-card" data-entry="${e.id}" style="width:100%;text-align:left;color:inherit">
    <div class="entry-top"><div><div class="entry-type">${t[0]} ${t[1]}</div><div class="small">${esc(p?.name||"Plante supprimée")}</div></div><div class="entry-date">${fmtDateTime(e.date)}</div></div>
    ${chips.length?`<div class="chips">${chips.map(x=>`<span class="chip">${x}</span>`).join("")}</div>`:""}
    ${e.note?`<p class="entry-note">${esc(e.note)}</p>`:""}
    ${e.photo?`<img class="entry-photo" src="${e.photo}" alt="Photo du journal">`:""}
  </button>`;
}

async function renderPlants(app){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  app.innerHTML=`<div class="actions"><button class="primary" id="addPlant">＋ Nouvelle plante</button></div>
  <div class="search"><input id="plantSearch" type="search" placeholder="Rechercher une plante…"></div>
  <div class="card-list" id="plantList">${plants.length?plants.map(p=>plantCard(p,entries)).join(""):`<div class="empty">Crée ta première plante pour commencer.</div>`}</div>`;
  qs("#addPlant").onclick=()=>showPlantForm();
  qs("#plantSearch").oninput=e=>{
    const q=e.target.value.toLowerCase();
    qsa("[data-plant]").forEach(el=>el.style.display=el.textContent.toLowerCase().includes(q)?"":"none");
  };
  bindPlantCards();
}
function bindPlantCards(){qsa("[data-plant]").forEach(b=>b.onclick=()=>showPlantDetail(b.dataset.plant))}
function bindEntryCards(){qsa("[data-entry]").forEach(b=>b.onclick=()=>showEntryDetail(b.dataset.entry))}

async function renderJournal(app){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
  app.innerHTML=`<div class="actions"><button class="primary" id="addEntry" ${plants.length?"":"disabled"}>＋ Ajouter une entrée</button></div>
    <div class="form-grid">
      <div class="field"><label>Plante</label><select id="filterPlant"><option value="">Toutes</option>${plants.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Type</label><select id="filterType"><option value="">Tous</option>${Object.entries(ENTRY_TYPES).map(([k,v])=>`<option value="${k}">${v[0]} ${v[1]}</option>`).join("")}</select></div>
    </div>
    <div class="card-list" id="journalList">${entries.length?(await Promise.all(entries.map(e=>entryCard(e,plants)))).join(""):`<div class="empty">Aucune entrée pour le moment.</div>`}</div>`;
  qs("#addEntry").onclick=()=>showEntryForm();
  const apply=()=>{
    const p=qs("#filterPlant").value,t=qs("#filterType").value;
    qsa("[data-entry]").forEach(el=>{
      const e=entries.find(x=>x.id===el.dataset.entry); el.style.display=(!p||e.plantId===p)&&(!t||e.type===t)?"":"none";
    });
  };
  qs("#filterPlant").onchange=apply; qs("#filterType").onchange=apply;
  bindEntryCards();
}

async function renderStats(app){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  app.innerHTML=`
    <div class="field"><label>Plante</label><select id="statsPlant">${plants.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    ${plants.length?`
      <div class="canvas-card"><h3>Température</h3><p class="small">Évolution des mesures enregistrées</p><canvas id="tempChart" width="700" height="280"></canvas></div>
      <div class="canvas-card"><h3>Hauteur</h3><p class="small">Croissance au fil du temps</p><canvas id="heightChart" width="700" height="280"></canvas></div>
      <div class="canvas-card"><h3>Humidité</h3><p class="small">Évolution de l'humidité relative</p><canvas id="humChart" width="700" height="280"></canvas></div>
    `:`<div class="empty">Ajoute une plante et quelques mesures pour afficher les graphiques.</div>`}`;
  if(!plants.length)return;
  const draw=()=>{
    const id=qs("#statsPlant").value, es=entries.filter(e=>e.plantId===id).sort((a,b)=>new Date(a.date)-new Date(b.date));
    drawLine(qs("#tempChart"),es.map(e=>[new Date(e.date),+e.temp]).filter(x=>Number.isFinite(x[1])),"°C");
    drawLine(qs("#heightChart"),es.map(e=>[new Date(e.date),+e.height]).filter(x=>Number.isFinite(x[1])),"cm");
    drawLine(qs("#humChart"),es.map(e=>[new Date(e.date),+e.humidity]).filter(x=>Number.isFinite(x[1])),"%");
  };
  qs("#statsPlant").onchange=draw; draw();
}
function drawLine(canvas,data,unit){
  const c=canvas.getContext("2d"), w=canvas.width,h=canvas.height;
  c.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement), muted=css.getPropertyValue("--muted").trim(), line=css.getPropertyValue("--line").trim(), accent=css.getPropertyValue("--accent").trim();
  c.strokeStyle=line;c.lineWidth=1;
  [50,110,170,230].forEach(y=>{c.beginPath();c.moveTo(45,y);c.lineTo(w-12,y);c.stroke()});
  if(data.length<2){c.fillStyle=muted;c.font="24px -apple-system";c.fillText("Pas assez de données",45,145);return}
  const vals=data.map(d=>d[1]), min=Math.min(...vals), max=Math.max(...vals), span=(max-min)||1;
  const x=i=>45+i*(w-65)/(data.length-1), y=v=>235-(v-min)*170/span;
  c.strokeStyle=accent;c.lineWidth=5;c.lineJoin="round";c.lineCap="round";c.beginPath();
  data.forEach((d,i)=>i?c.lineTo(x(i),y(d[1])):c.moveTo(x(i),y(d[1])));c.stroke();
  c.fillStyle=muted;c.font="20px -apple-system";c.fillText(`${min.toFixed(1)} ${unit}`,8,240);c.fillText(`${max.toFixed(1)} ${unit}`,8,65);
}

async function renderSettings(app){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  const size=(new Blob([JSON.stringify({plants,entries})]).size/1024).toFixed(0);
  app.innerHTML=`
    <div class="settings-card"><h3>Sauvegarde</h3><p class="small">Exporte régulièrement une copie de tes données. Les photos sont incluses dans la sauvegarde JSON.</p>
      <div class="actions"><button class="primary" id="exportJson">Exporter JSON</button><button class="secondary" id="importJson">Importer JSON</button></div>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
    </div>
    <div class="settings-card"><h3>Export tableur</h3><p class="small">CSV compatible avec Excel, Numbers et Google Sheets.</p>
      <div class="actions"><button class="secondary" id="exportPlantsCsv">Plantes CSV</button><button class="secondary" id="exportEntriesCsv">Journal CSV</button></div>
    </div>
    <div class="settings-card"><h3>Données locales</h3>
      <div class="kv"><span>Plantes</span><strong>${plants.length}</strong></div>
      <div class="kv"><span>Entrées</span><strong>${entries.length}</strong></div>
      <div class="kv"><span>Taille approx. sauvegarde</span><strong>${size} Ko</strong></div>
      <div class="actions" style="margin-top:12px"><button class="danger-btn" id="resetApp">Effacer toutes les données</button></div>
    </div>
    <div class="settings-card"><h3>Installation iPhone</h3><p class="small">Une fois l'app hébergée en HTTPS : ouvre-la dans Safari → Partager → « Sur l’écran d’accueil ». Elle pourra ensuite fonctionner hors ligne.</p></div>
    <div class="settings-card"><h3>Version</h3><p class="small">Mon Jardin v1.0 — aucune pub, aucun abonnement, aucune donnée envoyée ailleurs.</p></div>`;
  qs("#exportJson").onclick=exportJSON;
  qs("#importJson").onclick=()=>qs("#importFile").click();
  qs("#importFile").onchange=importJSON;
  qs("#exportPlantsCsv").onclick=()=>exportCSV("plantes.csv",plants);
  qs("#exportEntriesCsv").onclick=()=>exportCSV("journal.csv",entries.map(e=>({...e,photo:e.photo?"[photo incluse dans JSON]":""})));
  qs("#resetApp").onclick=async()=>{if(confirm("Effacer toutes les plantes, entrées et photos ?")){for(const p of plants)await del("plants",p.id);for(const e of entries)await del("entries",e.id);showToast("Données effacées");render()}};
}
function download(name,content,type="application/octet-stream"){
  const a=document.createElement("a"),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)
}
async function exportJSON(){
  const [plants,entries]=await Promise.all([all("plants"),all("entries")]);
  download(`mon-jardin-sauvegarde-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),plants,entries},null,2),"application/json");
}
async function importJSON(ev){
  try{
    const file=ev.target.files[0];if(!file)return;
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.plants)||!Array.isArray(data.entries))throw new Error("Format invalide");
    if(!confirm(`Importer ${data.plants.length} plantes et ${data.entries.length} entrées ? Les éléments portant le même ID seront remplacés.`))return;
    for(const p of data.plants)await put("plants",p);for(const e of data.entries)await put("entries",e);
    showToast("Sauvegarde importée");render();
  }catch(e){alert("Import impossible : "+e.message)}
}
function exportCSV(name,rows){
  if(!rows.length)return showToast("Rien à exporter");
  const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  download(name,"\uFEFF"+[cols.map(q).join(";"),...rows.map(r=>cols.map(c=>q(r[c])).join(";"))].join("\n"),"text/csv;charset=utf-8");
}

function showQuickAdd(){
  Promise.all([all("plants")]).then(([plants])=>{
    qs("#modalTitle").textContent="Ajouter";
    qs("#modalBody").innerHTML=`<div class="actions" style="display:grid">
      <button type="button" class="primary" id="qaPlant">🌱 Nouvelle plante</button>
      <button type="button" class="secondary" id="qaEntry" ${plants.length?"":"disabled"}>🗒️ Entrée de journal</button>
    </div>`;
    qs("#modal").showModal();
    qs("#qaPlant").onclick=()=>{qs("#modal").close();showPlantForm()};
    qs("#qaEntry").onclick=()=>{qs("#modal").close();showEntryForm()};
  });
}

async function showPlantForm(id=null){
  const p=id?await getOne("plants",id):null;
  qs("#modalTitle").textContent=p?"Modifier la plante":"Nouvelle plante";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field full"><label>Nom *</label><input id="pName" value="${esc(p?.name||"")}" placeholder="Ex. Tomate 01"></div>
      <div class="field"><label>Espèce</label><input id="pSpecies" value="${esc(p?.species||"")}" placeholder="Tomate, basilic…"></div>
      <div class="field"><label>Variété</label><input id="pVariety" value="${esc(p?.variety||"")}" placeholder="Roma, Genovese…"></div>
      <div class="field"><label>Date de départ</label><input id="pStart" type="date" value="${p?.startDate?.slice(0,10)||""}"></div>
      <div class="field"><label>Stade</label><select id="pStage">${["Plantule","Croissance","Préfloraison","Floraison","Fructification","Maturation","Repos"].map(x=>`<option ${p?.stage===x?"selected":""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Volume du pot (L)</label><input id="pPot" type="number" step="0.1" value="${esc(p?.pot||"")}"></div>
      <div class="field"><label>Emplacement</label><select id="pEnv">${["Intérieur","Extérieur","Serre","Balcon / terrasse"].map(x=>`<option ${p?.environment===x?"selected":""}>${x}</option>`).join("")}</select></div>
      <div class="field full"><label>Substrat</label><input id="pSoil" value="${esc(p?.soil||"")}" placeholder="Terreau, coco, mélange…"></div>
      <div class="field full"><label>Photo</label><input id="pPhoto" type="file" accept="image/*" capture="environment"><div class="small">Facultatif. Max ~3,5 Mo par photo.</div></div>
      <div class="field full"><label>Notes</label><textarea id="pNotes" placeholder="Origine, particularités, objectifs…">${esc(p?.notes||"")}</textarea></div>
      <div class="field full actions"><button type="button" class="primary" id="savePlant">${p?"Enregistrer":"Créer la plante"}</button>${p?`<button type="button" class="danger-btn" id="deletePlant">Supprimer</button>`:""}</div>
    </div>`;
  qs("#modal").showModal();
  qs("#savePlant").onclick=async()=>{
    try{
      const name=qs("#pName").value.trim();if(!name)return alert("Donne un nom à la plante.");
      const file=qs("#pPhoto").files[0]; const photo=file?await blobToDataURL(file):p?.photo||null;
      await put("plants",{id:p?.id||uid(),name,species:qs("#pSpecies").value.trim(),variety:qs("#pVariety").value.trim(),startDate:qs("#pStart").value,stage:qs("#pStage").value,pot:qs("#pPot").value,environment:qs("#pEnv").value,soil:qs("#pSoil").value.trim(),notes:qs("#pNotes").value.trim(),photo,createdAt:p?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
      qs("#modal").close();showToast("Plante enregistrée");render();
    }catch(e){alert(e.message)}
  };
  if(p)qs("#deletePlant").onclick=async()=>{if(confirm(`Supprimer ${p.name} et toutes ses entrées ?`)){const es=(await all("entries")).filter(e=>e.plantId===p.id);for(const e of es)await del("entries",e.id);await del("plants",p.id);qs("#modal").close();showToast("Plante supprimée");render()}};
}

async function showEntryForm(existing=null,forcedPlant=null){
  const plants=await all("plants"); if(!plants.length)return showToast("Crée d’abord une plante");
  const e=existing;
  qs("#modalTitle").textContent=e?"Modifier l’entrée":"Nouvelle entrée";
  const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  qs("#modalBody").innerHTML=`
  <div class="form-grid">
    <div class="field"><label>Plante *</label><select id="ePlant">${plants.map(p=>`<option value="${p.id}" ${(e?.plantId||forcedPlant)===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Type *</label><select id="eType">${Object.entries(ENTRY_TYPES).map(([k,v])=>`<option value="${k}" ${e?.type===k?"selected":""}>${v[0]} ${v[1]}</option>`).join("")}</select></div>
    <div class="field full"><label>Date et heure</label><input id="eDate" type="datetime-local" value="${e?.date?new Date(new Date(e.date)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):nowLocal}"></div>
    <div class="form-section">Environnement</div>
    <div class="field"><label>Température (°C)</label><input id="eTemp" type="number" step="0.1" value="${esc(e?.temp||"")}"></div>
    <div class="field"><label>Humidité (%)</label><input id="eHum" type="number" step="0.1" value="${esc(e?.humidity||"")}"></div>
    <div class="field"><label>VPD (kPa)</label><input id="eVpd" type="number" step="0.01" value="${esc(e?.vpd||"")}"></div>
    <div class="field"><label>Lumière / durée</label><input id="eLight" value="${esc(e?.light||"")}" placeholder="Ex. 12 h, 50 %"></div>
    <div class="form-section">Arrosage et mesures</div>
    <div class="field"><label>Eau donnée (L)</label><input id="eWater" type="number" step="0.05" value="${esc(e?.water||"")}"></div>
    <div class="field"><label>Hauteur (cm)</label><input id="eHeight" type="number" step="0.1" value="${esc(e?.height||"")}"></div>
    <div class="field"><label>pH</label><input id="ePh" type="number" step="0.01" value="${esc(e?.ph||"")}"></div>
    <div class="field"><label>EC (mS/cm)</label><input id="eEc" type="number" step="0.01" value="${esc(e?.ec||"")}"></div>
    <div class="form-section">Santé / intervention</div>
    <div class="field"><label>Gravité (0–5)</label><select id="eSeverity">${[0,1,2,3,4,5].map(x=>`<option value="${x}" ${+(e?.severity||0)===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Produit / action</label><input id="eProduct" value="${esc(e?.product||"")}" placeholder="Engrais, taille, traitement…"></div>
    <div class="field full"><label>Photo</label><input id="ePhoto" type="file" accept="image/*" capture="environment"></div>
    <div class="field full"><label>Note</label><textarea id="eNote" placeholder="Ce que tu observes, changements depuis la dernière fois…">${esc(e?.note||"")}</textarea></div>
    <div class="field full actions"><button type="button" class="primary" id="saveEntry">Enregistrer</button>${e?`<button type="button" class="danger-btn" id="deleteEntry">Supprimer</button>`:""}</div>
  </div>`;
  qs("#modal").showModal();
  qs("#saveEntry").onclick=async()=>{
    try{
      const file=qs("#ePhoto").files[0];const photo=file?await blobToDataURL(file):e?.photo||null;
      const local=qs("#eDate").value; const date=local?new Date(local).toISOString():new Date().toISOString();
      await put("entries",{id:e?.id||uid(),plantId:qs("#ePlant").value,type:qs("#eType").value,date,temp:qs("#eTemp").value,humidity:qs("#eHum").value,vpd:qs("#eVpd").value,light:qs("#eLight").value.trim(),water:qs("#eWater").value,height:qs("#eHeight").value,ph:qs("#ePh").value,ec:qs("#eEc").value,severity:qs("#eSeverity").value,product:qs("#eProduct").value.trim(),note:qs("#eNote").value.trim(),photo,createdAt:e?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
      qs("#modal").close();showToast("Entrée enregistrée");render();
    }catch(err){alert(err.message)}
  };
  if(e)qs("#deleteEntry").onclick=async()=>{if(confirm("Supprimer cette entrée ?")){await del("entries",e.id);qs("#modal").close();showToast("Entrée supprimée");render()}};
}
async function showEntryDetail(id){const e=await getOne("entries",id);if(e)showEntryForm(e)}
async function showPlantDetail(id){
  const [p,entries]=await Promise.all([getOne("plants",id),all("entries")]); if(!p)return;
  const es=entries.filter(e=>e.plantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  qs("#modalTitle").textContent=p.name;
  qs("#modalBody").innerHTML=`
    <div class="plant-detail-head">${plantPhotoHTML(p)}<div><h2>${esc(p.name)}</h2><p class="small">${esc([p.species,p.variety].filter(Boolean).join(" • ")||"Plante")}</p><div class="badges">${p.stage?`<span class="badge">${esc(p.stage)}</span>`:""}${ageDays(p.startDate)!=null?`<span class="badge">J+${ageDays(p.startDate)}</span>`:""}</div></div></div>
    <hr>
    <div class="grid">
      <div class="metric"><div class="label">HAUTEUR</div><div class="value">${latestFor(es,id,"height")?latestFor(es,id,"height")+" cm":"—"}</div></div>
      <div class="metric"><div class="label">DERNIER ARROSAGE</div><div class="value" style="font-size:18px">${(()=>{const x=es.find(e=>+e.water>0);return x?fmtDate(x.date):"—"})()}</div></div>
      <div class="metric"><div class="label">POT</div><div class="value">${p.pot?p.pot+" L":"—"}</div></div>
      <div class="metric"><div class="label">ENTRÉES</div><div class="value">${es.length}</div></div>
    </div>
    <hr>
    ${p.soil?`<div class="kv"><span>Substrat</span><strong>${esc(p.soil)}</strong></div>`:""}
    ${p.environment?`<div class="kv"><span>Emplacement</span><strong>${esc(p.environment)}</strong></div>`:""}
    ${p.notes?`<p class="entry-note">${esc(p.notes)}</p>`:""}
    <div class="actions" style="margin-top:16px"><button type="button" class="primary" id="detailAdd">＋ Ajouter une entrée</button><button type="button" class="secondary" id="detailEdit">Modifier</button></div>
    <div class="section-title" style="margin-top:22px"><h2>Historique récent</h2></div>
    <div class="card-list" style="margin-top:10px">${es.length?(await Promise.all(es.slice(0,5).map(e=>entryCard(e,[p])))).join(""):`<div class="empty">Aucune entrée.</div>`}</div>`;
  qs("#modal").showModal();
  qs("#detailAdd").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id)};
  qs("#detailEdit").onclick=()=>{qs("#modal").close();showPlantForm(p.id)};
  qsa("[data-entry]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEntryDetail(b.dataset.entry)});
}

async function seedDemo(){
  const plants=await all("plants");if(plants.length)return;
  // Démarrage volontairement vide : aucune donnée d'exemple ne pollue le journal.
}
(async function init(){
  db=await openDB(); await seedDemo();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  render();
})();
