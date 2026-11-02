export async function apiFetch(path:string,init:RequestInit={}):Promise<Response>{
 const method=(init.method??"GET").toUpperCase(),headers=new Headers(init.headers);
 if(!["GET","HEAD","OPTIONS"].includes(method)){
  const item=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("nsa_csrf="));
  if(item)headers.set("x-csrf-token",decodeURIComponent(item.slice("nsa_csrf=".length)));
 }
 return fetch("/api/proxy/"+path.replace(/^\/+/, ""),{...init,headers,credentials:"same-origin",cache:"no-store"});
}
