const safeReturn=()=>{const r=new URLSearchParams(location.search).get('returnTo')||'';const n=r==='cart'||r==='checkout'?r+'.html':r;return /^[\w\-]+\.html(\?[\w=&%.\-]*)?$/.test(n)&&!/^(auth|account)\.html/.test(n)?n:'account.html'};
const TOKEN_KEY='shoplane_auth_token', CURRENT_KEY='shoplane_current_user';
const $=id=>document.getElementById(id); const token=()=>localStorage.getItem(TOKEN_KEY); const current=()=>{try{return JSON.parse(localStorage.getItem(CURRENT_KEY)||'null')}catch{return null}};
function msg(text,error=false){$('message').textContent=text;$('message').className='message '+(error?'error':'ok')}
function show(mode){$('signInForm').hidden=mode!=='signin';$('createForm').hidden=mode!=='create';$('forgotForm').hidden=mode!=='forgot';if($('resetForm'))$('resetForm').hidden=mode!=='reset';$('signedIn').hidden=mode!=='account';$('tabSignIn').classList.toggle('active',mode==='signin');$('tabCreate').classList.toggle('active',mode==='create');msg('')}
async function api(url,opts={}){opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};if(token())opts.headers.Authorization='Bearer '+token();const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'Request failed');return d}
async function refreshAccount(){try{const d=await api('/api/account');localStorage.setItem(CURRENT_KEY,JSON.stringify(d.user));show('account');$('welcome').textContent='Signed in as '+d.user.name+' ('+d.user.email+')';$('userCount').textContent='';renderAddresses(d.user.addresses||[]);setupInstall();setupNotifications()}catch{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(CURRENT_KEY);show('signin')}}
function renderAddresses(a){const box=$('addresses');if(!box)return;box.innerHTML='<h3>Saved Addresses</h3>'+(!a.length?'<p>No saved addresses yet.</p>':a.map(x=>`<div class="address-card"><strong>${x.label}</strong><p>${x.name}<br>${x.address}, ${x.city}, ${x.state} - ${x.pincode}<br>${x.phone}</p><button data-id="${x.id}" class="deleteAddress">Remove</button></div>`).join(''));box.querySelectorAll('.deleteAddress').forEach(b=>b.onclick=async()=>{await api('/api/account/addresses/'+b.dataset.id,{method:'DELETE'});refreshAccount()})}
$('tabSignIn').onclick=()=>show('signin');$('tabCreate').onclick=()=>show('create');if($('forgotBtn'))$('forgotBtn').onclick=()=>show('forgot');$('backSignIn').onclick=()=>show('signin');
$('createForm').onsubmit=async e=>{e.preventDefault();try{if($('password').value!==$('confirmPassword').value)return msg('Passwords do not match.',true);await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:$('name').value,email:$('email').value,password:$('password').value})});msg('Account created successfully. Please sign in.');$('createForm').reset();show('signin')}catch(x){msg(x.message,true)}};
$('signInForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('loginEmail').value,password:$('loginPassword').value})});localStorage.setItem(TOKEN_KEY,d.token);localStorage.setItem(CURRENT_KEY,JSON.stringify(d.user));location.href=safeReturn()}catch(x){msg(x.message,true)}};
$('forgotForm').onsubmit=async e=>{e.preventDefault();try{const em=$('resetEmail').value.trim();const d=await api('/api/auth/forgot',{method:'POST',body:JSON.stringify({email:em})});$('resetEmail2').value=em;if($('resetWa'))$('resetWa').href=waLink(SHOPLANE_WA_NUMBER,'Hi BRANDON, I forgot my password. My account email: '+em+'. Please send me the reset code.');show('reset');msg(d.message)}catch(x){msg(x.message,true)}};
if($('resetForm'))$('resetForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/auth/reset',{method:'POST',body:JSON.stringify({email:$('resetEmail2').value,code:$('resetCode').value,password:$('resetPassword').value})});msg('Password reset successfully. Please sign in.');show('signin')}catch(x){msg(x.message,true)}};
if($('addressForm'))$('addressForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/account/addresses',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();refreshAccount()}catch(x){msg(x.message,true)}};
$('signOutBtn').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'})}catch{}localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(CURRENT_KEY);location.href='auth.html'};
function setupInstall(){let btn=$('installBtn');if(!btn)return;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.deferredInstall=e;btn.hidden=false});btn.onclick=async()=>{if(window.deferredInstall){window.deferredInstall.prompt();await window.deferredInstall.userChoice;window.deferredInstall=null;btn.hidden=true}}}
async function setupNotifications(){let b=$('notifyBtn');if(!b||!('Notification'in window))return;const on=()=>{b.textContent='Notifications Enabled'};if(Notification.permission==='granted'){on();window.slPushSubscribe&&window.slPushSubscribe()}b.onclick=async()=>{let p=await Notification.requestPermission();if(p==='granted'){on();if(window.slPushSubscribe)await window.slPushSubscribe();if(window.slNotify)window.slNotify('BRANDON','You will now get a notification whenever your order status changes.','welcome')}else alert('Notifications are blocked. Please allow them in your browser site settings.')}}
if(location.pathname.endsWith('account.html'))refreshAccount(); else {const q=new URLSearchParams(location.search);const m=q.get('mode');show(['create','signin'].includes(m)?m:'signin');if(q.get('reason')==='shop')msg('Please create an account and sign in to start shopping.')}
/* Continue with Google (shown only when GOOGLE_CLIENT_ID is set on the server) */
(function(){
  const box=$('googleBox');if(!box||!window.ShopLane||!ShopLane.config)return;
  ShopLane.config.then(function(c){
    if(!c||!c.googleClientId)return;
    const sync=function(){box.hidden=$('signInForm').hidden&&$('createForm').hidden};
    const baseShow=show;show=function(m){baseShow(m);sync()};sync();
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=function(){
      google.accounts.id.initialize({client_id:c.googleClientId,callback:async function(resp){
        try{const d=await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential:resp.credential})});
          localStorage.setItem(TOKEN_KEY,d.token);localStorage.setItem(CURRENT_KEY,JSON.stringify(d.user));location.href=safeReturn()}
        catch(x){msg(x.message,true)}}});
      google.accounts.id.renderButton($('googleBtn'),{theme:'outline',size:'large',text:'continue_with',shape:'pill',width:300});
    };
    document.head.appendChild(s);
  });
})();
