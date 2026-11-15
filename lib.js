/* MAVIX - lógica compartida (lo cargan index, panel y admin) */
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>n==null||n===""?"A consultar":"S/ "+Number(n).toLocaleString("es-PE");
const fdate=d=>new Date(d).toLocaleDateString("es-PE");
const hace=d=>{const m=Math.max(1,Math.round((Date.now()-new Date(d))/6e4));return m<60?`hace ${m} min`:m<1440?`hace ${Math.round(m/60)} h`:`hace ${Math.round(m/1440)} d`};
const DAY=864e5;
const CIU=["Cusco","Sicuani","Espinar","Santo Tomás","Juliaca","Puno","Puerto Maldonado","Otros"];
const CATS=[
 {id:"emp",emoji:"💼",nombre:"Empleos"},{id:"ser",emoji:"🛠️",nombre:"Servicios"},{id:"alq",emoji:"🏠",nombre:"Alquileres"},
 {id:"veh",emoji:"🚗",nombre:"Vehículos",subs:[{id:"carros",emoji:"🚗",nombre:"Carros"},{id:"motos",emoji:"🏍️",nombre:"Motos"}]},
 {id:"tec",emoji:"📱",nombre:"Tecnología"},{id:"otr",emoji:"📦",nombre:"Otros"}];
const cat=id=>CATS.find(c=>c.id===id)||{emoji:"📦",nombre:"Otros"};
const opts=(a,ph)=>`<option value="">${ph}</option>`+a.map(c=>`<option>${c}</option>`).join("");

const sb=window.supabase?window.supabase.createClient(CFG.url,CFG.key):null;
const S={me:null,prof:null,mine:[],pr:{3:5,7:10,10:15},num:"910680644",ciu:localStorage.getItem("mx_ciu")||""};
const isAdm=()=>S.prof?.role==="admin";

function toast(t){let e=$("toast");if(!e){e=document.createElement("div");e.id="toast";e.className="toast hide";document.body.appendChild(e)}
 e.textContent=t;e.classList.remove("hide");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add("hide"),2800)}
const fail=e=>{console.error(e);toast(e?.message||"Ocurrió un error")};
function fatal(e){console.error(e);const m=document.querySelector("main")||document.body;
 m.innerHTML='<div class="box"><h2>No se pudo cargar</h2><small>'+esc(e?.message||e)+'. Revisa config.js y que schema.sql esté ejecutado en Supabase.</small></div>'}

async function loadProfile(s){
 S.me=s?.user||null;S.prof=null;
 if(S.me){const{data}=await sb.from("profiles").select("*").eq("id",S.me.id).maybeSingle();S.prof=data}
}
async function loadCfg(){
 const{data}=await sb.from("config").select("*");
 (data||[]).forEach(r=>{if(r.clave==="precios")S.pr=r.valor;if(r.clave==="numero")S.num=String(r.valor)});
}
async function boot(){
 if(!sb)throw new Error("No cargó la librería de Supabase (revisa tu internet)");
 await loadCfg();const{data}=await sb.auth.getSession();await loadProfile(data.session);
}
async function salir(){await sb.auth.signOut();location.href="index.html"}
const logh=t=>sb.from("historial").insert({texto:t}).throwOnError();
async function copiar(t){try{await navigator.clipboard.writeText(t);toast("Número copiado: "+t)}catch{toast("Copia el número: "+t)}}
const waLink=r=>"https://wa.me/51"+S.num+"?text="+encodeURIComponent(`Hola, quiero activar mi publicación.\nID: ${r.codigo}\nTítulo: ${r.titulo}\nAdjunto la captura del pago.`);

/* tarjeta de anuncio (prev=true: vista previa sin enlaces) */
const card=(a,prev)=>{const c=cat(a.cat),f=a.fotos||[];
 return`<article class="cd"><div class="ph" ${f.length>1&&!prev?`data-id="${esc(a.id)}"`:""}>${f[0]?`<img loading="lazy" alt="" src="${esc(f[0])}">`:c.emoji}${a.destacado?'<span class="tg">Destacado</span>':""}${f.length>1?`<i>${f.length} fotos</i>`:""}</div>
 <div class="bd"><span class="pr">${money(a.precio)}</span><h3>${esc(a.titulo)}</h3><p>${esc(a.descripcion)}</p><span class="mt">${esc(a.ciudad)} · ${hace(a.creado||Date.now())}</span></div>
 ${prev?'<div class="ct"><span class="call">Llamar</span><span class="wa">WhatsApp</span></div>'
 :`<div class="ct"><a class="call" href="tel:+51${esc(a.tel)}">Llamar</a><a class="wa" target="_blank" rel="noopener" href="https://wa.me/51${esc(a.wa)}?text=${encodeURIComponent("Hola, vi tu anuncio en MAVIX: "+a.titulo)}">WhatsApp</a></div>`}</article>`};

