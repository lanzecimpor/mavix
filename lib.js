"use strict";
/* MAVIX · código compartido por index.html, panel.html y admin.html */
const $=i=>document.getElementById(i),DAY=864e5;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CIU=["Cusco","Sicuani","Juliaca","Espinar","Santo Tomás","Puerto Maldonado"];
const S={me:null,prof:null,cats:[],wa:"51910680644",yape:"910680644",pr:{3:3,7:5,10:7},ciu:localStorage.getItem("mx_ciu")||""};
const isAdm=()=>!!S.prof&&S.prof.role==="admin";
const money=p=>p?"S/ "+Number(p).toLocaleString("es-PE"):"Consultar";
const fmtTel=n=>String(n).replace(/\D/g,"").replace(/(\d{3})(?=\d)/g,"$1 ");
const cat=id=>S.cats.find(c=>c.id===id)||{emoji:"📌",nombre:id};
const catName=id=>{const c=cat(id),p=c.padre?cat(c.padre):null;return p?p.nombre+" › "+c.nombre:c.nombre};
function catOptions(){
  let o="";
  S.cats.filter(c=>!c.padre).forEach(r=>{const h=S.cats.filter(c=>c.padre===r.id);
    if(h.length)h.forEach(c=>o+=`<option value="${esc(c.id)}">${esc(r.nombre+" › "+c.nombre)}</option>`);
    else o+=`<option value="${esc(r.id)}">${esc(r.nombre)}</option>`});
  return o;
}
const fdate=t=>{const d=new Date(t);return d.toLocaleDateString("es-PE",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})};
function hace(t){const h=Math.floor((Date.now()-new Date(t))/36e5);if(h<1)return"Hace minutos";if(h<24)return"Hace "+h+" h";const d=Math.floor(h/24);return d===1?"Ayer":"Hace "+d+" días"}
function toast(m){const t=$("toast");if(!t)return alert(m);t.textContent=m;t.classList.remove("hide");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.add("hide"),3200)}
const fail=e=>{console.error(e);toast("Error: "+(e.message||e))};
const opts=(sel,list,first)=>{sel.innerHTML=(first?`<option value="">${first}</option>`:"")+list.map(v=>`<option value="${esc(v.id||v)}">${esc(v.nombre||v)}</option>`).join("")};
function fatal(e){console.error(e);const m=document.querySelector("main");if(m){m.classList.remove("hide");m.innerHTML='<div class="em">No se pudo leer la base de datos. Revisa que ejecutaste schema.sql y que config.js tiene tu URL y clave correctas.</div>'}}
async function copiar(t){
  try{await navigator.clipboard.writeText(t)}catch(e){const x=document.createElement("textarea");x.value=t;document.body.appendChild(x);x.select();try{document.execCommand("copy")}catch(_){}x.remove()}
  toast("Número copiado: "+t);
}
function abrir(url){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.click()}

if(!window.CFG||!CFG.url||CFG.url.includes("TU-PROYECTO")){
  document.body.innerHTML='<p style="padding:24px;font-family:system-ui,sans-serif">Falta conectar Supabase: edita <b>config.js</b> con tu URL y tu clave anon.</p>';
  throw new Error("Configura config.js");
}
const sb=supabase.createClient(CFG.url,CFG.key);
const logh=t=>sb.from("historial").insert({texto:t});

async function loadCats(){const{data,error}=await sb.from("categorias").select("*").order("orden").order("nombre");if(error)throw error;S.cats=data||[]}
async function loadCfg(){
  const{data,error}=await sb.from("config").select("*");if(error)throw error;
  (data||[]).forEach(r=>{if(r.clave==="wa")S.wa=r.valor;if(r.clave==="yape")S.yape=r.valor;if(r.clave==="precios")S.pr=r.valor;
    if(r.clave==="ciudades"&&Array.isArray(r.valor)&&r.valor.length)CIU.splice(0,CIU.length,...r.valor)});
  if(!CIU.includes(S.ciu))S.ciu="";
}
async function loadProfile(session){
  S.me=session?session.user:null;S.prof=null;
  if(S.me){const{data}=await sb.from("profiles").select("*").eq("id",S.me.id).maybeSingle();S.prof=data}
}
async function boot(){await Promise.all([loadCats(),loadCfg()]);const{data}=await sb.auth.getSession();await loadProfile(data.session)}
async function salir(){await sb.auth.signOut();location.href="index.html"}

/* Iniciar sesión con usuario o correo */
async function entrar(k,pass){
  k=k.trim();
  if(!k.includes("@")){const{data}=await sb.rpc("email_de_usuario",{u:k});if(!data)return"Usuario o contraseña incorrectos.";k=data}
  const{data,error}=await sb.auth.signInWithPassword({email:k,password:pass});
  if(error)return/confirm/i.test(error.message)?"Confirma tu correo antes de entrar.":"Usuario o contraseña incorrectos.";
  await loadProfile(data.session);return null;
}

