console.clear()

let id = location.search.split('?')[1]
console.log(id)

if(document.cookie.indexOf(',counter=')>=0)
{
    let counter = document.cookie.split(',')[1].split('=')[1]
    document.getElementById("badge").innerHTML = counter
}

function dynamicContentDetails(ob)
{
    let mainContainer = document.createElement('div')
    mainContainer.id = 'containerD'
    document.getElementById('containerProduct').appendChild(mainContainer);

    let imageSectionDiv = document.createElement('div')
    imageSectionDiv.id = 'imageSection'

    let imgTag = document.createElement('img')
     imgTag.id = 'imgDetails'
     //imgTag.id = ob.photos
     imgTag.src = ob.preview

    imageSectionDiv.appendChild(imgTag)

    let productDetailsDiv = document.createElement('div')
    productDetailsDiv.id = 'productDetails'

    // console.log(productDetailsDiv);

    let h1 = document.createElement('h1')
    let h1Text = document.createTextNode(ob.name)
    h1.appendChild(h1Text)

    let h4 = document.createElement('h4')
    let h4Text = document.createTextNode(ob.brand)
    h4.appendChild(h4Text)
    console.log(h4);

    let detailsDiv = document.createElement('div')
    detailsDiv.id = 'details'

    let h3DetailsDiv = document.createElement('h3')
    let h3DetailsText = document.createTextNode('Rs ' + ob.price)
    h3DetailsDiv.appendChild(h3DetailsText)
    const _pr = Number(ob.price) || 0, _mrp = Number(ob.mrp) || 0
    if (_mrp > _pr) {
        const ex = document.createElement('span'); ex.className = 'priceExtras'
        ex.innerHTML = '<s>Rs ' + _mrp + '</s> <b>' + Math.round((_mrp - _pr) / _mrp * 100) + '% off</b> <em>You save Rs ' + (_mrp - _pr) + '</em>' + (ob.sale ? ' <i>Sale</i>' : '')
        h3DetailsDiv.appendChild(ex)
    }

    let h3 = document.createElement('h3')
    let h3Text = document.createTextNode('Description')
    h3.appendChild(h3Text)

    let para = document.createElement('p')
    let paraText = document.createTextNode(ob.description)
    para.appendChild(paraText)

    let productPreviewDiv = document.createElement('div')
    productPreviewDiv.id = 'productPreview'

    let h3ProductPreviewDiv = document.createElement('h3')
    let h3ProductPreviewText = document.createTextNode('Product Preview')
    h3ProductPreviewDiv.appendChild(h3ProductPreviewText)
    productPreviewDiv.appendChild(h3ProductPreviewDiv)

    let i;
    for(i=0; i<ob.photos.length; i++)
    {
        let imgTagProductPreviewDiv = document.createElement('img')
        imgTagProductPreviewDiv.id = 'previewImg'
        imgTagProductPreviewDiv.src = ob.photos[i]
        imgTagProductPreviewDiv.onclick = function(event)
        {
            console.log("clicked" + this.src)
            imgTag.src = ob.photos[i]
            document.getElementById("imgDetails").src = this.src 
            
        }
        productPreviewDiv.appendChild(imgTagProductPreviewDiv)
    }

    const STOCK_KEY='shoplane_stock_v1';
function getStock(){try{return JSON.parse(localStorage.getItem(STOCK_KEY)||'{}')}catch(e){return{}}}
function saveStock(v){localStorage.setItem(STOCK_KEY,JSON.stringify(v))}
const stock=getStock(); if(stock[id]===undefined){stock[id]=10;saveStock(stock)} if(ob.stock!==undefined){stock[id]=Number(ob.stock);saveStock(stock)}
let stockInfo=document.createElement('p'); stockInfo.id='stockInfo'; stockInfo.textContent=stock[id]<=0?'Out of stock':stock[id]<=3?'Only '+stock[id]+' left in stock':'In stock ('+stock[id]+')'; productDetailsDiv.appendChild(stockInfo);
let buttonDiv = document.createElement('div')
    buttonDiv.id = 'button'

    let buttonTag = document.createElement('button')
    buttonDiv.appendChild(buttonTag)

    buttonText = document.createTextNode('Add to Cart')
    buttonTag.onclick  =   function()
    {
        if(!window.ShopLane.requireLogin()) return;
        const stocks=getStock(); if(Number(stocks[id]||0)<=0){alert('This product is currently out of stock.');return;}
        let token = id
        if(ob.sizes && ob.sizes.length){ if(!chosenSize){ sizeMsg.textContent='Please select a size'; return } token = id + '_' + chosenSize }

        if (window.slTrack) slTrack('event', 'add_to_cart', { currency: 'INR', value: Number(ob.price) || 0, items: [{ item_id: String(id), item_name: ob.name }] })
        let order = token+" "
        let counter = 1
        if(document.cookie.indexOf(',counter=')>=0)
        {
            order = token + " " + document.cookie.split(',')[0].split('=')[1]
            counter = Number(document.cookie.split(',')[1].split('=')[1]) + 1
        }
        document.cookie = "orderId=" + order + ",counter=" + counter
        document.getElementById("badge").innerHTML = counter
        console.log(document.cookie)
    }
    buttonTag.appendChild(buttonText)


    console.log(mainContainer.appendChild(imageSectionDiv));
    mainContainer.appendChild(imageSectionDiv)
    mainContainer.appendChild(productDetailsDiv)
    productDetailsDiv.appendChild(h1)
    productDetailsDiv.appendChild(h4)
    const ratingLine=document.createElement('a'); ratingLine.id='ratingLine'; ratingLine.href='#reviewsSection'; ratingLine.className='ratingLine'; productDetailsDiv.appendChild(ratingLine)
    productDetailsDiv.appendChild(detailsDiv)
    detailsDiv.appendChild(h3DetailsDiv)
    detailsDiv.appendChild(h3)
    detailsDiv.appendChild(para)
    productDetailsDiv.appendChild(productPreviewDiv)
    
    
    let chosenSize = ''
    const sizeMsg = document.createElement('p'); sizeMsg.className = 'sizeMsg'
    if (ob.sizes && ob.sizes.length) {
        const sizeBox = document.createElement('div'); sizeBox.className = 'sizePicker'
        const sh = document.createElement('h3'); sh.textContent = 'Select size'; sizeBox.appendChild(sh)
        const row = document.createElement('div'); row.className = 'sizeRow'
        ob.sizes.forEach(function (s) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'sizeChip'; b.textContent = s
            b.onclick = function () { chosenSize = s; row.querySelectorAll('.sizeChip').forEach(function (x) { x.classList.toggle('active', x === b) }); sizeMsg.textContent = '' }
            row.appendChild(b)
        })
        sizeBox.append(row, sizeMsg); productDetailsDiv.appendChild(sizeBox)
    }
    /* Delivery pincode check (India Post lookup on the server) */
    const pinBox = document.createElement('div'); pinBox.className = 'pinCheck'
    const pinH = document.createElement('h3'); pinH.textContent = 'Check delivery'
    const pinRow = document.createElement('div'); pinRow.className = 'pinRow'
    const pinInput = document.createElement('input'); pinInput.type = 'text'; pinInput.inputMode = 'numeric'; pinInput.maxLength = 6; pinInput.placeholder = 'Enter 6-digit pincode'; pinInput.autocomplete = 'postal-code'; pinInput.setAttribute('aria-label', 'Delivery pincode')
    const pinBtn = document.createElement('button'); pinBtn.type = 'button'; pinBtn.textContent = 'Check'
    const pinRes = document.createElement('p'); pinRes.className = 'pinResult'; pinRes.setAttribute('aria-live', 'polite')
    pinRow.append(pinInput, pinBtn); pinBox.append(pinH, pinRow, pinRes); productDetailsDiv.appendChild(pinBox)
    const fmtDay = function (n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
    const checkPin = function () {
        const pin = pinInput.value.replace(/\D/g, '')
        pinRes.className = 'pinResult'
        if (!/^[1-9]\d{5}$/.test(pin)) { pinRes.classList.add('bad'); pinRes.textContent = 'Please enter a valid 6-digit pincode.'; return }
        pinRes.textContent = 'Checking...'
        fetch('/api/pincode/' + pin).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d } }) }).then(function (x) {
            if (!x.ok) { pinRes.classList.add('bad'); pinRes.textContent = x.d.message || 'Could not check this pincode.'; return }
            try { localStorage.setItem('sl_pin', pin) } catch (e) {}
            const d = x.d, place = [d.area, d.district, d.state].filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i }).join(', ')
            pinRes.classList.add('good')
            pinRes.textContent = 'Delivery' + (place ? ' to ' + place + ' (' + pin + ')' : ' to ' + pin) + ' by ' + fmtDay(d.minDays) + ' - ' + fmtDay(d.maxDays) + (d.cod ? '. Cash on Delivery available.' : '.') + ' Free delivery on orders above \u20B93000.'
        }).catch(function () { pinRes.classList.add('bad'); pinRes.textContent = 'Could not check right now. Please try again.' })
    }
    pinBtn.onclick = checkPin
    pinInput.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); checkPin() } }
    try { const sp = localStorage.getItem('sl_pin'); if (sp && /^[1-9]\d{5}$/.test(sp)) { pinInput.value = sp; checkPin() } } catch (e) {}
    productDetailsDiv.appendChild(buttonDiv)

    const reviewsSection=document.createElement('section'); reviewsSection.id='reviewsSection';
    reviewsSection.innerHTML='<h2>Ratings &amp; Reviews</h2><div id="reviewsBody"><p class="noReviews">Loading reviews...</p></div>';
    document.getElementById('containerProduct').appendChild(reviewsSection)

    return mainContainer
}




