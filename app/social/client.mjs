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
document.addEventListener('submit',function(e){var f=e.target;var q=f.getAttribute('data-confirm');if(q&&!confirm(q))e.preventDefault()});
$$('[data-autosubmit]').forEach(function(s){s.addEventListener('change',function(){s.form.submit()})});
// karakter sayacı: data-count="#hedef" data-max="2200"
$$('[data-count]').forEach(function(el){var out=$(el.getAttribute('data-count'));var max=+el.getAttribute('data-max')||0;
  var u=function(){var n=el.value.length;if(out){out.textContent=n+(max?' / '+max:'');out.classList.toggle('over',max&&n>max)}};el.addEventListener('input',u);u()});
// platform seçimine göre sayaç sınırı
$$('input[name=platforms]').forEach(function(cb){cb.addEventListener('change',function(){var cap=$('#caption');if(!cap)return;var mx=0;
  $$('input[name=platforms]:checked').forEach(function(x){var v=+x.getAttribute('data-max');if(!mx||v<mx)mx=v});cap.setAttribute('data-max',mx||2200);cap.dispatchEvent(new Event('input'))})});
// şablon önizleme ve PNG kaydı
var pv=$('[data-render]');
if(pv){var form=pv.closest('form')||document;var timer;
  var refresh=function(){clearTimeout(timer);timer=setTimeout(function(){var fd=new FormData($('#tpl-form'));var p=new URLSearchParams(fd);p.delete('csrf');
    fetch(pv.getAttribute('data-render')+'?'+p.toString(),{credentials:'same-origin'}).then(function(r){return r.text()}).then(function(s){pv.innerHTML=s;var g=pv.querySelector('svg');if(g){var vb=(g.getAttribute('viewBox')||'0 0 1 1').split(' ');g.style.width=Math.min(pv.clientWidth-32,560*vb[2]/vb[3])+'px';g.style.height='auto'}})},250)};
  $$('#tpl-form input, #tpl-form select, #tpl-form textarea').forEach(function(i){i.addEventListener('input',refresh);i.addEventListener('change',refresh)});refresh();
  var save=$('[data-save-png]');
  if(save)save.addEventListener('click',function(){var svg=pv.querySelector('svg');if(!svg)return;save.disabled=true;save.textContent='Kaydediliyor…';
    var w=+svg.getAttribute('width'),h=+svg.getAttribute('height');var xml=new XMLSerializer().serializeToString(svg);
    var img=new Image();img.onload=function(){var cv=document.createElement('canvas');cv.width=w;cv.height=h;var g=cv.getContext('2d');g.drawImage(img,0,0,w,h);
      cv.toBlob(function(b){var fd=new FormData();fd.append('csrf',csrf());fd.append('file',b,'gorsel.png');
        fetch(save.getAttribute('data-save-png'),{method:'POST',body:fd,credentials:'same-origin',headers:{'Accept':'application/json'}}).then(function(r){return r.json()}).then(function(j){
          if(j.redirect)location.href=j.redirect;else{save.disabled=false;save.textContent='Görseli kaydet';alert(j.error||'Kaydedilemedi')}})},'image/png')};
    img.onerror=function(){save.disabled=false;save.textContent='Görseli kaydet';alert('Görsel oluşturulamadı')};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml)})}
})();
`;
