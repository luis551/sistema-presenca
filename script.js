window.db = { funcionarios: [], presencas: {}, pagamentos: [], extras: [], users: [], entregas: [], audit: [] };
window.currentUser = null;
let editingId = null;

// --- SISTEMA DE LOG (AUDITORIA) ---
function registrarLog(acao, detalhes) {
    const log = {
        data: new Date().toISOString(),
        user: window.currentUser ? window.currentUser.user : 'desconhecido',
        acao: acao,
        detalhes: detalhes
    };
    if(!window.db.audit) window.db.audit = [];
    window.db.audit.push(log);
}

function renderizarAudit() {
    const tbody = document.getElementById('tbodyAudit');
    tbody.innerHTML = '';
    if(!window.db.audit || window.db.audit.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#aaa;">Nenhum registro encontrado.</td></tr>';
        return;
    }
    const logs = [...window.db.audit].sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 100);
    
    logs.forEach(l => {
        const d = new Date(l.data);
        const dataFmt = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        tbody.innerHTML += `<tr><td>${dataFmt}</td><td><strong>${l.user}</strong></td><td>${l.acao}</td><td>${l.detalhes}</td></tr>`;
    });
}

// --- SISTEMA DE PERMISSÕES ---
function verificarPermissao(tipo) {
    if (window.currentUser && window.currentUser.isAdmin) return true;
    if (window.currentUser && window.currentUser.perms && window.currentUser.perms[tipo] === true) return true;
    return false;
}

function checkPerm(tipo) {
    if (!verificarPermissao(tipo)) {
        alert("⛔ ACESSO NEGADO: Você não tem permissão para realizar esta ação.");
        return false;
    }
    return true;
}

// --- DARK MODE ---
window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-theme');
    window.atualizarDashboard();
}

// --- MOTOBOY LOGIC ---
window.atualizarInfoMoto = function() { window.calcularMotoPreview(); }

window.calcularMotoPreview = function() {
    const turno = document.getElementById('selMotoTurno').value;
    const ifood = parseInt(document.getElementById('qtdIfood').value) || 0;
    const app99 = parseInt(document.getElementById('qtd99').value) || 0;
    const zap = parseInt(document.getElementById('qtdZap').value) || 0;
    
    const totalEntregas = ifood + app99 + zap;
    let valorFixo = 0;
    let valorPorEntrega = 0;

    if (turno === 'Noite') {
        valorFixo = 50;
        valorPorEntrega = 5;
    } else {
        valorFixo = 0;
        valorPorEntrega = 9;
    }

    const totalReceber = valorFixo + (totalEntregas * valorPorEntrega);
    document.getElementById('previewMotoTotal').innerText = totalReceber.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    return { totalEntregas, totalReceber };
}

window.lancarEntregaMoto = function() {
    if(!checkPerm('moto')) return; 

    const idFunc = document.getElementById('selMotoId').value;
    const data = document.getElementById('dataMoto').value;
    const turno = document.getElementById('selMotoTurno').value;
    if(!idFunc || !data) return alert("Selecione Motoboy e Data!");

    const calc = window.calcularMotoPreview();
    const func = window.db.funcionarios.find(f => f.id == idFunc);

    const novoRegistro = {
        id: Date.now(),
        idFunc: idFunc,
        nomeFunc: func.nome,
        data: data,
        turno: turno,
        ifood: parseInt(document.getElementById('qtdIfood').value) || 0,
        app99: parseInt(document.getElementById('qtd99').value) || 0,
        zap: parseInt(document.getElementById('qtdZap').value) || 0,
        totalEntregas: calc.totalEntregas,
        valorTotal: calc.totalReceber
    };

    if(!window.db.entregas) window.db.entregas = [];
    window.db.entregas.push(novoRegistro);
    
    registrarLog('Motoboy', `Lançou diária de ${fmtMoeda(calc.totalReceber)} para ${func.nome}`);
    
    if(window.salvarNuvem) window.salvarNuvem();
    alert("Fechamento do Motoboy Salvo!");
    
    document.getElementById('qtdIfood').value = '';
    document.getElementById('qtd99').value = '';
    document.getElementById('qtdZap').value = '';
    window.renderizarMotoboys();
    window.atualizarDashboard();
}

