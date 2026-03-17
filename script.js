// ============================================================
// === PARTE 1: FUNDAÇÃO, AUDITORIA E LOGIN ===
// ============================================================

window.db = { funcionarios: [], presencas: {}, pagamentos: [], extras: [], users: [], entregas: [], audit: [], boletos: [] };
window.currentUser = null;
let editingId = null;
let secaoAtual = 'dashboard';

// --- FORMATADORES GERAIS ---
const fmtMoeda = (v) => parseFloat(v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const fmtData = (d) => { if(!d) return '-'; return new Date(d).toLocaleDateString('pt-BR', {timeZone: 'UTC'}); };
const fmtDataSimples = (d) => { if(!d) return '--/--/--'; const [ano, mes, dia] = d.split('-'); return `${dia}/${mes}/${ano}`; };

window.copiarTexto = function(texto) { 
    const el = document.createElement('textarea'); 
    el.value = texto; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); 
    alert('Chave Pix copiada!'); 
}

// --- AUDITORIA E PERMISSÕES ---
function registrarLog(acao, detalhes) {
    const log = { data: new Date().toISOString(), user: window.currentUser ? window.currentUser.user : 'desconhecido', acao, detalhes };
    if(!window.db.audit) window.db.audit = [];
    window.db.audit.push(log);
    if (window.db.audit.length > 200) window.db.audit = window.db.audit.slice(-200);
}

window.renderizarAudit = function() {
    const tbody = document.getElementById('tbodyAudit');
    if(!tbody) return;
    tbody.innerHTML = '';
    const logs = [...(window.db.audit || [])].sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 100);
    if(logs.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#aaa;">Nenhum registro encontrado.</td></tr>'; return; }
    logs.forEach(l => {
        const d = new Date(l.data);
        const dataFmt = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        tbody.innerHTML += `<tr><td>${dataFmt}</td><td><strong>${l.user}</strong></td><td>${l.acao}</td><td>${l.detalhes}</td></tr>`;
    });
}

function verificarPermissao(tipo) {
    if (window.currentUser && window.currentUser.isAdmin) return true;
    if (window.currentUser && window.currentUser.perms && window.currentUser.perms[tipo] === true) return true;
    return false;
}

function checkPerm(tipo) {
    if (!verificarPermissao(tipo)) { alert("⛔ ACESSO NEGADO: Você não tem permissão para realizar esta ação."); return false; }
    return true;
}

// --- NAVEGAÇÃO E TEMA ---
window.showSection = function(id, btnElement) {
    secaoAtual = id; 
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    if(btnElement) btnElement.classList.add('active');

    // Atualiza apenas a seção visível
    if(id === 'previsao' && window.atualizarPrevisao) window.atualizarPrevisao();
    if(id === 'extras' && window.renderizarExtras) window.renderizarExtras();
    if(id === 'dashboard' && window.atualizarDashboard) window.atualizarDashboard();
    if(id === 'seguranca') renderizarAudit();
    if(id === 'pagamentos' && window.atualizarPainelPagamentos) window.atualizarPainelPagamentos();
    if(id === 'boletos' && window.renderizarBoletos) window.renderizarBoletos();
    if(id === 'motoboys' && window.renderizarMotoboys) {
        window.renderizarMotoboys();
        const sel = document.getElementById('selMotoId');
        if (sel && sel.options.length <= 1) {
             sel.innerHTML = '<option value="">Selecione...</option>';
             (window.db.funcionarios || []).forEach(f => {
                sel.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
            });
        }
    }
}

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-theme');
    if(window.atualizarDashboard) window.atualizarDashboard();
}

