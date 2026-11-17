const SUPABASE_URL = "https://xgejvhoyctqehtaipdzm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3nuKiqpAuaUQaIPEOkj2cg_bJ1lO0eG";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIAS = ["Vehículos", "Inmuebles", "Tecnología", "Hogar", "Servicios", "Otros"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function precio(n) {
  return "S/ " + Number(n).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}
function whatsapp(c) {
  let d = String(c).replace(/\D/g, "");
  if (d.length === 9) d = "51" + d;
  return "https://wa.me/" + d;
}
async function getUsuario() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}
async function getRol(user) {
  if (!user) return null;
  const { data } = await sb.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  return data ? data.rol : "usuario";
}
async function pintarNav() {
  const user = await getUsuario();
  const rol = await getRol(user);
  let h = '<a href="index.html" class="marca">Tablón</a><span class="espacio"></span><a href="index.html">Anuncios</a>';
  if (user) h += '<a href="publicar.html">Publicar</a>';
  if (rol === "admin") h += '<a href="admin.html">Admin</a>';
  h += user ? '<button id="salir" class="link">Salir</button>' : '<a href="login.html" class="boton">Entrar</a>';
  document.getElementById("nav").innerHTML = h;
  const s = document.getElementById("salir");
  if (s) s.onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  return { user, rol };
}