/* Mensajes de WhatsApp */
function waActivar(r){
  const m=`Hola, solicito la activación de mi publicación en MAVIX.\n\nCódigo: ${r.codigo}\nTítulo: ${r.titulo}\nCiudad: ${r.ciudad}\nDías: ${r.dias}\nMonto pagado: S/ ${S.pr[r.dias]} (Yape)\n\nAdjunto la captura de mi pago.`;
  return`https://wa.me/${S.wa}?text=${encodeURIComponent(m)}`;
}
const waCliente=(tel,txt)=>`https://wa.me/51${String(tel).replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`;

/* Formulario de anuncio. admin=true publica directo; si no, crea la solicitud y llama done(solicitud) */
function mountForm(el,admin,done){
  let files=[];
  el.innerHTML=`<div class="f" style="padding:0">
   <label>1. Ciudad<select id="fCiu"></select></label>
   <label>2. Categoría<select id="fCat"></select></label>
   <label>3. Título<input id="fTit" maxlength="70" placeholder="Ej: Casa en venta en Sicuani"></label>
   <label>4. Descripción<textarea id="fDes" rows="3" maxlength="400"></textarea></label>
   <label>5. Número para llamadas<input id="fTel" inputmode="numeric" maxlength="9" placeholder="9 dígitos"></label>
   <button type="button" class="b pillbtn" id="fSame" aria-pressed="true">✓ Usar también como WhatsApp</button>
   <label id="wbox" class="hide">Número de WhatsApp<input id="fWa" inputmode="numeric" maxlength="9" placeholder="9 dígitos"></label>
   <label>Precio en S/ (opcional)<input id="fPre" inputmode="numeric"></label>
   <label>Fotos opcionales (máximo 3)<input id="fFot" type="file" accept="image/*" multiple></label><div class="pre" id="prev"></div>
   <label>Nota para el administrador (opcional)<input id="fNot" maxlength="200"></label>
   <label>Duración${admin?"":" y precio a pagar"}<select id="fDur"></select></label>
   <p class="err" id="fErr"></p>
   <button class="b p" id="goReq">${admin?"Publicar ahora":"Enviar solicitud"}</button></div>`;
  opts($("fCiu"),CIU,"Elige tu ciudad");if(S.ciu)$("fCiu").value=S.ciu;
  $("fCat").innerHTML=catOptions();
  $("fDur").innerHTML=[3,7,10].map(d=>`<option value="${d}"${d===7?" selected":""}>${d} días${admin?"":" · S/ "+S.pr[d]}</option>`).join("");
  if(admin)$("fNot").closest("label").classList.add("hide");
  $("fSame").onclick=()=>{const on=$("fSame").getAttribute("aria-pressed")!=="true";$("fSame").setAttribute("aria-pressed",on);$("fSame").textContent=(on?"✓ ":"")+"Usar también como WhatsApp";$("wbox").classList.toggle("hide",on)};
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
    const E=$("fErr"),ci=$("fCiu").value,t=$("fTit").value.trim(),d=$("fDes").value.trim(),tel=$("fTel").value.replace(/\D/g,""),same=$("fSame").getAttribute("aria-pressed")==="true",wa=same?tel:$("fWa").value.replace(/\D/g,"");
    if(!ci)return E.textContent="Elige tu ciudad.";
    if(t.length<5)return E.textContent="Escribe un título de al menos 5 caracteres.";
    if(d.length<10)return E.textContent="Describe el anuncio con al menos 10 caracteres.";
    if(!/^9\d{8}$/.test(tel))return E.textContent="El número de llamadas debe tener 9 dígitos y empezar con 9.";
    if(!/^9\d{8}$/.test(wa))return E.textContent="El número de WhatsApp debe tener 9 dígitos y empezar con 9.";
    const dias=+$("fDur").value,pre=$("fPre").value.replace(/\D/g,""),btn=$("goReq");
    btn.disabled=true;E.textContent="Enviando…";
    try{
      const fotos=await subir(),base={cat:$("fCat").value,ciudad:ci,titulo:t,descripcion:d,precio:pre?+pre:null,tel,wa,fotos};
      if(admin){
        await sb.from("anuncios").insert({...base,expira:new Date(Date.now()+dias*DAY).toISOString()}).throwOnError();
        await logh("Admin publicó: "+t);toast("Anuncio publicado");
        mountForm(el,admin,done);if(done)done();
      }else{
        const{data:r}=await sb.from("solicitudes").insert({...base,user_id:S.me.id,nota:$("fNot").value.trim(),dias}).select().single().throwOnError();
        mountForm(el,admin,done);if(done)done(r);
      }
    }catch(err){E.textContent="No se pudo enviar: "+(err.message||err);btn.disabled=false}
  };
}