// --- LOGIN (COM BACKDOOR PARA O MESTRE) ---
window.tentarLogin = async function() {
    const user = document.getElementById('loginUser').value.toLowerCase();
    const pass = document.getElementById('loginPass').value;
    
    // Se o banco estiver vazio, cria o seu acesso na marra!
    if(!window.db.users || window.db.users.length === 0) {
        if(user === 'expeto') {
            const novoUser = { id: Date.now(), user: 'Expeto', pass: pass || '1234', isAdmin: true };
            window.currentUser = novoUser;
            if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_users', novoUser.id, novoUser);
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('user-badge').innerText = `👤 Expeto (Mestre)`;
            window.showSection('dashboard');
            if(window.renderizarTudo) setTimeout(() => window.renderizarTudo(), 500);
            return;
        }
        alert("⏳ Banco vazio. Use 'expeto' para forçar entrada se for o mestre."); return;
    }

    const u = window.db.users.find(x => x.user.toLowerCase() === user && x.pass === pass);
    if(u) {
        window.currentUser = u;
        document.getElementById('login-screen').style.display = 'none';
        
        const badge = document.getElementById('user-badge');
        const btnSeguranca = document.getElementById('btnSeguranca');
        const btnBoletos = document.getElementById('btnMenuBoletos');

        if (u.isAdmin) {
            badge.innerHTML = `👑 ${u.user.toUpperCase()} (ADMIN)`;
            badge.style.color = '#f1c40f';
            if(btnSeguranca) btnSeguranca.style.display = 'flex';
            if(btnBoletos) btnBoletos.style.display = 'flex';
        } else {
            badge.innerHTML = `👤 ${u.user.toUpperCase()}`;
            badge.style.color = 'white';
            if(btnSeguranca) btnSeguranca.style.display = 'none';
            if(btnBoletos) btnBoletos.style.display = (u.perms && u.perms.boletos) ? 'flex' : 'none';
        }
        
        registrarLog('Sistema', 'Usuário logou no painel');
        window.showSection('dashboard');
        if(window.renderizarTudo) setTimeout(() => window.renderizarTudo(), 500);
    } else { 
        document.getElementById('loginError').style.display = 'block'; 
    }
}
window.checkLogin = window.tentarLogin;

// Atalho para garantir que as datas carreguem na segunda-feira atual
window.onload = () => {
    const hojeIso = new Date().toISOString().split('T')[0];
    ['dataPresenca', 'dataPagamento', 'dataComissao', 'dataDespesa', 'dataMoto'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = hojeIso;
    });
    if(window.definirInicioSemana) window.definirInicioSemana();
};
// ============================================================
// === PARTE 2: FUNCIONÁRIOS E LISTA DE PRESENÇA ===
// ============================================================

// --- GESTÃO DE FUNCIONÁRIOS ---
window.toggleTipoPagamento = function() {
    const tipoPrincipal = document.getElementById('fTipoPrincipal').value;
    const divFrequencia = document.getElementById('divFrequencia');
    const divPassagem = document.getElementById('divPassagem');
    const lblSalario = document.getElementById('lblSalario');
    if(tipoPrincipal === 'Mensalista') { 
        divFrequencia.style.display = 'flex'; 
        divPassagem.style.display = 'flex'; 
        lblSalario.innerText = "Salário Base Mensal (R$) *"; 
    } else { 
        divFrequencia.style.display = 'none'; 
        divPassagem.style.display = 'none'; 
        lblSalario.innerText = "Valor da Diária (R$) *"; 
    }
}

window.processarFormularioFuncionario = async function() {
    if(!checkPerm('func')) return; 

    const nome = document.getElementById('fNome').value;
    const empresa = document.getElementById('fEmpresa').value;
    const tipoPrincipal = document.getElementById('fTipoPrincipal').value;
    let tipoFinal = (tipoPrincipal === 'Diaria') ? 'Diaria' : document.getElementById('fFrequencia').value;
    const cargo = document.getElementById('fCargo').value;
    const salario = parseFloat(document.getElementById('fSalario').value);
    const passagemInput = document.getElementById('fPassagem').value;
    const passagem = (tipoFinal !== 'Diaria' && passagemInput) ? parseFloat(passagemInput) : 0;
    const pix = document.getElementById('fPix').value;
    const cpf = document.getElementById('fCpf').value;
    const tel = document.getElementById('fTel').value;
    const nasc = document.getElementById('fNasc').value;
    const entrada = document.getElementById('fEntrada').value;
    const end = document.getElementById('fEnd').value;
    
    if (!nome || !cargo || !empresa || isNaN(salario)) return alert("Preencha os campos obrigatórios!");
    if (tipoFinal !== 'Diaria' && isNaN(passagem)) return alert("Preencha o valor da passagem!");
    
    let funcData = { nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };

    if (editingId !== null) {
        if(!confirm(`Salvar alterações para ${nome}?`)) return;
        funcData.id = editingId;
        registrarLog('Funcionario', `Editou funcionário ${nome}`);
        if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_funcionarios', funcData.id, funcData);
        alert("Atualizado!"); 
        window.cancelarEdicao();
    } else {
        funcData.id = Date.now();
        registrarLog('Funcionario', `Cadastrou funcionário ${nome}`);
        if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_funcionarios', funcData.id, funcData);
        alert("Cadastrado!");
        document.querySelectorAll('#funcionarios input').forEach(input => input.value = '');
    }
}

