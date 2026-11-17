"use strict";
/* MAVIX · código compartido por index.html, panel.html y admin.html */
const $=i=>document.getElementById(i),DAY=864e5;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CIU=["Lima","Arequipa","Cusco","Juliaca","Puno","Trujillo","Piura","Chiclayo","Huancayo"];
const S={me:null,prof:null,cats:[],wa:"51900000000",pr:{3:3,7:5,10:7},ciu:localStorage.getItem("mx_ciu")||""};
const isAdm=()=>!!S.prof&&S.prof.role==="admin";
const money=p=>p?"S/ "+Number(p).toLocaleString("es-PE"):"Consultar";
const cat=id=>S.cats.find(c=>c.id===id)||{emoji:"📌",nombre:id};
const fdate=t=>{const d=new Date(t);return d.toLocaleDateString("es-PE",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})};
function hace(t){const h=Math.floor((Date.now()-new Date(t))/36e5);if(h<1)return"Hace minutos";if(h<24)return"Hace "+h+" h";const d=Math.floor(h/24);return d===1?"Ayer":"Hace "+d+" días"}
function toast(m){const t=$("toast");if(!t)return alert(m);t.textContent=m;t.classList.remove("hide");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.add("hide"),3200)}
const fail=e=>{console.error(e);toast("Error: "+(e.message||e))};
const opts=(sel,list,first)=>{sel.innerHTML=(first?`<option value="">${first}</option>`:"")+list.map(v=>`<option value="${esc(v.id||v)}">${esc(v.nombre||v)}</option>`).join("")};
function fatal(e){console.error(e);const m=document.querySelector("main");if(m){m.classList.remove("hide");m.innerHTML='<div class="em">No se pudo leer la base de datos. Revisa que ejecutaste schema.sql y que config.js tiene tu URL y clave correctas.</div>'}}

if(!window.CFG||!CFG.url||CFG.url.includes("TU-PROYECTO")){
  document.body.innerHTML='<p style="padding:24px;font-family:system-ui,sans-serif">Falta conectar Supabase: edita <b>config.js</b> con tu URL y tu clave anon.</p>';
  throw new Error("Configura config.js");
}
const sb=supabase.createClient(CFG.url,CFG.key);
const logh=t=>sb.from("historial").insert({texto:t});

async function loadCats(){const{data,error}=await sb.from("categorias").select("*").order("nombre");if(error)throw error;S.cats=data||[]}
async function loadCfg(){const{data,error}=await sb.from("config").select("*");if(error)throw error;(data||[]).forEach(r=>{if(r.clave==="wa")S.wa=r.valor;if(r.clave==="precios")S.pr=r.valor})}
async function loadProfile(session){
  S.me=session?session.user:null;S.prof=null;
  if(S.me){const{data}=await sb.from("profiles").select("*").eq("id",S.me.id).maybeSingle();S.prof=data}
}
async function boot(){await Promise.all([loadCats(),loadCfg()]);const{data}=await sb.auth.getSession();await loadProfile(data.session)}
async function salir(){await sb.auth.signOut();location.href="index.html"}

/* Mensaje que llega al WhatsApp del administrador */
function waLink(r,usuario){
  const m=`*Solicitud MAVIX*\nUsuario: ${usuario}\nTítulo: ${r.titulo}\nCategoría: ${cat(r.cat).nombre}\nCiudad: ${r.ciudad}\nPrecio: ${r.precio?"S/ "+r.precio:"No indicado"}\nDuración: ${r.dias} días (S/ ${S.pr[r.dias]})\nLlamadas: ${r.tel}\nWhatsApp: ${r.wa}\nFotos: ${(r.fotos||[]).length}\nDescripción: ${r.descripcion}${r.nota?"\nNota: "+r.nota:""}`;
  return`https://wa.me/${S.wa}?text=${encodeURIComponent(m)}`;
}
function abrir(url){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.click()}

