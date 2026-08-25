const DB_NAME="grow-in-pf-db", DB_VERSION=7;
let db, route="dashboard", gardenMode="plants";

const ENTRY_TYPES={
  watering:["💧","Arrosage"],
  nutrition:["🧪","Engrais / nutrition"],
  repotting:["🪴","Rempotage"],
  training:["✂️","Taille / palissage"],
  measurement:["📏","Mesure"],
  observation:["👀","Observation"],
  pest:["🐛","Ravageur / traitement"],
  harvest:["🧺","Récolte"],
  photo:["📷","Photo"],
  intervention:["🛠️","Autre intervention"]
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
      if(!d.objectStoreNames.contains("environments")){
        const s=d.createObjectStore("environments",{keyPath:"id"});
        s.createIndex("name","name");
      }
      if(!d.objectStoreNames.contains("envEntries")){
        const s=d.createObjectStore("envEntries",{keyPath:"id"});
        s.createIndex("environmentId","environmentId");
        s.createIndex("date","date");
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


function monthLabel(date){
  return new Intl.DateTimeFormat("fr-FR",{month:"long", year:"numeric"}).format(date);
}
function isoDay(date){
  const d=new Date(date); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);
}
function buildCalendarData(entries, focusDate=new Date(), selectedDate=null){
  const focus=new Date(focusDate.getFullYear(),focusDate.getMonth(),1);
  const start=new Date(focus);
  const offset=(focus.getDay()+6)%7; // lundi début
  start.setDate(start.getDate()-offset);
  const days=[];
  const counts=new Map();
  entries.forEach(e=>{
    const k=isoDay(e.date);
    counts.set(k,(counts.get(k)||0)+1);
  });
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const key=isoDay(d);
    days.push({
      iso:key,
      day:d.getDate(),
      other:d.getMonth()!==focus.getMonth(),
      today:key===isoDay(new Date()),
      selected:key===selectedDate,
      count:counts.get(key)||0
    });
  }
  return {focus,days};
}
function renderCalendarHTML(entries, focusDate=new Date(), selectedDate=null){
  const {focus,days}=buildCalendarData(entries, focusDate, selectedDate);
  return `
    <div class="timeline-card">
      <div class="calendar-head">
        <button type="button" class="calendar-nav" id="calPrev">‹</button>
        <h3>${esc(monthLabel(focus))}</h3>
        <button type="button" class="calendar-nav" id="calNext">›</button>
      </div>
      <div class="calendar-weekdays">
        <div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div>
      </div>
      <div class="calendar-grid">
        ${days.map(d=>`
          <button type="button" class="calendar-day ${d.other?'other':''} ${d.today?'today':''} ${d.selected?'selected':''}" data-cal-day="${d.iso}">
            <div>${d.day}</div>
            ${d.count?`<span class="calendar-dot"></span>`:`<span style="width:6px;height:6px"></span>`}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}
async function savePlantNotes(plantId, notes){
  const p=await getOne("plants",plantId);
  if(!p) return;
  p.notes=notes;
  p.updatedAt=new Date().toISOString();
  await put("plants",p);
}