window.prepararEdicao = function(id) {
    if(!checkPerm('func')) return; 
    const func = window.db.funcionarios.find(f => f.id === id);
    if (!func) return;
    document.getElementById('fNome').value = func.nome;
    document.getElementById('fEmpresa').value = func.empresa;
    if (func.tipo === 'Diaria') { 
        document.getElementById('fTipoPrincipal').value = 'Diaria'; 
    } else { 
        document.getElementById('fTipoPrincipal').value = 'Mensalista'; 
        document.getElementById('fFrequencia').value = func.tipo || 'Mensal'; 
    }
    window.toggleTipoPagamento();
    document.getElementById('fCargo').value = func.cargo;
    document.getElementById('fSalario').value = func.salario;
    document.getElementById('fPassagem').value = func.passagem || '';
    document.getElementById('fPix').value = func.pix || '';
    document.getElementById('fCpf').value = func.cpf || '';
    document.getElementById('fTel').value = func.tel || '';
    document.getElementById('fNasc').value = func.nasc || '';
    document.getElementById('fEntrada').value = func.entrada || '';
    document.getElementById('fEnd').value = func.end || '';
    editingId = id;
    document.getElementById('tituloFormFunc').innerText = "✏️ Editando Funcionário";
    document.getElementById('tituloFormFunc').style.color = "#2980b9";
    document.getElementById('btnSalvarFunc').innerText = "💾 Salvar Alterações";
    document.getElementById('btnCancelarEdit').style.display = "block";
    document.getElementById('formFuncionarioCard').scrollIntoView({ behavior: 'smooth' });
}

window.cancelarEdicao = function() {
    editingId = null;
    document.querySelectorAll('#funcionarios input').forEach(input => input.value = '');
    document.getElementById('fTipoPrincipal').value = 'Mensalista';
    window.toggleTipoPagamento();
    document.getElementById('tituloFormFunc').innerText = "Cadastrar Novo Funcionário";
    document.getElementById('tituloFormFunc').style.color = "var(--text-main)";
    document.getElementById('btnSalvarFunc').innerText = "+ Cadastrar Funcionário";
    document.getElementById('btnCancelarEdit').style.display = "none";
}

window.removerFuncionario = async function(id) {
    if(!checkPerm('func')) return;
    if(confirm("ATENÇÃO: Deseja realmente excluir este funcionário?")) {
        const f = window.db.funcionarios.find(f => f.id === id);
        if(f) registrarLog('Funcionario', `Excluiu funcionário ${f.nome}`);
        if (editingId === id) window.cancelarEdicao();
        if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_funcionarios', id);
    }
}

// --- LISTA DE PRESENÇA ---
window.atualizarCorCard = function(selectElement) { 
    const card = selectElement.closest('.presenca-card'); 
    const valor = selectElement.value;
    card.classList.remove('card-Presente', 'card-Atrasado', 'card-Falta', 'card-Atestado', 'card-Folga', 'card-Pendente');
    if(valor) card.classList.add(`card-${valor}`);
    else card.classList.add('card-Pendente');
}

