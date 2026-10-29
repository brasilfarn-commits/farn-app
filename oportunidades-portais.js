(function(){
  if (typeof firebase === 'undefined') return;
  var db = firebase.firestore();

  function criarCard(o){
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)';
    var html = '';
    if (o.imagem){
      html += '<div style="width:100%;height:220px;background:#f8fafc;overflow:hidden"><img src="'+escAttr(o.imagem)+'" style="width:100%;height:100%;object-fit:cover" alt=""></div>';
    }
    html += '<div style="padding:20px 24px;display:flex;flex-direction:column;gap:12px">' +
      '<div style="font-size:18px;font-weight:800;color:#0f172a">'+esc(o.nome||'')+'</div>' +
      '<div style="font-size:14px;color:#475569;line-height:1.7;white-space:pre-wrap">'+esc(o.descricao||'')+'</div>';
    if (o.link){
      html += '<div><a href="'+escAttr(o.link)+'" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700"><i class="fa-solid fa-arrow-up-right-from-square"></i> Acessar oportunidade</a></div>';
    }
    html += '</div>';
    card.innerHTML = html;
    return card;
  }

  function esc(s){ return String(s||'').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]; }); }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }

  function carregarFormado(){
    var lista = document.getElementById('pf-oportunidade-lista');
    var vazio = document.getElementById('pf-oportunidade-empty');
    if (!lista) return;
    lista.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px"></i></div>';
    db.collection('oportunidades').get().then(function(snap){
      lista.innerHTML = '';
      var encontrados = 0;
      snap.forEach(function(doc){
        var o = doc.data() || {};
        var ativo = o.ativo !== false;
        if (!ativo) return;
        if (o.exibirFormado === true) {
          encontrados++;
          lista.appendChild(criarCard(o));
        }
      });
      if (encontrados === 0) {
        if (vazio) vazio.style.display = 'block';
      } else {
        if (vazio) vazio.style.display = 'none';
      }
    }).catch(function(e){
      console.error(e);
      lista.innerHTML = '<div style="text-align:center;padding:40px;color:#dc2626">Erro ao carregar oportunidades</div>';
      if (vazio) vazio.style.display = 'none';
    });
  }

  function carregarDocente(){
    var lista = document.getElementById('pd-oportunidade-lista');
    var vazio = document.getElementById('pd-oportunidade-empty');
    if (!lista) return;
    lista.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px"></i></div>';
    db.collection('oportunidades').get().then(function(snap){
      lista.innerHTML = '';
      var encontrados = 0;
      snap.forEach(function(doc){
        var o = doc.data() || {};
        var ativo = o.ativo !== false;
        if (!ativo) return;
        if (o.exibirDocente === true) {
          encontrados++;
          lista.appendChild(criarCard(o));
        }
      });
      if (encontrados === 0) {
        if (vazio) vazio.style.display = 'block';
      } else {
        if (vazio) vazio.style.display = 'none';
      }
    }).catch(function(e){
      console.error(e);
      lista.innerHTML = '<div style="text-align:center;padding:40px;color:#dc2626">Erro ao carregar oportunidades</div>';
      if (vazio) vazio.style.display = 'none';
    });
  }

  function carregarAluno(){
    var lista = document.getElementById('pf-oportunidade-lista');
    var vazio = document.getElementById('pf-oportunidade-empty');
    if (!lista) {
      console.warn('Elemento pf-oportunidade-lista não encontrado no DOM');
      return;
    }
    lista.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px"></i></div>';
    console.log('Buscando oportunidades para aluno (modo cliente)...');
    db.collection('oportunidades').get().then(function(snap){
      lista.innerHTML = '';
      var encontrados = 0;
      snap.forEach(function(doc){
        var o = doc.data() || {};
        var ativo = o.ativo !== false;
        if (!ativo) return;
        if (o.exibirAluno === true) {
          encontrados++;
          lista.appendChild(criarCard(o));
        }
      });
      console.log('Oportunidades aluno encontradas:', encontrados);
      if (encontrados === 0) {
        if (vazio) vazio.style.display = 'block';
      } else {
        if (vazio) vazio.style.display = 'none';
      }
    }).catch(function(e){
      console.error('Erro ao carregar oportunidades aluno:', e);
      lista.innerHTML = '<div style="text-align:center;padding:40px;color:#dc2626">Erro ao carregar oportunidades</div>';
      if (vazio) vazio.style.display = 'none';
    });
  }

  function iniciar(){
    if (document.getElementById('pf-oportunidade-lista')){
      carregarFormado();
      carregarAluno();
    }
    if (document.getElementById('pd-oportunidade-lista')){
      carregarDocente();
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
