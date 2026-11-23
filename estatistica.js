/* =====================================================================
   ESTATISTICA - painel somente de leitura do Admin
   ---------------------------------------------------------------------
   Nao grava nada. Le o espelho local do FarnDB (atualizado pelo polling
   do proprio adaptador) e recalcula os numeros a cada segundo enquanto a
   secao estiver aberta.

   Fontes (nenhuma colecao nova):
   - cursosCadastro (cursos) e seus subcollections individuos,
     fichaAvaliacoes, aulas e apontamentos;
   - apontamentosAdm (apontamento de presenca do docente, GPS/QR e horario);
   - docentesAdmin (quadro de docentes);
   - apostilasAlunos (material cadastrado).

   Satisfacao do aluno sobre o docente e confirmacao de entrega de material
   ainda nao tem campo proprio no sistema. O painel reconhece os nomes mais
   usados quando esses campos passam a existir e mostra "sem dados" ate la,
   sem inventar numero.
   ===================================================================== */
(function (global) {
    'use strict';

    var TOLERANCIA_MIN = 15;          // minutos para apontamento "no horario"
    var TIMER = null;
    var CARREGANDO = false;
    var ULTIMO = null;
    var ULTIMO_SIG = '';
    var ULTIMA_LEITURA = null;
    var FILTRO_CURSO = '';
    var ERRO = '';

    /* ----------------------------- utilitarios -------------------------- */
    function db() {
        return (typeof dbFirestore !== 'undefined' && dbFirestore) ? dbFirestore : null;
    }
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function num(v) {
        var x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
        return isNaN(x) ? 0 : x;
    }
    function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
    function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function dataKey(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return '';
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[1] + '-' + m[2] + '-' + m[3];
        m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        var d = new Date(s);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    function fmtDia(k) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || ''))) return k || '-';
        var p = String(k).split('-');
        return p[2] + '/' + p[1];
    }
    function fmtHora(d) {
        if (!d) return '--:--:--';
        try {
            return d.toLocaleTimeString('pt-BR', { hour12: false });
        } catch (e) {
            return String(d).slice(11, 19);
        }
    }
    function minutosPrevistos(dataValor, horaValor) {
        var dk = dataKey(dataValor);
        var hm = String(horaValor == null ? '' : horaValor).match(/^(\d{1,2}):(\d{2})/);
        if (!dk || !hm) return null;
        var hh = String(hm[1]).padStart(2, '0');
        var dt = new Date(dk + 'T' + hh + ':' + hm[2] + ':00');
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }
    function diferencaMinutos(reg) {
        var previsto = minutosPrevistos(reg.dataAula, reg.horaAula);
        var real = Date.parse(reg.apontadoEm || '');
        if (previsto == null || isNaN(real)) return null;
        return Math.round((real - previsto) / 60000);
    }
    function ehAluno(p) {
        if (!p) return false;
        var tipo = String(p.tipoPessoa || '').toUpperCase();
        var sit = String(p.situacaoCurso || '');
        var status = String(p.status || '');
        if (tipo === 'F' || sit === 'Formado' || status === 'Formado') return false;
        return tipo === 'A' || sit !== '' || /acad/i.test(status) || !p.tipoPessoa;
    }
    function temNota(av) {
        if (!av) return false;
        var mapas = ['notasTeoricas', 'notasPraticas', 'avTeoricaManual', 'avPraticaManual'];
        for (var i = 0; i < mapas.length; i++) {
            var m = av[mapas[i]];
            if (m && typeof m === 'object' && Object.keys(m).length) return true;
        }
        var simples = ['avFinalTeorica', 'avFinalPratica', 'mediaTeoricaManual', 'mediaPraticaManual'];
        for (var j = 0; j < simples.length; j++) {
            var v = av[simples[j]];
            if (v !== '' && v != null && String(v).trim() !== '') return true;
        }
        return false;
    }
    function separarAulas(aulas) {
        var lista = aulas || [];
        return {
            todas: lista,
            teorica: lista.filter(function (a) {
                return String(a.avTeorica || '') === 'Sim' || /teor/i.test(String(a.tipo || ''));
            }),
            pratica: lista.filter(function (a) {
                return String(a.avPratica || '') === 'Sim' || /pratic/i.test(String(a.tipo || ''));
            })
        };
    }
    function calcularAluno(ficha, aulas) {
        var f = ficha || {};
        var av = f.av || {};
        var foP = (av.foPositivos || []).length;
        var foN = (av.foNegativos || []).length;
        var pontos = Math.floor(foP / 10) - Math.floor(foN / 5);
        var aprovado = false;
        var notaCert = null;
        var avaliado = temNota(av);

        /* Usa a mesma regra da Ficha do Curso quando o nucleo compartilhado
           estiver carregado. Assim os numeros conferem com a tela oficial. */
        if (typeof fichaGeralCalcular === 'function') {
            try {
                var r = fichaGeralCalcular(
                    { turma: f.turma || '', projeto: f.projeto || '' },
                    Object.assign({}, f, { av: av }),
                    separarAulas(aulas)
                );
                foP = r.foP; foN = r.foN; pontos = r.pontosComp;
                aprovado = !!r.aprovado;
                notaCert = (r.notaCertificadora === '' || r.notaCertificadora == null)
                    ? null : num(r.notaCertificadora);
            } catch (e) { /* fallback abaixo */ }
        }
        if (notaCert == null && avaliado) {
            var somaT = 0, qtdT = 0, somaP = 0, qtdP = 0;
            Object.keys(av.notasTeoricas || {}).forEach(function (k) {
                var n = num(av.notasTeoricas[k]); if (n > 0) { somaT += n; qtdT++; }
            });
            Object.keys(av.notasPraticas || {}).forEach(function (k) {
                var n = num(av.notasPraticas[k]); if (n > 0) { somaP += n; qtdP++; }
            });
            var autoT = qtdT ? Math.round((somaT / qtdT) * 10) / 10 : 0;
            var autoP = qtdP ? Math.round((somaP / qtdP) * 10) / 10 : 0;
            var manualT = String(av.mediaTeoricaManual || '').trim();
            var manualP = String(av.mediaPraticaManual || '').trim();
            var mT = manualT ? Math.max(0, Math.min(10, num(manualT))) : autoT;
            var mP = manualP ? Math.max(0, Math.min(10, num(manualP))) : autoP;
            var media = Math.round(((mT + mP) / 2) * 10) / 10;
            var ft = String(av.avFinalTeorica || '').trim();
            var fp = String(av.avFinalPratica || '').trim();
            var fin = (ft || fp)
                ? (((ft ? num(ft) : 0) + (fp ? num(fp) : 0)) / 2) : 0;
            notaCert = Math.round(Math.max(0, Math.min(10, (media + fin) / 2)) * 10) / 10;
            aprovado = notaCert >= 7;
        }
        return { foP: foP, foN: foN, pontos: pontos, aprovado: aprovado,
            notaCert: notaCert, avaliado: avaliado };
    }

    /* ------------------- satisfacao / material (campos opcionais) ------- */
    function boolMaterial(v) {
        if (typeof v === 'boolean') return v;
        var s = String(v == null ? '' : v).trim().toLowerCase();
        if (!s) return null;
        if (/^(sim|s|1|true|entregue|recebido|confirmado|ok|liberado)$/.test(s)) return true;
        if (/^(nao|não|n|0|false|pendente|faltante|nao entregue)$/.test(s)) return false;
        return null;
    }
    function lerMaterial(obj) {
        if (!obj || typeof obj !== 'object') return null;
        var chaves = ['materialEntregue', 'entregaMaterial', 'materialRecebido',
            'materiaisEntregues', 'confirmacaoMaterial', 'confirmMaterial',
            'materialLiberado'];
        for (var i = 0; i < chaves.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(obj, chaves[i])) continue;
            var b = boolMaterial(obj[chaves[i]]);
            if (b !== null) return b;
        }
        if (obj.material && typeof obj.material === 'object') {
            var interno = lerMaterial(obj.material);
            if (interno !== null) return interno;
        }
        return null;
    }
    function materiaisDoRegistro(reg) {
        var out = [];
        if (!reg || typeof reg !== 'object') return out;
        var geral = lerMaterial(reg);
        if (geral !== null) out.push({ cpf: '', ok: geral });
        (reg.alunos || []).forEach(function (al) {
            var v = lerMaterial(al);
            if (v !== null) out.push({ cpf: soDigitos(al.cpf), ok: v });
        });
        var mapas = [reg.materialConfirmacoes, reg.materiaisPorAluno, reg.entregaMaterialAlunos];
        mapas.forEach(function (mapa) {
            if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return;
            Object.keys(mapa).forEach(function (k) {
                out.push({ cpf: soDigitos(k), ok: boolMaterial(mapa[k]) !== false });
            });
        });
        return out;
    }
    function extrairSatisfacao(obj) {
        if (!obj || typeof obj !== 'object') return null;
        var chaves = ['satisfacao', 'satisfacaoDocente', 'notaSatisfacao',
            'notaDocente', 'avaliacaoDocente', 'notaSatisfacaoAluno'];
        function ler(o) {
            if (!o || typeof o !== 'object') return null;
            for (var i = 0; i < chaves.length; i++) {
                if (!Object.prototype.hasOwnProperty.call(o, chaves[i])) continue;
                var n = num(o[chaves[i]]);
                if (n > 0) return Math.min(10, n);
            }
            if (o.avaliacao && typeof o.avaliacao === 'object') return ler(o.avaliacao);
            return null;
        }
        var direto = ler(obj);
        if (direto != null) return direto;
        var notas = [];
        (obj.alunos || []).forEach(function (al) {
            var n = ler(al);
            if (n != null) notas.push(n);
        });
        if (!notas.length) return null;
        return Math.round((notas.reduce(function (a, b) { return a + b; }, 0) / notas.length) * 10) / 10;
    }

    /* ----------------------------- processamento ------------------------ */
    function processar(cursos, detalhes, apontAdm, docentes, apostilas, satisfacoes) {
        var porCurso = [];
        var materialPorCurso = [];

        cursos.forEach(function (c, idx) {
            var dt = detalhes[idx] || {};
            var individuos = dt.ind || [];
            var fichas = dt.fich || [];
            var aulas = dt.aul || [];
            var aptCurso = dt.apt || [];
            var cpfsCurso = {};
            individuos.forEach(function (p) {
                var k = soDigitos(p.cpf); if (k) cpfsCurso[k] = p;
            });
            var alunos = individuos.filter(ehAluno);
            var fichaPorCpf = {};
            fichas.forEach(function (f) {
                var k = soDigitos(f.cpf); if (k) fichaPorCpf[k] = f;
            });

            var dias = {}, totalPres = 0, totalFal = 0, totalJust = 0;
            function addPres(data, status, chave) {
                var dia = dataKey(data);
                var cat = String(status || '');
                if (!dia || (cat !== 'Presente' && cat !== 'Falta' && cat !== 'Justificada')) return;
                var linha = dias[dia] || (dias[dia] = {
                    Presente: 0, Falta: 0, Justificada: 0, vistos: {}
                });
                var ck = String(chave || '') + '|' + dia + '|' + cat;
                if (linha.vistos[ck]) return;
                linha.vistos[ck] = 1;
                linha[cat]++;
                if (cat === 'Presente') totalPres++;
                else if (cat === 'Falta') totalFal++;
                else totalJust++;
            }
            fichas.forEach(function (f) {
                (f.presencas || []).forEach(function (p) {
                    addPres(p.dataAula || p.data || p.criadoEm, p.status,
                        'f|' + soDigitos(f.cpf) + '|' + (p.apontamentoId || p.aulaId || p._id || ''));
                });
            });
            aptCurso.forEach(function (a) {
                (a.alunos || []).forEach(function (al) {
                    if (!cpfsCurso[soDigitos(al.cpf)]) return;
                    addPres(a.dataAula, al.status, 'c|' + (a._id || a.dataAula || ''));
                });
            });
            apontAdm.forEach(function (a) {
                if (a.cursoId && String(a.cursoId) !== String(c._id)) return;
                (a.alunos || []).forEach(function (al) {
                    if (!cpfsCurso[soDigitos(al.cpf)]) return;
                    addPres(a.dataAula || a.criadoEm, al.status, 'a|' + (a._id || ''));
                });
            });

            var foP = 0, foN = 0, pontos = 0, avaliados = 0, aprovados = 0;
            alunos.forEach(function (p) {
                var f = fichaPorCpf[soDigitos(p.cpf)] || {};
                var r = calcularAluno(f, aulas);
                foP += r.foP; foN += r.foN; pontos += r.pontos;
                if (r.avaliado) { avaliados++; if (r.aprovado) aprovados++; }
            });

            var listaDias = Object.keys(dias).sort().reverse().map(function (k) {
                return { dia: k, Presente: dias[k].Presente, Falta: dias[k].Falta, Justificada: dias[k].Justificada };
            });
            porCurso.push({
                id: c._id, nome: c.nome || c._id,
                individuos: individuos.length, alunos: alunos.length,
                pres: totalPres, faltas: totalFal, just: totalJust,
                dias: listaDias, foP: foP, foN: foN, pontos: pontos,
                avaliados: avaliados, aprovados: aprovados
            });

            var confirmados = {};
            function addMaterial(reg) {
                materiaisDoRegistro(reg).forEach(function (x) {
                    if (x.ok !== true) return;
                    if (x.cpf && cpfsCurso[x.cpf]) confirmados[x.cpf] = true;
                    else if (!x.cpf) Object.keys(cpfsCurso).forEach(function (k) { confirmados[k] = true; });
                });
            }
            aptCurso.forEach(addMaterial);
            apontAdm.forEach(function (a) {
                if (a.cursoId && String(a.cursoId) !== String(c._id)) return;
                addMaterial(a);
            });
            var disponiveis = apostilas.filter(function (a) {
                return String(a.cursoId || '') === String(c._id);
            }).length;
            materialPorCurso.push({
                id: c._id, nome: c.nome || c._id, total: alunos.length,
                confirmados: Object.keys(confirmados).length,
                pendentes: Math.max(0, alunos.length - Object.keys(confirmados).length),
                disponiveis: disponiveis
            });
        });

        /* ------------------------------ docentes ------------------------- */
        var mapaDoc = {};
        docentes.forEach(function (d) {
            var id = String(d.id);
            mapaDoc[id] = {
                id: id, nome: d.nome || 'Docente sem nome', cpf: d.cpf || '',
                total: 0, noHorario: 0, atrasado: 0, adiantado: 0,
                semApontamento: 0, semHorario: 0, satisf: 0, satisfN: 0
            };
        });
        function docenteDe(reg) {
            var id = String(reg.docenteId || '');
            if (id && mapaDoc[id]) return mapaDoc[id];
            var nome = String(reg.docenteNome || reg.docente || '').trim();
            var achou = null;
            Object.keys(mapaDoc).forEach(function (k) {
                if (nome && String(mapaDoc[k].nome).toLowerCase() === nome.toLowerCase()) achou = mapaDoc[k];
            });
            if (achou) return achou;
            if (nome) {
                var chave = 'nome:' + nome.toLowerCase();
                if (!mapaDoc[chave]) {
                    mapaDoc[chave] = {
                        id: '', nome: nome, cpf: reg.docenteCpf || '',
                        total: 0, noHorario: 0, atrasado: 0, adiantado: 0,
                        semApontamento: 0, semHorario: 0, satisf: 0, satisfN: 0
                    };
                }
                return mapaDoc[chave];
            }
            return null;
        }
        var fontes = apontAdm.slice();
        cursos.forEach(function (c, idx) {
            (detalhes[idx].apt || []).forEach(function (a) {
                fontes.push(Object.assign({ _cursoId: c._id }, a));
            });
        });
        fontes.forEach(function (reg) {
            var d = docenteDe(reg);
            if (!d) return;
            d.total++;
            if (!reg.apontadoEm) {
                d.semApontamento++;
            } else {
                var diff = diferencaMinutos(reg);
                if (diff == null) d.semHorario++;
                else if (Math.abs(diff) <= TOLERANCIA_MIN) d.noHorario++;
                else if (diff > TOLERANCIA_MIN) d.atrasado++;
                else d.adiantado++;
            }
            var s = extrairSatisfacao(reg);
            if (s != null) { d.satisf += s; d.satisfN++; }
        });
        satisfacoes.forEach(function (sr) {
            var alvo = null;
            var cpfS = soDigitos(sr.docenteCpf || sr.cpf || '');
            Object.keys(mapaDoc).forEach(function (k) {
                if (cpfS && soDigitos(mapaDoc[k].cpf) === cpfS) alvo = mapaDoc[k];
            });
            if (!alvo) alvo = docenteDe(sr);
            var s = extrairSatisfacao(sr);
            if (alvo && s != null) { alvo.satisf += s; alvo.satisfN++; }
        });
        var listaDocentes = Object.keys(mapaDoc).map(function (k) {
            var d = mapaDoc[k];
            d.satisfacao = d.satisfN ? Math.round((d.satisf / d.satisfN) * 10) / 10 : null;
            return d;
        }).sort(function (a, b) {
            return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        });

        return {
            porCurso: porCurso,
            docentes: listaDocentes,
            materialPorCurso: materialPorCurso,
            totalApostilas: apostilas.length,
            totalApontamentosAdm: apontAdm.length,
            tolerancia: TOLERANCIA_MIN
        };
    }

    /* ------------------------------- leitura ---------------------------- */
    async function carregarSatisfacoes(d) {
        var out = [];
        var nomes = ['avaliacoesDocentes', 'satisfacaoDocentes', 'feedbackDocentes'];
        for (var i = 0; i < nomes.length; i++) {
            try {
                var snap = await d.collection(nomes[i]).get();
                snap.forEach(function (x) {
                    out.push(Object.assign({ _id: x.id, _colecao: nomes[i] }, x.data() || {}));
                });
            } catch (e) { /* colecao ainda nao existe: sem nota de satisfacao */ }
        }
        return out;
    }

    async function carregar() {
        if (CARREGANDO) return;
        var d = db();
        if (!d) {
            ERRO = 'Banco de dados ainda nao conectado. Aguarde e tente novamente.';
            renderErro();
            return;
        }
        CARREGANDO = true;
        try {
            var cursos = [];
            var snapC = await d.collection('cursosCadastro').get();
            snapC.forEach(function (x) {
                cursos.push(Object.assign({ _id: x.id }, x.data() || {}));
            });
            cursos.sort(function (a, b) {
                return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
            });

            var respostas = await Promise.all([
                d.collection('apontamentosAdm').get(),
                d.collection('docentesAdmin').get(),
                d.collection('apostilasAlunos').get(),
                carregarSatisfacoes(d)
            ]);
            var apontAdm = [], docentes = [], apostilas = [];
            respostas[0].forEach(function (x) { apontAdm.push(Object.assign({ _id: x.id }, x.data() || {})); });
            respostas[1].forEach(function (x) { docentes.push(Object.assign({ id: x.id }, x.data() || {})); });
            respostas[2].forEach(function (x) { apostilas.push(Object.assign({ _id: x.id }, x.data() || {})); });
            var satisfacoes = respostas[3] || [];

            var detalhes = await Promise.all(cursos.map(function (c) {
                var base = 'cursosCadastro/' + c._id + '/';
                return Promise.all([
                    d.collection(base + 'individuos').get(),
                    d.collection(base + 'fichaAvaliacoes').get(),
                    d.collection(base + 'aulas').get(),
                    d.collection(base + 'apontamentos').get()
                ]).then(function (partes) {
                    var ind = [], fich = [], aul = [], apt = [];
                    partes[0].forEach(function (x) { ind.push(Object.assign({ _id: x.id }, x.data() || {})); });
                    partes[1].forEach(function (x) { fich.push(Object.assign({ _id: x.id }, x.data() || {})); });
                    partes[2].forEach(function (x) { aul.push(Object.assign({ _id: x.id }, x.data() || {})); });
                    partes[3].forEach(function (x) { apt.push(Object.assign({ _id: x.id }, x.data() || {})); });
                    return { ind: ind, fich: fich, aul: aul, apt: apt };
                });
            }));

            var resultado = processar(cursos, detalhes, apontAdm, docentes, apostilas, satisfacoes);
            var sig = JSON.stringify(resultado);
            ULTIMA_LEITURA = new Date();
            ERRO = '';
            if (sig !== ULTIMO_SIG) {
                ULTIMO = resultado;
                ULTIMO_SIG = sig;
                render();
            } else {
                atualizarHora();
            }
        } catch (e) {
            ERRO = 'Erro ao ler os dados: ' + (e && e.message ? e.message : e);
            renderErro();
        } finally {
            CARREGANDO = false;
        }
    }

    /* ------------------------------- render ----------------------------- */
    function atualizarHora() {
        var el = document.getElementById('estat-hora');
        if (el) el.textContent = fmtHora(ULTIMA_LEITURA || new Date());
    }
    function renderErro() {
        var box = document.getElementById('estat-erro');
        if (!box) return;
        if (!ERRO) { box.style.display = 'none'; box.textContent = ''; return; }
        box.style.display = '';
        box.textContent = ERRO;
    }
    function vazio(txt) {
        return '<div class="estat-vazio">' + esc(txt) + '</div>';
    }
    function renderAlunos(r) {
        var lista = r.porCurso.filter(function (c) {
            return !FILTRO_CURSO || String(c.id) === String(FILTRO_CURSO);
        });
        if (!lista.length) return vazio('Nenhum curso cadastrado.');
        var html = '<div class="estat-tabela"><table class="data-table"><thead><tr>'
            + '<th>Curso</th><th>Alunos</th><th>Presença / Faltas por dia</th>'
            + '<th>Comportamento</th><th>Expectativa positiva</th></tr></thead><tbody>';
        lista.forEach(function (c) {
            var dias = c.dias.slice(0, 6).map(function (d) {
                return '<div class="estat-dia"><b>' + esc(fmtDia(d.dia)) + '</b> '
                    + '<span class="estat-p">P ' + d.Presente + '</span> '
                    + '<span class="estat-f">F ' + d.Falta + '</span> '
                    + (d.Justificada ? '<span class="estat-j">J ' + d.Justificada + '</span>' : '')
                    + '</div>';
            }).join('');
            var expect = c.avaliados
                ? '<b style="color:' + (pct(c.aprovados, c.avaliados) >= 70 ? '#16a34a' : '#d97706') + '">'
                    + pct(c.aprovados, c.avaliados) + '%</b>'
                    + '<br><span>' + c.aprovados + ' de ' + c.avaliados + ' avaliados</span>'
                : '<span style="color:#94a3b8">Sem notas lançadas</span>';
            html += '<tr>'
                + '<td><b>' + esc(c.nome) + '</b><br><span>' + c.individuos + ' indivíduo(s)</span></td>'
                + '<td><b style="font-size:17px;color:#0f172a">' + c.alunos + '</b></td>'
                + '<td>' + (dias || '<span style="color:#94a3b8">Sem presenças apontadas</span>')
                    + (c.dias.length > 6 ? '<div class="estat-mais">+ ' + (c.dias.length - 6) + ' dia(s)</div>' : '')
                    + '<div class="estat-totais">Total: <span class="estat-p">' + c.pres + ' P</span> · '
                    + '<span class="estat-f">' + c.faltas + ' F</span> · '
                    + '<span class="estat-j">' + c.just + ' J</span></div></td>'
                + '<td><span class="estat-pill estat-foP">FO+ ' + c.foP + '</span> '
                    + '<span class="estat-pill estat-foN">FO- ' + c.foN + '</span>'
                    + '<br><span>' + (c.pontos >= 0 ? '+' : '') + c.pontos + ' ponto(s) na AV</span></td>'
                + '<td>' + expect + '</td></tr>';
        });
        return html + '</tbody></table></div>';
    }
    function renderDocentes(r) {
        var lista = r.docentes;
        if (!lista.length) return vazio('Nenhum docente cadastrado.');
        var html = '<div class="estat-tabela"><table class="data-table"><thead><tr>'
            + '<th>Docente</th><th>Apontamentos</th><th>Horário da aula</th><th>Satisfação</th></tr></thead><tbody>';
        lista.forEach(function (d) {
            var horario = d.total
                ? '<span class="estat-pill estat-ok">No horário ' + d.noHorario + '</span> '
                    + '<span class="estat-pill estat-ruim">Atrasado ' + d.atrasado + '</span> '
                    + '<span class="estat-pill estat-neutro">Adiantado ' + d.adiantado + '</span> '
                    + '<br><span>Sem apontamento: ' + d.semApontamento
                    + (d.semHorario ? ' · Sem horário cadastrado: ' + d.semHorario : '')
                    + '</span>'
                : '<span style="color:#94a3b8">Sem apontamentos</span>';
            var sat = d.satisfacao != null
                ? '<b style="font-size:17px;color:#0f766e">' + String(d.satisfacao).replace('.', ',') + ' / 10</b>'
                    + '<br><span>' + d.satisfN + ' avaliação(ões)</span>'
                : '<span style="color:#94a3b8">Sem nota de satisfação cadastrada</span>';
            html += '<tr><td><b>' + esc(d.nome) + '</b>'
                + (d.cpf ? '<br><span>' + esc(d.cpf) + '</span>' : '') + '</td>'
                + '<td><b style="font-size:17px">' + d.total + '</b><br><span>tolerância ±' + r.tolerancia + ' min</span></td>'
                + '<td>' + horario + '</td><td>' + sat + '</td></tr>';
        });
        return html + '</tbody></table></div>';
    }
    function renderMaterial(r) {
        var lista = r.materialPorCurso.filter(function (c) {
            return !FILTRO_CURSO || String(c.id) === String(FILTRO_CURSO);
        });
        if (!lista.length) return vazio('Nenhum curso cadastrado.');
        var html = '<div class="estat-tabela"><table class="data-table"><thead><tr>'
            + '<th>Curso</th><th>Alunos</th><th>Material cadastrado</th>'
            + '<th>Confirmação de entrega</th></tr></thead><tbody>';
        lista.forEach(function (c) {
            var status = !c.total ? '<span style="color:#94a3b8">Sem alunos</span>'
                : (c.confirmados === 0
                    ? '<span class="estat-pill estat-ruim">Sem apontamento de material</span>'
                    : (c.pendentes === 0
                        ? '<span class="estat-pill estat-ok">Todos confirmados</span>'
                        : '<span class="estat-pill estat-alerta">' + c.pendentes + ' pendente(s)</span>'));
            html += '<tr><td><b>' + esc(c.nome) + '</b></td>'
                + '<td>' + c.total + '</td>'
                + '<td>' + (c.disponiveis ? c.disponiveis + ' apostila(s) neste curso' : 'Nenhuma apostila vinculada ao curso')
                    + '<br><span>' + r.totalApostilas + ' no sistema</span></td>'
                + '<td><b style="color:#16a34a;font-size:17px">' + c.confirmados + '</b> / ' + c.total
                    + '<br>' + status + '</td></tr>';
        });
        return html + '</tbody></table></div>';
    }
    function render() {
        if (!ULTIMO) return;
        renderErro();
        var sel = document.getElementById('estat-curso');
        if (sel) {
            var atual = FILTRO_CURSO;
            sel.innerHTML = '<option value="">Todos os cursos</option>' + ULTIMO.porCurso.map(function (c) {
                return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>';
            }).join('');
            sel.value = atual;
        }
        var cursos = document.getElementById('estat-total-cursos');
        if (cursos) cursos.textContent = String(ULTIMO.porCurso.length);
        var alunos = document.getElementById('estat-total-alunos');
        if (alunos) alunos.textContent = String(ULTIMO.porCurso.reduce(function (a, c) { return a + c.alunos; }, 0));
        var apont = document.getElementById('estat-total-apontamentos');
        if (apont) apont.textContent = String(ULTIMO.totalApontamentosAdm);
        var aAlunos = document.getElementById('estat-alunos');
        if (aAlunos) aAlunos.innerHTML = renderAlunos(ULTIMO);
        var aDoc = document.getElementById('estat-docentes');
        if (aDoc) aDoc.innerHTML = renderDocentes(ULTIMO);
        var aMat = document.getElementById('estat-material');
        if (aMat) aMat.innerHTML = renderMaterial(ULTIMO);
        atualizarHora();
    }

    /* ------------------------------- ciclo de vida ---------------------- */
    function inicializar() {
        if (!podeVer()) {
            var box = document.getElementById('estat-erro');
            if (box) {
                box.style.display = '';
                box.textContent = 'Seu perfil não tem permissão para acessar ESTATISTICA.';
            }
            return;
        }
        if (!TIMER) {
            TIMER = setInterval(function () {
                carregar();          // relê o espelho local a cada segundo
            }, 1000);
        }
        carregar();
    }
    function parar() {
        if (TIMER) { clearInterval(TIMER); TIMER = null; }
    }
    function podeVer() {
        if (typeof admPermItem === 'function') return admPermItem('sec:estatistica', 'ver');
        return true;
    }
    function atualizar() {
        ULTIMO_SIG = '';
        carregar();
    }
    function filtroChange() {
        var sel = document.getElementById('estat-curso');
        FILTRO_CURSO = sel ? sel.value : '';
        render();
    }

    global.estatInicializar = inicializar;
    global.estatisticaInicializar = inicializar;
    global.estatParar = parar;
    global.estatAtualizar = atualizar;
    global.estatFiltroChange = filtroChange;
})(window);
