// Arvela Social — tarayıcı betiği (CSP: yalnız bu dosya). Menü, sayaçlar, kopyala, şablonu PNG'ye çevirip kaydet.
export const CLIENT_JS = String.raw`
(function(){
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var csrf=function(){var i=$('input[name=csrf]');return i?i.value:''};
document.addEventListener('click',function(e){
  var m=e.target.closest('[data-menu]'); if(m){$('#side').classList.toggle('open');return}
  if($('#side')&&$('#side').classList.contains('open')&&!e.target.closest('#side')) $('#side').classList.remove('open');
  var c=e.target.closest('[data-copy]'); if(c){var t=$(c.getAttribute('data-copy'));var v=t?(t.value||t.textContent):'';
    (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){var o=c.textContent;c.textContent='Kopyalandı';setTimeout(function(){c.textContent=o},1500)},function(){if(t&&t.select){t.select();document.execCommand('copy')}});e.preventDefault()}
});
document.addEventListener('submit',function(e){var f=e.target;var q=f.getAttribute('data-confirm')||(e.submitter&&e.submitter.getAttribute('data-confirm'));if(q&&!confirm(q))e.preventDefault()});
$$('[data-autosubmit]').forEach(function(s){s.addEventListener('change',function(){s.form.submit()})});
// karakter sayacı: data-count="#hedef" data-max="2200"
$$('[data-count]').forEach(function(el){var out=$(el.getAttribute('data-count'));var max=+el.getAttribute('data-max')||0;
  var u=function(){var n=el.value.length;if(out){out.textContent=n+(max?' / '+max:'');out.classList.toggle('over',max&&n>max)}};el.addEventListener('input',u);u()});
// platform seçimine göre sayaç sınırı
$$('input[name=platforms],input[name=account_ids]').forEach(function(cb){cb.addEventListener('change',function(){var cap=$('#caption');if(!cap)return;var mx=0;
  $$('input[name=platforms]:checked,input[name=account_ids]:checked').forEach(function(x){var v=+x.getAttribute('data-max');if(!mx||v<mx)mx=v});cap.setAttribute('data-max',mx||2200);cap.dispatchEvent(new Event('input'))})});
// şablon önizleme ve PNG kaydı
var pv=$('[data-render]');
if(pv){var form=pv.closest('form')||document;var timer;
  var refresh=function(){clearTimeout(timer);timer=setTimeout(function(){var fd=new FormData($('#tpl-form'));var p=new URLSearchParams(fd);p.delete('csrf');
    fetch(pv.getAttribute('data-render')+'?'+p.toString(),{credentials:'same-origin'}).then(function(r){return r.text()}).then(function(s){pv.innerHTML=s;var g=pv.querySelector('svg');if(g){var vb=(g.getAttribute('viewBox')||'0 0 1 1').split(' ');g.style.width=Math.min(pv.clientWidth-32,560*vb[2]/vb[3])+'px';g.style.height='auto'}})},250)};
  $$('#tpl-form input, #tpl-form select, #tpl-form textarea').forEach(function(i){i.addEventListener('input',refresh);i.addEventListener('change',refresh)});refresh();
  var save=$('[data-save-png]');
  if(save)save.addEventListener('click',function(){var svg=pv.querySelector('svg');if(!svg)return;save.disabled=true;save.textContent='Kaydediliyor…';
    var w=+svg.getAttribute('width'),h=+svg.getAttribute('height');var xml=new XMLSerializer().serializeToString(svg);
    var img=new Image();img.onload=function(){var cv=document.createElement('canvas');cv.width=w;cv.height=h;var g=cv.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
      cv.toBlob(function(b){var fd=new FormData();fd.append('csrf',csrf());fd.append('file',b,'gorsel.jpg');
        fetch(save.getAttribute('data-save-png'),{method:'POST',body:fd,credentials:'same-origin',headers:{'Accept':'application/json'}}).then(function(r){return r.json()}).then(function(j){
          if(j.redirect)location.href=j.redirect;else{save.disabled=false;save.textContent='Görseli kaydet';alert(j.error||'Kaydedilemedi')}})},'image/jpeg',0.92)};
    img.onerror=function(){save.disabled=false;save.textContent='Görseli kaydet';alert('Görsel oluşturulamadı')};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml)})}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-print]');if(b){e.preventDefault();window.print()}});
  // gönderi önizlemesi: metin + hashtag canlı; sekmeler
  var cap=$('#caption'),tags=$('#hashtags');
  function pvUpd(){var t=(cap?cap.value:'').trim();var h=(tags?tags.value:'').trim();var full=[t,h].filter(Boolean).join('\n\n');
    $$('[data-pv-text]').forEach(function(el){var lim=el.closest('.pv-instagram')?125:el.closest('.pv-linkedin')?210:240;
      el.textContent=full.length>lim?full.slice(0,lim)+'… daha fazla':full||'Metin burada görünecek.'})}
  if(cap){cap.addEventListener('input',pvUpd);if(tags)tags.addEventListener('input',pvUpd);pvUpd()}
  $$('[data-pv-tab]').forEach(function(b){b.addEventListener('click',function(){var k=b.getAttribute('data-pv-tab');
    $$('[data-pv-tab]').forEach(function(x){x.classList.toggle('on',x===b)});$$('[data-pv]').forEach(function(p){p.hidden=p.getAttribute('data-pv')!==k})})});
  // imza ekle
  $$('[data-sig]').forEach(function(b){b.addEventListener('click',function(){var src=$(b.getAttribute('data-sig')),dst=$(b.getAttribute('data-target'));if(!src||!dst)return;
    var v=src.value;if(dst.value.indexOf(v)<0){dst.value=dst.value.replace(/\s+$/,'')+(dst.value.trim()?'\n\n':'')+v;dst.dispatchEvent(new Event('input'))}})});
  // takvimde sürükle-bırak
  var dnd=$('[data-dnd="1"]');
  if(dnd){var drag=null;
    document.addEventListener('dragstart',function(e){var c=e.target.closest&&e.target.closest('[data-post]');if(!c)return;drag=c;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.getAttribute('data-post'));c.classList.add('dragging')});
    document.addEventListener('dragend',function(){if(drag)drag.classList.remove('dragging');$$('.drop').forEach(function(x){x.classList.remove('drop')})});
    $$('[data-day]').forEach(function(cell){
      cell.addEventListener('dragover',function(e){if(!drag)return;e.preventDefault();cell.classList.add('drop')});
      cell.addEventListener('dragleave',function(){cell.classList.remove('drop')});
      cell.addEventListener('drop',function(e){e.preventDefault();cell.classList.remove('drop');if(!drag)return;var id=drag.getAttribute('data-post');var fd=new URLSearchParams();
        fd.append('csrf',csrf());fd.append('gun',cell.getAttribute('data-day'));if(cell.getAttribute('data-time'))fd.append('saat',cell.getAttribute('data-time'));
        var add=cell.querySelector('.add');cell.insertBefore(drag,add||null);
        fetch('/gonderi/'+id+'/zaman',{method:'POST',body:fd,headers:{'x-csrf':csrf()},credentials:'same-origin'}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){
          if(!r.ok){alert(j.error||'Taşınamadı');location.reload()}else if(j.reapprove){location.reload()}})})})})}
  // fotoğraf yüklerken JPEG'e çevir (Instagram yalnız JPEG kabul eder)
  $$('form[data-jpeg]').forEach(function(f){f.addEventListener('submit',function(e){var inp=f.querySelector('input[type=file]');if(!inp||!inp.files.length||f.__done)return;
    var need=[].some.call(inp.files,function(x){return x.type!=='image/jpeg'&&/^image\/(png|webp)$/.test(x.type)});if(!need||!window.DataTransfer)return;e.preventDefault();
    var dt=new DataTransfer();var files=[].slice.call(inp.files);var i=0;
    (function next(){if(i>=files.length){inp.files=dt.files;f.__done=true;f.submit();return}var x=files[i++];
      if(x.type==='image/jpeg'||!/^image\/(png|webp)$/.test(x.type)){dt.items.add(x);return next()}
      var u=URL.createObjectURL(x);var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0);
        c.toBlob(function(b){dt.items.add(new File([b],x.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}));URL.revokeObjectURL(u);next()},'image/jpeg',0.92)};im.onerror=function(){dt.items.add(x);next()};im.src=u})()})});
})();
`;