window.carregarListaPresenca = function() {
    const data = document.getElementById('dataPresenca').value;
    const filtroEmpresa = document.getElementById('filtroEmpresaPresenca').value;
    if(!data) return alert("Selecione uma data");
    
    const grid = document.getElementById('gridCards');
    grid.innerHTML = '';
    document.getElementById('areaPresenca').style.display = 'block';
    const btnTopo = document.getElementById('btnSalvarTopo');
    if(btnTopo) btnTopo.style.display = 'block';
    
    const registroDia = window.db.presencas[data] || [];
    const funcionariosFiltrados = (window.db.funcionarios || [])
        .filter(f => { if (!filtroEmpresa) return true; return f.empresa === filtroEmpresa; })
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); 
    
    funcionariosFiltrados.forEach(f => {
        const saved = registroDia.find(r => r.id === f.id);
        const status = saved ? saved.status : ''; 
        const obs = saved ? saved.obs : '';
        const cardClass = status ? `card-${status}` : 'card-Pendente';

        let tagClass = 'tag-mensal'; let tagText = 'MENSAL';
        if(f.tipo === 'Quinzenal') { tagClass = 'tag-quinzenal'; tagText = 'QUINZENAL'; }
        else if(f.tipo === 'Semanal') { tagClass = 'tag-semanal'; tagText = 'SEMANAL'; }
        else if(f.tipo === 'Diaria') { tagClass = 'tag-diaria'; tagText = `DIÁRIA: ${fmtMoeda(f.salario)}`; }
        
        const tipoBadge = `<span class="tag-tipo ${tagClass}">${tagText}</span>`;
        const card = document.createElement('div');
        card.className = `presenca-card ${cardClass}`;
        card.setAttribute('data-id', f.id);
        card.innerHTML = `
            <div>
                <h4>${f.nome} ${tipoBadge}</h4>
                <span style="font-size:0.8rem; color:var(--accent); font-weight:bold;">🏢 ${f.empresa || '-'}</span>
            </div>
            <select class="status-presenca" onchange="atualizarCorCard(this)" style="margin-top:10px;">
                <option value="" disabled ${status === '' ? 'selected' : ''}>❓ Selecione a opção...</option>
                <option value="Presente" ${status === 'Presente' ? 'selected' : ''}>✅ Presente</option>
                <option value="Atrasado" ${status === 'Atrasado' ? 'selected' : ''}>⚠️ Atrasado</option>
                <option value="Falta" ${status === 'Falta' ? 'selected' : ''}>❌ Falta</option>
                <option value="Atestado" ${status === 'Atestado' ? 'selected' : ''}>🔵 Atestado</option>
                <option value="Folga" ${status === 'Folga' ? 'selected' : ''}>🟢 Folga</option>
            </select>
            <input type="text" class="obs-presenca" value="${obs}" placeholder="Observação (opcional)">
        `;
        grid.appendChild(card);
    });
}

window.salvarPresencaDia = async function() {
    if(!checkPerm('pres')) return; 
    const data = document.getElementById('dataPresenca').value;
    if(!data) return alert("Selecione uma data!");
    const cards = document.querySelectorAll('.presenca-card');
    if(cards.length === 0) return alert("Nenhum funcionário listado para salvar.");

    const listaExistente = window.db.presencas[data] || [];
    const mapaPresenca = new Map();
    listaExistente.forEach(p => { const idSeguro = parseInt(p.id); if (!isNaN(idSeguro)) mapaPresenca.set(idSeguro, p); });

    let contador = 0;
    cards.forEach(card => {
        const idCard = parseInt(card.getAttribute('data-id'));
        if (!isNaN(idCard)) {
            const select = card.querySelector('.status-presenca');
            const status = select ? select.value : '';
            const inputObs = card.querySelector('.obs-presenca');
            const obs = inputObs ? inputObs.value : '';
            mapaPresenca.set(idCard, { id: idCard, status: status, obs: obs });
            if(status) contador++;
        }
    });

    const listaFinal = Array.from(mapaPresenca.values());
    registrarLog('Presenca', `Salvou chamada de ${fmtData(data)} (${contador} registros)`);

    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_presencas', data, { data: data, registros: listaFinal });

    const btnSalvar = document.getElementById('btnSalvarTopo');
    if(btnSalvar) {
        const textoOriginal = btnSalvar.innerText;
        btnSalvar.innerText = "✅ Salvo!";
        btnSalvar.style.backgroundColor = "#27ae60";
        setTimeout(() => { btnSalvar.innerText = textoOriginal; btnSalvar.style.backgroundColor = ""; }, 2000);
    } else {
        alert("✅ Lista Salva com Sucesso!");
    }
}

