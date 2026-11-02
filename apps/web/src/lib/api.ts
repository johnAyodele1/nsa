function csrfCookieValue():string|undefined{for(const name of ["__Host-nsa_csrf","nsa_csrf"]){const prefix=name+"=";const item=document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith(prefix));if(item){try{return decodeURIComponent(item.slice(prefix.length));}catch{return undefined;}}}return undefined;}
export async function apiFetch(path:string,init:RequestInit={}):Promise<Response>{
 const method=(init.method??"GET").toUpperCase(),headers=new Headers(init.headers);
 if(!["GET","HEAD","OPTIONS"].includes(method)){const token=csrfCookieValue();if(token)headers.set("x-csrf-token",token);}
 return fetch("/api/proxy/"+path.replace(/^\/+/, ""),{...init,headers,credentials:"same-origin",cache:"no-store"});
}