/* Formulario de anuncio (lo usan el panel de usuario y el de administrador) */
function mountForm(el,admin,done){
  let files=[];
  el.innerHTML=`<div class="f" style="padding:0">
   <div class="r"><label>Categoría<select id="fCat"></select></label><label>Ciudad<select id="fCiu"></select></label></div>
   <label>Título<input id="fTit" maxlength="70"></label>
   <label>Descripción<textarea id="fDes" rows="3" maxlength="400"></textarea></label>
   <div class="r"><label>Precio en S/ (opcional)<input id="fPre" inputmode="numeric"></label><label>Duración<select id="fDur"></select></label></div>
   <label>Número para llamadas<input id="fTel" inputmode="numeric" maxlength="9" placeholder="9 dígitos"></label>
   <label style="font-weight:400"><span><input type="checkbox" id="fSame" checked> Usar el mismo número para WhatsApp</span></label>
   <label id="wbox" class="hide">Número de WhatsApp<input id="fWa" inputmode="numeric" maxlength="9" placeholder="9 dígitos"></label>
   <label>Fotos opcionales (máximo 3)<input id="fFot" type="file" accept="image/*" multiple></label><div class="pre" id="prev"></div>
   <label>Nota para el administrador<input id="fNot" maxlength="200"></label>
   <p class="err" id="fErr"></p>
   <button class="b p" id="goReq">${admin?"Publicar ahora":"Enviar solicitud por WhatsApp"}</button></div>`;
  opts($("fCat"),S.cats);opts($("fCiu"),CIU);if(S.ciu)$("fCiu").value=S.ciu;
  $("fDur").innerHTML=[3,7,10].map(d=>`<option value="${d}">${d} días${admin?"":" · S/ "+S.pr[d]}</option>`).join("");
  if(admin)$("fNot").closest("label").classList.add("hide");
  $("fSame").onchange=e=>$("wbox").classList.toggle("hide",e.target.checked);
  $("fFot").onchange=e=>{
    files=[...e.target.files].slice(0,3);if(e.target.files.length>3)toast("Solo se usan las primeras 3 fotos");
    $("prev").innerHTML=files.map(f=>`<img alt="" src="${URL.createObjectURL(f)}">`).join("");
  };
  const shrink=f=>new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{const s=Math.min(1,900/im.width),c=document.createElement("canvas");c.width=im.width*s;c.height=im.height*s;c.getContext("2d").drawImage(im,0,0,c.width,c.height);c.toBlob(res,"image/jpeg",.75)};im.src=r.result};r.readAsDataURL(f)});
  async function subir(){
    const out=[];
    for(const f of files){const b=await shrink(f),p=`${S.me.id}/${crypto.randomUUID()}.jpg`;
      const{error}=await sb.storage.from("fotos").upload(p,b,{contentType:"image/jpeg"});if(error)throw error;
      out.push(sb.storage.from("fotos").getPublicUrl(p).data.publicUrl)}
    return out;
  }
  $("goReq").onclick=async()=>{
    const t=$("fTit").value.trim(),d=$("fDes").value.trim(),tel=$("fTel").value.replace(/\D/g,""),wa=$("fSame").checked?tel:$("fWa").value.replace(/\D/g,""),E=$("fErr");
    if(t.length<5)return E.textContent="Escribe un título de al menos 5 caracteres.";
    if(d.length<10)return E.textContent="Describe el anuncio con al menos 10 caracteres.";
    if(!/^9\d{8}$/.test(tel)||!/^9\d{8}$/.test(wa))return E.textContent="Los números deben tener 9 dígitos y empezar con 9.";
    const dias=+$("fDur").value,pre=$("fPre").value.replace(/\D/g,""),btn=$("goReq");
    btn.disabled=true;E.textContent="Enviando…";
    try{
      const fotos=await subir(),base={cat:$("fCat").value,ciudad:$("fCiu").value,titulo:t,descripcion:d,precio:pre?+pre:null,tel,wa,fotos};
      if(admin){
        await sb.from("anuncios").insert({...base,expira:new Date(Date.now()+dias*DAY).toISOString()}).throwOnError();
        await logh("Admin publicó: "+t);toast("Anuncio publicado");
      }else{
        const nota=$("fNot").value.trim();
        await sb.from("solicitudes").insert({...base,user_id:S.me.id,nota,dias}).throwOnError();
        abrir(waLink({...base,nota,dias},S.prof.username));
        toast("Solicitud enviada. El administrador verificará tu pago.");
      }
      mountForm(el,admin,done);if(done)done();
    }catch(err){E.textContent="No se pudo enviar: "+(err.message||err);btn.disabled=false}
  };
}