function currentWeekDays(baseDate=new Date()){
  const base=new Date(baseDate); base.setHours(0,0,0,0);
  const monday=new Date(base);
  const offset=(base.getDay()+6)%7;
  monday.setDate(base.getDate()-offset);
  return Array.from({length:7}, (_,i)=>{const d=new Date(monday); d.setDate(monday.getDate()+i); return d;});
}
function renderHomeWeekStrip(entries){
  const days=currentWeekDays();
  const labelMonth=new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(new Date()).toUpperCase();
  return `
    <div class="timeline-card">
      <div class="home-month-bar">
        <div class="home-month-title">${esc(labelMonth)}</div>
        <div class="small">Cette semaine</div>
      </div>
      <div class="home-week-strip">
        ${days.map(d=>{
          const key=isoDay(d);
          const count=entries.filter(e=>isoDay(e.date)===key).length;
          const isToday=key===isoDay(new Date());
          const dow=new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d);
          return `<div class="home-day ${isToday?'today':''}">
            <div class="dow">${esc(dow.charAt(0).toUpperCase()+dow.slice(1,3))}</div>
            <div class="day-bubble">${d.getDate()}</div>
            ${count?'<div class="dot"></div>':'<div style="height:8px"></div>'}
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}
async function choosePlantForEntry(forcedType="photo"){
  const plants=await all("plants");
  if(!plants.length) return showToast("Crée d’abord une plante");
  qs("#modalTitle").textContent="Choisir une plante";
  qs("#modalBody").innerHTML=`<div class="card-list">
    ${plants.map(p=>`<button type="button" class="plant-card" data-pick-plant="${p.id}" style="width:100%;text-align:left;color:inherit">
      ${plantPhotoHTML(p)}
      <div><h3>${esc(p.name)}</h3><p>${esc(p.stage||'Plante')}</p></div>
      <span class="status-dot"></span>
    </button>`).join("")}
  </div>`;
  qs("#modal").showModal();
  qsa("[data-pick-plant]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEntryForm(null,b.dataset.pickPlant,forcedType);});
}
async function chooseEnvironmentForJournal(){
  const envs=await all("environments");
  if(!envs.length) return showToast("Crée d’abord un environnement");
  qs("#modalTitle").textContent="Journal d’environnement";
  qs("#modalBody").innerHTML=`<div class="card-list">
    ${envs.map(env=>`<button type="button" class="environment-card" data-pick-env="${env.id}" style="text-align:left;color:inherit">
      <div class="environment-title"><div class="environment-icon">${esc(env.icon||"🏡")}</div><div><h3>${esc(env.name)}</h3><p>${esc(env.description||'')}</p></div></div>
    </button>`).join("")}
  </div>`;
  qs("#modal").showModal();
  qsa("[data-pick-env]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEnvironmentEntryForm(null,b.dataset.pickEnv);});
}
function environmentEntryCard(e){
  const pills=[];
  if(e.temp) pills.push(`🌡️ ${esc(e.temp)} °C`);
  if(e.humidity) pills.push(`💧 ${esc(e.humidity)} %`);
  if(e.vpd) pills.push(`VPD ${esc(e.vpd)}`);
  if(e.lightHours) pills.push(`💡 ${esc(e.lightHours)} h`);
  if(e.width || e.depth || e.height) pills.push(`📦 ${esc(e.width||"—")}×${esc(e.depth||"—")}×${esc(e.height||"—")} cm`);
  return `<button type="button" class="env-entry-card" data-env-entry="${e.id}" style="width:100%;text-align:left;color:inherit">
    <div class="top"><strong>Journal environnement</strong><span class="small">${fmtDateTime(e.date)}</span></div>
    ${pills.length?`<div class="metric-pill-row">${pills.map(x=>`<span class="metric-pill">${x}</span>`).join("")}</div>`:""}
    ${e.note?`<div class="entry-note">${esc(e.note)}</div>`:""}
  </button>`;
}

async function render(){
  const app=qs("#app");
  const titles={dashboard:"Accueil",garden:"Jardin",plants:"Mes plantes",environments:"Environnements",journal:"Journal",stats:"Statistiques",settings:"Réglages"};
  qs("#pageTitle").textContent=titles[route]||"Grow in PF";
  if(route==="dashboard") return renderDashboard(app);
  if(route==="garden") return renderGarden(app);
  if(route==="plants") return renderPlants(app);
  if(route==="environments") return renderEnvironments(app);
  if(route==="journal") return renderJournal(app);
  if(route==="stats") return renderStats(app);
  if(route==="settings") return renderSettings(app);
}



async function renderDashboard(app){
  const [plants,entries,environments,envEntries]=await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const todayKey=isoDay(new Date());
  const todayEntries=entries.filter(e=>isoDay(e.date)===todayKey);
  const recentPlants=plants.slice(0,3);
  app.innerHTML=`
    ${renderHomeWeekStrip(entries)}

    <section>
      <div class="home-section-title">Outils</div>
      <div class="home-tools">
        <button class="home-tool" id="toolAction">
          <div class="home-tool-circle">⚡</div><span>Action</span>
        </button>
        <button class="home-tool" id="toolPhoto">
          <div class="home-tool-circle">📷</div><span>Photo</span>
        </button>
        <button class="home-tool" id="toolPlantJournal">
          <div class="home-tool-circle">🗒️</div><small>Journal de plante</small>
        </button>
        <button class="home-tool" id="toolEnvJournal">
          <div class="home-tool-circle">🏡</div><small>Journal de l’environnement</small>
        </button>
        <button class="home-tool dark" id="toolMore">
          <div class="home-tool-circle">💼</div><span>Plus</span>
        </button>
      </div>
    </section>

    <section>
      <div class="home-section-title">Journal</div>
      <div class="card-list">
        ${todayEntries.length?(await Promise.all(todayEntries.slice(0,4).map(e=>entryCard(e,plants)))).join(""):`<div class="today-empty">Rien pour aujourd'hui</div>`}
      </div>
    </section>

    <section>
      <div class="home-section-title">Mes plantes</div>
      <div class="card-list">
        ${recentPlants.length?recentPlants.map(p=>plantCard(p,entries,environments)).join(""):`<div class="empty">Aucune plante pour le moment.</div>`}
      </div>
    </section>

    <section>
      <div class="home-section-title">Environnements</div>
      <div class="card-list">
        ${environments.length?environments.slice(0,3).map(env=>{
          const last = envEntries.filter(x=>x.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
          const count = plants.filter(p=>p.environmentId===env.id).length;
          return `<button type="button" class="environment-card" data-open-env="${env.id}" style="text-align:left;color:inherit">
            <div class="environment-title"><div class="environment-icon">${esc(env.icon||"🏡")}</div><div><h3>${esc(env.name)}</h3><p>${count} plante${count>1?"s":""}</p></div></div>
            <div class="badges" style="margin-top:10px">
              ${last?.temp?`<span class="badge">🌡️ ${esc(last.temp)} °C</span>`:""}
              ${last?.humidity?`<span class="badge">💧 ${esc(last.humidity)} %</span>`:""}
              ${last?.vpd?`<span class="badge">VPD ${esc(last.vpd)}</span>`:""}
            </div>
          </button>`;
        }).join(""):`<div class="empty">Aucun environnement.</div>`}
      </div>
    </section>
  `;
  qs("#toolAction").onclick=()=>showQuickAdd();
  qs("#toolPhoto").onclick=()=>choosePlantForEntry("photo");
  qs("#toolPlantJournal").onclick=()=>setRoute("journal");
  qs("#toolEnvJournal").onclick=()=>chooseEnvironmentForJournal();
  qs("#toolMore").onclick=()=>setRoute("settings");
  qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
  bindPlantCards();
  bindEntryCards();
}



function plantCard(p,entries,environments=[]){
  const st=severityStatus(entries,p.id), h=latestFor(entries,p.id,"height"), d=ageDays(p.startDate);
  const env=environments.find(x=>x.id===p.environmentId);
  return `<button class="plant-card" data-plant="${p.id}" style="width:100%;text-align:left;color:inherit">
    ${plantPhotoHTML(p)}
    <div><h3>${esc(p.name)}</h3><p>${esc([p.species,p.variety].filter(Boolean).join(" • ")||"Plante")}</p>
    <div class="badges">${env?`<span class="badge">🏡 ${esc(env.name)}</span>`:""}${p.stage?`<span class="badge">${esc(p.stage)}</span>`:""}${d!=null?`<span class="badge">J+${d}</span>`:""}${h?`<span class="badge">${esc(h)} cm</span>`:""}</div></div>
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
  const [plants,entries,environments]=await Promise.all([all("plants"),all("entries"),all("environments")]);
  app.innerHTML=`<div class="actions"><button class="primary" id="addPlant">＋ Nouvelle plante</button></div>
  <div class="form-grid">
    <div class="field full"><label>Environnement</label><select id="plantEnvFilter"><option value="">Tous les environnements</option>${environments.map(e=>`<option value="${e.id}">${esc(e.icon||"🏡")} ${esc(e.name)}</option>`).join("")}<option value="__none">Sans environnement</option></select></div>
  </div>
  <div class="search"><input id="plantSearch" type="search" placeholder="Rechercher une plante…"></div>
  <div class="card-list" id="plantList">${plants.length?plants.map(p=>plantCard(p,entries,environments)).join(""):`<div class="empty">Crée ta première plante pour commencer.</div>`}</div>`;
  qs("#addPlant").onclick=()=>showPlantForm();
  const applyPlantFilters=()=>{
    const q=qs("#plantSearch").value.toLowerCase(), env=qs("#plantEnvFilter").value;
    qsa("[data-plant]").forEach(el=>{
      const p=plants.find(x=>x.id===el.dataset.plant);
      const envOk=!env || (env==="__none" ? !p.environmentId : p.environmentId===env);
      el.style.display=el.textContent.toLowerCase().includes(q)&&envOk?"":"none";
    });
  };
  qs("#plantSearch").oninput=applyPlantFilters;
  qs("#plantEnvFilter").onchange=applyPlantFilters;
  bindPlantCards();
}
function bindPlantCards(){qsa("[data-plant]").forEach(b=>b.onclick=()=>showPlantDetail(b.dataset.plant))}
function bindEntryCards(){qsa("[data-entry]").forEach(b=>b.onclick=()=>showEntryDetail(b.dataset.entry))}




async function renderGarden(app){
  const [plants,entries,environments,envEntries]=await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  const phaseOptions=[...new Set(plants.map(p=>p.stage).filter(Boolean))];
  const environmentMap=new Map(environments.map(e=>[e.id,e]));
  const groupedPlants=(list)=>{
    const groups={};
    list.forEach(p=>{
      const env=environmentMap.get(p.environmentId);
      const key=env?env.name:"Sans environnement";
      if(!groups[key])groups[key]={env,items:[]};
      groups[key].items.push(p);
    });
    return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],"fr"));
  };

  app.innerHTML=`
    <section>
      <div class="segmented" id="gardenSegment">
        <button data-mode="plants" class="${gardenMode==="plants"?"active":""}">🌱 Plantes</button>
        <button data-mode="environments" class="${gardenMode==="environments"?"active":""}">🏡 Environnements</button>
      </div>
    </section>

    <section id="gardenPlants" class="${gardenMode==="plants"?"":"hidden"}">
      <div class="filter-row">
        <div class="field">
          <label>Phase</label>
          <select id="gardenPhaseFilter">
            <option value="">Toutes</option>
            ${phaseOptions.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Environnement</label>
          <select id="gardenEnvFilter">
            <option value="">Tous</option>
            ${environments.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}
            <option value="__none">Sans environnement</option>
          </select>
        </div>
      </div>
      <div id="gardenPlantsList" class="card-list"></div>
    </section>

    <section id="gardenEnvironments" class="${gardenMode==="environments"?"":"hidden"}">
      <div class="environment-toolbar">
        <div class="actions">
          <button class="primary" id="gardenAddEnvironment">＋ Nouvel environnement</button>
          <button class="secondary" id="gardenAddEnvJournal">🗒️ Journal d’environnement</button>
        </div>
      </div>
      <div id="gardenEnvironmentList" class="environment-list-gap"></div>
    </section>

    <button class="fab" id="gardenFab" aria-label="Ajouter">＋</button>
  `;

  const renderGroupedPlants=()=>{
    const phase=qs("#gardenPhaseFilter")?.value || "";
    const envFilter=qs("#gardenEnvFilter")?.value || "";
    const filtered=plants.filter(p=>{
      const phaseOk=!phase || p.stage===phase;
      const envOk=!envFilter || (envFilter==="__none" ? !p.environmentId : p.environmentId===envFilter);
      return phaseOk && envOk;
    });
    const groups=groupedPlants(filtered);
    const html=groups.length ? groups.map(([groupName,group])=>`
      <div class="env-group">
        <div class="group-header">
          <h3>${esc(group.env?.icon||"")} ${esc(groupName)}</h3>
          <span class="small">${group.items.length}</span>
        </div>
        <div class="plant-list-compact">
          ${group.items.map(p=>gardenPlantCard(p,entries,environments)).join("")}
        </div>
      </div>
    `).join("") : `<div class="empty">Aucune plante avec ces filtres.</div>`;
    qs("#gardenPlantsList").innerHTML=html;
    bindPlantCards();
  };

  const renderEnvironmentCards=()=>{
    const sorted=[...environments].sort((a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name,"fr"));
    const html=sorted.length ? sorted.map(env=>{
      const envPlants=plants.filter(p=>p.environmentId===env.id);
      const last = envEntries.filter(x=>x.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      return `
        <div class="environment-card">
          <div class="environment-head">
            <div class="environment-title">
              <div class="environment-icon">${esc(env.icon||"🏡")}</div>
              <div>
                <h3>${esc(env.name)}</h3>
                <p>${envPlants.length} plante${envPlants.length>1?"s":""}</p>
              </div>
            </div>
            <button class="icon-btn" data-edit-env="${env.id}" aria-label="Modifier">⋯</button>
          </div>
          ${env.description?`<p>${esc(env.description)}</p>`:""}
          <div class="badges">
            ${last?.temp?`<span class="badge">🌡️ ${esc(last.temp)} °C</span>`:""}
            ${last?.humidity?`<span class="badge">💧 ${esc(last.humidity)} %</span>`:""}
            ${last?.vpd?`<span class="badge">VPD ${esc(last.vpd)}</span>`:""}
            ${last?.lightHours?`<span class="badge">💡 ${esc(last.lightHours)} h</span>`:""}
          </div>
          <div class="environment-actions">
            <button class="secondary" type="button" data-open-env="${env.id}">Ouvrir</button>
            <button class="secondary" type="button" data-manage-env="${env.id}">Gérer les plantes</button>
          </div>
        </div>
      `;
    }).join("") : `<div class="empty">Aucun environnement pour le moment.</div>`;
    qs("#gardenEnvironmentList").innerHTML=html;
    qsa("[data-edit-env]").forEach(b=>b.onclick=()=>showEnvironmentForm(b.dataset.editEnv));
    qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
    qsa("[data-manage-env]").forEach(b=>b.onclick=()=>showEnvironmentPlantManager(b.dataset.manageEnv));
  };

  renderGroupedPlants();
  renderEnvironmentCards();

  qsa("#gardenSegment button").forEach(btn=>btn.onclick=()=>{gardenMode=btn.dataset.mode; render();});
  qs("#gardenPhaseFilter").onchange=renderGroupedPlants;
  qs("#gardenEnvFilter").onchange=renderGroupedPlants;
  qs("#gardenAddEnvironment").onclick=()=>showEnvironmentForm();
  qs("#gardenAddEnvJournal").onclick=()=>chooseEnvironmentForJournal();
  qs("#gardenFab").onclick=()=>gardenMode==="plants" ? showPlantForm() : showEnvironmentForm();
}

function gardenPlantCard(p,entries,environments=[]){
  const env=environments.find(x=>x.id===p.environmentId);
  const h=latestFor(entries,p.id,"height");
  const d=ageDays(p.startDate);
  return `<button class="plant-card" data-plant="${p.id}" style="width:100%;text-align:left;color:inherit">
    ${plantPhotoHTML(p)}
    <div>
      <h3>${esc(p.name)}</h3>
      <div class="compact-sub">
        ${d!=null?`<span>🌱 J+${d}</span>`:""}
        ${p.stage?`<span>${esc(p.stage)}</span>`:""}
        ${h?`<span>${esc(h)} cm</span>`:""}
      </div>
    </div>
    <span class="status-dot ${severityStatus(entries,p.id)==="ok"?"":severityStatus(entries,p.id)}"></span>
  </button>`;
}

async function renderEnvironments(app){
  const [environments,plants,envEntries]=await Promise.all([all("environments"),all("plants"),all("envEntries")]);
  const sorted=[...environments].sort((a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name,"fr"));
  const cards=sorted.map(env=>{
    const ps=plants.filter(p=>p.environmentId===env.id);
    const latest=envEntries.filter(e=>e.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    return `<div class="environment-card">
      <div class="environment-head">
        <div class="environment-title">
          <div class="environment-icon">${esc(env.icon||"🏡")}</div>
          <div><h3>${esc(env.name)}</h3><p>${ps.length} plante${ps.length>1?"s":""}</p></div>
        </div>
        <button class="icon-btn" data-edit-env="${env.id}" aria-label="Modifier">⋯</button>
      </div>
      ${env.description?`<p>${esc(env.description)}</p>`:""}
      <div class="badges">
        ${latest?.temp?`<span class="badge">🌡️ ${esc(latest.temp)} °C</span>`:""}
        ${latest?.humidity?`<span class="badge">💧 ${esc(latest.humidity)} %</span>`:""}
        ${latest?.vpd?`<span class="badge">VPD ${esc(latest.vpd)}</span>`:""}
      </div>
      <div class="environment-actions">
        <button type="button" class="secondary" data-open-env="${env.id}">Ouvrir</button>
        <button type="button" class="secondary" data-env-journal="${env.id}">Journal</button>
      </div>
    </div>`;
  }).join("");
  const unassigned=plants.filter(p=>!p.environmentId);
  app.innerHTML=`
    <section class="hero">
      <h2>Organise tes zones de culture 🏡</h2>
      <p>Assigne chaque plante à une zone, ouvre chaque environnement et suis son propre journal.</p>
      <div class="actions" style="margin-top:16px"><button class="primary" id="addEnvironment">＋ Nouvel environnement</button><button class="secondary" id="addEnvironmentJournal">🗒️ Journal d’environnement</button></div>
    </section>
    <div class="environment-list-gap">${cards||`<div class="empty">Aucun environnement.</div>`}</div>
    ${unassigned.length?`<div class="environment-card"><div class="environment-head"><div class="environment-title"><div class="environment-icon">❔</div><div><h3>Sans environnement</h3><p>${unassigned.length} plante${unassigned.length>1?"s":""}</p></div></div></div><div class="environment-plant-list">${unassigned.map(p=>`<button class="environment-plant" data-plant="${p.id}" style="width:100%;color:inherit;text-align:left"><strong>${esc(p.name)}</strong><span>À assigner</span></button>`).join("")}</div></div>`:""}
  `;
  qs("#addEnvironment").onclick=()=>showEnvironmentForm();
  qs("#addEnvironmentJournal").onclick=()=>chooseEnvironmentForJournal();
  qsa("[data-edit-env]").forEach(b=>b.onclick=()=>showEnvironmentForm(b.dataset.editEnv));
  qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
  qsa("[data-env-journal]").forEach(b=>b.onclick=()=>showEnvironmentEntryForm(null,b.dataset.envJournal));
  bindPlantCards();
}


async function showEnvironmentForm(id=null){
  const env=id?await getOne("environments",id):null;
  qs("#modalTitle").textContent=env?"Modifier l’environnement":"Nouvel environnement";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field"><label>Icône</label><input id="envIcon" value="${esc(env?.icon||"🏡")}" placeholder="🏡"></div>
      <div class="field"><label>Nom *</label><input id="envName" value="${esc(env?.name||"")}" placeholder="Ex. Tente 1×1 m"></div>
      <div class="field full"><label>Description</label><textarea id="envDescription" placeholder="Ex. Tente principale, potager extérieur…">${esc(env?.description||"")}</textarea></div>
      <div class="field full actions">
        <button type="button" class="primary" id="saveEnvironment">Enregistrer</button>
        ${env?`<button type="button" class="danger-btn" id="deleteEnvironment">Supprimer</button>`:""}
      </div>
    </div>`;
  qs("#modal").showModal();
  qs("#saveEnvironment").onclick=async()=>{
    const name=qs("#envName").value.trim();
    if(!name)return alert("Donne un nom à l’environnement.");
    await put("environments",{id:env?.id||uid(),name,icon:qs("#envIcon").value.trim()||"🏡",description:qs("#envDescription").value.trim(),order:env?.order??99,createdAt:env?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
    qs("#modal").close();showToast("Environnement enregistré");render();
  };
  if(env)qs("#deleteEnvironment").onclick=async()=>{
    const plants=await all("plants");
    const assigned=plants.filter(p=>p.environmentId===env.id);
    if(assigned.length && !confirm(`${assigned.length} plante(s) utilisent cet environnement. Elles deviendront « sans environnement ». Continuer ?`))return;
    for(const p of assigned){p.environmentId="";await put("plants",p)}
    await del("environments",env.id);
    qs("#modal").close();showToast("Environnement supprimé");render();
  };
}

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
  const [plants,entries,environments,envEntries]=await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  const size=(new Blob([JSON.stringify({plants,entries,environments,envEntries})]).size/1024).toFixed(0);
  app.innerHTML=`
    <div class="settings-card"><h3>Sauvegarde</h3><p class="small">Exporte régulièrement une copie de tes données. Les photos sont incluses dans la sauvegarde JSON.</p>
      <div class="actions"><button class="primary" id="exportJson">Exporter JSON</button><button class="secondary" id="importJson">Importer JSON</button></div>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
    </div>
    <div class="settings-card"><h3>Export tableur</h3><p class="small">CSV compatible avec Excel, Numbers et Google Sheets.</p>
      <div class="actions"><button class="secondary" id="exportPlantsCsv">Plantes CSV</button><button class="secondary" id="exportEntriesCsv">Journal plantes CSV</button><button class="secondary" id="exportEnvEntriesCsv">Journal env CSV</button></div>
    </div>
    <div class="settings-card"><h3>Données locales</h3>
      <div class="kv"><span>Plantes</span><strong>${plants.length}</strong></div>
      <div class="kv"><span>Entrées plantes</span><strong>${entries.length}</strong></div>
      <div class="kv"><span>Environnements</span><strong>${environments.length}</strong></div>
      <div class="kv"><span>Entrées environnements</span><strong>${envEntries.length}</strong></div>
      <div class="kv"><span>Taille approx. sauvegarde</span><strong>${size} Ko</strong></div>
      <div class="actions" style="margin-top:12px"><button class="danger-btn" id="resetApp">Effacer toutes les données</button></div>
    </div>
    <div class="settings-card"><h3>Installation iPhone</h3><p class="small">Une fois l'app hébergée en HTTPS : ouvre-la dans Safari → Partager → « Sur l’écran d’accueil ». Elle pourra ensuite fonctionner hors ligne.</p></div>
    <div class="settings-card"><h3>Version</h3><p class="small">Grow in PF v1.4 — aucune pub, aucun abonnement, aucune donnée envoyée ailleurs.</p></div>`;
  qs("#exportJson").onclick=exportJSON;
  qs("#importJson").onclick=()=>qs("#importFile").click();
  qs("#importFile").onchange=importJSON;
  qs("#exportPlantsCsv").onclick=()=>exportCSV("plantes.csv",plants);
  qs("#exportEntriesCsv").onclick=()=>exportCSV("journal-plantes.csv",entries.map(e=>({...e,photo:e.photo?"[photo incluse dans JSON]":""})));
  qs("#exportEnvEntriesCsv").onclick=()=>exportCSV("journal-environnements.csv",envEntries);
  qs("#resetApp").onclick=async()=>{
    if(confirm("Effacer toutes les plantes, entrées, environnements, journaux d’environnement et photos ?")){
      for(const p of plants) await del("plants",p.id);
      for(const e of entries) await del("entries",e.id);
      for(const env of environments) await del("environments",env.id);
      for(const ee of envEntries) await del("envEntries",ee.id);
      showToast("Données effacées");
      await ensureDefaultEnvironments();
      render();
    }
  };
}

function download(name,content,type="application/octet-stream"){
  const a=document.createElement("a"),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)
}
async function exportJSON(){
  const [plants,entries,environments,envEntries]=await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  download(`grow-in-pf-sauvegarde-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:5,exportedAt:new Date().toISOString(),plants,entries,environments,envEntries},null,2),"application/json");
}
async function importJSON(ev){
  try{
    const file=ev.target.files[0];if(!file)return;
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.plants)||!Array.isArray(data.entries))throw new Error("Format invalide");
    if(!confirm(`Importer ${data.plants.length} plantes et ${data.entries.length} entrées ? Les éléments portant le même ID seront remplacés.`))return;
    if(Array.isArray(data.environments)){for(const env of data.environments)await put("environments",env)}
    if(Array.isArray(data.envEntries)){for(const ee of data.envEntries)await put("envEntries",ee)}
    for(const p of data.plants)await put("plants",p);
    for(const e of data.entries)await put("entries",e);
    await ensureDefaultEnvironments();
    showToast("Sauvegarde importée");
    render();
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
    qs("#modalTitle").textContent="Ajouter rapidement";
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
  const [p,environments]=await Promise.all([id?getOne("plants",id):Promise.resolve(null),all("environments")]);
  qs("#modalTitle").textContent=p?"Modifier la plante":"Nouvelle plante";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field full"><label>Nom *</label><input id="pName" value="${esc(p?.name||"")}" placeholder="Ex. Tomate 01"></div>
      <div class="field"><label>Espèce</label><input id="pSpecies" value="${esc(p?.species||"")}" placeholder="Tomate, basilic…"></div>
      <div class="field"><label>Variété</label><input id="pVariety" value="${esc(p?.variety||"")}" placeholder="Roma, Genovese…"></div>
      <div class="field"><label>Date de départ</label><input id="pStart" type="date" value="${p?.startDate?.slice(0,10)||""}"></div>
      <div class="field"><label>Stade</label><select id="pStage">${["Plantule","Croissance","Préfloraison","Floraison","Fructification","Maturation","Repos"].map(x=>`<option ${p?.stage===x?"selected":""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Volume du pot (L)</label><input id="pPot" type="number" step="0.1" value="${esc(p?.pot||"")}"></div>
      <div class="field"><label>Environnement</label><select id="pEnv"><option value="">Sans environnement</option>${environments.map(x=>`<option value="${x.id}" ${p?.environmentId===x.id?"selected":""}>${esc(x.icon||"🏡")} ${esc(x.name)}</option>`).join("")}</select></div>
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
      await put("plants",{id:p?.id||uid(),name,species:qs("#pSpecies").value.trim(),variety:qs("#pVariety").value.trim(),startDate:qs("#pStart").value,stage:qs("#pStage").value,pot:qs("#pPot").value,environmentId:qs("#pEnv").value,environment:"",soil:qs("#pSoil").value.trim(),notes:qs("#pNotes").value.trim(),photo,createdAt:p?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
      qs("#modal").close();showToast("Plante enregistrée");render();
    }catch(e){alert(e.message)}
  };
  if(p)qs("#deletePlant").onclick=async()=>{if(confirm(`Supprimer ${p.name} et toutes ses entrées ?`)){const es=(await all("entries")).filter(e=>e.plantId===p.id);for(const e of es)await del("entries",e.id);await del("plants",p.id);qs("#modal").close();showToast("Plante supprimée");render()}};
}

async function showEntryForm(existing=null,forcedPlant=null,forcedType=null){
  const plants=await all("plants"); if(!plants.length)return showToast("Crée d’abord une plante");
  const e=existing;
  qs("#modalTitle").textContent=e?"Modifier l’entrée":"Nouvelle entrée";
  const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  qs("#modalBody").innerHTML=`
  <div class="form-grid">
    <div class="field"><label>Plante *</label><select id="ePlant">${plants.map(p=>`<option value="${p.id}" ${(e?.plantId||forcedPlant)===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Type *</label><select id="eType">${Object.entries(ENTRY_TYPES).map(([k,v])=>`<option value="${k}" ${((e?.type||forcedType||"observation")===k)?"selected":""}>${v[0]} ${v[1]}</option>`).join("")}</select></div>
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
  const [p,entries,environments]=await Promise.all([getOne("plants",id),all("entries"),all("environments")]); if(!p)return;
  const env=environments.find(x=>x.id===p.environmentId);
  const es=entries.filter(e=>e.plantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const todayStr=new Date().toISOString().slice(0,10);
  const todayEntries=es.filter(e=>e.date.slice(0,10)===todayStr);
  qs("#modalTitle").textContent=p.name;
  qs("#modalBody").innerHTML=`
    <div class="detail-hero">
      ${p.photo?`<img src="${p.photo}" alt="">`:""}
      <div class="detail-hero-overlay">
        <h2>${esc(p.name)}</h2>
        <div class="detail-meta">
          ${p.stage?`<span class="badge">🌱 ${esc(p.stage)}</span>`:""}
          ${p.variety?`<span class="badge">🧬 ${esc(p.variety)}</span>`:""}
          ${env?`<span class="badge">🏡 ${esc(env.name)}</span>`:""}
        </div>
        <div class="detail-age">🕘 ${ageDays(p.startDate)!=null?`${ageDays(p.startDate)} jours (${Math.max(1,Math.ceil(ageDays(p.startDate)/7))} semaines)`:"Date non renseignée"}</div>
      </div>
    </div>

    <div class="actions-grid-4">
      <button type="button" class="action-tile" id="detailAction"><span class="icon">⚡</span>Action</button>
      <button type="button" class="action-tile" id="detailJournal"><span class="icon">🗒️</span>Journal</button>
      <button type="button" class="action-tile" id="detailPhoto"><span class="icon">📷</span>Photo</button>
      <button type="button" class="action-tile" id="detailEdit"><span class="icon">⋯</span>Plus</button>
    </div>

    <div class="section-caption" style="margin-top:18px">Actions instantanées</div>
    <div class="actions-grid-4">
      <button type="button" class="action-tile" id="qaWater"><span class="icon">💧</span>Arrosage</button>
      <button type="button" class="action-tile" id="qaFeed"><span class="icon">🧪</span>Engrais</button>
      <button type="button" class="action-tile" id="qaPest"><span class="icon">🐛</span>Répulsif</button>
      <button type="button" class="action-tile" id="qaTrim"><span class="icon">✂️</span>Taille</button>
    </div>

    <div class="section-caption" style="margin-top:18px">Aujourd'hui</div>
    ${todayEntries.length?`<div class="card-list">${await Promise.all(todayEntries.slice(0,3).map(e=>entryCard(e,[p]))).then(list=>list.join(""))}</div>`:`<div class="today-empty">Rien pour aujourd'hui</div>`}

    <div class="section-caption" style="margin-top:18px">Historique récent</div>
    <div class="card-list">${es.length?(await Promise.all(es.slice(0,4).map(e=>entryCard(e,[p])))).join(""):`<div class="empty">Aucune entrée.</div>`}</div>
  `;
  qs("#modal").showModal();

  qs("#detailAction").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id)};
  qs("#detailJournal").onclick=()=>setRoute("journal");
  qs("#detailPhoto").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id,"photo")};
  qs("#detailEdit").onclick=()=>{qs("#modal").close();showPlantForm(p.id)};
  qs("#qaWater").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"watering"),0)};
  qs("#qaFeed").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"nutrition"),0)};
  qs("#qaPest").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"pest"),0)};
  qs("#qaTrim").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id,"intervention")};

  qsa("[data-entry]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEntryDetail(b.dataset.entry)});
}



async function ensureDefaultEnvironments(){
  let envs=await all("environments");
  const defaults=[
    {id:"env-propagation",name:"Tente de propagation",icon:"🌱",description:"Zone dédiée aux semis, boutures et jeunes plantes.",order:1},
    {id:"env-tente-1x1",name:"Tente 1×1 m",icon:"⛺",description:"Tente principale de culture indoor.",order:2},
    {id:"env-potager",name:"Potager",icon:"🌿",description:"Plantes cultivées au potager / en extérieur.",order:3}
  ];
  for(const d of defaults){
    if(!envs.some(e=>e.id===d.id || e.name.toLowerCase()===d.name.toLowerCase())){
      await put("environments",{...d,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    }
  }
  envs=await all("environments");

  // Migration douce depuis l'ancien champ "environment"
  const plants=await all("plants");
  for(const p of plants){
    if(p.environmentId)continue;
    const legacy=(p.environment||"").trim().toLowerCase();
    if(!legacy)continue;
    let match=envs.find(e=>e.name.toLowerCase()===legacy);
    if(!match){
      const id="env-"+uid();
      match={id,name:p.environment,icon:"🏡",description:"Importé depuis l’ancienne version.",order:90,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await put("environments",match); envs.push(match);
    }
    p.environmentId=match.id;
    await put("plants",p);
  }
}
async function seedDemo(){
  const plants=await all("plants");if(plants.length)return;
  // Démarrage volontairement vide : aucune donnée d'exemple ne pollue le journal.
}


/* ===== V1.5 overrides ===== */
function weatherCodeText(code){
  const map = {
    0:"Ciel clair",1:"Peu nuageux",2:"Partiellement nuageux",3:"Couvert",
    45:"Brume",48:"Brouillard",51:"Bruine légère",53:"Bruine",55:"Bruine forte",
    61:"Pluie légère",63:"Pluie",65:"Pluie forte",71:"Neige légère",80:"Averses",
    81:"Averses",82:"Averses fortes",95:"Orage"
  };
  return map[code] || "Conditions variables";
}
function weatherDotClass(code){
  if([61,63,65,80,81,82,95].includes(code)) return "warn";
  return "has";
}
async function loadWeather(force=false){
  const cache = window.__growWeatherCache || {};
  if(!force && cache.fetchedAt && (Date.now()-cache.fetchedAt)<30*60*1000 && cache.data) return cache.data;
  const fallback = {lat:-17.516, lon:-149.507, place:"Tahiti"};
  const getPos = ()=>new Promise(resolve=>{
    if(!navigator.geolocation) return resolve(fallback);
    let done=false;
    const timer=setTimeout(()=>{ if(!done){done=true; resolve(fallback);} }, 4500);
    navigator.geolocation.getCurrentPosition(
      pos=>{ if(done) return; done=true; clearTimeout(timer); resolve({lat:pos.coords.latitude, lon:pos.coords.longitude, place:"Autour de toi"}); },
      ()=>{ if(done) return; done=true; clearTimeout(timer); resolve(fallback); },
      {enableHighAccuracy:false, timeout:4000, maximumAge:30*60*1000}
    );
  });
  try{
    const loc = await getPos();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Pacific/Tahiti&forecast_days=4`;
    const res = await fetch(url);
    const raw = await res.json();
    const data = {loc, raw};
    window.__growWeatherCache = {data, fetchedAt:Date.now()};
    return data;
  }catch(e){
    return null;
  }
}
function renderWeatherCard(data){
  if(!data || !data.raw || !data.raw.current || !data.raw.daily){
    return `<section class="weather-card">
      <div class="weather-top">
        <div><div class="weather-place">Météo locale</div><div class="weather-sub">Données indisponibles hors ligne</div></div>
      </div>
    </section>`;
  }
  const cur = data.raw.current;
  const daily = data.raw.daily;
  const days = daily.time.map((x,i)=>({
    date:x,
    label:new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(new Date(x)).replace(".",""),
    tmax:daily.temperature_2m_max[i],
    tmin:daily.temperature_2m_min[i],
    rain:daily.precipitation_probability_max[i],
    code:daily.weather_code[i]
  }));
  return `<section class="weather-card">
    <div class="weather-top">
      <div><div class="weather-place">🌤️ ${esc(data.loc.place)}</div><div class="weather-sub">Météo locale et prévisions</div></div>
      <button class="weather-refresh" id="refreshWeather">Actualiser</button>
    </div>
    <div class="weather-current">
      <div><div class="temp">${Math.round(cur.temperature_2m)}°</div><div class="meta">${esc(weatherCodeText(cur.weather_code))}</div></div>
      <div class="meta">💧 ${Math.round(cur.relative_humidity_2m)} %</div>
    </div>
    <div class="weather-forecast">
      ${days.map((d,i)=>`<div class="weather-day">
        <strong>${i===0?"Aujourd.":esc(d.label)}</strong>
        <span>${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</span>
        <span>${esc(weatherCodeText(d.code))}</span>
        <span>🌧️ ${d.rain ?? 0}%</span>
      </div>`).join("")}
    </div>
  </section>`;
}
function renderGWJWeek(entries, baseDate=new Date(), selectedISO=null){
  const days=currentWeekDays(baseDate);
  const monthLabel = new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(baseDate).toUpperCase();
  return `<section class="gwj-strip">
    <div class="gwj-strip-head">
      <div class="month">${esc(monthLabel)}</div>
      <div class="tag">${selectedISO ? esc(new Intl.DateTimeFormat("fr-FR",{weekday:"long"}).format(new Date(selectedISO))) : "Suivi"}</div>
    </div>
    <div class="gwj-week">
      ${days.map(d=>{
        const iso = isoDay(d);
        const dayEntries = entries.filter(e=>isoDay(e.date)===iso);
        const hasPhoto = dayEntries.some(e=>!!e.photo);
        const hasWarn = dayEntries.some(e=>+e.severity>=3);
        const dot = hasPhoto ? "photo" : hasWarn ? "warn" : dayEntries.length ? "has" : "none";
        return `<button type="button" class="gwj-day ${iso===selectedISO?"active":""} ${iso===isoDay(new Date())?"today":""}" data-week-day="${iso}">
          <div class="dow">${esc(new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d).replace(".",""))}</div>
          <div class="bubble">${d.getDate()}</div>
          <div class="dot ${dot}"></div>
        </button>`;
      }).join("")}
    </div>
  </section>`;
}

async function renderDashboard(app){
  const [plants,entries,environments,envEntries] = await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const todayKey = isoDay(new Date());
  const todayEntries = entries.filter(e=>isoDay(e.date)===todayKey);
  const weather = await loadWeather();
  const featuredPlants = plants.slice(0,4);
  const featuredEnvs = environments.slice(0,4);

  app.innerHTML = `
    <div class="home-stack">
      ${renderGWJWeek(entries, new Date(), todayKey)}
      ${renderWeatherCard(weather)}

      <section>
        <div class="gwj-section-title">Outils</div>
        <div class="home-tools">
          <button class="home-tool" id="toolAction"><div class="home-tool-circle">⚡</div><span>Action</span></button>
          <button class="home-tool" id="toolPhoto"><div class="home-tool-circle">📷</div><span>Photo</span></button>
          <button class="home-tool" id="toolPlantJournal"><div class="home-tool-circle">📝</div><small>Journal de plante</small></button>
          <button class="home-tool" id="toolEnvJournal"><div class="home-tool-circle">🏡</div><small>Journal environnement</small></button>
          <button class="home-tool dark" id="toolMore"><div class="home-tool-circle">🧰</div><span>Plus</span></button>
        </div>
      </section>

      <section>
        <div class="gwj-section-title">Journal</div>
        <div class="card-list">
          ${todayEntries.length ? (await Promise.all(todayEntries.slice(0,4).map(e=>entryCard(e,plants)))).join("") : `<div class="gwj-empty">Rien pour aujourd'hui</div>`}
        </div>
      </section>

      <section>
        <div class="gwj-section-title">Mes plantes</div>
        <div class="card-list">
          ${featuredPlants.length ? featuredPlants.map(p=>plantCard(p,entries,environments)).join("") : `<div class="gwj-empty">Aucune plante pour le moment</div>`}
        </div>
      </section>

      <section>
        <div class="gwj-section-title">Environnements</div>
        <div class="gwj-card-scroll">
          ${featuredEnvs.length ? featuredEnvs.map(env=>{
            const last = envEntries.filter(x=>x.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
            const count = plants.filter(p=>p.environmentId===env.id).length;
            return `<button type="button" class="gwj-mini-card" data-open-env="${env.id}">
              <div class="title-row"><div class="environment-icon">${esc(env.icon||"🏡")}</div><div><strong>${esc(env.name)}</strong><div class="small">${count} plante${count>1?"s":""}</div></div></div>
              <div class="meta">
                ${last?.temp?`<span class="badge">🌡️ ${esc(last.temp)} °C</span>`:""}
                ${last?.humidity?`<span class="badge">💧 ${esc(last.humidity)} %</span>`:""}
                ${last?.vpd?`<span class="badge">VPD ${esc(last.vpd)}</span>`:""}
              </div>
            </button>`;
          }).join("") : `<div class="gwj-empty" style="min-width:100%">Aucun environnement</div>`}
        </div>
      </section>
    </div>
  `;
  qs("#toolAction").onclick=()=>showQuickAdd();
  qs("#toolPhoto").onclick=()=>choosePlantForEntry("photo");
  qs("#toolPlantJournal").onclick=()=>setRoute("journal");
  qs("#toolEnvJournal").onclick=()=>chooseEnvironmentForJournal();
  qs("#toolMore").onclick=()=>setRoute("settings");
  if(qs("#refreshWeather")) qs("#refreshWeather").onclick=async()=>{ window.__growWeatherCache=null; renderDashboard(app); };
  qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
  bindPlantCards();
  bindEntryCards();
}

async function renderGarden(app){
  const [plants,entries,environments,envEntries] = await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  const phaseOptions=[...new Set(plants.map(p=>p.stage).filter(Boolean))];
  const environmentMap=new Map(environments.map(e=>[e.id,e]));
  const groupedPlants=(list)=>{
    const groups={};
    list.forEach(p=>{
      const env=environmentMap.get(p.environmentId);
      const key=env?env.name:"Sans environnement";
      if(!groups[key])groups[key]={env,items:[]};
      groups[key].items.push(p);
    });
    return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],"fr"));
  };

  app.innerHTML = `
    <div class="garden-shell">
      <section class="garden-segment">
        <div class="segmented" id="gardenSegment">
          <button data-mode="plants" class="${gardenMode==="plants"?"active":""}">🌱 Plantes</button>
          <button data-mode="environments" class="${gardenMode==="environments"?"active":""}">🏡 Environnements</button>
        </div>
      </section>

      <section id="gardenPlants" class="${gardenMode==="plants"?"":"hidden"}">
        <div class="filter-row">
          <div class="field">
            <label>Phase</label>
            <select id="gardenPhaseFilter">
              <option value="">Toutes</option>
              ${phaseOptions.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Environnement</label>
            <select id="gardenEnvFilter">
              <option value="">Tous</option>
              ${environments.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}
              <option value="__none">Sans environnement</option>
            </select>
          </div>
        </div>
        <div id="gardenPlantsList" class="card-list"></div>
      </section>

      <section id="gardenEnvironments" class="${gardenMode==="environments"?"":"hidden"}">
        <div class="gwj-toolbar">
          <button class="primary" id="gardenAddEnvironment">＋ Nouvel environnement</button>
          <button class="secondary" id="gardenAddEnvJournal">🗒️ Journal d’environnement</button>
        </div>
        <div id="gardenEnvironmentList" class="environment-list-gap"></div>
      </section>

      <button class="fab" id="gardenFab" aria-label="Ajouter">＋</button>
    </div>
  `;

  const renderGroupedPlants=()=>{
    const phase=qs("#gardenPhaseFilter")?.value || "";
    const envFilter=qs("#gardenEnvFilter")?.value || "";
    const filtered=plants.filter(p=>{
      const phaseOk=!phase || p.stage===phase;
      const envOk=!envFilter || (envFilter==="__none" ? !p.environmentId : p.environmentId===envFilter);
      return phaseOk && envOk;
    });
    const groups=groupedPlants(filtered);
    qs("#gardenPlantsList").innerHTML = groups.length ? groups.map(([groupName,group])=>`
      <div class="env-group">
        <div class="group-header">
          <h3>${esc(group.env?.icon||"")} ${esc(groupName)}</h3>
          <span class="small">${group.items.length}</span>
        </div>
        <div class="plant-list-compact">
          ${group.items.map(p=>gardenPlantCard(p,entries,environments)).join("")}
        </div>
      </div>`).join("") : `<div class="gwj-empty">Aucune plante avec ces filtres</div>`;
    bindPlantCards();
  };

  const renderEnvironmentCards=()=>{
    const sorted=[...environments].sort((a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name,"fr"));
    qs("#gardenEnvironmentList").innerHTML = sorted.length ? sorted.map(env=>{
      const envPlants=plants.filter(p=>p.environmentId===env.id);
      const last = envEntries.filter(x=>x.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      return `<div class="environment-card">
        <div class="environment-head">
          <div class="environment-title">
            <div class="environment-icon">${esc(env.icon||"🏡")}</div>
            <div><h3>${esc(env.name)}</h3><p>${envPlants.length} plante${envPlants.length>1?"s":""}</p></div>
          </div>
          <button class="icon-btn" data-edit-env="${env.id}" aria-label="Modifier">⋯</button>
        </div>
        ${env.description?`<p>${esc(env.description)}</p>`:""}
        <div class="badges">
          ${last?.temp?`<span class="badge">🌡️ ${esc(last.temp)} °C</span>`:""}
          ${last?.humidity?`<span class="badge">💧 ${esc(last.humidity)} %</span>`:""}
          ${last?.vpd?`<span class="badge">VPD ${esc(last.vpd)}</span>`:""}
          ${last?.lightHours?`<span class="badge">💡 ${esc(last.lightHours)} h</span>`:""}
        </div>
        <div class="environment-actions">
          <button class="secondary" type="button" data-open-env="${env.id}">Ouvrir</button>
          <button class="secondary" type="button" data-manage-env="${env.id}">Plantes</button>
        </div>
      </div>`;
    }).join("") : `<div class="gwj-empty">Aucun environnement</div>`;
    qsa("[data-edit-env]").forEach(b=>b.onclick=()=>showEnvironmentForm(b.dataset.editEnv));
    qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
    qsa("[data-manage-env]").forEach(b=>b.onclick=()=>showEnvironmentPlantManager(b.dataset.manageEnv));
  };

  renderGroupedPlants();
  renderEnvironmentCards();
  qsa("#gardenSegment button").forEach(btn=>btn.onclick=()=>{gardenMode=btn.dataset.mode; render();});
  qs("#gardenPhaseFilter").onchange=renderGroupedPlants;
  qs("#gardenEnvFilter").onchange=renderGroupedPlants;
  qs("#gardenAddEnvironment").onclick=()=>showEnvironmentForm();
  qs("#gardenAddEnvJournal").onclick=()=>chooseEnvironmentForJournal();
  qs("#gardenFab").onclick=()=>gardenMode==="plants" ? showPlantForm() : showEnvironmentForm();
}

async function showPlantDetail(id){
  window.__plantSelectedDate = window.__plantSelectedDate || {};
  const [p,entries,environments]=await Promise.all([getOne("plants",id),all("entries"),all("environments")]); if(!p)return;
  const env=environments.find(x=>x.id===p.environmentId);
  const es=entries.filter(e=>e.plantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const selected = window.__plantSelectedDate[id] || (es[0] ? isoDay(es[0].date) : isoDay(new Date()));
  const selectedEntries = es.filter(e=>isoDay(e.date)===selected);

  qs("#modalTitle").textContent=p.name;
  qs("#modalBody").innerHTML=`
    <div class="detail-hero">
      ${p.photo?`<img src="${p.photo}" alt="">`:""}
      <div class="detail-top-actions">
        <button type="button" class="overlay-btn" id="detailBack">‹</button>
        <button type="button" class="overlay-btn" id="detailEdit">⋯</button>
      </div>
      <button type="button" class="photo-fab" id="detailPhotoFab">📷</button>
      <div class="detail-hero-overlay">
        <h2>${esc(p.name)}</h2>
        <div class="detail-meta">
          ${p.stage?`<span class="badge">🌱 ${esc(p.stage)}</span>`:""}
          ${p.variety?`<span class="badge">🧬 ${esc(p.variety)}</span>`:""}
          ${env?`<span class="badge">🏡 ${esc(env.name)}</span>`:""}
        </div>
        <div class="detail-age">🕘 ${ageDays(p.startDate)!=null?`${ageDays(p.startDate)} jours (${Math.max(1,Math.ceil(ageDays(p.startDate)/7))} semaines)`:"Date non renseignée"}</div>
      </div>
    </div>

    ${renderGWJWeek(es, new Date(selected), selected)}

    <div class="actions-grid-4">
      <button type="button" class="action-tile" id="detailAction"><span class="icon">⚡</span>Action</button>
      <button type="button" class="action-tile" id="detailJournal"><span class="icon">📝</span>Journal de plante</button>
      <button type="button" class="action-tile" id="detailPhoto"><span class="icon">📷</span>Photo</button>
      <button type="button" class="action-tile" id="detailMore"><span class="icon">⋯</span>Plus</button>
    </div>

    <div class="section-caption" style="margin-top:14px">Actions instantanées</div>
    <div class="actions-grid-4">
      <button type="button" class="action-tile" id="qaWater"><span class="icon">💧</span>Arrosage</button>
      <button type="button" class="action-tile" id="qaFeed"><span class="icon">🧪</span>Engrais</button>
      <button type="button" class="action-tile" id="qaPest"><span class="icon">🐛</span>Répulsif</button>
      <button type="button" class="action-tile" id="qaTrim"><span class="icon">✂️</span>Taille</button>
    </div>

    <div class="section-caption" style="margin-top:14px">Notes de la plante</div>
    <div class="note-card">
      <textarea id="plantNoteArea" placeholder="Ajoute ici tes notes, observations, idées, rappels…">${esc(p.notes||"")}</textarea>
      <div class="note-inline-actions"><button type="button" class="primary" id="savePlantNote">Enregistrer</button></div>
    </div>

    <div class="section-caption" style="margin-top:14px">Journal du ${fmtDate(selected)}</div>
    ${selectedEntries.length?`<div class="card-list">${(await Promise.all(selectedEntries.slice(0,6).map(e=>entryCard(e,[p])))).join("")}</div>`:`<div class="today-empty">Aucune entrée pour cette date</div>`}

    <div class="section-caption" style="margin-top:14px">Historique récent</div>
    <div class="card-list">${es.length?(await Promise.all(es.slice(0,4).map(e=>entryCard(e,[p])))).join(""):`<div class="gwj-empty">Aucune entrée</div>`}</div>
  `;
  qs("#modal").showModal();

  qs("#detailBack").onclick=()=>qs("#modal").close();
  qs("#detailEdit").onclick=()=>{qs("#modal").close();showPlantForm(p.id)};
  qs("#detailMore").onclick=()=>setRoute("journal");
  qs("#detailAction").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id)};
  qs("#detailJournal").onclick=()=>setRoute("journal");
  qs("#detailPhoto").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id,"photo")};
  qs("#detailPhotoFab").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id,"photo")};
  qs("#qaWater").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"watering"),0)};
  qs("#qaFeed").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"nutrition"),0)};
  qs("#qaPest").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"pest"),0)};
  qs("#qaTrim").onclick=()=>{qs("#modal").close();showEntryForm(null,p.id,"intervention")};
  qs("#savePlantNote").onclick=async()=>{ await savePlantNotes(p.id, qs("#plantNoteArea").value.trim()); showToast("Notes enregistrées"); };
  qsa("[data-week-day]").forEach(b=>b.onclick=()=>{window.__plantSelectedDate[id]=b.dataset.weekDay; showPlantDetail(id);});
  qsa("[data-entry]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEntryDetail(b.dataset.entry)});
}

async function showEnvironmentDetail(id){
  window.__envSelectedDate = window.__envSelectedDate || {};
  const [env,plants,envEntries] = await Promise.all([getOne("environments",id),all("plants"),all("envEntries")]);
  if(!env) return;
  const assigned = plants.filter(p=>p.environmentId===id);
  const es = envEntries.filter(e=>e.environmentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const selected = window.__envSelectedDate[id] || (es[0] ? isoDay(es[0].date) : isoDay(new Date()));
  const selectedEntries = es.filter(e=>isoDay(e.date)===selected);
  const latest = es[0];

  qs("#modalTitle").textContent = env.name;
  qs("#modalBody").innerHTML = `
    <div class="detail-hero" style="background:linear-gradient(160deg,#123222,#08140f);min-height:190px">
      <div class="detail-top-actions">
        <button type="button" class="overlay-btn" id="envBack">‹</button>
        <button type="button" class="overlay-btn" id="envEdit">⋯</button>
      </div>
      <div class="detail-hero-overlay" style="min-height:190px">
        <h2>${esc(env.name)}</h2>
        <div class="detail-meta">
          <span class="badge">${esc(env.icon||"🏡")} Environnement</span>
          <span class="badge">${assigned.length} plante${assigned.length>1?"s":""}</span>
          ${latest?.temp?`<span class="badge">🌡️ ${esc(latest.temp)} °C</span>`:""}
          ${latest?.humidity?`<span class="badge">💧 ${esc(latest.humidity)} %</span>`:""}
          ${latest?.vpd?`<span class="badge">VPD ${esc(latest.vpd)}</span>`:""}
        </div>
        ${env.description?`<div class="small">${esc(env.description)}</div>`:""}
      </div>
    </div>

    ${renderGWJWeek(es, new Date(selected), selected)}

    <div class="actions-grid-4">
      <button type="button" class="action-tile" id="envJournal"><span class="icon">📝</span>Journal env.</button>
      <button type="button" class="action-tile" id="envManagePlants"><span class="icon">🌱</span>Plantes</button>
      <button type="button" class="action-tile" id="envAddPlant"><span class="icon">＋</span>Ajouter</button>
      <button type="button" class="action-tile" id="envMore"><span class="icon">⋯</span>Plus</button>
    </div>

    <div class="section-caption" style="margin-top:14px">Plantes de l’environnement</div>
    <div class="card-list">
      ${assigned.length ? assigned.map(p=>`<button class="plant-card" data-plant="${p.id}" style="width:100%;text-align:left;color:inherit">${plantPhotoHTML(p)}<div><h3>${esc(p.name)}</h3><p>${esc(p.stage||"Plante")}</p></div><span class="status-dot"></span></button>`).join("") : `<div class="gwj-empty">Aucune plante assignée</div>`}
    </div>

    <div class="section-caption" style="margin-top:14px">Journal du ${fmtDate(selected)}</div>
    <div class="card-list">
      ${selectedEntries.length ? selectedEntries.slice(0,6).map(environmentEntryCard).join("") : `<div class="today-empty">Aucune entrée environnement pour cette date</div>`}
    </div>

    <div class="section-caption" style="margin-top:14px">Historique récent</div>
    <div class="card-list">
      ${es.length ? es.slice(0,4).map(environmentEntryCard).join("") : `<div class="gwj-empty">Aucun journal environnement</div>`}
    </div>
  `;
  qs("#modal").showModal();
  qs("#envBack").onclick=()=>qs("#modal").close();
  qs("#envEdit").onclick=()=>{qs("#modal").close();showEnvironmentForm(id)};
  qs("#envJournal").onclick=()=>{qs("#modal").close();showEnvironmentEntryForm(null,id)};
  qs("#envManagePlants").onclick=()=>{qs("#modal").close();showEnvironmentPlantManager(id)};
  qs("#envAddPlant").onclick=()=>{qs("#modal").close();showPlantForm()};
  qs("#envMore").onclick=()=>setRoute("garden");
  qsa("[data-week-day]").forEach(b=>b.onclick=()=>{window.__envSelectedDate[id]=b.dataset.weekDay; showEnvironmentDetail(id);});
  qsa("[data-plant]").forEach(b=>b.onclick=()=>{qs("#modal").close();showPlantDetail(b.dataset.plant)});
  qsa("[data-env-entry]").forEach(b=>b.onclick=()=>showEnvironmentEntryDetail(b.dataset.envEntry));
}

async function showEnvironmentPlantManager(envId){
  const [env,plants,environments]=await Promise.all([getOne("environments",envId),all("plants"),all("environments")]);
  if(!env) return;
  qs("#modalTitle").textContent = `Plantes • ${env.name}`;
  qs("#modalBody").innerHTML = `
    <div class="manage-plant-list">
      ${plants.length ? plants.map(p=>{
        const currentEnv = environments.find(e=>e.id===p.environmentId);
        const inThis = p.environmentId===envId;
        return `<div class="manage-plant-card">
          <div><strong>${esc(p.name)}</strong><div class="small">${currentEnv?`Actuellement : ${esc(currentEnv.name)}`:"Sans environnement"}</div></div>
          <div class="manage-plant-actions">
            ${inThis ? `<button type="button" class="secondary" data-remove-plant="${p.id}">Retirer</button>` : `<button type="button" class="primary" data-move-plant="${p.id}">Déplacer ici</button>`}
            <button type="button" class="secondary" data-open-plant="${p.id}">Ouvrir</button>
          </div>
        </div>`;
      }).join("") : `<div class="gwj-empty">Aucune plante</div>`}
    </div>
  `;
  qs("#modal").showModal();

  qsa("[data-move-plant]").forEach(b=>b.onclick=async()=>{
    const p=await getOne("plants", b.dataset.movePlant);
    p.environmentId=envId; p.updatedAt=new Date().toISOString();
    await put("plants", p);
    showToast("Plante déplacée");
    showEnvironmentPlantManager(envId);
  });
  qsa("[data-remove-plant]").forEach(b=>b.onclick=async()=>{
    const p=await getOne("plants", b.dataset.removePlant);
    p.environmentId=""; p.updatedAt=new Date().toISOString();
    await put("plants", p);
    showToast("Plante retirée");
    showEnvironmentPlantManager(envId);
  });
  qsa("[data-open-plant]").forEach(b=>b.onclick=()=>{qs("#modal").close();showPlantDetail(b.dataset.openPlant);});
}


/* ===== Grow in PF V1.6 ===== */

function openAppModal(detail=false){
  const m=qs("#modal");
  if(m.open) m.close();
  m.classList.toggle("detail-modal", !!detail);
  m.showModal();
}
function environmentTypeIcon(type="indoor"){
  if(type==="outdoor"){
    return `<svg class="env-svg" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="47" cy="16" r="8" fill="currentColor" opacity=".9"/>
      <path d="M6 48c9-10 18-15 27-15 9 0 17 4 25 13v8H6v-6Z" fill="currentColor" opacity=".25"/>
      <path d="M32 52V29M32 36c-8-8-15-7-20-5 4 9 11 13 20 13M32 37c7-8 14-8 20-5-3 9-10 13-20 13" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  return `<svg class="env-svg" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M12 54V18l20-9 20 9v36H12Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M22 22h20M32 22v10M25 48c2-9 6-14 7-14s5 5 7 14M32 48V34" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M27 39c-5-4-9-3-12-2 2 6 6 8 12 8M37 39c5-4 9-3 12-2-2 6-6 8-12 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
function environmentIconBlock(env){
  return `<div class="environment-icon custom-env-icon ${env?.type==="outdoor"?"outdoor":"indoor"}">${environmentTypeIcon(env?.type||"indoor")}</div>`;
}
function inferEnvironmentType(env){
  if(env?.type==="indoor" || env?.type==="outdoor") return env.type;
  const n=(env?.name||"").toLowerCase();
  return /(potager|extérieur|exterieur|jardin|balcon|terrasse|dehors)/.test(n) ? "outdoor" : "indoor";
}
function val(id){ return qs(`#${id}`)?.value ?? ""; }
function selectedText(id){ const el=qs(`#${id}`); return el?.options?.[el.selectedIndex]?.text || ""; }
function opt(value,current,label=value){
  return `<option value="${esc(value)}" ${String(current??"")===String(value)?"selected":""}>${esc(label)}</option>`;
}
function detailData(e){ return e?.details || {}; }

function actionFieldsHTML(type,e={}){
  e = e || {};
  const d=detailData(e);
  const common = {
    ph:e.ph ?? d.ph ?? "",
    ec:e.ec ?? d.ec ?? "",
    water:e.water ?? d.water ?? "",
    height:e.height ?? d.height ?? "",
    severity:e.severity ?? d.severity ?? "",
    product:e.product ?? d.product ?? ""
  };
  switch(type){
    case "watering":
      return `
        <div class="form-section">Arrosage</div>
        <div class="field"><label>Volume d’eau (L)</label><input id="aWater" type="number" step="0.05" value="${esc(d.water||common.water)}"></div>
        <div class="field"><label>État du substrat avant</label><select id="aSubstrateState">
          ${opt("",d.substrateState,"Non renseigné")}${opt("sec",d.substrateState,"Sec")}${opt("leger",d.substrateState,"Légèrement humide")}${opt("humide",d.substrateState,"Humide")}
        </select></div>
        <div class="field"><label>Source d’eau</label><select id="aWaterSource">
          ${opt("",d.waterSource,"Non renseignée")}${opt("robinet",d.waterSource,"Robinet")}${opt("pluie",d.waterSource,"Eau de pluie")}${opt("osmosee",d.waterSource,"Osmosée")}${opt("autre",d.waterSource,"Autre")}
        </select></div>
        <div class="field"><label>Drainage / runoff (%)</label><input id="aRunoff" type="number" step="1" min="0" max="100" value="${esc(d.runoff||"")}"></div>
        <div class="field"><label>pH eau</label><input id="aPh" type="number" step="0.01" value="${esc(d.ph||common.ph)}"></div>
        <div class="field"><label>EC eau (mS/cm)</label><input id="aEc" type="number" step="0.01" value="${esc(d.ec||common.ec)}"></div>`;
    case "nutrition":
      return `
        <div class="form-section">Engrais / nutrition</div>
        <div class="field full"><label>Produit / amendement</label><input id="aProduct" value="${esc(d.product||common.product)}" placeholder="Ex. Alga Grow, compost, top dress…"></div>
        <div class="field"><label>Dose</label><input id="aDose" type="number" step="0.01" value="${esc(d.dose||"")}"></div>
        <div class="field"><label>Unité</label><select id="aDoseUnit">
          ${opt("ml/L",d.doseUnit||"ml/L","ml/L")}${opt("g/L",d.doseUnit,"g/L")}${opt("g",d.doseUnit,"g")}${opt("ml",d.doseUnit,"ml")}${opt("c. à soupe",d.doseUnit,"c. à soupe")}
        </select></div>
        <div class="field"><label>Méthode</label><select id="aMethod">
          ${opt("arrosage",d.method,"Arrosage")}${opt("top-dress",d.method,"Top dress")}${opt("foliaire",d.method,"Foliaire")}${opt("substrat",d.method,"Mélangé au substrat")}
        </select></div>
        <div class="field"><label>Volume solution (L)</label><input id="aWater" type="number" step="0.05" value="${esc(d.water||common.water)}"></div>
        <div class="field"><label>pH final</label><input id="aPh" type="number" step="0.01" value="${esc(d.ph||common.ph)}"></div>
        <div class="field"><label>EC final (mS/cm)</label><input id="aEc" type="number" step="0.01" value="${esc(d.ec||common.ec)}"></div>`;
    case "repotting":
      return `
        <div class="form-section">Rempotage</div>
        <div class="field"><label>Ancien pot (L)</label><input id="aOldPot" type="number" step="0.1" value="${esc(d.oldPot||"")}"></div>
        <div class="field"><label>Nouveau pot (L)</label><input id="aNewPot" type="number" step="0.1" value="${esc(d.newPot||"")}"></div>
        <div class="field full"><label>Nouveau substrat</label><input id="aSubstrate" value="${esc(d.substrate||"")}" placeholder="Composition ou nom du substrat"></div>
        <div class="field"><label>État des racines</label><select id="aRoots">
          ${opt("",d.roots,"Non renseigné")}${opt("peu-colonise",d.roots,"Peu colonisé")}${opt("bien-colonise",d.roots,"Bien colonisé")}${opt("rootbound",d.roots,"Très colonisé / rootbound")}${opt("probleme",d.roots,"Racines à surveiller")}
        </select></div>
        <div class="field"><label>Mycorhizes</label><select id="aMyco">
          ${opt("",d.myco,"Non renseigné")}${opt("oui",d.myco,"Oui")}${opt("non",d.myco,"Non")}
        </select></div>`;
    case "training":
      return `
        <div class="form-section">Taille / palissage</div>
        <div class="field"><label>Technique</label><select id="aTechnique">
          ${opt("LST",d.technique,"LST")}${opt("HST",d.technique,"HST / Supercropping")}${opt("Topping",d.technique,"Topping")}${opt("FIM",d.technique,"FIM")}${opt("Defoliation",d.technique,"Défoliation")}${opt("Lollipop",d.technique,"Lollipopping")}${opt("Pruning",d.technique,"Taille classique")}${opt("SCROG",d.technique,"SCROG / filet")}
        </select></div>
        <div class="field"><label>Branches / zones concernées</label><input id="aBranches" value="${esc(d.branches||"")}" placeholder="Ex. 2 branches principales"></div>
        <div class="field"><label>Intensité</label><select id="aIntensity">
          ${opt("legere",d.intensity,"Légère")}${opt("moyenne",d.intensity,"Moyenne")}${opt("forte",d.intensity,"Forte")}
        </select></div>
        <div class="field"><label>Réaction attendue / résultat</label><input id="aResult" value="${esc(d.result||"")}" placeholder="Ex. ouvrir la canopée"></div>`;
    case "measurement":
      return `
        <div class="form-section">Mesures de la plante</div>
        <div class="field"><label>Hauteur (cm)</label><input id="aHeight" type="number" step="0.1" value="${esc(d.height||common.height)}"></div>
        <div class="field"><label>Largeur canopée (cm)</label><input id="aCanopy" type="number" step="0.1" value="${esc(d.canopy||"")}"></div>
        <div class="field"><label>Diamètre tige (mm)</label><input id="aStem" type="number" step="0.1" value="${esc(d.stem||"")}"></div>
        <div class="field"><label>Nœuds / branches</label><input id="aNodes" type="number" step="1" value="${esc(d.nodes||"")}"></div>
        <div class="field"><label>Fleurs</label><input id="aFlowers" type="number" step="1" value="${esc(d.flowers||"")}"></div>
        <div class="field"><label>Fruits</label><input id="aFruits" type="number" step="1" value="${esc(d.fruits||"")}"></div>`;
    case "observation":
      return `
        <div class="form-section">Observation</div>
        <div class="field"><label>Type de symptôme</label><select id="aSymptom">
          ${opt("",d.symptom,"Aucun / général")}${opt("jaunissement",d.symptom,"Jaunissement")}${opt("chlorose",d.symptom,"Chlorose")}${opt("taches",d.symptom,"Taches")}${opt("brulure",d.symptom,"Pointes / brûlure")}${opt("courbure",d.symptom,"Feuilles courbées")}${opt("croissance",d.symptom,"Croissance ralentie")}${opt("autre",d.symptom,"Autre")}
        </select></div>
        <div class="field"><label>Zone</label><select id="aZone">
          ${opt("",d.zone,"Non renseignée")}${opt("haut",d.zone,"Haut")}${opt("milieu",d.zone,"Milieu")}${opt("bas",d.zone,"Bas")}${opt("general",d.zone,"Généralisé")}
        </select></div>
        <div class="field"><label>Âge des feuilles</label><select id="aLeafAge">
          ${opt("",d.leafAge,"Non renseigné")}${opt("nouvelles",d.leafAge,"Nouvelles")}${opt("anciennes",d.leafAge,"Anciennes")}${opt("toutes",d.leafAge,"Toutes")}
        </select></div>
        <div class="field"><label>Gravité (0–5)</label><select id="aSeverity">
          ${[0,1,2,3,4,5].map(x=>opt(String(x),String(d.severity||common.severity||0),String(x))).join("")}
        </select></div>
        <div class="field full"><label>Progression</label><select id="aProgression">
          ${opt("",d.progression,"Non renseignée")}${opt("stable",d.progression,"Stable")}${opt("ameliore",d.progression,"S’améliore")}${opt("progresse",d.progression,"Progresse")}
        </select></div>`;
    case "pest":
      return `
        <div class="form-section">Ravageur / traitement</div>
        <div class="field"><label>Ravageur / problème</label><input id="aPest" value="${esc(d.pest||"")}" placeholder="Ex. mineuse, acarien, oïdium…"></div>
        <div class="field"><label>Gravité (0–5)</label><select id="aSeverity">${[0,1,2,3,4,5].map(x=>opt(String(x),String(d.severity||common.severity||0),String(x))).join("")}</select></div>
        <div class="field full"><label>Traitement / produit</label><input id="aProduct" value="${esc(d.product||common.product)}" placeholder="Produit ou action effectuée"></div>
        <div class="field"><label>Dose</label><input id="aDoseText" value="${esc(d.doseText||"")}" placeholder="Ex. 1 ml/L"></div>
        <div class="field"><label>Zone touchée</label><input id="aAffected" value="${esc(d.affected||"")}" placeholder="Ex. feuilles basses"></div>`;
    case "harvest":
      return `
        <div class="form-section">Récolte</div>
        <div class="field"><label>Poids frais (g)</label><input id="aWetWeight" type="number" step="0.1" value="${esc(d.wetWeight||"")}"></div>
        <div class="field"><label>Poids sec (g)</label><input id="aDryWeight" type="number" step="0.1" value="${esc(d.dryWeight||"")}"></div>
        <div class="field"><label>Nombre de fruits / unités</label><input id="aCount" type="number" step="1" value="${esc(d.count||"")}"></div>
        <div class="field"><label>Qualité / état</label><select id="aQuality">
          ${opt("",d.quality,"Non renseignée")}${opt("excellente",d.quality,"Excellente")}${opt("bonne",d.quality,"Bonne")}${opt("moyenne",d.quality,"Moyenne")}${opt("faible",d.quality,"Faible")}
        </select></div>`;
    case "photo":
      return `
        <div class="form-section">Photo</div>
        <div class="field"><label>Vue / angle</label><select id="aAngle">
          ${opt("",d.angle,"Non renseigné")}${opt("face",d.angle,"Face")}${opt("dessus",d.angle,"Dessus")}${opt("profil",d.angle,"Profil")}${opt("feuille",d.angle,"Feuille / détail")}${opt("racines",d.angle,"Racines")}${opt("fruit",d.angle,"Fleur / fruit")}
        </select></div>
        <div class="field"><label>Étiquette</label><input id="aLabel" value="${esc(d.label||"")}" placeholder="Ex. comparaison semaine 4"></div>`;
    default:
      return `
        <div class="form-section">Intervention</div>
        <div class="field full"><label>Action réalisée</label><input id="aProduct" value="${esc(d.product||common.product)}" placeholder="Décris l’action"></div>`;
  }
}
function readActionFields(type){
  const g=id=>val(id);
  switch(type){
    case "watering": return {water:g("aWater"), substrateState:g("aSubstrateState"), waterSource:g("aWaterSource"), runoff:g("aRunoff"), ph:g("aPh"), ec:g("aEc")};
    case "nutrition": return {product:g("aProduct"), dose:g("aDose"), doseUnit:g("aDoseUnit"), method:g("aMethod"), water:g("aWater"), ph:g("aPh"), ec:g("aEc")};
    case "repotting": return {oldPot:g("aOldPot"), newPot:g("aNewPot"), substrate:g("aSubstrate"), roots:g("aRoots"), myco:g("aMyco")};
    case "training": return {technique:g("aTechnique"), branches:g("aBranches"), intensity:g("aIntensity"), result:g("aResult")};
    case "measurement": return {height:g("aHeight"), canopy:g("aCanopy"), stem:g("aStem"), nodes:g("aNodes"), flowers:g("aFlowers"), fruits:g("aFruits")};
    case "observation": return {symptom:g("aSymptom"), zone:g("aZone"), leafAge:g("aLeafAge"), severity:g("aSeverity"), progression:g("aProgression")};
    case "pest": return {pest:g("aPest"), severity:g("aSeverity"), product:g("aProduct"), doseText:g("aDoseText"), affected:g("aAffected")};
    case "harvest": return {wetWeight:g("aWetWeight"), dryWeight:g("aDryWeight"), count:g("aCount"), quality:g("aQuality")};
    case "photo": return {angle:g("aAngle"), label:g("aLabel")};
    default: return {product:g("aProduct")};
  }
}
function entrySummaryPills(e){
  const d=detailData(e), pills=[];
  switch(e.type){
    case "watering":
      if(d.water||e.water)pills.push(`💧 ${d.water||e.water} L`);
      if(d.substrateState)pills.push(`Substrat ${d.substrateState}`);
      if(d.ph||e.ph)pills.push(`pH ${d.ph||e.ph}`);
      if(d.ec||e.ec)pills.push(`EC ${d.ec||e.ec}`);
      break;
    case "nutrition":
      if(d.product||e.product)pills.push(`🧪 ${d.product||e.product}`);
      if(d.dose)pills.push(`${d.dose} ${d.doseUnit||""}`);
      if(d.method)pills.push(d.method);
      break;
    case "repotting":
      if(d.oldPot||d.newPot)pills.push(`🪴 ${d.oldPot||"?"}L → ${d.newPot||"?"}L`);
      if(d.roots)pills.push(`Racines: ${d.roots}`);
      if(d.myco)pills.push(`Myco: ${d.myco}`);
      break;
    case "training":
      if(d.technique)pills.push(`✂️ ${d.technique}`);
      if(d.intensity)pills.push(`Intensité ${d.intensity}`);
      break;
    case "measurement":
      if(d.height||e.height)pills.push(`📏 ${d.height||e.height} cm`);
      if(d.canopy)pills.push(`Canopée ${d.canopy} cm`);
      if(d.stem)pills.push(`Tige ${d.stem} mm`);
      break;
    case "observation":
      if(d.symptom)pills.push(`👀 ${d.symptom}`);
      if(d.zone)pills.push(d.zone);
      if(d.severity||e.severity)pills.push(`Niveau ${d.severity||e.severity}/5`);
      break;
    case "pest":
      if(d.pest)pills.push(`🐛 ${d.pest}`);
      if(d.product||e.product)pills.push(d.product||e.product);
      if(d.severity||e.severity)pills.push(`Niveau ${d.severity||e.severity}/5`);
      break;
    case "harvest":
      if(d.wetWeight)pills.push(`Frais ${d.wetWeight} g`);
      if(d.dryWeight)pills.push(`Sec ${d.dryWeight} g`);
      if(d.count)pills.push(`${d.count} unités`);
      break;
    case "photo":
      if(d.angle)pills.push(`📷 ${d.angle}`);
      if(d.label)pills.push(d.label);
      break;
    default:
      if(d.product||e.product)pills.push(d.product||e.product);
  }
  if(e.temp)pills.push(`🌡️ ${e.temp} °C`);
  if(e.humidity)pills.push(`💧 ${e.humidity} %`);
  if(e.vpd)pills.push(`VPD ${e.vpd}`);
  return pills;
}

async function entryCard(e,plants){
  const p=plants.find(x=>x.id===e.plantId), t=ENTRY_TYPES[e.type]||["•",e.type];
  const pills=entrySummaryPills(e);
  return `<button class="entry-card" data-entry="${e.id}" style="width:100%;text-align:left;color:inherit">
    <div class="entry-top"><div><div class="entry-type">${t[0]} ${t[1]}</div><div class="small">${esc(p?.name||"Plante supprimée")}</div></div><div class="entry-date">${fmtDateTime(e.date)}</div></div>
    ${pills.length?`<div class="chips">${pills.map(x=>`<span class="chip">${esc(x)}</span>`).join("")}</div>`:""}
    ${e.note?`<p class="entry-note">${esc(e.note)}</p>`:""}
    ${e.photo?`<img class="entry-photo" src="${e.photo}" alt="Photo du journal">`:""}
  </button>`;
}

async function showEntryForm(existing=null,forcedPlant=null,forcedType=null){
  const plants=await all("plants");
  if(!plants.length)return showToast("Crée d’abord une plante");
  const e=existing;
  const selectedType=e?.type||forcedType||"observation";
  const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  qs("#modalTitle").textContent=e?"Modifier l’entrée":"Nouvelle action";
  qs("#modalBody").innerHTML=`
    <div class="form-grid action-form">
      <div class="field"><label>Plante *</label><select id="ePlant">${plants.map(p=>`<option value="${p.id}" ${(e?.plantId||forcedPlant)===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Action *</label><select id="eType">${Object.entries(ENTRY_TYPES).map(([k,v])=>`<option value="${k}" ${selectedType===k?"selected":""}>${v[0]} ${v[1]}</option>`).join("")}</select></div>
      <div class="field full"><label>Date et heure</label><input id="eDate" type="datetime-local" value="${e?.date?new Date(new Date(e.date)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):nowLocal}"></div>
      <div id="specificFields" class="dynamic-fields">${actionFieldsHTML(selectedType,e)}</div>
      <details class="field full optional-context" ${e?.temp||e?.humidity||e?.vpd?"open":""}>
        <summary>Contexte environnemental (optionnel)</summary>
        <div class="form-grid context-grid">
          <div class="field"><label>Température (°C)</label><input id="eTemp" type="number" step="0.1" value="${esc(e?.temp||"")}"></div>
          <div class="field"><label>Humidité (%)</label><input id="eHum" type="number" step="0.1" value="${esc(e?.humidity||"")}"></div>
          <div class="field"><label>VPD (kPa)</label><input id="eVpd" type="number" step="0.01" value="${esc(e?.vpd||"")}"></div>
        </div>
      </details>
      <div class="field full"><label>Photo</label><input id="ePhoto" type="file" accept="image/*" capture="environment"></div>
      <div class="field full"><label>Note</label><textarea id="eNote" placeholder="Observation libre…">${esc(e?.note||"")}</textarea></div>
      <div class="field full actions form-actions"><button type="button" class="primary" id="saveEntry">Enregistrer</button>${e?`<button type="button" class="danger-btn" id="deleteEntry">Supprimer</button>`:""}</div>
    </div>`;
  openAppModal(false);

  qs("#eType").onchange=()=>{
    qs("#specificFields").innerHTML=actionFieldsHTML(qs("#eType").value,{});
  };

  qs("#saveEntry").onclick=async()=>{
    try{
      const type=qs("#eType").value;
      const details=readActionFields(type);
      const file=qs("#ePhoto").files[0];
      const photo=file?await blobToDataURL(file):e?.photo||null;
      const local=qs("#eDate").value;
      const date=local?new Date(local).toISOString():new Date().toISOString();
      const water=details.water||"";
      const ph=details.ph||"";
      const ec=details.ec||"";
      const height=details.height||"";
      const severity=details.severity||"";
      const product=details.product||"";
      await put("entries",{
        ...(e||{}),
        id:e?.id||uid(),
        plantId:qs("#ePlant").value,
        type,date,details,
        water,ph,ec,height,severity,product,
        temp:val("eTemp"),
        humidity:val("eHum"),
        vpd:val("eVpd"),
        note:qs("#eNote").value.trim(),
        photo,
        createdAt:e?.createdAt||new Date().toISOString(),
        updatedAt:new Date().toISOString()
      });
      qs("#modal").close();
      showToast("Action enregistrée");
      render();
    }catch(err){alert(err.message)}
  };
  if(e)qs("#deleteEntry").onclick=async()=>{
    if(confirm("Supprimer cette entrée ?")){
      await del("entries",e.id);
      qs("#modal").close();
      showToast("Entrée supprimée");
      render();
    }
  };
}
async function showEntryDetail(id){
  const e=await getOne("entries",id);
  if(e)showEntryForm(e);
}

async function showQuickAdd(forcedPlant=null){
  const plants=await all("plants");
  qs("#modalTitle").textContent="Ajouter une action";
  const actions=[
    ["watering","💧","Arrosage"],["nutrition","🧪","Engrais"],["repotting","🪴","Rempotage"],
    ["training","✂️","Taille"],["measurement","📏","Mesure"],["observation","👀","Observation"],
    ["pest","🐛","Traitement"],["harvest","🧺","Récolte"],["photo","📷","Photo"]
  ];
  qs("#modalBody").innerHTML=`
    <div class="action-picker">
      ${actions.map(([type,icon,label])=>`<button type="button" class="action-pick" data-action-type="${type}"><span>${icon}</span><strong>${label}</strong></button>`).join("")}
      <button type="button" class="action-pick add-plant-pick" id="qaPlant"><span>🌱</span><strong>Nouvelle plante</strong></button>
    </div>`;
  openAppModal(false);
  qsa("[data-action-type]").forEach(b=>b.onclick=()=>{
    const actionType=b.dataset.actionType;
    qs("#modal").close();
    setTimeout(()=>{
      if(forcedPlant) showEntryForm(null,forcedPlant,actionType);
      else choosePlantForEntry(actionType);
    },0);
  });
  qs("#qaPlant").onclick=()=>{qs("#modal").close();showPlantForm()};
}

async function showEnvironmentForm(id=null){
  const env=id?await getOne("environments",id):null;
  const inferred=inferEnvironmentType(env);
  qs("#modalTitle").textContent=env?"Modifier l’environnement":"Nouvel environnement";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field full env-type-preview">
        <div class="env-preview-icon" id="envPreviewIcon">${environmentTypeIcon(inferred)}</div>
      </div>
      <div class="field full"><label>Nom *</label><input id="envName" value="${esc(env?.name||"")}" placeholder="Ex. Tente 1×1 m"></div>
      <div class="field full"><label>Type</label><select id="envType">
        ${opt("indoor",inferred,"Intérieur")}${opt("outdoor",inferred,"Extérieur")}
      </select></div>
      <div class="field full"><label>Description</label><textarea id="envDescription" placeholder="Ex. Tente principale, potager extérieur…">${esc(env?.description||"")}</textarea></div>
      <div class="field full actions form-actions">
        <button type="button" class="primary" id="saveEnvironment">Enregistrer</button>
        ${env?`<button type="button" class="danger-btn" id="deleteEnvironment">Supprimer</button>`:""}
      </div>
    </div>`;
  openAppModal(false);
  qs("#envType").onchange=()=>qs("#envPreviewIcon").innerHTML=environmentTypeIcon(qs("#envType").value);
  qs("#saveEnvironment").onclick=async()=>{
    const name=qs("#envName").value.trim();
    if(!name)return alert("Donne un nom à l’environnement.");
    await put("environments",{
      ...(env||{}),id:env?.id||uid(),name,type:qs("#envType").value,
      description:qs("#envDescription").value.trim(),
      order:env?.order??99,createdAt:env?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
    });
    qs("#modal").close();showToast("Environnement enregistré");render();
  };
  if(env)qs("#deleteEnvironment").onclick=async()=>{
    const plants=await all("plants");
    const assigned=plants.filter(p=>p.environmentId===env.id);
    if(assigned.length && !confirm(`${assigned.length} plante(s) utilisent cet environnement. Elles deviendront « sans environnement ». Continuer ?`))return;
    for(const p of assigned){p.environmentId="";await put("plants",p)}
    await del("environments",env.id);
    qs("#modal").close();showToast("Environnement supprimé");render();
  };
}

async function showPlantForm(id=null,forcedEnv=null){
  const [p,environments]=await Promise.all([id?getOne("plants",id):Promise.resolve(null),all("environments")]);
  qs("#modalTitle").textContent=p?"Modifier la plante":"Nouvelle plante";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field full"><label>Nom *</label><input id="pName" value="${esc(p?.name||"")}" placeholder="Ex. Tomate 01"></div>
      <div class="field"><label>Espèce</label><input id="pSpecies" value="${esc(p?.species||"")}" placeholder="Tomate, basilic…"></div>
      <div class="field"><label>Variété</label><input id="pVariety" value="${esc(p?.variety||"")}" placeholder="Roma, Genovese…"></div>
      <div class="field"><label>Date de départ</label><input id="pStart" type="date" value="${p?.startDate?.slice(0,10)||""}"></div>
      <div class="field"><label>Stade</label><select id="pStage">${["Plantule","Croissance","Préfloraison","Floraison","Fructification","Maturation","Repos"].map(x=>`<option ${p?.stage===x?"selected":""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Volume du pot (L)</label><input id="pPot" type="number" step="0.1" value="${esc(p?.pot||"")}"></div>
      <div class="field"><label>Environnement</label><select id="pEnv"><option value="">Sans environnement</option>${environments.map(x=>`<option value="${x.id}" ${(p?.environmentId||forcedEnv)===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select></div>
      <div class="field full"><label>Substrat</label><input id="pSoil" value="${esc(p?.soil||"")}" placeholder="Terreau, coco, mélange…"></div>
      <div class="field full"><label>Photo</label><input id="pPhoto" type="file" accept="image/*" capture="environment"><div class="small">Facultatif. Max ~3,5 Mo par photo.</div></div>
      <div class="field full"><label>Notes</label><textarea id="pNotes" placeholder="Origine, particularités, objectifs…">${esc(p?.notes||"")}</textarea></div>
      <div class="field full actions form-actions"><button type="button" class="primary" id="savePlant">${p?"Enregistrer":"Créer la plante"}</button>${p?`<button type="button" class="danger-btn" id="deletePlant">Supprimer</button>`:""}</div>
    </div>`;
  openAppModal(false);
  qs("#savePlant").onclick=async()=>{
    try{
      const name=qs("#pName").value.trim();if(!name)return alert("Donne un nom à la plante.");
      const file=qs("#pPhoto").files[0]; const photo=file?await blobToDataURL(file):p?.photo||null;
      await put("plants",{
        ...(p||{}),id:p?.id||uid(),name,species:qs("#pSpecies").value.trim(),variety:qs("#pVariety").value.trim(),
        startDate:qs("#pStart").value,stage:qs("#pStage").value,pot:qs("#pPot").value,
        environmentId:qs("#pEnv").value,environment:"",soil:qs("#pSoil").value.trim(),notes:qs("#pNotes").value.trim(),
        photo,createdAt:p?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
      });
      qs("#modal").close();showToast("Plante enregistrée");render();
    }catch(e){alert(e.message)}
  };
  if(p)qs("#deletePlant").onclick=async()=>{
    if(confirm(`Supprimer ${p.name} et toutes ses entrées ?`)){
      const es=(await all("entries")).filter(e=>e.plantId===p.id);
      for(const e of es)await del("entries",e.id);
      await del("plants",p.id);
      qs("#modal").close();showToast("Plante supprimée");render();
    }
  };
}

function gardenPlantCard(p,entries,environments=[]){
  const env=environments.find(x=>x.id===p.environmentId);
  const d=ageDays(p.startDate);
  return `<button class="plant-card centered-card" data-plant="${p.id}" style="width:100%;text-align:left;color:inherit">
    ${plantPhotoHTML(p)}
    <div class="plant-card-copy">
      <h3>${esc(p.name)}</h3>
      <div class="compact-sub">
        ${p.stage?`<span>${esc(p.stage)}</span>`:""}${d!=null?`<span>J+${d}</span>`:""}${env?`<span>${esc(env.name)}</span>`:""}
      </div>
    </div>
    <span class="status-dot ${severityStatus(entries,p.id)==="ok"?"":severityStatus(entries,p.id)}"></span>
  </button>`;
}

async function renderGarden(app){
  const [plants,entries,environments,envEntries]=await Promise.all([all("plants"),all("entries"),all("environments"),all("envEntries")]);
  const phaseOptions=[...new Set(plants.map(p=>p.stage).filter(Boolean))];
  const environmentMap=new Map(environments.map(e=>[e.id,e]));
  const groupedPlants=list=>{
    const groups={};
    list.forEach(p=>{
      const env=environmentMap.get(p.environmentId);
      const key=env?env.name:"Sans environnement";
      if(!groups[key])groups[key]={env,items:[]};
      groups[key].items.push(p);
    });
    return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],"fr"));
  };

  app.innerHTML=`
    <div class="garden-shell">
      <section class="garden-segment">
        <div class="segmented" id="gardenSegment">
          <button data-mode="plants" class="${gardenMode==="plants"?"active":""}">🌱 Plantes</button>
          <button data-mode="environments" class="${gardenMode==="environments"?"active":""}">Environnements</button>
        </div>
      </section>

      <section id="gardenPlants" class="${gardenMode==="plants"?"":"hidden"}">
        <div class="filter-row mobile-filter-row">
          <div class="field"><label>Phase</label><select id="gardenPhaseFilter"><option value="">Toutes</option>${phaseOptions.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></div>
          <div class="field"><label>Environnement</label><select id="gardenEnvFilter"><option value="">Tous</option>${environments.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join("")}<option value="__none">Sans environnement</option></select></div>
        </div>
        <div id="gardenPlantsList" class="card-list"></div>
      </section>

      <section id="gardenEnvironments" class="${gardenMode==="environments"?"":"hidden"}">
        <div class="environment-toolbar-v16">
          <button class="primary" id="gardenAddEnvironment">＋ Nouvel environnement</button>
          <button class="secondary" id="gardenAddEnvJournal">📝 Journal d’environnement</button>
        </div>
        <div id="gardenEnvironmentList" class="environment-list-gap"></div>
      </section>

      <button class="fab" id="gardenFab" aria-label="Ajouter">＋</button>
    </div>`;

  const renderGroupedPlants=()=>{
    const phase=qs("#gardenPhaseFilter")?.value||"", envFilter=qs("#gardenEnvFilter")?.value||"";
    const filtered=plants.filter(p=>(!phase||p.stage===phase)&&(!envFilter||(envFilter==="__none"?!p.environmentId:p.environmentId===envFilter)));
    const groups=groupedPlants(filtered);
    qs("#gardenPlantsList").innerHTML=groups.length?groups.map(([groupName,group])=>`
      <div class="env-group">
        <div class="group-header"><h3>${group.env?environmentTypeIcon(inferEnvironmentType(group.env)):""} <span>${esc(groupName)}</span></h3><span class="small">${group.items.length}</span></div>
        <div class="plant-list-compact">${group.items.map(p=>gardenPlantCard(p,entries,environments)).join("")}</div>
      </div>`).join(""):`<div class="gwj-empty">Aucune plante avec ces filtres</div>`;
    bindPlantCards();
  };
  const renderEnvironmentCards=()=>{
    const sorted=[...environments].sort((a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name,"fr"));
    qs("#gardenEnvironmentList").innerHTML=sorted.length?sorted.map(env=>{
      const envPlants=plants.filter(p=>p.environmentId===env.id);
      const last=envEntries.filter(x=>x.environmentId===env.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      return `<div class="environment-card environment-card-v16">
        <div class="environment-main">
          ${environmentIconBlock(env)}
          <div class="environment-copy"><h3>${esc(env.name)}</h3><p>${envPlants.length} plante${envPlants.length>1?"s":""} • ${inferEnvironmentType(env)==="outdoor"?"Extérieur":"Intérieur"}</p></div>
          <button class="icon-btn env-more" data-edit-env="${env.id}" aria-label="Modifier">⋯</button>
        </div>
        <div class="badges centered-badges">
          ${last?.temp?`<span class="badge">🌡️ ${esc(last.temp)} °C</span>`:""}${last?.humidity?`<span class="badge">💧 ${esc(last.humidity)} %</span>`:""}${last?.vpd?`<span class="badge">VPD ${esc(last.vpd)}</span>`:""}${last?.lightHours?`<span class="badge">💡 ${esc(last.lightHours)} h</span>`:""}
        </div>
        <div class="environment-actions">
          <button class="secondary" type="button" data-open-env="${env.id}">Ouvrir</button>
          <button class="secondary" type="button" data-manage-env="${env.id}">Plantes</button>
        </div>
      </div>`;
    }).join(""):`<div class="gwj-empty">Aucun environnement</div>`;
    qsa("[data-edit-env]").forEach(b=>b.onclick=()=>showEnvironmentForm(b.dataset.editEnv));
    qsa("[data-open-env]").forEach(b=>b.onclick=()=>showEnvironmentDetail(b.dataset.openEnv));
    qsa("[data-manage-env]").forEach(b=>b.onclick=()=>showEnvironmentPlantManager(b.dataset.manageEnv));
  };
  renderGroupedPlants(); renderEnvironmentCards();
  qsa("#gardenSegment button").forEach(btn=>btn.onclick=()=>{gardenMode=btn.dataset.mode;render()});
  qs("#gardenPhaseFilter").onchange=renderGroupedPlants;
  qs("#gardenEnvFilter").onchange=renderGroupedPlants;
  qs("#gardenAddEnvironment").onclick=()=>showEnvironmentForm();
  qs("#gardenAddEnvJournal").onclick=()=>chooseEnvironmentForJournal();
  qs("#gardenFab").onclick=()=>gardenMode==="plants"?showPlantForm():showEnvironmentForm();
}

async function showPlantDetail(id){
  window.__plantSelectedDate=window.__plantSelectedDate||{};
  const [p,entries,environments]=await Promise.all([getOne("plants",id),all("entries"),all("environments")]);if(!p)return;
  const env=environments.find(x=>x.id===p.environmentId);
  const es=entries.filter(e=>e.plantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const selected=window.__plantSelectedDate[id]||(es[0]?isoDay(es[0].date):isoDay(new Date()));
  const selectedEntries=es.filter(e=>isoDay(e.date)===selected);
  qs("#modalTitle").textContent=p.name;
  qs("#modalBody").innerHTML=`
    <div class="detail-page">
      <div class="detail-hero">
        ${p.photo?`<img src="${p.photo}" alt="">`:""}
        <div class="detail-top-actions"><button type="button" class="overlay-btn" id="detailBack">‹</button><button type="button" class="overlay-btn" id="detailEdit">⋯</button></div>
        <button type="button" class="photo-fab" id="detailPhotoFab">📷</button>
        <div class="detail-hero-overlay">
          <h2>${esc(p.name)}</h2>
          <div class="detail-meta">${p.stage?`<span class="badge">🌱 ${esc(p.stage)}</span>`:""}${p.variety?`<span class="badge">🧬 ${esc(p.variety)}</span>`:""}${env?`<span class="badge">${esc(env.name)}</span>`:""}</div>
          <div class="detail-age">🕘 ${ageDays(p.startDate)!=null?`${ageDays(p.startDate)} jours • semaine ${Math.max(1,Math.ceil(ageDays(p.startDate)/7))}`:"Date non renseignée"}</div>
        </div>
      </div>
      ${renderGWJWeek(es,new Date(selected),selected)}
      <div class="detail-action-grid">
        <button type="button" class="action-tile" id="detailAction"><span class="icon">⚡</span>Action</button>
        <button type="button" class="action-tile" id="detailPhoto"><span class="icon">📷</span>Photo</button>
        <button type="button" class="action-tile" id="detailMeasure"><span class="icon">📏</span>Mesure</button>
        <button type="button" class="action-tile" id="detailRepot"><span class="icon">🪴</span>Rempotage</button>
      </div>
      <div class="section-caption">Actions rapides</div>
      <div class="quick-action-grid">
        <button type="button" class="action-tile" id="qaWater"><span class="icon">💧</span>Arrosage</button>
        <button type="button" class="action-tile" id="qaFeed"><span class="icon">🧪</span>Engrais</button>
        <button type="button" class="action-tile" id="qaTrim"><span class="icon">✂️</span>Taille</button>
        <button type="button" class="action-tile" id="qaPest"><span class="icon">🐛</span>Traitement</button>
      </div>
      <div class="section-caption">Notes</div>
      <div class="note-card"><textarea id="plantNoteArea" placeholder="Notes sur cette plante…">${esc(p.notes||"")}</textarea><div class="note-inline-actions"><button type="button" class="primary" id="savePlantNote">Enregistrer</button></div></div>
      <div class="section-caption">Journal du ${fmtDate(selected)}</div>
      ${selectedEntries.length?`<div class="card-list">${(await Promise.all(selectedEntries.slice(0,8).map(e=>entryCard(e,[p])))).join("")}</div>`:`<div class="today-empty">Aucune entrée pour cette date</div>`}
      <div class="section-caption">Historique récent</div>
      <div class="card-list">${es.length?(await Promise.all(es.slice(0,5).map(e=>entryCard(e,[p])))).join(""):`<div class="gwj-empty">Aucune entrée</div>`}</div>
    </div>`;
  openAppModal(true);
  qs("#detailBack").onclick=()=>qs("#modal").close();
  qs("#detailEdit").onclick=()=>{qs("#modal").close();showPlantForm(p.id)};
  qs("#detailAction").onclick=()=>{qs("#modal").close();showQuickAdd(p.id)};
  qs("#detailPhoto").onclick=qs("#detailPhotoFab").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"photo"),0)};
  qs("#detailMeasure").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"measurement"),0)};
  qs("#detailRepot").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"repotting"),0)};
  qs("#qaWater").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"watering"),0)};
  qs("#qaFeed").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"nutrition"),0)};
  qs("#qaTrim").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"training"),0)};
  qs("#qaPest").onclick=()=>{qs("#modal").close();setTimeout(()=>showEntryForm(null,p.id,"pest"),0)};
  qs("#savePlantNote").onclick=async()=>{await savePlantNotes(p.id,qs("#plantNoteArea").value.trim());showToast("Notes enregistrées")};
  qsa("[data-week-day]").forEach(b=>b.onclick=()=>{window.__plantSelectedDate[id]=b.dataset.weekDay;showPlantDetail(id)});
  qsa("[data-entry]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEntryDetail(b.dataset.entry)});
}

async function showEnvironmentEntryForm(existing=null,forcedEnv=null){
  const envs=await all("environments");if(!envs.length)return showToast("Crée d’abord un environnement");
  const e=existing;
  const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  qs("#modalTitle").textContent=e?"Modifier le journal environnement":"Journal d’environnement";
  qs("#modalBody").innerHTML=`
    <div class="form-grid">
      <div class="field full"><label>Environnement</label><select id="eeEnv">${envs.map(env=>`<option value="${env.id}" ${(e?.environmentId||forcedEnv)===env.id?"selected":""}>${esc(env.name)}</option>`).join("")}</select></div>
      <div class="field full"><label>Date et heure</label><input id="eeDate" type="datetime-local" value="${e?.date?new Date(new Date(e.date)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):nowLocal}"></div>
      <div class="form-section">Conditions</div>
      <div class="field"><label>Température (°C)</label><input id="eeTemp" type="number" step="0.1" value="${esc(e?.temp||"")}"></div>
      <div class="field"><label>Humidité (%)</label><input id="eeHumidity" type="number" step="0.1" value="${esc(e?.humidity||"")}"></div>
      <div class="field"><label>VPD (kPa)</label><input id="eeVpd" type="number" step="0.01" value="${esc(e?.vpd||"")}"></div>
      <div class="field"><label>Heures de lumière</label><input id="eeLightHours" type="number" step="0.1" value="${esc(e?.lightHours||"")}"></div>
      <div class="field"><label>Puissance lampe (%)</label><input id="eeLightPower" type="number" step="1" min="0" max="100" value="${esc(e?.lightPower||"")}"></div>
      <div class="field"><label>PPFD (µmol/m²/s)</label><input id="eePpfd" type="number" step="1" value="${esc(e?.ppfd||"")}"></div>
      <div class="form-section">Dimensions</div>
      <div class="field"><label>Largeur (cm)</label><input id="eeWidth" type="number" step="0.1" value="${esc(e?.width||"")}"></div>
      <div class="field"><label>Profondeur (cm)</label><input id="eeDepth" type="number" step="0.1" value="${esc(e?.depth||"")}"></div>
      <div class="field"><label>Hauteur (cm)</label><input id="eeHeight" type="number" step="0.1" value="${esc(e?.height||"")}"></div>
      <div class="field full"><label>Note</label><textarea id="eeNote" placeholder="Ventilation, changements, météo, matériel…">${esc(e?.note||"")}</textarea></div>
      <div class="field full actions form-actions"><button type="button" class="primary" id="saveEnvEntry">Enregistrer</button>${e?`<button type="button" class="danger-btn" id="deleteEnvEntry">Supprimer</button>`:""}</div>
    </div>`;
  openAppModal(false);
  qs("#saveEnvEntry").onclick=async()=>{
    const local=qs("#eeDate").value;
    await put("envEntries",{
      ...(e||{}),id:e?.id||uid(),environmentId:qs("#eeEnv").value,date:local?new Date(local).toISOString():new Date().toISOString(),
      temp:val("eeTemp"),humidity:val("eeHumidity"),vpd:val("eeVpd"),lightHours:val("eeLightHours"),
      lightPower:val("eeLightPower"),ppfd:val("eePpfd"),width:val("eeWidth"),depth:val("eeDepth"),height:val("eeHeight"),
      note:qs("#eeNote").value.trim(),createdAt:e?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
    });
    qs("#modal").close();showToast("Journal environnement enregistré");render();
  };
  if(e)qs("#deleteEnvEntry").onclick=async()=>{
    if(confirm("Supprimer cette entrée environnement ?")){
      await del("envEntries",e.id);qs("#modal").close();showToast("Entrée supprimée");render();
    }
  };
}
async function showEnvironmentEntryDetail(id){const e=await getOne("envEntries",id);if(e)showEnvironmentEntryForm(e,e.environmentId)}

async function showEnvironmentPlantManager(envId){
  const [env,plants,environments]=await Promise.all([getOne("environments",envId),all("plants"),all("environments")]);if(!env)return;
  qs("#modalTitle").textContent=`Plantes • ${env.name}`;
  qs("#modalBody").innerHTML=`<div class="manage-plant-list">
    <button type="button" class="primary add-new-in-env" id="createPlantInEnv">＋ Créer une plante dans cet environnement</button>
    ${plants.length?plants.map(p=>{
      const currentEnv=environments.find(e=>e.id===p.environmentId),inThis=p.environmentId===envId;
      return `<div class="manage-plant-card"><div class="manage-plant-head">${plantPhotoHTML(p)}<div><strong>${esc(p.name)}</strong><div class="small">${currentEnv?`Actuellement : ${esc(currentEnv.name)}`:"Sans environnement"}</div></div></div>
        <div class="manage-plant-actions">${inThis?`<button type="button" class="secondary" data-remove-plant="${p.id}">Retirer</button>`:`<button type="button" class="primary" data-move-plant="${p.id}">Déplacer ici</button>`}<button type="button" class="secondary" data-open-plant="${p.id}">Ouvrir</button></div></div>`;
    }).join(""):`<div class="gwj-empty">Aucune plante</div>`}
  </div>`;
  openAppModal(false);
  qs("#createPlantInEnv").onclick=()=>{qs("#modal").close();showPlantForm(null,envId)};
  qsa("[data-move-plant]").forEach(b=>b.onclick=async()=>{const p=await getOne("plants",b.dataset.movePlant);p.environmentId=envId;p.updatedAt=new Date().toISOString();await put("plants",p);showToast("Plante déplacée");showEnvironmentPlantManager(envId)});
  qsa("[data-remove-plant]").forEach(b=>b.onclick=async()=>{const p=await getOne("plants",b.dataset.removePlant);p.environmentId="";p.updatedAt=new Date().toISOString();await put("plants",p);showToast("Plante retirée");showEnvironmentPlantManager(envId)});
  qsa("[data-open-plant]").forEach(b=>b.onclick=()=>{qs("#modal").close();showPlantDetail(b.dataset.openPlant)});
}

async function showEnvironmentDetail(id){
  window.__envSelectedDate=window.__envSelectedDate||{};
  const [env,plants,envEntries]=await Promise.all([getOne("environments",id),all("plants"),all("envEntries")]);if(!env)return;
  const assigned=plants.filter(p=>p.environmentId===id);
  const es=envEntries.filter(e=>e.environmentId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const selected=window.__envSelectedDate[id]||(es[0]?isoDay(es[0].date):isoDay(new Date()));
  const selectedEntries=es.filter(e=>isoDay(e.date)===selected),latest=es[0];
  qs("#modalTitle").textContent=env.name;
  qs("#modalBody").innerHTML=`
    <div class="detail-page">
      <div class="environment-detail-hero">
        <div class="detail-top-actions"><button type="button" class="overlay-btn" id="envBack">‹</button><button type="button" class="overlay-btn" id="envEdit">⋯</button></div>
        <div class="environment-big-icon">${environmentTypeIcon(inferEnvironmentType(env))}</div>
        <h2>${esc(env.name)}</h2>
        <div class="detail-meta centered-badges"><span class="badge">${inferEnvironmentType(env)==="outdoor"?"Extérieur":"Intérieur"}</span><span class="badge">${assigned.length} plante${assigned.length>1?"s":""}</span>${latest?.temp?`<span class="badge">🌡️ ${esc(latest.temp)} °C</span>`:""}${latest?.humidity?`<span class="badge">💧 ${esc(latest.humidity)} %</span>`:""}${latest?.vpd?`<span class="badge">VPD ${esc(latest.vpd)}</span>`:""}</div>
        ${env.description?`<p>${esc(env.description)}</p>`:""}
      </div>
      ${renderGWJWeek(es,new Date(selected),selected)}
      <div class="detail-action-grid">
        <button type="button" class="action-tile" id="envJournal"><span class="icon">📝</span>Journal</button>
        <button type="button" class="action-tile" id="envManagePlants"><span class="icon">🌱</span>Gérer plantes</button>
        <button type="button" class="action-tile" id="envAddPlant"><span class="icon">＋</span>Nouvelle plante</button>
        <button type="button" class="action-tile" id="envEdit2"><span class="icon">✏️</span>Modifier</button>
      </div>
      <div class="section-caption">Plantes</div>
      <div class="card-list">${assigned.length?assigned.map(p=>gardenPlantCard(p,[],[env])).join(""):`<div class="gwj-empty">Aucune plante assignée</div>`}</div>
      <div class="section-caption">Journal du ${fmtDate(selected)}</div>
      <div class="card-list">${selectedEntries.length?selectedEntries.map(environmentEntryCard).join(""):`<div class="today-empty">Aucune entrée pour cette date</div>`}</div>
      <div class="section-caption">Historique récent</div>
      <div class="card-list">${es.length?es.slice(0,5).map(environmentEntryCard).join(""):`<div class="gwj-empty">Aucun journal environnement</div>`}</div>
    </div>`;
  openAppModal(true);
  qs("#envBack").onclick=()=>qs("#modal").close();
  qs("#envEdit").onclick=qs("#envEdit2").onclick=()=>{qs("#modal").close();showEnvironmentForm(id)};
  qs("#envJournal").onclick=()=>{qs("#modal").close();showEnvironmentEntryForm(null,id)};
  qs("#envManagePlants").onclick=()=>{qs("#modal").close();showEnvironmentPlantManager(id)};
  qs("#envAddPlant").onclick=()=>{qs("#modal").close();showPlantForm(null,id)};
  qsa("[data-week-day]").forEach(b=>b.onclick=()=>{window.__envSelectedDate[id]=b.dataset.weekDay;showEnvironmentDetail(id)});
  qsa("[data-plant]").forEach(b=>b.onclick=()=>{qs("#modal").close();showPlantDetail(b.dataset.plant)});
  qsa("[data-env-entry]").forEach(b=>b.onclick=()=>{qs("#modal").close();showEnvironmentEntryDetail(b.dataset.envEntry)});
}

async function ensureDefaultEnvironments(){
  let envs=await all("environments");
  const defaults=[
    {id:"env-propagation",name:"Tente de propagation",type:"indoor",description:"Zone dédiée aux semis, boutures et jeunes plantes.",order:1},
    {id:"env-tente-1x1",name:"Tente 1×1 m",type:"indoor",description:"Tente principale de culture indoor.",order:2},
    {id:"env-potager",name:"Potager",type:"outdoor",description:"Plantes cultivées au potager / en extérieur.",order:3}
  ];
  for(const d of defaults){
    const found=envs.find(e=>e.id===d.id||e.name.toLowerCase()===d.name.toLowerCase());
    if(!found)await put("environments",{...d,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  envs=await all("environments");
  for(const env of envs){
    if(!env.type){
      env.type=inferEnvironmentType(env);
      env.updatedAt=new Date().toISOString();
      await put("environments",env);
    }
  }
  const plants=await all("plants");
  for(const p of plants){
    if(p.environmentId)continue;
    const legacy=(p.environment||"").trim().toLowerCase();
    if(!legacy)continue;
    let match=envs.find(e=>e.name.toLowerCase()===legacy);
    if(!match){
      match={id:"env-"+uid(),name:p.environment,type:inferEnvironmentType({name:p.environment}),description:"Importé depuis l’ancienne version.",order:90,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await put("environments",match);envs.push(match);
    }
    p.environmentId=match.id;await put("plants",p);
  }
}

(async function init(){
  db=await openDB(); await ensureDefaultEnvironments(); await seedDemo();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  render();
})();
