(function(){
  if (typeof firebase === 'undefined') return;

  var db = firebase.firestore();
  var storage = null;
  try { if (firebase.storage) storage = firebase.storage(); } catch(e) {}

  window.oportunidadesAdminInicializar = function(){
    carregarLista();
  };

  function carregarLista(){
    var lista = document.getElementById('oportunidade-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin" style="font-size:18px"></i><p style="margin-top:8px;font-size:13px">Carregando oportunidades...</p></div>';
    db.collection('oportunidades').orderBy('createdAt','desc').get().then(function(snap){
      if (snap.empty){
        lista.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8"><i class="fa-solid fa-briefcase" style="font-size:28px"></i><p style="margin-top:8px;font-size:13px">Nenhuma oportunidade cadastrada.</p></div>';
        return;
      }
      var html = '<div style="display:flex;flex-direction:column;gap:10px">';
      snap.forEach(function(doc){
        var d = doc.data();
        var portais = [];
        if (d.exibirAluno) portais.push('Aluno');
        if (d.exibirFormado) portais.push('Formado');
        if (d.exibirDocente) portais.push('Docente');
        var ativo = d.ativo !== false;
        html += '<div style="display:flex;gap:14px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;flex-wrap:wrap">' +
          '<div style="width:110px;height:64px;border-radius:10px;background:#f8fafc;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0">' +
            (d.imagem ? '<img src="'+escAttr(d.imagem)+'" style="width:100%;height:100%;object-fit:cover">' : '<i class="fa-solid fa-image" style="color:#cbd5e1;font-size:18px"></i>') +
          '</div>' +
          '<div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:4px">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
              '<div style="font-weight:700;color:#0f172a;font-size:15px">'+esc(d.nome)+'</div>' +
              '<span style="display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;'+(ativo?'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0':'background:#f8fafc;color:#64748b;border:1px solid #e2e8f0')+'">'+(ativo?'Ativo':'Inativo')+'</span>' +
            '</div>' +
            '<div style="font-size:11px;color:#64748b">Exibir em: '+(portais.length?portais.join(', '):'Nenhum')+'</div>' +
            (d.link ? '<div style="font-size:11px;color:#2563eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px">'+esc(d.link)+'</div>' : '<div style="font-size:11px;color:#94a3b8">Sem link</div>') +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
            '<button class="btn-outline btn-sm" onclick="oportunidadeVisualizar(\''+doc.id+'\')"><i class="fa-solid fa-eye"></i> Visualizar</button>' +
            '<button class="btn-outline btn-sm" onclick="oportunidadeEditar(\''+doc.id+'\')"><i class="fa-solid fa-pen"></i> Editar</button>' +
            '<button class="btn-outline btn-sm" onclick="oportunidadeAlternarStatus(\''+doc.id+'\', '+(ativo?'false':'true')+')"><i class="fa-solid '+(ativo?'fa-toggle-off':'fa-toggle-on')+'"></i> '+(ativo?'Inativar':'Ativar')+'</button>' +
            '<button class="btn-outline btn-sm" style="color:#dc2626;border-color:#fecaca" onclick="oportunidadeExcluir(\''+doc.id+'\')"><i class="fa-solid fa-trash"></i> Excluir</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      lista.innerHTML = html;
    }).catch(function(e){
      console.error(e);
      lista.innerHTML = '<div style="text-align:center;padding:30px;color:#dc2626"><i class="fa-solid fa-triangle-exclamation"></i><p style="margin-top:8px;font-size:13px">Erro ao carregar.</p></div>';
    });
  }

  function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }

  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function bindImagemPreview(){
    var fileInput = document.getElementById('oportunidade-img-file');
    if (!fileInput) return;
    if (fileInput.dataset.bound) return;
    fileInput.dataset.bound = '1';
    fileInput.onchange = function(){
      var img = document.getElementById('oportunidade-img-preview');
      var ph = document.getElementById('oportunidade-img-placeholder');
      var file = fileInput.files[0];
      if (!file){ return; }
      if (file.size > 5*1024*1024){
        alert('Imagem muito grande. Tamanho máximo: 5MB');
        fileInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e){
        if (!img || !ph) return;
        img.src = e.target.result;
        img.style.display = 'block';
        ph.style.display = 'none';
        img.dataset.url = '';
      };
      reader.readAsDataURL(file);
    };
  }

  function initFileInput(){
    var fileInput = document.getElementById('oportunidade-img-file');
    if (!fileInput) return;
    if (fileInput.dataset.oppBound) return;
    fileInput.dataset.oppBound = '1';
    fileInput.onchange = function(){
      var img = document.getElementById('oportunidade-img-preview');
      var ph = document.getElementById('oportunidade-img-placeholder');
      var file = fileInput.files && fileInput.files[0];
      if (!file){
        return;
      }
      if (file.size > 5*1024*1024){
        alert('Imagem muito grande. Tamanho máximo: 5MB');
        fileInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e){
        if (!img || !ph) return;
        img.src = e.target.result;
        img.style.display = 'block';
        ph.style.display = 'none';
      };
      reader.readAsDataURL(file);
    };
  }

  window.oportunidadeAbrirForm = function(id){
    document.getElementById('oportunidade-id').value = id||'';
    document.getElementById('oportunidade-form-titulo').textContent = id ? 'Editar anúncio de oportunidade' : 'Criar anúncio de oportunidade';
    document.getElementById('oportunidade-nome').value = '';
    document.getElementById('oportunidade-descricao').value = '';
    document.getElementById('oportunidade-link').value = '';
    document.getElementById('oportunidade-port-aluno').checked = false;
    document.getElementById('oportunidade-port-formado').checked = false;
    document.getElementById('oportunidade-port-docente').checked = false;
    document.getElementById('oportunidade-ativo').checked = true;
    var fileInput = document.getElementById('oportunidade-img-file');
    if (fileInput) fileInput.value = '';
    var img = document.getElementById('oportunidade-img-preview');
    var ph = document.getElementById('oportunidade-img-placeholder');
    if (img){ img.src = ''; img.style.display = 'none'; img.dataset.url = ''; }
    if (ph){ ph.style.display = 'inline'; }
    initFileInput();
    document.getElementById('oportunidade-modal').classList.remove('hidden');
    if (id){
      db.collection('oportunidades').doc(id).get().then(function(doc){
        if (!doc.exists) return;
        var d = doc.data();
        document.getElementById('oportunidade-nome').value = d.nome||'';
        document.getElementById('oportunidade-descricao').value = d.descricao||'';
        document.getElementById('oportunidade-link').value = d.link||'';
        document.getElementById('oportunidade-port-aluno').checked = !!d.exibirAluno;
        document.getElementById('oportunidade-port-formado').checked = !!d.exibirFormado;
        document.getElementById('oportunidade-port-docente').checked = !!d.exibirDocente;
        document.getElementById('oportunidade-ativo').checked = d.ativo!==false;
        if (d.imagem){
          img.src = d.imagem; img.style.display = 'block';
          ph.style.display = 'none';
          img.dataset.url = d.imagem;
        }
      });
    }
  };

  window.oportunidadeFecharForm = function(){
    document.getElementById('oportunidade-modal').classList.add('hidden');
  };

  window.oportunidadeRemoverImagem = function(){
    var img = document.getElementById('oportunidade-img-preview');
    var ph = document.getElementById('oportunidade-img-placeholder');
    var file = document.getElementById('oportunidade-img-file');
    if (img){ img.src = ''; img.style.display = 'none'; img.dataset.url = ''; }
    if (ph){ ph.style.display = 'inline'; }
    if (file) file.value = '';
  };

  window.oportunidadeEditar = function(id){
    oportunidadeAbrirForm(id);
  };

  window.oportunidadeExcluir = function(id){
    if (!confirm('Excluir esta oportunidade?')) return;
    db.collection('oportunidades').doc(id).delete().then(function(){
      carregarLista();
    }).catch(function(e){ alert('Erro ao excluir'); console.error(e); });
  };

  window.oportunidadeAlternarStatus = function(id, valor){
    db.collection('oportunidades').doc(id).update({
      ativo: valor,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){
      carregarLista();
    }).catch(function(e){
      console.error(e);
      alert('Erro ao alterar status');
    });
  };

  window.oportunidadeVisualizar = function(id){
    db.collection('oportunidades').doc(id).get().then(function(doc){
      if (!doc.exists) return;
      var d = doc.data();
      var modal = document.getElementById('oportunidade-view-modal');
      document.getElementById('oportunidade-view-nome').textContent = d.nome || '';
      document.getElementById('oportunidade-view-desc').textContent = d.descricao || '';
      var imgWrap = document.getElementById('oportunidade-view-img-wrap');
      var img = document.getElementById('oportunidade-view-img');
      if (d.imagem){
        img.src = d.imagem;
        imgWrap.style.display = 'block';
      } else {
        img.src = '';
        imgWrap.style.display = 'none';
      }
      var link = document.getElementById('oportunidade-view-link');
      var linkVazio = document.getElementById('oportunidade-view-link-vazio');
      if (d.link){
        link.href = d.link;
        link.textContent = d.link;
        link.style.display = 'inline';
        linkVazio.style.display = 'none';
      } else {
        link.href = '#';
        link.textContent = '';
        link.style.display = 'none';
        linkVazio.style.display = 'block';
      }
      document.getElementById('oportunidade-view-aluno').style.display = d.exibirAluno ? 'inline-flex' : 'none';
      document.getElementById('oportunidade-view-formado').style.display = d.exibirFormado ? 'inline-flex' : 'none';
      document.getElementById('oportunidade-view-docente').style.display = d.exibirDocente ? 'inline-flex' : 'none';
      var status = document.getElementById('oportunidade-view-status');
      var ativo = d.ativo !== false;
      status.textContent = ativo ? 'ATIVO' : 'INATIVO';
      status.style.background = ativo ? '#f0fdf4' : '#f8fafc';
      status.style.color = ativo ? '#166534' : '#475569';
      status.style.border = ativo ? '1px solid #bbf7d0' : '1px solid #e2e8f0';
      modal.classList.remove('hidden');
    });
  };

  window.oportunidadeFecharVisualizar = function(){
    document.getElementById('oportunidade-view-modal').classList.add('hidden');
  };

  async function uploadImagem(file){
    if (!file) return '';
    if (!storage){
      throw new Error('Firebase Storage não inicializado');
    }
    var nomeSanitizado = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    var ref = storage.ref().child('oportunidades/' + Date.now() + '_' + nomeSanitizado);
    var metadata = { contentType: file.type || 'image/jpeg' };
    var uploadTask = ref.put(file, metadata);
    await uploadTask;
    var url = await ref.getDownloadURL();
    return url;
  }

  window.oportunidadeSalvar = async function(){
    var id = document.getElementById('oportunidade-id').value;
    var nome = document.getElementById('oportunidade-nome').value.trim();
    var descricao = document.getElementById('oportunidade-descricao').value.trim();
    var link = document.getElementById('oportunidade-link').value.trim();
    var exibirAluno = document.getElementById('oportunidade-port-aluno').checked;
    var exibirFormado = document.getElementById('oportunidade-port-formado').checked;
    var exibirDocente = document.getElementById('oportunidade-port-docente').checked;
    var ativo = document.getElementById('oportunidade-ativo').checked;
    var fileInput = document.getElementById('oportunidade-img-file');
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;
    var img = document.getElementById('oportunidade-img-preview');
    if (!nome){ alert('Informe o nome'); return; }
    if (!descricao){ alert('Informe a descrição'); return; }
    if (!exibirAluno && !exibirFormado && !exibirDocente){ alert('Selecione pelo menos um portal'); return; }
    var btns = document.querySelectorAll('#oportunidade-modal .btn-primary');
    btns.forEach(function(b){ b.disabled = true; });
    try {
      var imagem = (img && img.dataset.url) ? img.dataset.url : '';
      if (file){
        imagem = await uploadImagem(file);
      }
      var dados = {
        nome: nome,
        descricao: descricao,
        link: link,
        imagem: imagem || '',
        exibirAluno: exibirAluno,
        exibirFormado: exibirFormado,
        exibirDocente: exibirDocente,
        ativo: ativo,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (id){
        await db.collection('oportunidades').doc(id).update(dados);
      } else {
        dados.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('oportunidades').add(dados);
      }
      oportunidadeFecharForm();
      carregarLista();
      alert('Oportunidade salva com sucesso!');
    } catch(e){
      console.error('Erro ao salvar oportunidade:', e);
      alert('Erro ao salvar oportunidade: ' + (e.message || 'Verifique conexão/permissões.'));
    } finally {
      btns.forEach(function(b){ b.disabled = false; });
    }
  };
})();