window.renderizarMotoboys = function() {
    const grid = document.getElementById('gridMotoboys');
    grid.innerHTML = '';
    if(!window.db.entregas) window.db.entregas = [];
    const lista = [...window.db.entregas].sort((a,b) => new Date(b.data) - new Date(a.data));

    if (lista.length === 0) { grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhuma entrega registrada.</p>'; return; }

    lista.forEach(item => {
        const badgeClass = item.turno === 'Noite' ? 'shift-noite' : 'shift-dia';
        const icone = item.turno === 'Noite' ? '🌙' : '☀️';
        
        const html = `
            <div class="moto-card">
                <div class="moto-info">
                    <h4>${item.nomeFunc} <span class="badge-shift ${badgeClass}">${icone} ${item.turno}</span></h4>
                    <small>📅 ${fmtData(item.data)}</small><br>
                    <small style="font-size:0.85rem">🔴 iFood: ${item.ifood} | 🟡 99: ${item.app99} | 🟢 Zap: ${item.zap}</small>
                </div>
                <div class="moto-values">
                    <div style="font-size:0.9rem; color:var(--text-sub);">Total: ${item.totalEntregas} entregas</div>
                    <div class="moto-total">${fmtMoeda(item.valorTotal)}</div>
                    <button class="btn-delete-pag" onclick="removerEntrega(${item.id})">🗑️</button>
                </div>
            </div>
        `;
        grid.innerHTML += html;
    });
}

window.removerEntrega = function(id) {
    if(!checkPerm('moto')) return;
    if(confirm("Apagar este registro de entrega?")) {
        const ent = window.db.entregas.find(e => e.id === id);
        if(ent) registrarLog('Motoboy', `Apagou diária de ${ent.nomeFunc} (${ent.data})`);
        
        window.db.entregas = window.db.entregas.filter(e => e.id !== id);
        if(window.salvarNuvem) window.salvarNuvem();
        window.renderizarMotoboys();
        window.atualizarDashboard();
    }
}

// --- FOLHA DE PONTO ---
window.imprimirFolhaPonto = function(idFunc) {
    const func = window.db.funcionarios.find(f => f.id === idFunc);
    if(!func) return;

    const mesAno = prompt("Digite o Mês/Ano para a folha (ex: 01/2026):", new Date().toLocaleDateString('pt-BR', {month:'2-digit', year:'numeric'}));
    if(!mesAno) return;

    const [mes, ano] = mesAno.split('/');
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const container = document.getElementById('tabela-ponto-container');
    
    let html = `<table class="tabela-ponto"><thead><tr><th>Dia</th><th>Semana</th><th>Status / Entrada - Saída</th><th>Assinatura</th></tr></thead><tbody>`;
    
    for(let i=1; i<=diasNoMes; i++) {
        const diaStr = i.toString().padStart(2, '0');
        const dataIso = `${ano}-${mes}-${diaStr}`;
        const dataObj = new Date(ano, mes-1, i);
        const diaSemana = dataObj.toLocaleDateString('pt-BR', {weekday: 'short'}).toUpperCase();
        
        let status = '';
        const listaDia = window.db.presencas[dataIso];
        if(listaDia) {
            const registro = listaDia.find(r => r.id === idFunc);
            if(registro) status = registro.status;
        }
        
        let statusShow = status ? `<b>${status.toUpperCase()}</b>` : '';
        if(diaSemana === 'DOM') statusShow = '<span style="color:#aaa">DOMINGO</span>';

        html += `<tr>
            <td width="50">${diaStr}/${mes}</td>
            <td width="50">${diaSemana}</td>
            <td>${statusShow}</td>
            <td></td>
        </tr>`;
    }
    html += `</tbody></table>`;

    document.getElementById('ponto-empresa').innerText = func.empresa;
    document.getElementById('ponto-nome').innerText = func.nome;
    document.getElementById('ponto-mes').innerText = mesAno;
    container.innerHTML = html;

    document.getElementById('area-ponto-print').style.display = 'flex';
}

// --- SISTEMA DE RECIBOS ---
window.gerarRecibo = function(idPagamento) {
    const pag = window.db.pagamentos.find(p => p.id === idPagamento);
    if (!pag) return;
    const func = window.db.funcionarios.find(f => f.id === pag.idFunc);
    
    document.getElementById('recibo-funcionario').innerText = pag.nomeFunc;
    document.getElementById('recibo-valor').innerText = pag.valor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    document.getElementById('recibo-tipo').innerText = pag.tipo === 'Vale' ? 'Adiantamento / Vale' : 'Pagamento de Salário';
    document.getElementById('recibo-desc').innerText = pag.desc || 'Sem observações';
    document.getElementById('recibo-data').innerText = new Date().toLocaleDateString('pt-BR');
    document.getElementById('recibo-empresa').innerText = func ? func.empresa : 'Empresa';
    
    document.getElementById('area-impressao').style.display = 'flex';
}

// --- SISTEMA DE LOGIN E PERMISSÕES ---
window.togglePermBoxes = function() {
    const isAdmin = document.getElementById('checkIsAdmin').checked;
    const area = document.getElementById('areaPermissoes');
    if(isAdmin) {
        area.style.display = 'none';
    } else {
        area.style.display = 'grid';
    }
}

window.abrirGestaoUsuarios = function() {
    const senha = prompt("🔒 Área Restrita.\nDigite sua SENHA DE ADMINISTRADOR:");
    if(!senha) return;
    const adminEncontrado = window.db.users.find(u => u.pass === senha && u.isAdmin === true);
    if(adminEncontrado) {
        document.getElementById('modalUsers').style.display = 'flex';
        renderizarListaUsuarios();
        cancelarEdicaoUser();
    } else {
        alert("❌ Acesso Negado: Senha incorreta ou usuário não é admin.");
    }
}

window.renderizarListaUsuarios = function() {
    const lista = document.getElementById('listaUsuarios');
    lista.innerHTML = '';
    window.db.users.forEach((u, index) => {
        const badge = u.isAdmin ? '<span class="badge-admin">ADMIN</span>' : '<span style="font-size:0.7rem; background:#ccc; padding:2px 5px; border-radius:4px;">USER</span>';
        
        const btnPass = `<button onclick="alert('Senha: ${u.pass}')" style="background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px; margin-right:5px;">👁️</button>`;
        const btnEdit = `<button onclick="editarUsuario(${index})" style="background:#f39c12; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px; margin-right:5px;">✏️</button>`;
        
        lista.innerHTML += `<div class="user-list-item"><div><strong>${u.user}</strong> ${badge}</div><div>${btnPass}${btnEdit}<button onclick="removerUsuario(${index})" style="background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px;">🗑️</button></div></div>`;
    });
}

window.salvarUsuario = function() {
    const user = document.getElementById('novoUser').value.toLowerCase().trim();
    const pass = document.getElementById('novaSenha').value.trim();
    const isAdmin = document.getElementById('checkIsAdmin').checked;
    const editIndex = document.getElementById('editUserIndex').value;
    
    if(!user || !pass) return alert("Preencha usuário e senha!");
    
    if(editIndex === "" && window.db.users.find(u => u.user === user)) return alert("Usuário já existe!");
    
    const perms = {
        func: document.getElementById('p_func').checked,
        pres: document.getElementById('p_pres').checked,
        fin: document.getElementById('p_fin').checked,
        moto: document.getElementById('p_moto').checked
    };

    const novoObjeto = { user, pass, isAdmin, perms };

    if(editIndex !== "") {
        window.db.users[editIndex] = novoObjeto;
        registrarLog('Admin', `Editou usuário ${user}`);
        alert("Usuário atualizado com sucesso!");
    } else {
        window.db.users.push(novoObjeto);
        registrarLog('Admin', `Criou usuário ${user}`);
        alert("Usuário criado!");
    }
    
    if(window.salvarNuvem) window.salvarNuvem();
    cancelarEdicaoUser();
    renderizarListaUsuarios();
}

window.editarUsuario = function(index) {
    const u = window.db.users[index];
    document.getElementById('editUserIndex').value = index;
    document.getElementById('novoUser').value = u.user;
    document.getElementById('novaSenha').value = u.pass;
    document.getElementById('checkIsAdmin').checked = u.isAdmin;
    
    if(u.perms) {
        document.getElementById('p_func').checked = u.perms.func;
        document.getElementById('p_pres').checked = u.perms.pres;
        document.getElementById('p_fin').checked = u.perms.fin;
        document.getElementById('p_moto').checked = u.perms.moto;
    } else {
        document.querySelectorAll('.perm-box input').forEach(c => c.checked = false);
    }

    togglePermBoxes();

    document.getElementById('tituloFormUser').innerText = "✏️ Editando Usuário: " + u.user;
    document.getElementById('tituloFormUser').style.color = "#e67e22";
    document.getElementById('btnSalvarUser').innerText = "💾 Salvar Alterações";
    document.getElementById('btnCancelarUser').style.display = "block";
}

window.cancelarEdicaoUser = function() {
    document.getElementById('editUserIndex').value = "";
    document.getElementById('novoUser').value = '';
    document.getElementById('novaSenha').value = '';
    document.getElementById('checkIsAdmin').checked = false;
    document.querySelectorAll('.perm-box input').forEach(c => c.checked = false);
    togglePermBoxes();

    document.getElementById('tituloFormUser').innerText = "Adicionar Novo Usuário";
    document.getElementById('tituloFormUser').style.color = "var(--text-main)";
    document.getElementById('btnSalvarUser').innerText = "+ Criar Usuário";
    document.getElementById('btnCancelarUser').style.display = "none";
}

window.removerUsuario = function(index) {
    if(confirm("Tem certeza que deseja apagar este usuário?")) {
        const u = window.db.users[index];
        registrarLog('Admin', `Excluiu usuário ${u.user}`);
        
        window.db.users.splice(index, 1);
        if(window.salvarNuvem) window.salvarNuvem();
        renderizarListaUsuarios();
        if(document.getElementById('editUserIndex').value == index) cancelarEdicaoUser();
    }
}

window.checkLogin = function() {
    const inputUser = document.getElementById('loginUser').value.toLowerCase().trim();
    const inputPass = document.getElementById('loginPass').value.trim();
    const usuarioEncontrado = window.db.users.find(u => u.user === inputUser && u.pass === inputPass);
    
    if (usuarioEncontrado) {
        window.currentUser = usuarioEncontrado; 
        document.getElementById('login-screen').style.display = 'none';
        
        const badge = document.getElementById('user-badge');
        if (usuarioEncontrado.isAdmin) {
            badge.innerHTML = `👑 ${inputUser.toUpperCase()} (ADMIN)`;
            badge.style.color = '#f1c40f';
            document.getElementById('btnSeguranca').style.display = 'flex';
        } else {
            badge.innerHTML = `👤 ${inputUser.toUpperCase()}`;
            badge.style.color = 'white';
            document.getElementById('btnSeguranca').style.display = 'none';
        }
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

window.onload = () => {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('dataPresenca').value = hoje;
    document.getElementById('dataPagamento').value = hoje;
    document.getElementById('dataComissao').value = hoje;
    document.getElementById('dataDespesa').value = hoje;
    document.getElementById('dataMoto').value = hoje;
};

const fmtMoeda = (v) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const fmtData = (d) => { if(!d) return '-'; return new Date(d).toLocaleDateString('pt-BR', {timeZone: 'UTC'}); };
const fmtDataSimples = (d) => { if(!d) return '--/--/--'; const [ano, mes, dia] = d.split('-'); return `${dia}/${mes}/${ano}`; };

window.showSection = function(id, btnElement) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(btnElement) btnElement.classList.add('active');
    if(id === 'previsao') window.atualizarPrevisao();
    if(id === 'extras') window.renderizarExtras();
    if(id === 'dashboard') window.atualizarDashboard();
    if(id === 'seguranca') renderizarAudit();
    if(id === 'motoboys') {
        window.renderizarMotoboys();
        const sel = document.getElementById('selMotoId');
        sel.innerHTML = '<option value="">Selecione...</option>';
        window.db.funcionarios.forEach(f => {
            sel.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
        });
    }
}
window.copiarTexto = function(texto) { const el = document.createElement('textarea'); el.value = texto; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); alert('Chave Pix copiada!'); }
window.toggleTipoPagamento = function() {
    const tipoPrincipal = document.getElementById('fTipoPrincipal').value;
    const divFrequencia = document.getElementById('divFrequencia');
    const divPassagem = document.getElementById('divPassagem');
    const lblSalario = document.getElementById('lblSalario');
    if(tipoPrincipal === 'Mensalista') { divFrequencia.style.display = 'flex'; divPassagem.style.display = 'flex'; lblSalario.innerText = "Salário Base Mensal (R$) *"; } else { divFrequencia.style.display = 'none'; divPassagem.style.display = 'none'; lblSalario.innerText = "Valor da Diária (R$) *"; }
}
window.processarFormularioFuncionario = function() {
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
    if (editingId !== null) {
        if(!confirm(`Salvar alterações para ${nome}?`)) return;
        const index = window.db.funcionarios.findIndex(f => f.id === editingId);
        if (index !== -1) {
            window.db.funcionarios[index] = { id: editingId, nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };
            registrarLog('Funcionario', `Editou funcionário ${nome}`);
            alert("Atualizado!"); window.cancelarEdicao();
        }
    } else {
        const novoFunc = { id: Date.now(), nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };
        window.db.funcionarios.push(novoFunc);
        registrarLog('Funcionario', `Cadastrou funcionário ${nome}`);
        alert("Cadastrado!");
        document.querySelectorAll('#funcionarios input').forEach(input => input.value = '');
    }
    if(window.salvarNuvem) window.salvarNuvem(); 
}
window.prepararEdicao = function(id) {
    if(!checkPerm('func')) return; 

    const func = window.db.funcionarios.find(f => f.id === id);
    if (!func) return;
    document.getElementById('fNome').value = func.nome;
    document.getElementById('fEmpresa').value = func.empresa;
    if (func.tipo === 'Diaria') { document.getElementById('fTipoPrincipal').value = 'Diaria'; } else { document.getElementById('fTipoPrincipal').value = 'Mensalista'; document.getElementById('fFrequencia').value = func.tipo || 'Mensal'; }
    toggleTipoPagamento();
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
    toggleTipoPagamento();
    document.getElementById('tituloFormFunc').innerText = "Cadastrar Novo Funcionário";
    document.getElementById('tituloFormFunc').style.color = "var(--dark)";
    document.getElementById('btnSalvarFunc').innerText = "+ Cadastrar Funcionário";
    document.getElementById('btnCancelarEdit').style.display = "none";
}
window.removerFuncionario = function(id) {
    if(!checkPerm('func')) return;

    if(confirm("ATENÇÃO: Deseja realmente excluir este funcionário?")) {
        const f = window.db.funcionarios.find(f => f.id === id);
        if(f) registrarLog('Funcionario', `Excluiu funcionário ${f.nome}`);
        
        window.db.funcionarios = window.db.funcionarios.filter(f => f.id !== id);
        if (editingId === id) window.cancelarEdicao();
        if(window.salvarNuvem) window.salvarNuvem(); 
    }
}
window.carregarListaPresenca = function() {
    const data = document.getElementById('dataPresenca').value;
    const filtroEmpresa = document.getElementById('filtroEmpresaPresenca').value;
    if(!data) return alert("Selecione uma data");
    const grid = document.getElementById('gridCards');
    grid.innerHTML = '';
    document.getElementById('areaPresenca').style.display = 'block';
    const registroDia = window.db.presencas[data] || [];
    const funcionariosFiltrados = window.db.funcionarios.filter(f => { if (!filtroEmpresa) return true; return f.empresa === filtroEmpresa; }).sort((a, b) => a.nome.localeCompare(b.nome)); 
    funcionariosFiltrados.forEach(f => {
        const saved = registroDia.find(r => r.id === f.id);
        const status = saved ? saved.status : 'Presente';
        const obs = saved ? saved.obs : '';
        let tagClass = 'tag-mensal'; let tagText = 'MENSAL';
        if(f.tipo === 'Quinzenal') { tagClass = 'tag-quinzenal'; tagText = 'QUINZENAL'; }
        else if(f.tipo === 'Semanal') { tagClass = 'tag-semanal'; tagText = 'SEMANAL'; }
        else if(f.tipo === 'Diaria') { tagClass = 'tag-diaria'; tagText = `DIÁRIA: ${fmtMoeda(f.salario)}`; }
        const tipoBadge = `<span class="tag-tipo ${tagClass}">${tagText}</span>`;
        const card = document.createElement('div');
        card.className = `presenca-card card-${status}`;
        card.setAttribute('data-id', f.id);
        card.innerHTML = `<div><h4>${f.nome} ${tipoBadge}</h4><span style="font-size:0.8rem; color:var(--accent); font-weight:bold;">🏢 ${f.empresa || '-'}</span></div><select class="status-presenca" onchange="atualizarCorCard(this)"><option value="Presente" ${status === 'Presente' ? 'selected' : ''}>✅ Presente</option><option value="Atrasado" ${status === 'Atrasado' ? 'selected' : ''}>⚠️ Atrasado</option><option value="Falta" ${status === 'Falta' ? 'selected' : ''}>❌ Falta</option><option value="Atestado" ${status === 'Atestado' ? 'selected' : ''}>🔵 Atestado</option><option value="Folga" ${status === 'Folga' ? 'selected' : ''}>🟢 Folga</option></select><input type="text" class="obs-presenca" value="${obs}" placeholder="Alguma observação?">`;
        grid.appendChild(card);
    });
}
window.atualizarCorCard = function(selectElement) { const card = selectElement.closest('.presenca-card'); card.className = card.className.replace(/card-\w+/, `card-${selectElement.value}`); }
window.salvarPresencaDia = function() {
    if(!checkPerm('pres')) return; 

    const data = document.getElementById('dataPresenca').value;
    const cards = document.querySelectorAll('.presenca-card');
    let listaDia = window.db.presencas[data] || []; 
    cards.forEach(card => {
        const idFunc = parseInt(card.getAttribute('data-id'));
        const status = card.querySelector('.status-presenca').value;
        const obs = card.querySelector('.obs-presenca').value;
        listaDia = listaDia.filter(r => r.id !== idFunc);
        listaDia.push({ id: idFunc, status: status, obs: obs });
    });
    window.db.presencas[data] = listaDia;
    registrarLog('Presenca', `Salvou lista de ${fmtData(data)}`);
    if(window.salvarNuvem) window.salvarNuvem(); 
    alert(`Lista salva!`);
}
window.lancarComissao = function() {
    if(!checkPerm('fin')) return; 

    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    const valor = parseFloat(document.getElementById('valorComissao').value);
    if(!idFunc || !data || isNaN(valor)) return alert("Preencha todos os campos!");
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    window.db.extras.push({ id: Date.now(), tipo: 'Comissao', categoria: 'Vendas', idFunc: String(idFunc), beneficiario: func.nome, valor: valor, data: data, obs: 'Comissão 7%' });
    registrarLog('Financeiro', `Lançou comissão ${fmtMoeda(valor)} para ${func.nome}`);
    if(window.salvarNuvem) window.salvarNuvem();
    alert("Comissão lançada!");
    document.getElementById('valorComissao').value = '';
    window.renderizarExtras();
}
window.lancarDespesa = function() {
    if(!checkPerm('fin')) return; 

    const cat = document.getElementById('tipoDespesa').value;
    const data = document.getElementById('dataDespesa').value;
    const valor = parseFloat(document.getElementById('valorDespesa').value);
    const obs = document.getElementById('obsDespesa').value;
    if(!data || isNaN(valor)) return alert("Preencha valor e data!");
    window.db.extras.push({ id: Date.now(), tipo: 'Despesa', categoria: cat, idFunc: 'DESPESAS', beneficiario: cat, valor: valor, data: data, obs: obs });
    registrarLog('Financeiro', `Lançou despesa ${fmtMoeda(valor)} (${cat})`);
    if(window.salvarNuvem) window.salvarNuvem();
    alert("Despesa lançada!");
    document.getElementById('valorDespesa').value = '';
    document.getElementById('obsDespesa').value = '';
    window.renderizarExtras();
}
window.removerExtra = function(id) { 
    if(!checkPerm('fin')) return; 
    if(confirm("Apagar este registro?")) { 
        const ext = window.db.extras.find(e => e.id === id);
        if(ext) registrarLog('Financeiro', `Apagou extra ${fmtMoeda(ext.valor)} de ${ext.beneficiario}`);
        
        window.db.extras = window.db.extras.filter(e => e.id !== id); 
        if(window.salvarNuvem) window.salvarNuvem(); 
        window.renderizarExtras(); 
    } 
}
window.renderizarExtras = function() {
    const grid = document.getElementById('gridExtras');
    const filtroId = document.getElementById('filtroExtras').value;
    grid.innerHTML = '';
    let lista = [...window.db.extras];
    if (filtroId) {
        const nomeFunc = window.db.funcionarios.find(f => f.id == filtroId)?.nome;
        lista = lista.filter(item => { if (filtroId === 'DESPESAS') return item.tipo === 'Despesa'; const matchId = String(item.idFunc) === String(filtroId); const matchNome = item.beneficiario === nomeFunc && item.tipo === 'Comissao'; return matchId || matchNome; });
    }
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));
    if (lista.length === 0) { grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhum registro encontrado.</p>'; return; }
    lista.forEach(item => {
        const cor = item.tipo === 'Comissao' ? 'extra-comissao' : 'extra-despesa';
        const tituloCor = item.tipo === 'Comissao' ? 'txt-purple' : 'txt-orange';
        const html = `<div class="extra-card ${cor}"><div class="extra-info"><h4 class="${tituloCor}">${item.categoria} - ${item.beneficiario}</h4><span>📅 ${fmtData(item.data)} | ${item.obs}</span></div><div class="extra-val ${tituloCor}">${fmtMoeda(item.valor)}</div><button class="btn-delete-pag" onclick="removerExtra(${item.id})">🗑️</button></div>`;
        grid.innerHTML += html;
    });
}
window.calcularTetoLiberado = function(func, dataStr) {
    const dia = parseInt(dataStr.split('-')[2]); 
    if (func.tipo === 'Mensal') return func.salario; 
    else if (func.tipo === 'Diaria') return 0; 
    else if (func.tipo === 'Quinzenal') { if (dia <= 15) return func.salario / 2; return func.salario; }
    else if (func.tipo === 'Semanal') { if (dia <= 7) return func.salario * 0.25; else if (dia <= 14) return func.salario * 0.50; else if (dia <= 21) return func.salario * 0.75; else return func.salario; }
    return 0;
}
window.getTotalComissoesMes = function(idFunc, dataRefStr) {
    const parts = dataRefStr.split('-'); const anoRef = parseInt(parts[0]); const mesRef = parseInt(parts[1]) - 1;
    const func = window.db.funcionarios.find(f => f.id == idFunc); const nomeFunc = func ? func.nome : "";
    return window.db.extras.reduce((acc, e) => {
        if (e.tipo !== 'Comissao') return acc;
        const eParts = e.data.split('-'); const eAno = parseInt(eParts[0]); const eMes = parseInt(eParts[1]) - 1;
        if (eAno !== anoRef || eMes !== mesRef) return acc;
        const isIdMatch = String(e.idFunc) === String(idFunc); const isNameMatch = e.beneficiario === nomeFunc;
        if (isIdMatch || isNameMatch) return acc + e.valor;
        return acc;
    }, 0);
}
window.calcularGanhosNoMes = function(idFunc, dataRefStr) {
    const func = window.db.funcionarios.find(f => f.id == idFunc); if (!func) return 0;
    let totalGanhos = 0; const [anoRef, mesRef] = dataRefStr.split('-'); 
    if (func.tipo !== 'Diaria') totalGanhos = window.calcularTetoLiberado(func, dataRefStr);
    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const listaDia = window.db.presencas[diaStr]; const registro = listaDia.find(r => r.id == idFunc);
            if(registro) {
                if (func.tipo !== 'Diaria') { if(registro.status === 'Presente' || registro.status === 'Atrasado') totalGanhos += (func.passagem || 0); } 
                else { if(registro.status === 'Presente') totalGanhos += func.salario; else if(registro.status === 'Atrasado') totalGanhos += (func.salario / 2); }
            }
        }
    });
    const totalComissoes = window.getTotalComissoesMes(idFunc, dataRefStr);
    return totalGanhos + totalComissoes;
}
window.getTotalPagoNoMes = function(idFunc, dataReferencia) {
    const dataRef = new Date(dataReferencia); const mesRef = dataRef.getUTCMonth(); const anoRef = dataRef.getUTCFullYear();
    return window.db.pagamentos.filter(p => { const d = new Date(p.data); return p.idFunc == idFunc && d.getUTCMonth() == mesRef && d.getUTCFullYear() == anoRef; }).reduce((acc, p) => acc + p.valor, 0);
}
window.atualizarPainelPagamentos = function() {
    const idFunc = document.getElementById('selectFuncionarioPagamento').value;
    const dataStr = document.getElementById('dataPagamento').value; 
    const divAviso = document.getElementById('avisoSaldo');
    const divResumo = document.getElementById('resumoFinanceiro');
    const gridPag = document.getElementById('gridPagamentos');
    gridPag.innerHTML = ''; 
    if (!idFunc) {
        divAviso.style.display = 'none'; divResumo.style.display = 'none';
        const todosPag = [...window.db.pagamentos].sort((a, b) => new Date(b.data) - new Date(a.data));
        window.renderizarCardsPagamento(todosPag);
        return;
    }
    divResumo.style.display = 'flex';
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    const pagsFuncionario = window.db.pagamentos.filter(p => p.idFunc == idFunc);
    let totalPagoSalario = 0; let totalVales = 0;
    const [anoRef, mesRef] = dataStr.split('-');
    pagsFuncionario.forEach(p => { if (p.data.startsWith(`${anoRef}-${mesRef}`)) { if (p.tipo === 'Vale') totalVales += p.valor; else totalPagoSalario += p.valor; } });
    document.getElementById('resumoSalario').innerText = fmtMoeda(totalPagoSalario);
    document.getElementById('resumoVale').innerText = fmtMoeda(totalVales);
    const historicoOrdenado = [...pagsFuncionario].sort((a, b) => new Date(b.data) - new Date(a.data));
    window.renderizarCardsPagamento(historicoOrdenado);
    if (!dataStr) return;
    const ganhosBase = window.calcularGanhosNoMes(idFunc, dataStr); const valorDevido = ganhosBase; const totalJaRecebido = totalPagoSalario + totalVales; const restante = valorDevido - totalJaRecebido;
    let extraInfo = ''; if(func.pix) extraInfo = `<br>🔑 <strong>Chave Pix:</strong> ${func.pix}`;
    const comissoes = window.getTotalComissoesMes(idFunc, dataStr); let extrasTxt = comissoes > 0 ? ` (Inclui ${fmtMoeda(comissoes)} de Extras)` : '';
    divAviso.style.display = 'block';
    if (restante > 0) { divAviso.style.backgroundColor = '#d4edda'; divAviso.style.color = '#155724'; divAviso.style.border = '1px solid #c3e6cb'; divAviso.innerHTML = `✅ <strong>Disponível: ${fmtMoeda(restante)}</strong>${extraInfo}<br><small>Ganhou: ${fmtMoeda(valorDevido)}${extrasTxt} | Recebeu: ${fmtMoeda(totalJaRecebido)}</small>`; } 
    else if (restante === 0) { divAviso.style.backgroundColor = '#d1ecf1'; divAviso.style.color = '#0c5460'; divAviso.style.border = '1px solid #bee5eb'; divAviso.innerHTML = `🔷 <strong>Conta Zerada!</strong><br>Tudo pago até o momento.`; } 
    else { divAviso.style.backgroundColor = '#f8d7da'; divAviso.style.color = '#721c24'; divAviso.style.border = '1px solid #f5c6cb'; divAviso.innerHTML = `🛑 <strong>DEVE À LOJA: ${fmtMoeda(Math.abs(restante))}</strong>${extraInfo}<br>Pegou mais do que o liberado.`; }
}
window.renderizarCardsPagamento = function(listaPagamentos) {
    const gridPag = document.getElementById('gridPagamentos');
    if (listaPagamentos.length === 0) { gridPag.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhum registro encontrado.</p>'; return; }
    listaPagamentos.forEach(p => {
        const isVale = p.tipo === 'Vale';
        const cardClass = isVale ? 'pagamento-card pag-vale' : 'pagamento-card pag-salario';
        const valorClass = isVale ? 'pag-valor valor-vale' : 'pag-valor valor-salario';
        const icone = isVale ? '🎫 VALE' : '💰 PAGAMENTO';
        const card = document.createElement('div'); card.className = cardClass;
        card.innerHTML = `<div class="pag-header"><span class="pag-date">📅 ${fmtData(p.data)}</span><div class="pag-nome">${p.nomeFunc}</div></div><div class="pag-desc" style="font-weight:bold; font-size:0.8em; color:var(--text-sub);">${icone}</div><div class="pag-desc">"${p.desc || 'Sem descrição'}"</div><div class="pag-footer"><div class="${valorClass}">${fmtMoeda(p.valor)}</div><div><button class="btn-print-pag" onclick="gerarRecibo(${p.id})">🖨️</button><button class="btn-delete-pag" onclick="removerPagamento(${p.id})">🗑️</button></div></div>`;
        gridPag.appendChild(card);
    });
}
window.lancarPagamento = function() {
    if(!checkPerm('fin')) return; 

    const idFunc = document.getElementById('selectFuncionarioPagamento').value;
    const tipo = document.getElementById('tipoLancamento').value;
    const valorInput = document.getElementById('valorPagamento').value;
    const data = document.getElementById('dataPagamento').value;
    const desc = document.getElementById('descPagamento').value;
    if(!idFunc || !valorInput || !data) return alert("Preencha Funcionario, Valor e Data!");
    const valor = parseFloat(valorInput);
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    const ganhosTotal = window.calcularGanhosNoMes(idFunc, data);
    const totalJaRecebido = window.getTotalPagoNoMes(idFunc, data); 
    if ((totalJaRecebido + valor) > ganhosTotal) {
        const disponivel = ganhosTotal - totalJaRecebido;
        if(!confirm(`⚠️ ATENÇÃO: O valor excede o permitido!\n\nLiberado: ${fmtMoeda(ganhosTotal)}\nJá Recebeu: ${fmtMoeda(totalJaRecebido)}\nDisponível: ${fmtMoeda(disponivel > 0 ? disponivel : 0)}\n\nDeseja lançar mesmo assim como VALE?`)) return;
    }
    window.db.pagamentos.push({ id: Date.now(), idFunc: parseInt(idFunc), nomeFunc: func.nome, tipo: tipo, valor: valor, data: data, desc: desc });
    registrarLog('Financeiro', `Lançou ${tipo} de ${fmtMoeda(valor)} para ${func.nome}`);
    if(window.salvarNuvem) window.salvarNuvem(); 
    document.getElementById('valorPagamento').value = ''; document.getElementById('descPagamento').value = '';
    window.atualizarPainelPagamentos(); alert("Operação registrada!");
}
window.removerPagamento = function(id) {
    if(!checkPerm('fin')) return; 
    if(confirm("Cancelar este lançamento?")) {
        const pag = window.db.pagamentos.find(p => p.id === id);
        if(pag) registrarLog('Financeiro', `Excluiu ${pag.tipo} de ${fmtMoeda(pag.valor)} de ${pag.nomeFunc}`);
        
        window.db.pagamentos = window.db.pagamentos.filter(p => p.id !== id);
        if(window.salvarNuvem) window.salvarNuvem();
        window.atualizarPainelPagamentos(); 
    }
}
window.atualizarPrevisao = function() {
    const hoje = new Date().toISOString().split('T')[0];
    const filtroId = document.getElementById('filtroPrevisao').value;
    const filtroTipo = document.getElementById('filtroTipoPrevisao').value; 

    const gridCurto = document.getElementById('gridPrevisaoCurto');
    const gridLongo = document.getElementById('gridPrevisaoLongo');
    const headCurto = document.getElementById('headCurto');
    const headLongo = document.getElementById('headLongo');
    const totalGeralEl = document.getElementById('totalDividaGeral');
    
    gridCurto.innerHTML = ''; gridLongo.innerHTML = '';
    let dividaTotal = 0;
    
    const showCurto = (filtroTipo === 'TODOS' || filtroTipo === 'SEMANAL');
    const showLongo = (filtroTipo === 'TODOS' || filtroTipo === 'MENSAL');

    headCurto.style.display = showCurto ? 'block' : 'none';
    gridCurto.style.display = showCurto ? 'grid' : 'none';
    headLongo.style.display = showLongo ? 'block' : 'none';
    gridLongo.style.display = showLongo ? 'grid' : 'none';

    let funcs = [...window.db.funcionarios].sort((a, b) => a.nome.localeCompare(b.nome));
    if (filtroId) funcs = funcs.filter(f => f.id == filtroId);
    
    funcs.forEach(f => {
        let ganhosBase = 0;
        if(f.tipo !== 'Diaria') {
            ganhosBase = window.calcularTetoLiberado(f, hoje);
            const [anoRef, mesRef] = hoje.split('-');
            Object.keys(window.db.presencas).forEach(diaStr => { if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { const registro = window.db.presencas[diaStr].find(r => r.id == f.id); if(registro && (registro.status === 'Presente' || registro.status === 'Atrasado')) { ganhosBase += (f.passagem || 0); } } });
        } else {
            const [anoRef, mesRef] = hoje.split('-');
            Object.keys(window.db.presencas).forEach(diaStr => { if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { const listaDia = window.db.presencas[diaStr]; const registro = listaDia.find(r => r.id == f.id); if(registro) { if(registro.status === 'Presente') ganhosBase += f.salario; else if(registro.status === 'Atrasado') ganhosBase += (f.salario / 2); } } });
        }
        const comissoes = window.getTotalComissoesMes(f.id, hoje);
        const pagos = window.getTotalPagoNoMes(f.id, hoje);
        const totalGanhos = ganhosBase + comissoes;
        const saldo = totalGanhos - pagos;
        
        if (saldo > 0) {
            const isCurto = (f.tipo === 'Diaria' || f.tipo === 'Semanal');
            let deveMostrar = false;
            if (isCurto && showCurto) deveMostrar = true;
            if (!isCurto && showLongo) deveMostrar = true;

            if (deveMostrar) {
                dividaTotal += saldo;
                const cardClass = isCurto ? 'prev-card prev-urgent' : 'prev-card prev-normal';
                const targetGrid = isCurto ? gridCurto : gridLongo;
                const tipoLabel = f.tipo.toUpperCase();
                const html = `<div class="${cardClass}"><div class="prev-info"><h4>${f.nome} <span class="prev-status">${tipoLabel}</span></h4><span>🏢 ${f.empresa}</span><div class="prev-details"><span class="prev-base">💼 Base: ${fmtMoeda(ganhosBase)}</span>${ comissoes > 0 ? `<span class="prev-extra-line">🟣 Extras: ${fmtMoeda(comissoes)}</span>` : '' }${ pagos > 0 ? `<span class="prev-pago">🟢 Pago: -${fmtMoeda(pagos)}</span>` : '' }</div></div><div class="prev-value">${fmtMoeda(saldo)}</div></div>`;
                targetGrid.innerHTML += html;
            }
        }
    });
    
    totalGeralEl.innerText = fmtMoeda(dividaTotal);
    if(showCurto && gridCurto.innerHTML === '') gridCurto.innerHTML = '<p style="color:#aaa; font-style:italic;">Ninguém para receber.</p>';
    if(showLongo && gridLongo.innerHTML === '') gridLongo.innerHTML = '<p style="color:#aaa; font-style:italic;">Ninguém para receber.</p>';
}

let chartPizza = null; let chartBarra = null;
window.renderizarGraficos = function(dados) {
    const ctxPizza = document.getElementById('graficoPizza').getContext('2d');
    const ctxBarra = document.getElementById('graficoBarra').getContext('2d');
    if(chartPizza) chartPizza.destroy(); if(chartBarra) chartBarra.destroy();
    chartPizza = new Chart(ctxPizza, {
        type: 'doughnut',
        data: { labels: ['Salários Pagos', 'Comissões', 'Motoboys', 'Despesas Loja'], datasets: [{ data: [dados.salarios, dados.comissoes, dados.moto, dados.despesas], backgroundColor: ['#27ae60', '#8e44ad', '#d35400', '#c0392b'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Para onde foi o dinheiro?', color: '#7f8c8d' }, legend: {labels: {color: '#7f8c8d'}} } }
    });
    const nomes = Object.keys(dados.ranking).slice(0, 5);
    const valores = Object.values(dados.ranking).slice(0, 5);
    chartBarra = new Chart(ctxBarra, {
        type: 'bar',
        data: { labels: nomes, datasets: [{ label: 'Vendas Totais (R$)', data: valores, backgroundColor: '#f1c40f', borderRadius: 5 }] },
        options: { responsive: true, plugins: { title: { display: true, text: 'Top Vendedores (XP)', color: '#7f8c8d' }, legend: {display: false} }, scales: { y: { beginAtZero: true, ticks: {color: '#7f8c8d'} }, x: {ticks: {color: '#7f8c8d'}} } }
    });
}
window.atualizarDashboard = function() {
    const hoje = new Date(); const mesAtual = hoje.getUTCMonth(); const anoAtual = hoje.getUTCFullYear();
    let totalSalarios = 0, totalComissoes = 0, totalDespesas = 0, totalMoto = 0, rankingVendas = {};
    window.db.pagamentos.forEach(p => { const d = new Date(p.data); if (d.getUTCMonth() === mesAtual && d.getUTCFullYear() === anoAtual) totalSalarios += p.valor; });
    window.db.extras.forEach(e => {
        const d = new Date(e.data);
        if (d.getUTCMonth() === mesAtual && d.getUTCFullYear() === anoAtual) {
            if (e.tipo === 'Despesa') totalDespesas += e.valor;
            else if (e.tipo === 'Comissao') { totalComissoes += e.valor; const vendasReais = e.valor / 0.07; if (!rankingVendas[e.beneficiario]) rankingVendas[e.beneficiario] = 0; rankingVendas[e.beneficiario] += vendasReais; }
        }
    });
    if(!window.db.entregas) window.db.entregas = [];
    window.db.entregas.forEach(m => {
        const d = new Date(m.data);
        if (d.getUTCMonth() === mesAtual && d.getUTCFullYear() === anoAtual) {
            totalMoto += m.valorTotal;
        }
    });

    document.getElementById('dashSalarios').innerText = fmtMoeda(totalSalarios);
    document.getElementById('dashComissoes').innerText = fmtMoeda(totalComissoes);
    document.getElementById('dashMotoboys').innerText = fmtMoeda(totalMoto);
    document.getElementById('dashDespesas').innerText = fmtMoeda(totalDespesas);
    const dadosGrafico = { salarios: totalSalarios, comissoes: totalComissoes, moto: totalMoto, despesas: totalDespesas, ranking: Object.fromEntries(Object.entries(rankingVendas).sort(([,a], [,b]) => b - a)) };
    window.renderizarGraficos(dadosGrafico);
    const sortedRank = Object.entries(rankingVendas).sort(([,a], [,b]) => b - a).slice(0, 5);
    const rankContainer = document.getElementById('rankingContainer'); rankContainer.innerHTML = '';
    if (sortedRank.length === 0) rankContainer.innerHTML = '<p style="color:#aaa; text-align:center;">Nenhuma venda este mês.</p>';
    else sortedRank.forEach(([nome, vendas], index) => {
        const comissao = vendas * 0.07; const medalha = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index+1}`; const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
        rankContainer.innerHTML += `<div class="ranking-item"><span class="rank-pos ${rankClass}">${medalha}</span><span class="rank-name">${nome}</span><div style="text-align:right;"><div class="rank-xp">Vendeu: ${fmtMoeda(vendas)}</div><small style="color:var(--text-sub);">Comissão: ${fmtMoeda(comissao)}</small></div></div>`;
    });
}
window.exportarExcel = function() {
    const idFunc = document.getElementById('selectFuncionarioPagamento').value;
    let dados = [...window.db.pagamentos];
    if (idFunc) dados = dados.filter(p => p.idFunc == idFunc);
    if(dados.length === 0) return alert("Nada para exportar.");
    let csvContent = "data:text/csv;charset=utf-8,Data;Funcionario;Tipo;Valor;Descricao\n";
    dados.forEach(row => { const dataFmt = new Date(row.data).toLocaleDateString('pt-BR'); const valorFmt = row.valor.toFixed(2).replace('.', ','); csvContent += `${dataFmt};${row.nomeFunc};${row.tipo};${valorFmt};${row.desc || ''}\n`; });
    const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "relatorio_pagamentos.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
window.atualizarInterface = function() {
    const tbFunc = document.getElementById('tabelaFuncionarios').querySelector('tbody'); tbFunc.innerHTML = '';
    const selectPag = document.getElementById('selectFuncionarioPagamento'); const selVendedor = document.getElementById('selVendedorExtra'); const selFiltroExtras = document.getElementById('filtroExtras'); const selPrevisao = document.getElementById('filtroPrevisao');
    const selectionAtualPag = selectPag.value; const selectionAtualExtra = selVendedor.value;
    selectPag.innerHTML = '<option value="">Selecione...</option>'; selVendedor.innerHTML = '<option value="">Selecione...</option>'; selFiltroExtras.innerHTML = '<option value="">Todos (Geral)</option><option value="DESPESAS">🔸 Despesas / Eventos</option>'; selPrevisao.innerHTML = '<option value="">Todos da Equipe</option>';
    const funcsOrdenados = [...window.db.funcionarios].sort((a, b) => a.nome.localeCompare(b.nome));
    funcsOrdenados.forEach(f => {
        let tagClass = 'tag-mensal'; let tagText = 'MENSAL';
        if(f.tipo === 'Quinzenal') { tagClass = 'tag-quinzenal'; tagText = 'QUINZENAL'; } else if(f.tipo === 'Semanal') { tagClass = 'tag-semanal'; tagText = 'SEMANAL'; } else if(f.tipo === 'Diaria') { tagClass = 'tag-diaria'; tagText = 'DIÁRIA'; }
        let infoPagamento = ''; if(f.tipo === 'Diaria') infoPagamento = `<span style="font-weight:bold; color:var(--warning)">${fmtMoeda(f.salario)}/dia</span>`; else infoPagamento = `<span style="font-weight:bold; color:var(--success)">${fmtMoeda(f.salario)}</span><br><span style="font-size:0.8em">+ Passagem: ${fmtMoeda(f.passagem || 0)}</span>`;
        const cpfDisplay = f.cpf ? `<br><span class="info-sub">CPF: ${f.cpf}</span>` : ''; const contatoDisplay = f.tel ? `📞 ${f.tel}` : '<span style="color:#ccc">Sem tel</span>'; const pixDisplay = f.pix ? `<br><div class="info-pix">Pix: ${f.pix}</div> <button class="btn-copy" onclick="copiarTexto('${f.pix}')">Copiar</button>` : '';
        const enderecoDisplay = f.end ? `<div class="info-sub">🏠 ${f.end}</div>` : ''; const nascDisplay = f.nasc ? `<div class="info-sub">🎂 ${fmtDataSimples(f.nasc)}</div>` : ''; const entradaDisplay = f.entrada ? `<div class="info-sub">Entrada: ${fmtDataSimples(f.entrada)}</div>` : '';
        
        // Botão de Ponto adicionado na tabela
        const btnPonto = `<button class="btn-copy" style="background:var(--secondary); color:white; border:none; margin-left:5px;" onclick="imprimirFolhaPonto(${f.id})" title="Imprimir Ponto">⏰</button>`;

        tbFunc.innerHTML += `<tr><td><strong>${f.nome}</strong>${cpfDisplay}</td><td>${f.cargo}<span class="info-empresa">🏢 ${f.empresa || '-'}</span>${entradaDisplay}</td><td>${contatoDisplay}${pixDisplay}${enderecoDisplay}${nascDisplay}</td><td><span class="tag-tipo ${tagClass}">${tagText}</span><br>${infoPagamento}</td><td><div class="table-actions"><button class="btn-edit" onclick="prepararEdicao(${f.id})" title="Editar">✏️</button><button class="btn-del" onclick="removerFuncionario(${f.id})" title="Excluir">🗑️</button>${btnPonto}</div></td></tr>`;
        selectPag.innerHTML += `<option value="${f.id}">${f.nome}</option>`; selVendedor.innerHTML += `<option value="${f.id}">${f.nome}</option>`; selFiltroExtras.innerHTML += `<option value="${f.id}">${f.nome}</option>`; selPrevisao.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
    });
    selectPag.value = selectionAtualPag; selVendedor.value = selectionAtualExtra;
    window.atualizarPainelPagamentos(); window.renderizarExtras(); window.atualizarPrevisao(); window.atualizarDashboard();
}