function rvEl(tag, cls, text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!==undefined) n.textContent=text; return n }
function rvStars(n){ n=Math.round(n); return '\u2605'.repeat(n)+'\u2606'.repeat(5-n) }
function rvDate(iso){ try{ return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) }catch(e){ return '' } }

function loadReviews(pid){
    const token=localStorage.getItem('shoplane_auth_token');
    fetch('/api/reviews/'+encodeURIComponent(pid),{headers:token?{Authorization:'Bearer '+token}:{}})
        .then(function(r){ if(!r.ok) throw new Error('x'); return r.json() })
        .then(function(d){ renderReviews(pid,d) })
        .catch(function(){ const b=document.getElementById('reviewsBody'); if(b) b.innerHTML='<p class="noReviews">Reviews could not be loaded right now.</p>' })
}

function renderReviews(pid,d){
    const body=document.getElementById('reviewsBody'); if(!body) return; body.innerHTML=''
    const line=document.getElementById('ratingLine')
    if(line){ line.textContent=''; if(d.count){ line.append(rvEl('span','stars',rvStars(d.avg)), rvEl('b','',' '+d.avg.toFixed(1)), rvEl('span','cnt',' ('+d.count+' review'+(d.count===1?'':'s')+')')) } else { line.textContent='No reviews yet' } }

    const top=rvEl('div','rvTop')
    const score=rvEl('div','rvScore'); score.append(rvEl('div','rvBig',d.count?d.avg.toFixed(1):'-'), rvEl('div','rvStarsBig',rvStars(d.avg)), rvEl('div','rvCount',d.count+' rating'+(d.count===1?'':'s')))
    const bars=rvEl('div','rvBars')
    for(let s=5;s>=1;s--){ const row=rvEl('div','rvBarRow'); const pct=d.count?Math.round((d.dist[s]||0)/d.count*100):0; const track=rvEl('div','rvTrack'); const fill=rvEl('div','rvFill'); fill.style.width=pct+'%'; track.appendChild(fill); row.append(rvEl('span','',s+' \u2605'), track, rvEl('span','rvN',String(d.dist[s]||0))); bars.appendChild(row) }
    top.append(score,bars); body.appendChild(top)

    // write-a-review area
    const box=rvEl('div','rvWrite')
    if(!d.signedIn){
        const p=rvEl('p','','Want to share your experience? '); const a=rvEl('a','','Sign in to write a review'); a.href='auth.html?mode=signin'; p.appendChild(a); box.appendChild(p)
    } else {
        box.appendChild(rvEl('h3','',d.mine?'Edit your review':'Write a review'))
        if(d.canReviewVerified) box.appendChild(rvEl('p','rvVerifiedNote','\u2714 You bought this product, so your review will show a "Verified purchase" badge.'))
        let rating=d.mine?d.mine.rating:0
        const pick=rvEl('div','rvPick'); pick.setAttribute('role','radiogroup'); pick.setAttribute('aria-label','Your rating')
        const stars=[]
        function paint(){ stars.forEach(function(b,i){ b.classList.toggle('on',i<rating); b.setAttribute('aria-checked',String(i+1===rating)) }); hint.textContent=rating?['','Poor','Fair','Good','Very good','Excellent'][rating]:'Tap a star' }
        const hint=rvEl('span','rvHint','')
        for(let i=1;i<=5;i++){ const b=rvEl('button','rvStar','\u2605'); b.type='button'; b.setAttribute('role','radio'); b.setAttribute('aria-label',i+' star'+(i===1?'':'s')); b.onclick=function(){ rating=i; paint() }; stars.push(b); pick.appendChild(b) }
        pick.appendChild(hint); paint()
        const title=rvEl('input'); title.maxLength=80; title.placeholder='Review title (optional)'
        const text=rvEl('textarea'); text.maxLength=600; text.rows=4; text.placeholder='What did you like or dislike? Fit, quality, comfort...'
        if(d.mine){ title.value=d.mine.title||''; text.value=d.mine.comment||'' }
        const msg=rvEl('p','rvMsg',''); msg.setAttribute('role','status')
        const actions=rvEl('div','rvActions'); const send=rvEl('button','primary',d.mine?'Update review':'Submit review'); send.type='button'; actions.appendChild(send)
        if(d.mine){ const del=rvEl('button','ghostBtn','Delete my review'); del.type='button'; del.onclick=function(){ if(!confirm('Delete your review?')) return; fetch('/api/reviews/'+encodeURIComponent(pid),{method:'DELETE',headers:{Authorization:'Bearer '+localStorage.getItem('shoplane_auth_token')}}).then(function(){ loadReviews(pid) }) }; actions.appendChild(del) }
        send.onclick=function(){
            if(!rating){ msg.className='rvMsg err'; msg.textContent='Please choose a star rating.'; return }
            send.disabled=true; msg.className='rvMsg'; msg.textContent='Saving...'
            fetch('/api/reviews/'+encodeURIComponent(pid),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('shoplane_auth_token')},body:JSON.stringify({rating:rating,title:title.value,comment:text.value})})
                .then(function(r){ return r.json().then(function(x){ if(r.status===401){ localStorage.removeItem('shoplane_auth_token'); localStorage.removeItem('shoplane_current_user'); throw new Error('Please sign in again to review.') } if(!r.ok) throw new Error(x.message||'Could not save review'); return x }) })
                .then(function(){ loadReviews(pid) })
                .catch(function(e){ send.disabled=false; msg.className='rvMsg err'; msg.textContent=e.message })
        }
        box.append(pick,title,text,msg,actions)
    }
    body.appendChild(box)

    // list
    const list=rvEl('div','reviewList')
    if(!d.reviews.length) list.appendChild(rvEl('p','noReviews','No reviews yet. Be the first to review this product.'))
    d.reviews.forEach(function(r){
        const it=rvEl('div','reviewItem'+(r.mine?' mineRv':''))
        const head=rvEl('div','rvHead'); head.append(rvEl('span','stars',rvStars(r.rating)), rvEl('strong','',r.name||'Customer'))
        if(r.verified) head.appendChild(rvEl('span','rvBadge','\u2714 Verified purchase'))
        head.appendChild(rvEl('time','',rvDate(r.createdAt)))
        it.appendChild(head)
        if(r.title) it.appendChild(rvEl('h4','rvTitle',r.title))
        if(r.comment) it.appendChild(rvEl('p','rvText',r.comment))
        list.appendChild(it)
    })
    body.appendChild(list)
}
function setupReviews(productId){ loadReviews(productId) }

// BACKEND CALLING

let httpRequest = new XMLHttpRequest()
{
    httpRequest.onreadystatechange = function()
    {
        if(this.readyState === 4 && this.status == 200)
        {
            console.log('connected!!');
            let contentDetails = JSON.parse(this.responseText)
            {
                console.log(contentDetails);
                dynamicContentDetails(contentDetails); setupReviews(id)
            }
        }
        else
        {
            console.log('not connected!');
        }
    }
}

httpRequest.open('GET', '/api/products/'+id, true)
httpRequest.send()  