// --- CUSTOM SELECT DE FUNCIONÁRIOS ---
window.toggleCustomSelect = function() {
    const dd = document.getElementById('customSelectDropdown');
    if(dd) {
        dd.classList.toggle('show');
        if(dd.classList.contains('show')) document.getElementById('customSelectSearch')?.focus();
    }
}

window.filtrarCustomSelect = function() {
    const termo = (document.getElementById('customSelectSearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('.custom-option-item');
    items.forEach(item => {
        const nomeAttr = item.getAttribute('data-nome');
        if(!nomeAttr) return; 
        item.style.display = nomeAttr.includes(termo) ? 'flex' : 'none';
    });
}

window.selecionarFuncionarioCustom = function(id, nome) {
    document.getElementById('customSelectLabel').innerHTML = id ? `✅ ${nome}` : `🔍 Selecione um funcionário...`;
    document.getElementById('customSelectDropdown').classList.remove('show');
    const busca = document.getElementById('customSelectSearch');
    if(busca) busca.value = ''; 
    window.filtrarCustomSelect(); 

    const selectOriginal = document.getElementById('selectFuncionarioPagamento');
    if(selectOriginal) {
        selectOriginal.value = id;
        if(window.atualizarPainelPagamentos) window.atualizarPainelPagamentos(); 
    }
}

document.addEventListener('click', function(e) {
    const trigger = document.getElementById('customSelectTrigger');
    const dropdown = document.getElementById('customSelectDropdown');
    if(trigger && dropdown) {
        if(!trigger.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('show');
    }
});
// ============================================================
// === PARTE 3: DASHBOARD, EXTRAS, BOLETOS E MOTOBOYS ===
// ============================================================

// --- DASHBOARD E GRÁFICOS ---
let myChartPizza = null;
let myChartBarra = null;

window.atualizarDashboard = function() {
    const totalSalarios = (window.db.pagamentos || []).filter(p => p.tipo === 'Salário').reduce((a,b) => a + b.valor, 0);
    const totalComissoes = (window.db.extras || []).filter(e => e.tipo === 'Comissao').reduce((a,b) => a + b.valor, 0);
    const totalEntregas = (window.db.entregas || []).reduce((a,b) => a + (b.valorTotal || 0), 0);
    const totalDespesas = (window.db.extras || []).filter(e => e.tipo === 'Despesa').reduce((a,b) => a + b.valor, 0);

    if(document.getElementById('dashSalarios')) document.getElementById('dashSalarios').innerText = fmtMoeda(totalSalarios);
    if(document.getElementById('dashComissoes')) document.getElementById('dashComissoes').innerText = fmtMoeda(totalComissoes);
    if(document.getElementById('dashMotoboys')) document.getElementById('dashMotoboys').innerText = fmtMoeda(totalEntregas);
    if(document.getElementById('dashDespesas')) document.getElementById('dashDespesas').innerText = fmtMoeda(totalDespesas);

    const rankingContainer = document.getElementById('rankingContainer');
    if(rankingContainer) {
        rankingContainer.innerHTML = '';
        const vendasPorFunc = {};
        (window.db.extras || []).filter(e => e.tipo === 'Comissao').forEach(c => { vendasPorFunc[c.beneficiario] = (vendasPorFunc[c.beneficiario] || 0) + c.valor; });
        const ranking = Object.entries(vendasPorFunc).sort((a,b) => b[1] - a[1]);
        ranking.forEach(([nome, valor], i) => {
            const medalha = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '👤'));
            rankingContainer.innerHTML += `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;"><span>${medalha} ${nome}</span><strong>${fmtMoeda(valor)}</strong></div>`;
        });
    }

    // Gráficos
    const ctxPizza = document.getElementById('graficoPizza');
    if(ctxPizza && window.Chart) {
        if(myChartPizza) myChartPizza.destroy();
        myChartPizza = new Chart(ctxPizza, {
            type: 'doughnut', data: { labels: ['Salários', 'Comissões', 'Despesas Loja'], datasets: [{ data: [totalSalarios, totalComissoes, totalDespesas], backgroundColor: ['#27ae60', '#8e44ad', '#e74c3c'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctxBarra = document.getElementById('graficoBarra');
    if(ctxBarra && window.Chart) {
        const vendas = {};
        (window.db.extras || []).filter(e => e.tipo === 'Comissao').forEach(c => { vendas[c.beneficiario] = (vendas[c.beneficiario] || 0) + c.valor; });
        const top5 = Object.entries(vendas).sort((a,b) => b[1] - a[1]).slice(0, 5);
        if(myChartBarra) myChartBarra.destroy();
        myChartBarra = new Chart(ctxBarra, {
            type: 'bar', data: { labels: top5.map(r => r[0]), datasets: [{ label: 'Comissões (R$)', data: top5.map(r => r[1]), backgroundColor: '#3498db' }] }, options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// --- RENDERS GERAIS ---
window.renderizarExtras = function() {
    const grid = document.getElementById('gridExtras');
    const filtroId = document.getElementById('filtroExtras')?.value;
    if(!grid) return;
    grid.innerHTML = '';
    
    let lista = [...(window.db.extras || [])];
    if (filtroId) lista = filtroId === 'DESPESAS' ? lista.filter(i => i.tipo === 'Despesa') : lista.filter(i => String(i.idFunc) === String(filtroId));
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));

    if (lista.length === 0) { grid.innerHTML = '<p style="text-align:center; width:100%;">Nenhum registro encontrado.</p>'; return; }

    lista.slice(0, 50).forEach(item => {
        const corCard = item.tipo === 'Comissao' ? 'extra-comissao' : 'extra-despesa';
        const corTexto = item.tipo === 'Comissao' ? 'txt-purple' : 'txt-orange';
        grid.innerHTML += `
            <div class="extra-card ${corCard}" style="padding:15px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <div><h4 class="${corTexto}" style="margin:0;">${item.categoria} - ${item.beneficiario}</h4><span style="font-size:0.8rem;">📅 ${fmtDataSimples(item.data)} | ${item.obs || ''}</span></div>
                <div style="text-align:right;"><div class="extra-val ${corTexto}">${fmtMoeda(item.valor)}</div><button onclick="removerExtra(${item.id})" style="background:none; border:none; cursor:pointer;">🗑️</button></div>
            </div>`;
    });
}

window.renderizarBoletos = function() {
    const grid = document.getElementById('gridBoletos');
    const filtro = document.getElementById('filtroBoletos')?.value || 'TODOS';
    if(!grid) return;
    grid.innerHTML = '';
    
    let totalV = 0, totalA = 0, totalP = 0;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    [...(window.db.boletos || [])].sort((a,b) => new Date(a.vencimento) - new Date(b.vencimento)).forEach(b => {
        const diff = new Date(b.vencimento + 'T12:00:00') - hoje;
        const dias = Math.ceil(diff / (1000 * 60 * 60 * 24)); 

        if(b.status === 'PAGO') totalP += b.valor;
        else { totalA += b.valor; if(dias < 0) totalV += b.valor; }

        if(filtro === 'PENDENTE' && b.status === 'PAGO') return;
        if(filtro === 'PAGO' && b.status !== 'PAGO') return;

        let borda = b.status==='PAGO' ? 'b-pago' : (dias<0 ? 'b-vencido' : (dias<=3 ? 'b-atencao' : 'b-dia'));
        let txt = b.status==='PAGO' ? '✅ PAGO' : (dias<0 ? `🚨 Venceu há ${Math.abs(dias)} dias` : `📅 Vence em ${dias} dias`);

        grid.innerHTML += `
            <div class="boleto-card ${borda}" style="padding:15px; margin-bottom:10px; display:flex; justify-content:space-between;">
                <div><strong>${b.desc}</strong><br><small>Vence: ${fmtDataSimples(b.vencimento)}</small><br><span style="font-size:0.8rem; font-weight:bold;">${txt}</span></div>
                <div style="text-align:right;"><h3>${fmtMoeda(b.valor)}</h3>
                <button onclick="toggleStatusBoleto(${b.id})" style="padding:5px;">${b.status==='PAGO'?'Desfazer':'Pagar'}</button>
                <button onclick="removerBoleto(${b.id})" style="background:none; border:none; color:red; cursor:pointer;">🗑️</button></div>
            </div>`;
    });

    if(document.getElementById('bolTotalVencido')) document.getElementById('bolTotalVencido').innerText = fmtMoeda(totalV);
    if(document.getElementById('bolTotalAberto')) document.getElementById('bolTotalAberto').innerText = fmtMoeda(totalA);
    if(document.getElementById('bolTotalPago')) document.getElementById('bolTotalPago').innerText = fmtMoeda(totalP);
}

window.renderizarMotoboys = function() {
    const grid = document.getElementById('gridMotoboys');
    const filtroMoto = document.getElementById('filtroMotoHist')?.value;
    if(!grid) return;
    grid.innerHTML = '';

    let lista = [...(window.db.entregas || [])];
    if (filtroMoto) lista = lista.filter(e => String(e.idFunc) === String(filtroMoto));
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));

    lista.forEach(e => {
        grid.innerHTML += `
            <div class="moto-card" style="padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-left: 5px solid #d35400; background:white;">
                <div><strong>${e.nomeFunc}</strong><br><small>📅 ${fmtDataSimples(e.data)} | 🔴 ${e.ifood} 🟡 ${e.app99} 🟢 ${e.zap}</small></div>
                <div style="text-align:right;"><strong style="color:#d35400; font-size:1.2rem;">${fmtMoeda(e.valorTotal)}</strong><br><button onclick="removerEntrega(${e.id})" style="background:none; border:none; cursor:pointer;">🗑️</button></div>
            </div>`;
    });
}

// --- MAGIA CENTRAL: Sincroniza tudo ---
window.renderizarTudo = function() {
    console.log("🎲 Sincronizando Visões...");
    if(window.atualizarInterface) window.atualizarInterface();
    if(window.atualizarDashboard) window.atualizarDashboard();
    if(window.renderizarBoletos) window.renderizarBoletos();
    if(window.renderizarExtras) window.renderizarExtras();
    if(window.renderizarMotoboys) window.renderizarMotoboys();
}

// ============================================================
// === AS MAGIAS DE AÇÃO (SALVAR/DELETAR) ===
// ============================================================

window.lancarPagamento = async function() {
    if(!checkPerm('fin')) return; 
    const idFunc = document.getElementById('selectFuncionarioPagamento')?.value;
    const tipo = document.getElementById('tipoLancamento')?.value || 'Pagamento';
    const valor = parseFloat(document.getElementById('valorPagamento')?.value);
    const data = document.getElementById('dataPagamento')?.value;
    
    if(!idFunc || isNaN(valor) || !data) return alert("Preencha Funcionário, Data e Valor!");

    const func = window.db.funcionarios.find(f => f.id == idFunc);
    const novoPag = { id: Date.now(), idFunc: String(idFunc), nomeFunc: func.nome, tipo, valor, data, status: 'PAGO' };

    registrarLog('Financeiro', `Lançou ${tipo} de ${fmtMoeda(valor)} para ${func.nome}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_pagamentos', novoPag.id, novoPag);
    alert("Operação Registrada!");
}

window.lancarComissao = async function() {
    if(!checkPerm('fin')) return; 
    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value);
    if(!idFunc || !data || isNaN(valorVendas)) return alert("Preencha o Vendedor, Data e Valor das Vendas!");
    
    let taxa = 0.07;
    if (valorVendas > 10000) taxa = 0.10;
    const valorComissao = valorVendas * taxa;
    const taxaTexto = (taxa * 100).toFixed(0) + "%";
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    
    const novoExtra = { 
        id: Date.now(), tipo: 'Comissao', categoria: 'Vendas', 
        idFunc: String(idFunc), beneficiario: func.nome, valor: valorComissao, 
        data: data, obs: `${taxaTexto} sobre ${fmtMoeda(valorVendas)}`
    };

    registrarLog('Financeiro', `Lançou comissão de ${fmtMoeda(valorComissao)} (${taxaTexto}) para ${func.nome}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert(`Comissão de ${fmtMoeda(valorComissao)} (${taxaTexto}) lançada!`);
}

window.lancarDespesa = async function() {
    if(!checkPerm('fin')) return; 
    const tipo = document.getElementById('tipoDespesa').value; 
    const data = document.getElementById('dataDespesa').value;
    const valor = parseFloat(document.getElementById('valorDespesa').value);
    const obs = document.getElementById('obsDespesa').value;

    if(!data || isNaN(valor)) return alert("Preencha a Data e o Valor da despesa!");

    const novoExtra = { 
        id: Date.now(), tipo: 'Despesa', categoria: 'Saída', 
        idFunc: 'LOJA', beneficiario: tipo, valor: valor, data: data, obs: obs 
    };

    registrarLog('Financeiro', `Lançou despesa: ${tipo} - ${fmtMoeda(valor)}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert("Despesa Registrada!");
}

window.lancarEntregaMoto = async function() {
    if(!checkPerm('moto')) return; 
    const idFunc = document.getElementById('selMotoId').value;
    const data = document.getElementById('dataMoto').value;
    const turno = document.getElementById('selMotoTurno').value;
    if(!idFunc || !data) return alert("Selecione Motoboy e Data!");

    const ifood = parseInt(document.getElementById('qtdIfood').value) || 0;
    const app99 = parseInt(document.getElementById('qtd99').value) || 0;
    const zap = parseInt(document.getElementById('qtdZap').value) || 0;
    const totalEntregas = ifood + app99 + zap;
    const totalReceber = (turno === 'Noite' ? 60 + (totalEntregas * 5) : totalEntregas * 9);

    const func = window.db.funcionarios.find(f => f.id == idFunc);

    const novoRegistro = {
        id: Date.now(), idFunc: idFunc, nomeFunc: func.nome, data: data, turno: turno,
        ifood, app99, zap, totalEntregas, valorTotal: totalReceber
    };

    registrarLog('Motoboy', `Lançou diária de ${fmtMoeda(totalReceber)} para ${func.nome}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_entregas', novoRegistro.id, novoRegistro);
    alert("Fechamento do Motoboy Salvo!");
}

window.lancarBoleto = async function() {
    if(!checkPerm('boletos')) return; 
    const desc = document.getElementById('bolDesc').value;
    const valor = parseFloat(document.getElementById('bolValor').value);
    const data = document.getElementById('bolData').value;
    const codigo = document.getElementById('bolCodigo').value;

    if(!desc || isNaN(valor) || !data) return alert("Preencha Descrição, Valor e Vencimento!");

    const novoBoleto = { id: Date.now(), desc: desc, valor: valor, vencimento: data, codigo: codigo, status: 'PENDENTE', dataPagamento: null };
    registrarLog('Boletos', `Cadastrou conta: ${desc} (${fmtMoeda(valor)})`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', novoBoleto.id, novoBoleto);
    alert("Conta Registrada!");
}

window.removerBoleto = async function(id) { if(confirm("Apagar conta?")) if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_boletos', id); }
window.removerEntrega = async function(id) { if(confirm("Apagar diária?")) if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_entregas', id); }
window.removerExtra = async function(id) { if(confirm("Apagar registro?")) if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_extras', id); }
window.removerPagamento = async function(id) { if(confirm("Apagar pagamento?")) if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_pagamentos', id); }

window.toggleStatusBoleto = async function(id) { 
    const b = window.db.boletos.find(x => x.id === id); 
    if(b) { 
        b.status = b.status === 'PENDENTE' ? 'PAGO' : 'PENDENTE'; 
        if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', id, b); 
    } 
}

window.baixarBackupLocal = function() {
    const dataAtual = new Date().toISOString().split('T')[0];
    const blob = new Blob([JSON.stringify(window.db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `BACKUP_${dataAtual}.json`; a.click();
}
window.restaurarBackupLocal = function() { window.open('migracao.html', '_blank'); }

// --- STUBS PARA NÃO QUEBRAR O HTML (Compatibilidade) ---
window.calcularMotoPreview = function() {}
window.atualizarPainelPagamentos = function() {}
window.mudarModoPagamento = function() {}
window.exportarExcel = function() {}
window.gerarRecibo = function() {}
window.imprimirFolhaPonto = function() {}