/* fotos: se reducen a máx. 1000px y se suben a Storage */
const comprimir=(file,max=1000)=>new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(file);
 i.onload=()=>{const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement("canvas");c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
  c.getContext("2d").drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):no(new Error("Imagen no válida")),"image/jpeg",.8)};
 i.onerror=()=>no(new Error("Una de las fotos no es una imagen válida"));i.src=u});
async function subirFotos(files){const out=[];
 for(const f of files){const b=await comprimir(f),p=`${S.me.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  const{error}=await sb.storage.from("fotos").upload(p,b,{contentType:"image/jpeg"});if(error)throw error;
  out.push(sb.storage.from("fotos").getPublicUrl(p).data.publicUrl)}
 return out}

/* formulario de publicación: admin=false -> solicitud; admin=true -> publica directo */
function mountForm(el,admin,done){
 el.innerHTML=`<form class="f" novalidate>
 <label>📍 Localización<select name="ciudad">${opts(CIU,"Elige dónde estás")}</select></label>
 <div class="r"><label>Categoría<select name="cat"><option value="">Elige una categoría</option>${CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.nombre}</option>`).join("")}</select></label>
 <label class="hide" data-sub>Subcategoría<select name="sub">${CATS.find(c=>c.id==="veh").subs.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join("")}</select></label></div>
 <label>Título<input name="titulo" maxlength="70" placeholder="Ej: Moto Honda 150cc 2021"></label>
 <label>Descripción<textarea name="descripcion" rows="3" maxlength="400" placeholder="Describe lo que ofreces"></textarea></label>
 <label>Precio (S/) <small>Vacío = a consultar</small><input name="precio" type="number" min="0" inputmode="numeric"></label>
 <div class="r"><label>Teléfono para llamadas<input name="tel" inputmode="numeric" maxlength="9" placeholder="9XXXXXXXX"></label>
 <label>WhatsApp<input name="wa" inputmode="numeric" maxlength="9" placeholder="9XXXXXXXX"></label></div>
 <label>Fotos (máximo 3)<input name="fotos" type="file" accept="image/*" multiple></label>
 <div><b style="font-size:.86rem">¿Cuántos días de publicación?</b><div class="days">${[3,7,10].map((d,i)=>`<label><input type="radio" name="dias" value="${d}"${i?"":" checked"}>${d} días<b>${admin?"Gratis":"S/ "+S.pr[d]}</b></label>`).join("")}</div></div>
 <p class="err" role="alert"></p>
 <button class="b ${admin?"p":"a"}" style="padding:13px;font-size:1rem" type="submit">${admin?"Publicar ahora":"Enviar solicitud al administrador"}</button></form>`;
 const f=el.querySelector("form"),E=f.querySelector(".err"),btn=f.querySelector("[type=submit]"),v=n=>f.elements[n].value.trim();
 f.elements.cat.onchange=e=>f.querySelector("[data-sub]").classList.toggle("hide",e.target.value!=="veh");
 f.elements.tel.oninput=f.elements.wa.oninput=e=>e.target.value=e.target.value.replace(/\D/g,"");
 f.onsubmit=async e=>{
  e.preventDefault();E.textContent="";const fs=[...f.elements.fotos.files];
  const msg=!v("ciudad")?"Elige tu localización.":!v("cat")?"Elige una categoría.":v("titulo").length<5?"El título debe tener al menos 5 caracteres.":
   v("descripcion").length<10?"Escribe una descripción de al menos 10 caracteres.":!/^9\d{8}$/.test(v("tel"))?"El teléfono debe tener 9 dígitos y empezar con 9.":
   !/^9\d{8}$/.test(v("wa"))?"El WhatsApp debe tener 9 dígitos y empezar con 9.":fs.length>3?"Máximo 3 fotos.":+v("precio")<0?"El precio no puede ser negativo.":"";
  if(msg)return E.textContent=msg;
  btn.disabled=true;btn.textContent="Enviando…";
  try{
   const fotos=await subirFotos(fs),dias=+f.elements.dias.value;
   const row={cat:v("cat"),sub:v("cat")==="veh"?v("sub"):null,ciudad:v("ciudad"),titulo:v("titulo"),descripcion:v("descripcion"),
    precio:v("precio")===""?null:Math.round(+v("precio")),tel:v("tel"),wa:v("wa"),fotos};
   let res=null;
   if(admin){await sb.from("anuncios").insert({...row,propio:true,expira:new Date(Date.now()+dias*DAY).toISOString()}).throwOnError();await logh("Publicación propia: "+row.titulo);toast("Publicación creada")}
   else{res=(await sb.from("solicitudes").insert({...row,dias,user_id:S.me.id}).select().single().throwOnError()).data;toast("Solicitud enviada al administrador")}
   f.reset();f.querySelector("[data-sub]").classList.add("hide");done&&done(res);
  }catch(err){E.textContent=err.message||"No se pudo enviar"}
  btn.disabled=false;btn.textContent=admin?"Publicar ahora":"Enviar solicitud al administrador";
 };
}

/* ventana de iniciar sesión / crear cuenta */
function openAuth(){
 let d=$("dAuth");
 if(!d){d=document.createElement("dialog");d.id="dAuth";
  const eye=id=>`<button class="eye" type="button" data-eye="${id}" aria-label="Mostrar contraseña">👁</button>`;
  d.innerHTML=`<div class="f">
  <p style="margin:0;color:var(--mu);font-size:.88rem">Para publicar un anuncio, inicia sesión o crea tu cuenta.</p>
  <div class="acts"><button class="b p" id="tLog">Iniciar sesión</button><button class="b" id="tReg">Crear cuenta</button></div>
  <div id="fLog" class="f" style="padding:0">
   <label>Usuario o correo<input id="lU" autocomplete="username"></label>
   <label>Contraseña<span class="pw"><input id="lP" type="password" autocomplete="current-password">${eye("lP")}</span></label>
   <p class="err" id="lE"></p><button class="b p" id="goLog">Entrar</button></div>
  <div id="fReg" class="f hide" style="padding:0">
   <label>Nombre de usuario<input id="rU" autocomplete="username"></label>
   <label>Correo Gmail<input id="rE" type="email" placeholder="tunombre@gmail.com"></label>
   <label>📍 ¿De dónde eres?<select id="rC">${opts(CIU,"Elige tu localización")}</select></label>
   <small>Pedimos tu localización para evitar solicitudes falsas.</small>
   <label>Contraseña<span class="pw"><input id="rP" type="password" autocomplete="new-password">${eye("rP")}</span></label>
   <label>Confirmar contraseña<span class="pw"><input id="rP2" type="password" autocomplete="new-password">${eye("rP2")}</span></label>
   <p class="err" id="rErr"></p><button class="b p" id="goReg">Crear cuenta</button></div>
  <div class="acts"><button class="b" data-close>Cerrar</button></div></div>`;
  document.body.appendChild(d);
  const tab=r=>{$("fReg").classList.toggle("hide",!r);$("fLog").classList.toggle("hide",r);$("tReg").className="b"+(r?" p":"");$("tLog").className="b"+(r?"":" p")};
  $("tLog").onclick=()=>tab(false);$("tReg").onclick=()=>tab(true);
  d.addEventListener("click",e=>{const y=e.target.closest("[data-eye]");
   if(y){const i=$(y.dataset.eye);i.type=i.type==="password"?"text":"password";y.textContent=i.type==="password"?"👁":"🙈"}
   if(e.target.closest("[data-close]"))d.close()});
  $("goReg").onclick=async()=>{
   const u=$("rU").value.trim(),m=$("rE").value.trim().toLowerCase(),c=$("rC").value,p=$("rP").value,E=$("rErr"),b=$("goReg");
   if(u.length<3)return E.textContent="El usuario debe tener al menos 3 caracteres.";
   if(!/^[a-z0-9._+-]+@gmail\.com$/.test(m))return E.textContent="Escribe un correo Gmail válido (termina en @gmail.com).";
   if(!c)return E.textContent="Indica de dónde eres.";
   if(p.length<6)return E.textContent="La contraseña debe tener al menos 6 caracteres.";
   if(p!==$("rP2").value)return E.textContent="Las contraseñas no coinciden.";
   E.textContent="Creando cuenta…";b.disabled=true;
   const{data,error}=await sb.auth.signUp({email:m,password:p,options:{data:{username:u,ciudad:c},emailRedirectTo:location.origin+location.pathname}});
   b.disabled=false;
   if(error)return E.textContent=/database|already|duplicate|registered/i.test(error.message)?"Ese usuario o correo ya existe.":error.message;
   d.close();toast(data.session?"Cuenta creada. Bienvenido, "+u:"Cuenta creada. Revisa tu Gmail para confirmarla.")};
  $("goLog").onclick=async()=>{
   let k=$("lU").value.trim();const E=$("lE"),b=$("goLog");if(!k||!$("lP").value)return E.textContent="Escribe tu usuario y contraseña.";
   E.textContent="Entrando…";b.disabled=true;
   if(!k.includes("@")){const{data}=await sb.rpc("email_de_usuario",{u:k});if(!data){b.disabled=false;return E.textContent="Usuario o contraseña incorrectos."}k=data}
   const{error}=await sb.auth.signInWithPassword({email:k,password:$("lP").value});b.disabled=false;
   if(error)return E.textContent=/confirm/i.test(error.message)?"Confirma tu correo antes de entrar.":"Usuario o contraseña incorrectos.";
   d.close();toast("Sesión iniciada")};
 }
 $("lE").textContent="";$("rErr").textContent="";d.showModal();
}
