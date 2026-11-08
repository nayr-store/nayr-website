let allProducts=[], cart={}, current="সব পণ্য", settings={};
const money=n=>Number(n).toLocaleString("en-US");
async function init(){const r=await fetch("/api/store");const d=await r.json();allProducts=d.products;settings=d.settings;
document.title=(settings.store_name||"NAYR")+" | Online Store";document.querySelector(".brand").childNodes[0].textContent=(settings.store_name||"NAYR");
document.getElementById("tagline").textContent=settings.tagline||"আপনার পছন্দের কেনাকাটার ঠিকানা";document.getElementById("announcement").textContent=settings.announcement||"স্বাগতম";
document.getElementById("footerName").textContent=settings.store_name||"NAYR";
document.getElementById("supportNumber").textContent=settings.whatsapp||"Admin Panel-এ নম্বর সেট করা হয়নি";
renderCategories(d.categories);renderProducts();}
function renderCategories(cats){const nav=document.getElementById("categories");nav.innerHTML="";["সব পণ্য",...cats].forEach(c=>{const b=document.createElement("button");b.className="chip"+(c===current?" active":"");b.textContent=c;b.onclick=()=>{current=c;renderCategories(cats);renderProducts()};nav.appendChild(b)})}
function renderProducts(){const list=allProducts.filter(p=>current==="সব পণ্য"||p.category===current);document.getElementById("productTotal").textContent=list.length+"টি পণ্য";const root=document.getElementById("products");root.innerHTML="";
list.forEach(p=>{const card=document.createElement("article");card.className="product";const image=p.image?`<img src="${esc(p.image)}" alt="">`:"N";card.innerHTML=`<div class="product-img">${image}</div><h3>${esc(p.name)}</h3><p>${esc(p.description||p.category)}</p><div class="price-row"><span class="price">৳${money(p.price)}</span><button class="add">ব্যাগে রাখুন</button></div><small class="muted">স্টক: ${p.stock}</small>`;card.querySelector(".add").onclick=()=>add(p.id);root.appendChild(card)})}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function add(id){cart[id]=(cart[id]||0)+1;updateCount()}
function updateCount(){document.getElementById("cartCount").textContent=Object.values(cart).reduce((a,b)=>a+b,0)}
function openCart(){renderCart();document.getElementById("cartModal").classList.add("show")}
function closeCart(){document.getElementById("cartModal").classList.remove("show")}
function renderCart(){const root=document.getElementById("cartItems");root.innerHTML="";let total=0;Object.entries(cart).forEach(([id,qty])=>{const p=allProducts.find(x=>x.id==id);if(!p)return;total+=p.price*qty;const line=document.createElement("div");line.className="cart-line";line.innerHTML=`<span>${esc(p.name)}<br><small>৳${money(p.price)} × ${qty}</small></span><span class="qty"><button data-d="-1">−</button>${qty}<button data-d="1">+</button></span>`;line.querySelectorAll("button").forEach(b=>b.onclick=()=>{cart[id]+=Number(b.dataset.d);if(cart[id]<=0)delete cart[id];updateCount();renderCart()});root.appendChild(line)});document.getElementById("cartTotal").textContent=money(total)}
document.getElementById("orderForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),items=Object.entries(cart).map(([id,qty])=>({id:Number(id),qty}));if(!items.length){alert("আগে শপিং ব্যাগে পণ্য যোগ করুন।");return}const data=Object.fromEntries(f.entries());data.items=items;const msg=document.getElementById("orderMessage");msg.textContent="অর্ডার পাঠানো হচ্ছে...";
try{const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||"অর্ডার করা যায়নি");msg.textContent=`ধন্যবাদ! আপনার অর্ডার নম্বর #${d.order_id}`;cart={};updateCount();renderCart();e.target.reset()}catch(err){msg.textContent=err.message}};
init();