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
    
    // ADICIONA O NOVO LOG
    window.db.audit.push(log);

    // CORREÇÃO CRÍTICA: Manter apenas os últimos 200 registros para não travar o banco
    if (window.db.audit.length > 200) {
        // Mantém apenas os últimos 200 itens do array
        window.db.audit = window.db.audit.slice(-200);
    }
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
    
    // Ordena do mais recente para o mais antigo
    const lista = [...window.db.entregas].sort((a,b) => new Date(b.data) - new Date(a.data));

    if (lista.length === 0) { 
        grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhuma entrega registrada.</p>'; 
        return; 
    }

    // OTIMIZAÇÃO: Mostra apenas os últimos 50 registros na tela para não travar
    // O histórico completo continua salvo no banco.
    const listaVisivel = lista.slice(0, 50);

    listaVisivel.forEach(item => {
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

    // Aviso visual se houver mais itens escondidos
    if(lista.length > 50) {
        grid.innerHTML += `<div style="text-align:center; padding:10px; color:#aaa; width:100%;">Exibindo 50 de ${lista.length} registros. (Use filtros para ver antigos)</div>`;
    }
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
    
    // --- PEGA AS PERMISSÕES (INCLUINDO A NOVA) ---
    const perms = {
        func: document.getElementById('p_func').checked,
        pres: document.getElementById('p_pres').checked,
        fin: document.getElementById('p_fin').checked,
        moto: document.getElementById('p_moto').checked,
        boletos: document.getElementById('p_boletos').checked // <--- AQUI
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
        document.getElementById('p_boletos').checked = u.perms.boletos; // <--- AQUI
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
        const btnSeguranca = document.getElementById('btnSeguranca');
        const btnBoletos = document.getElementById('btnMenuBoletos'); // O botão novo

        if (usuarioEncontrado.isAdmin) {
            badge.innerHTML = `👑 ${inputUser.toUpperCase()} (ADMIN)`;
            badge.style.color = '#f1c40f';
            btnSeguranca.style.display = 'flex';
            btnBoletos.style.display = 'flex'; // Admin vê tudo
        } else {
            badge.innerHTML = `👤 ${inputUser.toUpperCase()}`;
            badge.style.color = 'white';
            btnSeguranca.style.display = 'none';

            // Verifica se o usuário comum tem permissão
            if(usuarioEncontrado.perms && usuarioEncontrado.perms.boletos) {
                btnBoletos.style.display = 'flex';
            } else {
                btnBoletos.style.display = 'none';
            }
        }
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

// --- GARANTIR QUE ABRE NA SEGUNDA-FEIRA ---
window.onload = () => {
    // Define as datas dos formulários para hoje
    const hojeIso = new Date().toISOString().split('T')[0];
    if(document.getElementById('dataPresenca')) document.getElementById('dataPresenca').value = hojeIso;
    if(document.getElementById('dataPagamento')) document.getElementById('dataPagamento').value = hojeIso;
    if(document.getElementById('dataComissao')) document.getElementById('dataComissao').value = hojeIso;
    if(document.getElementById('dataDespesa')) document.getElementById('dataDespesa').value = hojeIso;
    if(document.getElementById('dataMoto')) document.getElementById('dataMoto').value = hojeIso;

    // --- AQUI ESTÁ A MÁGICA ---
    // Assim que a tela carrega, ele já define o filtro para a Segunda-feira atual.
    // Isso impede que apareçam contas da semana passada.
    window.definirInicioSemana();
};

const fmtMoeda = (v) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const fmtData = (d) => { if(!d) return '-'; return new Date(d).toLocaleDateString('pt-BR', {timeZone: 'UTC'}); };
const fmtDataSimples = (d) => { if(!d) return '--/--/--'; const [ano, mes, dia] = d.split('-'); return `${dia}/${mes}/${ano}`; };


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
// --- NOVA FUNÇÃO: MOSTRAR O CÁLCULO ENQUANTO DIGITA ---
window.atualizarPreviewComissao = function() {
    const vendas = parseFloat(document.getElementById('valorVendasInput').value) || 0;
    const comissao = vendas * 0.07; // Calcula 7%
    
    document.getElementById('previewComissaoValor').innerText = comissao.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

// --- ATUALIZADA: LANÇAR COMISSÃO BASEADA EM VENDAS ---
window.lancarComissao = function() {
    if(!checkPerm('fin')) return; 

    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    
    // Pega o valor das VENDAS
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value);
    
    if(!idFunc || !data || isNaN(valorVendas)) return alert("Preencha o Vendedor, Data e Valor das Vendas!");
    
    // O SISTEMA CALCULA OS 7% AQUI
    const valorComissao = valorVendas * 0.07;

    const func = window.db.funcionarios.find(f => f.id == idFunc);
    
    // Salva no banco.
    // DICA: No campo 'obs', guardamos quanto ele vendeu para consulta futura.
    // O campo 'valor' guarda a comissão (o que ele vai receber).
    window.db.extras.push({ 
        id: Date.now(), 
        tipo: 'Comissao', 
        categoria: 'Vendas', 
        idFunc: String(idFunc), 
        beneficiario: func.nome, 
        valor: valorComissao, // Salva os R$ 70,00
        data: data, 
        obs: `7% sobre ${fmtMoeda(valorVendas)}` // Salva "7% sobre R$ 1.000,00"
    });

    registrarLog('Financeiro', `Lançou comissão de ${fmtMoeda(valorComissao)} (Vendas: ${fmtMoeda(valorVendas)}) para ${func.nome}`);
    
    if(window.salvarNuvem) window.salvarNuvem();
    
    alert(`Comissão de ${fmtMoeda(valorComissao)} lançada com sucesso!`);
    
    // Limpa os campos
    document.getElementById('valorVendasInput').value = '';
    document.getElementById('previewComissaoValor').innerText = 'R$ 0,00';
    
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
    
    // Filtra primeiro
    if (filtroId) {
        const nomeFunc = window.db.funcionarios.find(f => f.id == filtroId)?.nome;
        lista = lista.filter(item => { 
            if (filtroId === 'DESPESAS') return item.tipo === 'Despesa'; 
            const matchId = String(item.idFunc) === String(filtroId); 
            const matchNome = item.beneficiario === nomeFunc && item.tipo === 'Comissao'; 
            return matchId || matchNome; 
        });
    }
    
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));

    if (lista.length === 0) { grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhum registro encontrado.</p>'; return; }

    // OTIMIZAÇÃO: Limita a visualização a 50 itens
    const listaVisivel = lista.slice(0, 50);

    listaVisivel.forEach(item => {
        const cor = item.tipo === 'Comissao' ? 'extra-comissao' : 'extra-despesa';
        const tituloCor = item.tipo === 'Comissao' ? 'txt-purple' : 'txt-orange';
        const html = `<div class="extra-card ${cor}"><div class="extra-info"><h4 class="${tituloCor}">${item.categoria} - ${item.beneficiario}</h4><span>📅 ${fmtData(item.data)} | ${item.obs}</span></div><div class="extra-val ${tituloCor}">${fmtMoeda(item.valor)}</div><button class="btn-delete-pag" onclick="removerExtra(${item.id})">🗑️</button></div>`;
        grid.innerHTML += html;
    });
}

window.definirInicioSemana = function() {
    const hoje = new Date();
    const diaSemana = hoje.getDay(); // 0 (Dom) a 6 (Sab)
    
    // Calcula quantos dias voltar para chegar à última segunda-feira
    // Se for Domingo (0), volta 6. Se for Segunda (1), volta 0.
    const diasParaVoltar = diaSemana === 0 ? 6 : (diaSemana - 1);
    
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - diasParaVoltar);
    
    // Formata manualmente para YYYY-MM-DD para não ter erro de fuso
    const ano = segunda.getFullYear();
    const mes = String(segunda.getMonth() + 1).padStart(2, '0');
    const dia = String(segunda.getDate()).padStart(2, '0');
    
    const inputData = document.getElementById('dataInicioCiclo');
    if (inputData) {
        inputData.value = `${ano}-${mes}-${dia}`;
        window.atualizarPrevisao(); // Recalcula a tela
    }
}
window.calcularSaldoGlobal = function(f, dataRefStr) {
    // Se não passar data, usa Hoje
    if (!dataRefStr) dataRefStr = new Date().toISOString().split('T')[0];

    let totalGanhos = 0;
    let totalPagos = 0;

    // 1. Soma Histórico de Pagamentos (Apenas o que foi pago ATÉ a data selecionada)
    window.db.pagamentos.forEach(p => {
        if (p.idFunc == f.id && p.data <= dataRefStr) {
            totalPagos += p.valor;
        }
    });

    // 2. Soma Histórico de Extras (Apenas ATÉ a data selecionada)
    window.db.extras.forEach(e => {
        if ((String(e.idFunc) === String(f.id) || e.beneficiario === f.nome) && e.data <= dataRefStr) {
            totalGanhos += e.valor;
        }
    });

    // --- CÁLCULO INTELIGENTE (BASEADO NA DATA ESCOLHIDA) ---
    // Define o "Mês Atual" baseado na data do formulário, não no dia de hoje
    const mesAtualStr = dataRefStr.slice(0, 7); // Ex: "2026-01"
    
    let semanasPassadasContadas = new Set();
    let mesesPassadosContados = new Set();

    Object.keys(window.db.presencas).forEach(diaStr => {
        // Só olha presenças até a data selecionada
        if (diaStr <= dataRefStr) {
            const registro = window.db.presencas[diaStr].find(r => r.id == f.id);
            
            if (registro && ['Presente', 'Atrasado'].includes(registro.status)) {
                const mesRegistro = diaStr.slice(0, 7);
                
                // A. PASSAGEM (Sempre soma)
                if (f.tipo !== 'Diaria') {
                    totalGanhos += (f.passagem || 0);
                }

                // B. DIARISTA (Soma o dia)
                if (f.tipo === 'Diaria') {
                    totalGanhos += f.salario;
                }

                // C. RASTREAR PASSADO (Se a presença for de um mês ANTERIOR ao selecionado)
                if (mesRegistro < mesAtualStr) {
                    if (f.tipo === 'Semanal') {
                        const diaDoMes = parseInt(diaStr.split('-')[2]);
                        const numSemana = Math.ceil(diaDoMes / 7); 
                        semanasPassadasContadas.add(`${mesRegistro}-W${numSemana}`);
                    } else {
                        mesesPassadosContados.add(mesRegistro);
                    }
                }
            }
        }
    });

    // 3. APLICAR SALÁRIOS
    if (f.tipo !== 'Diaria') {
        
        // A. Passado: Cobra semanas/meses fechados anteriores à data escolhida
        if (f.tipo === 'Semanal') {
            const qtdSemanas = semanasPassadasContadas.size;
            totalGanhos += qtdSemanas * (f.salario * 0.25);
        } else {
            mesesPassadosContados.forEach(() => {
                totalGanhos += f.salario;
            });
        }

        // B. Mês "Atual" (Da data selecionada): Usa a regra do calendário
        // Aqui ele vai ver se é dia 1, dia 8 ou dia 15 DA DATA QUE ESCOLHESTE
        totalGanhos += window.calcularTetoLiberado(f, dataRefStr);
    }

    return totalGanhos - totalPagos;
};
// 2. Atualiza a Tela (Mostra a Semana + Pendências Antigas)
// ============================================================
// === MÓDULO DE PAGAMENTOS (RESTAURADO - LÓGICA MENSAL) ===
// ============================================================

// 1. Regra de Liberação (Semanal/Quinzenal/Mensal)
// --- NOVA LÓGICA: ATUALIZAÇÃO ÀS SEGUNDAS-FEIRAS ---
window.calcularTetoLiberado = function(func, dataStr) {
    if (func.tipo === 'Mensal') return func.salario; 
    if (func.tipo === 'Diaria') return 0; 
    
    // QUINZENAL (Dia 1 e Dia 16)
    if (func.tipo === 'Quinzenal') { 
        const dia = parseInt(dataStr.split('-')[2]);
        if (dia <= 15) return func.salario / 2; 
        return func.salario; 
    }
    
    // --- CORREÇÃO SEMANAL (TRAVADO ATÉ SEGUNDA) ---
    if (func.tipo === 'Semanal') { 
        const dataAtual = new Date(dataStr + 'T12:00:00');
        const ano = dataAtual.getFullYear();
        const mes = dataAtual.getMonth(); 
        const diaAtual = dataAtual.getDate();

        // Encontrar todas as Segundas-feiras do mês
        let segundas = [];
        let d = new Date(ano, mes, 1);
        while (d.getDay() !== 1) { d.setDate(d.getDate() + 1); } // Acha a 1ª
        while (d.getMonth() === mes) {
            segundas.push(d.getDate());
            d.setDate(d.getDate() + 7);
        }

        // REGRA DE OURO:
        // 1. Antes da 1ª Segunda-feira = ZERO (0%)
        if (diaAtual < segundas[0]) return 0;

        // 2. Da 1ª Segunda até antes da 2ª = 25%
        if (diaAtual < segundas[1]) return func.salario * 0.25;

        // 3. Da 2ª Segunda até antes da 3ª = 50%
        if (diaAtual < segundas[2]) return func.salario * 0.50;

        // 4. Da 3ª Segunda até antes da 4ª (se houver) = 75%
        // Nota: Se não houver 4ª segunda (fevereiro as vezes), libera tudo no passo final
        if (segundas[3] && diaAtual < segundas[3]) return func.salario * 0.75;

        // 5. Da 4ª Segunda em diante = 100%
        return func.salario; 
    }
    return 0;
}   

// 2. Auxiliar de Comissões
window.getTotalComissoesMes = function(idFunc, dataRefStr) {
    const parts = dataRefStr.split('-'); 
    const anoRef = parseInt(parts[0]); 
    const mesRef = parseInt(parts[1]) - 1;
    const func = window.db.funcionarios.find(f => f.id == idFunc); 
    const nomeFunc = func ? func.nome : "";
    
    return window.db.extras.reduce((acc, e) => {
        if (e.tipo !== 'Comissao') return acc;
        const eParts = e.data.split('-'); 
        const eAno = parseInt(eParts[0]); 
        const eMes = parseInt(eParts[1]) - 1;
        if (eAno !== anoRef || eMes !== mesRef) return acc;
        
        const isIdMatch = String(e.idFunc) === String(idFunc); 
        const isNameMatch = e.beneficiario === nomeFunc;
        if (isIdMatch || isNameMatch) return acc + e.valor;
        return acc;
    }, 0);
}
// --- NOVA FUNÇÃO: SOMA ENTREGAS DO MÊS ---
window.getTotalMotoboyMes = function(idFunc, dataRefStr) {
    const parts = dataRefStr.split('-'); 
    const anoRef = parseInt(parts[0]); 
    const mesRef = parseInt(parts[1]) - 1; // Javascript conta meses de 0 a 11
    
    // Filtra a lista de entregas (db.entregas)
    return window.db.entregas.reduce((acc, entrega) => {
        const eParts = entrega.data.split('-'); 
        const eAno = parseInt(eParts[0]); 
        const eMes = parseInt(eParts[1]) - 1;
        
        // Verifica se é o Motoboy certo e o Mês certo
        if (entrega.idFunc == idFunc && eAno === anoRef && eMes === mesRef) {
            return acc + (entrega.valorTotal || 0);
        }
        return acc;
    }, 0);
}
// 3. Calcula Ganhos do Mês (Sem olhar passado)
window.calcularGanhosNoMes = function(idFunc, dataRefStr) {
    const func = window.db.funcionarios.find(f => f.id == idFunc); 
    if (!func) return 0;
    
    let totalGanhos = 0; 
    const [anoRef, mesRef] = dataRefStr.split('-'); 
    
    // 1. Salário Base (Se não for Diarista puro)
    if (func.tipo !== 'Diaria') totalGanhos = window.calcularTetoLiberado(func, dataRefStr);
    
    // 2. Presenças (Passagens ou Diárias comuns)
    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const listaDia = window.db.presencas[diaStr]; 
            const registro = listaDia.find(r => r.id == idFunc);
            if(registro) {
                if (func.tipo !== 'Diaria') { 
                    if(registro.status === 'Presente' || registro.status === 'Atrasado') totalGanhos += (func.passagem || 0); 
                } else { 
                    // Se for diarista comum (não motoboy de entrega), soma a diária fixa
                    if(registro.status === 'Presente') totalGanhos += func.salario; 
                    else if(registro.status === 'Atrasado') totalGanhos += (func.salario / 2); 
                }
            }
        }
    });
    
    // 3. Comissões (Vendas)
    const totalComissoes = window.getTotalComissoesMes(idFunc, dataRefStr);

    // 4. ENTREGAS MOTOBOY (NOVO!)
    const totalEntregas = window.getTotalMotoboyMes(idFunc, dataRefStr);

    return totalGanhos + totalComissoes + totalEntregas;
}

// --- COPIE DAQUI PARA BAIXO ---

// 4. Calcula Pagamentos Feitos no Mês (RESTAURADA)
window.getTotalPagoNoMes = function(idFunc, dataReferencia) {
    const dataRef = new Date(dataReferencia); 
    const mesRef = dataRef.getUTCMonth(); 
    const anoRef = dataRef.getUTCFullYear();
    
    return window.db.pagamentos.filter(p => { 
        const d = new Date(p.data); 
        return p.idFunc == idFunc && d.getUTCMonth() == mesRef && d.getUTCFullYear() == anoRef; 
    }).reduce((acc, p) => acc + p.valor, 0);
}

window.atualizarPainelPagamentos = function() {
    const idFunc = document.getElementById('selectFuncionarioPagamento').value;
    const dataStr = document.getElementById('dataPagamento').value; 
    const divAviso = document.getElementById('avisoSaldo');
    const divResumo = document.getElementById('resumoFinanceiro');
    const gridPag = document.getElementById('gridPagamentos');
    
    gridPag.innerHTML = ''; 
    
    // Se não tiver funcionário selecionado
    if (!idFunc) {
        divAviso.style.display = 'none'; divResumo.style.display = 'none';
        const todosPag = [...window.db.pagamentos].sort((a, b) => new Date(b.data) - new Date(a.data));
        window.renderizarCardsPagamento(todosPag);
        return;
    }
    
    divResumo.style.display = 'flex';
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    const pagsFuncionario = window.db.pagamentos.filter(p => p.idFunc == idFunc);
    
    // --- 1. SOMA O QUE JÁ FOI PAGO (Vales e Salários) ---
    let totalPagoSalario = 0; 
    let totalVales = 0;
    const [anoRef, mesRef] = dataStr.split('-');
    
    pagsFuncionario.forEach(p => { 
        if (p.data.startsWith(`${anoRef}-${mesRef}`)) { 
            if (p.tipo === 'Vale') totalVales += p.valor; 
            else totalPagoSalario += p.valor; 
        } 
    });
    
    document.getElementById('resumoSalario').innerText = fmtMoeda(totalPagoSalario);
    document.getElementById('resumoVale').innerText = fmtMoeda(totalVales);
    
    const historicoOrdenado = [...pagsFuncionario].sort((a, b) => new Date(b.data) - new Date(a.data));
    window.renderizarCardsPagamento(historicoOrdenado);
    
    if (!dataStr) return;
    
    // --- 2. CÁLCULOS DOS GANHOS ---
    const salarioBaseLiberado = window.calcularTetoLiberado(func, dataStr);
    
    let totalPassagens = 0;
    let diasPresenca = 0;

    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const registro = window.db.presencas[diaStr].find(r => r.id == idFunc);
            if(registro && ['Presente', 'Atrasado'].includes(registro.status)) {
                 if (func.tipo !== 'Diaria') { 
                     totalPassagens += (func.passagem || 0); 
                 }
                 diasPresenca++;
            }
        }
    });

    const totalComissoes = window.getTotalComissoesMes(idFunc, dataStr); 
    const totalEntregas = window.getTotalMotoboyMes(idFunc, dataStr); 
    
    // Soma tudo
    const ganhosTotal = salarioBaseLiberado + totalPassagens + totalComissoes + totalEntregas;
    const totalJaRecebido = totalPagoSalario + totalVales; 
    const restante = ganhosTotal - totalJaRecebido;
    
    // --- 3. MONTAGEM DO EXTRATO VISUAL (Na caixa verde) ---
    
    // Define as cores da caixa
    divAviso.style.display = 'block';
    let corFundo, corTexto, corBorda, icone;
    
    if (restante > 0) {
        corFundo = '#d4edda'; corTexto = '#155724'; corBorda = '#c3e6cb'; icone = '✅';
    } else if (restante === 0) {
        corFundo = '#d1ecf1'; corTexto = '#0c5460'; corBorda = '#bee5eb'; icone = '🔷';
    } else {
        corFundo = '#f8d7da'; corTexto = '#721c24'; corBorda = '#f5c6cb'; icone = '🛑';
    }

    divAviso.style.backgroundColor = corFundo; 
    divAviso.style.color = corTexto; 
    divAviso.style.border = `1px solid ${corBorda}`; 

    // Cria a lista de detalhes (Só aparece o que tiver valor > 0)
    let detalhesHTML = '<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.1); font-size:0.85rem; line-height:1.6;">';
    
    if(totalEntregas > 0) detalhesHTML += `<div style="display:flex; justify-content:space-between;"><span>🏍️ Entregas Motoboy:</span> <strong>${fmtMoeda(totalEntregas)}</strong></div>`;
    if(totalComissoes > 0) detalhesHTML += `<div style="display:flex; justify-content:space-between;"><span>⭐ Comissões/Vendas:</span> <strong>${fmtMoeda(totalComissoes)}</strong></div>`;
    if(totalPassagens > 0) detalhesHTML += `<div style="display:flex; justify-content:space-between;"><span>🚌 Presença/Passagem (${diasPresenca}d):</span> <strong>${fmtMoeda(totalPassagens)}</strong></div>`;
    if(salarioBaseLiberado > 0) detalhesHTML += `<div style="display:flex; justify-content:space-between;"><span>📅 Salário Base:</span> <strong>${fmtMoeda(salarioBaseLiberado)}</strong></div>`;
    
    // Mostra o total ganho e o que já foi pago
    detalhesHTML += `<div style="display:flex; justify-content:space-between; margin-top:5px; border-top:1px dashed rgba(0,0,0,0.1); padding-top:5px;"><span>∑ Total Bruto:</span> <strong>${fmtMoeda(ganhosTotal)}</strong></div>`;
    
    if(totalJaRecebido > 0) detalhesHTML += `<div style="display:flex; justify-content:space-between; color:#c0392b;"><span>💸 Já Recebido (Vales):</span> <strong>- ${fmtMoeda(totalJaRecebido)}</strong></div>`;
    
    detalhesHTML += '</div>';

    let extraInfo = func.pix ? `<div style="margin-top:8px; font-size:0.8rem; opacity:0.8;">🔑 Pix: ${func.pix}</div>` : '';

    // Monta o HTML Final
    divAviso.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:1.3rem;">
                ${icone} <strong>Disponível: ${fmtMoeda(restante)}</strong>
            </span>
        </div>
        ${detalhesHTML}
        ${extraInfo}
    `;
}

// FUNÇÃO PARA ABRIR O MODAL
// ATENÇÃO: Adicionei o parâmetro 'entregas' na função
window.abrirDetalhesFinanceiros = function(nome, base, passagens, dias, extras, entregas, recebido, saldo) {
    const el = document.getElementById('corpoDetalhes');
    const corSaldo = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
    
    // Verifica se tem valor para mostrar, senão esconde a linha para não poluir
    const htmlEntregas = entregas > 0 
        ? `<div class="detalhes-linha"><span>🏍️ Entregas (Motoboy)</span><span class="detalhes-destaque">+ ${fmtMoeda(entregas)}</span></div>` 
        : '';
        
    const htmlExtras = extras > 0
        ? `<div class="detalhes-linha"><span>⭐ Comissões / Extras</span><span class="detalhes-destaque">+ ${fmtMoeda(extras)}</span></div>`
        : '';

    const htmlPassagem = passagens > 0
        ? `<div class="detalhes-linha"><span>🚌 Passagem (${dias} dias)</span><span class="detalhes-destaque">+ ${fmtMoeda(passagens)}</span></div>`
        : '';

    const htmlSalario = base > 0
        ? `<div class="detalhes-linha"><span>📅 Salário Base</span><span class="detalhes-destaque">${fmtMoeda(base)}</span></div>`
        : '';

    el.innerHTML = `
        <div style="text-align:center; font-weight:bold; color:#7f8c8d; margin-bottom:15px;">${nome}</div>
        
        ${htmlSalario}
        ${htmlPassagem}
        ${htmlExtras}
        ${htmlEntregas} <div class="detalhes-linha" style="color:#c0392b;">
            <span>💸 Já Recebeu (Vales)</span>
            <strong>- ${fmtMoeda(recebido)}</strong>
        </div>
        
        <div class="detalhes-total" style="color:${corSaldo}">
            <span>SALDO FINAL</span>
            <span>${fmtMoeda(saldo)}</span>
        </div>
        <p style="font-size:0.75rem; color:#aaa; text-align:center; margin-top:10px;">
            * Valores referentes ao mês selecionado.
        </p>
    `;
    
    document.getElementById('modalDetalhes').style.display = 'flex';
}

// 6. Renderizar Cards (Visual dos Pagamentos)
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

// 7. Lançar Pagamento (Verificação Mensal)
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
    
    // VERIFICA LIMITE MENSAL
    const ganhosTotal = window.calcularGanhosNoMes(idFunc, data);
    const totalJaRecebido = window.getTotalPagoNoMes(idFunc, data); 
    
    if ((totalJaRecebido + valor) > ganhosTotal) {
        const disponivel = ganhosTotal - totalJaRecebido;
        if(!confirm(`⚠️ ATENÇÃO: O valor excede o permitido!\n\nLiberado: ${fmtMoeda(ganhosTotal)}\nJá Recebeu: ${fmtMoeda(totalJaRecebido)}\nDisponível: ${fmtMoeda(disponivel > 0 ? disponivel : 0)}\n\nDeseja lançar mesmo assim como VALE?`)) return;
    }
    
    window.db.pagamentos.push({ id: Date.now(), idFunc: parseInt(idFunc), nomeFunc: func.nome, tipo: tipo, valor: valor, data: data, desc: desc });
    registrarLog('Financeiro', `Lançou ${tipo} de ${fmtMoeda(valor)} para ${func.nome}`);
    
    if(window.salvarNuvem) window.salvarNuvem(); 
    
    document.getElementById('valorPagamento').value = ''; 
    document.getElementById('descPagamento').value = '';
    window.atualizarPainelPagamentos(); 
    alert("Operação registrada!");
}

// 8. Remover Pagamento
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
// ============================================================
// === NOVA OTIMIZAÇÃO DE RENDERIZAÇÃO (Para evitar travar) ===
// ============================================================

// Variável para saber qual seção está visível
let secaoAtual = 'dashboard';

// Substitui a antiga window.showSection
window.showSection = function(id, btnElement) {
    secaoAtual = id; // Atualiza a seção atual
    
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    if(btnElement) btnElement.classList.add('active');

    // Só atualiza os dados da seção que foi aberta
    atualizarSecaoEspecifica(id);
}

// Nova função auxiliar para atualizar apenas o necessário
window.atualizarSecaoEspecifica = function(id) {
    if(id === 'previsao') window.atualizarPrevisao();
    if(id === 'extras') window.renderizarExtras();
    if(id === 'dashboard') window.atualizarDashboard();
    if(id === 'seguranca') renderizarAudit();
    if(id === 'pagamentos') window.atualizarPainelPagamentos();
    
    // --- LINHA NOVA PARA OS BOLETOS ---
    if(id === 'boletos') window.renderizarBoletos();

    if(id === 'motoboys') {
        window.renderizarMotoboys();
        const sel = document.getElementById('selMotoId');
        if (sel.options.length <= 1) {
             sel.innerHTML = '<option value="">Selecione...</option>';
             window.db.funcionarios.forEach(f => {
                sel.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
            });
        }
    }
}

// Variável de controle (Fica fora da função para lembrar se clicou no botão)
let mostrarTodosFuncionarios = false;

window.alternarVisualizacao = function() {
    mostrarTodosFuncionarios = !mostrarTodosFuncionarios; // Inverte (Sim/Não)
    window.atualizarInterface(); // Atualiza a tela
}

// Substitui a antiga window.atualizarInterface
window.atualizarInterface = function() {
    // 1. Prepara a Tabela e os Selects
    const tbFunc = document.getElementById('tabelaFuncionarios').querySelector('tbody'); 
    tbFunc.innerHTML = '';
    
    const inputBusca = document.getElementById('buscaFuncionario');
    const termoBusca = inputBusca ? inputBusca.value.toLowerCase() : '';

    const selectPag = document.getElementById('selectFuncionarioPagamento'); 
    const selVendedor = document.getElementById('selVendedorExtra'); 
    const selFiltroExtras = document.getElementById('filtroExtras'); 
    const selPrevisao = document.getElementById('filtroPrevisao');
    
    const selectionAtualPag = selectPag ? selectPag.value : ''; 
    const selectionAtualExtra = selVendedor ? selVendedor.value : '';

    if(selectPag) selectPag.innerHTML = '<option value="">Selecione...</option>'; 
    if(selVendedor) selVendedor.innerHTML = '<option value="">Selecione...</option>'; 
    if(selFiltroExtras) selFiltroExtras.innerHTML = '<option value="">Todos (Geral)</option><option value="DESPESAS">🔸 Despesas / Eventos</option>'; 
    if(selPrevisao) selPrevisao.innerHTML = '<option value="">Todos da Equipe</option>';

    // Pega todos os funcionários e ordena por nome
    const funcsOrdenados = [...window.db.funcionarios].sort((a, b) => a.nome.localeCompare(b.nome));
    
    // --- PARTE 1: Preencher os Menus (Carrega TODOS) ---
    funcsOrdenados.forEach(f => {
        if(selectPag) selectPag.innerHTML += `<option value="${f.id}">${f.nome}</option>`; 
        if(selVendedor) selVendedor.innerHTML += `<option value="${f.id}">${f.nome}</option>`; 
        if(selFiltroExtras) selFiltroExtras.innerHTML += `<option value="${f.id}">${f.nome}</option>`; 
        if(selPrevisao) selPrevisao.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
    });

    // --- PARTE 2: Lógica Inteligente de Exibição ---
    let listaParaTabela = [];
    let mensagemRodape = '';

    if (termoBusca !== "") {
        // SE ESTIVER PESQUISANDO: Filtra pelo nome e mostra tudo que achar
        listaParaTabela = funcsOrdenados.filter(f => f.nome.toLowerCase().includes(termoBusca));
        if (listaParaTabela.length === 0) mensagemRodape = `<span style="color:red">Ninguém encontrado com "${termoBusca}"</span>`;
    } 
    else {
        // SE NÃO ESTIVER PESQUISANDO:
        if (mostrarTodosFuncionarios) {
            // Se o botão "Ver Todos" foi clicado, mostra TODO MUNDO
            listaParaTabela = funcsOrdenados;
            mensagemRodape = `<button onclick="window.alternarVisualizacao()" style="cursor:pointer; background:none; border:none; color:#e67e22; font-weight:bold; padding:10px; width:100%;">⬆️ Ocultar Lista (Voltar ao modo rápido)</button>`;
        } else {
            // Modo Padrão: Mostra apenas os 5 primeiros
            listaParaTabela = funcsOrdenados.slice(0, 5);
            const totalOcultos = funcsOrdenados.length - 5;
            if (totalOcultos > 0) {
                mensagemRodape = `<button onclick="window.alternarVisualizacao()" style="cursor:pointer; background:var(--secondary); border:none; color:white; border-radius:4px; padding:10px 20px; font-size:0.9rem; margin-top:5px;">⬇️ Ver Lista Completa (+${totalOcultos} funcionários)</button><br><small style="color:#7f8c8d;">(Pode demorar um pouquinho para carregar)</small>`;
            }
        }
    }

    // --- PARTE 3: Desenhar a Tabela ---
    listaParaTabela.forEach(f => {
        let tagClass = 'tag-mensal'; let tagText = 'MENSAL';
        if(f.tipo === 'Quinzenal') { tagClass = 'tag-quinzenal'; tagText = 'QUINZENAL'; } else if(f.tipo === 'Semanal') { tagClass = 'tag-semanal'; tagText = 'SEMANAL'; } else if(f.tipo === 'Diaria') { tagClass = 'tag-diaria'; tagText = 'DIÁRIA'; }
        
        let infoPagamento = ''; 
        if(f.tipo === 'Diaria') infoPagamento = `<span style="font-weight:bold; color:var(--warning)">${fmtMoeda(f.salario)}/dia</span>`; 
        else infoPagamento = `<span style="font-weight:bold; color:var(--success)">${fmtMoeda(f.salario)}</span><br><span style="font-size:0.8em">+ Passagem: ${fmtMoeda(f.passagem || 0)}</span>`;
        
        const cpfDisplay = f.cpf ? `<br><span class="info-sub">CPF: ${f.cpf}</span>` : ''; 
        const contatoDisplay = f.tel ? `📞 ${f.tel}` : '<span style="color:#ccc">Sem tel</span>'; 
        const pixDisplay = f.pix ? `<br><div class="info-pix">Pix: ${f.pix}</div> <button class="btn-copy" onclick="copiarTexto('${f.pix}')">Copiar</button>` : '';
        const enderecoDisplay = f.end ? `<div class="info-sub">🏠 ${f.end}</div>` : ''; 
        const nascDisplay = f.nasc ? `<div class="info-sub">🎂 ${fmtDataSimples(f.nasc)}</div>` : ''; 
        const entradaDisplay = f.entrada ? `<div class="info-sub">Entrada: ${fmtDataSimples(f.entrada)}</div>` : '';
        
        const btnPonto = `<button class="btn-copy" style="background:var(--secondary); color:white; border:none; margin-left:5px;" onclick="imprimirFolhaPonto(${f.id})" title="Imprimir Ponto">⏰</button>`;

        tbFunc.innerHTML += `<tr><td><strong>${f.nome}</strong>${cpfDisplay}</td><td>${f.cargo}<span class="info-empresa">🏢 ${f.empresa || '-'}</span>${entradaDisplay}</td><td>${contatoDisplay}${pixDisplay}${enderecoDisplay}${nascDisplay}</td><td><span class="tag-tipo ${tagClass}">${tagText}</span><br>${infoPagamento}</td><td><div class="table-actions"><button class="btn-edit" onclick="prepararEdicao(${f.id})" title="Editar">✏️</button><button class="btn-del" onclick="removerFuncionario(${f.id})" title="Excluir">🗑️</button>${btnPonto}</div></td></tr>`;
    });

    // Adiciona o Botão ou Mensagem no final da tabela
    if (mensagemRodape) {
        tbFunc.innerHTML += `<tr><td colspan="5" style="text-align:center; padding:15px;">${mensagemRodape}</td></tr>`;
    }

    if(selectPag) selectPag.value = selectionAtualPag; 
    if(selVendedor) selVendedor.value = selectionAtualExtra;

    if(typeof atualizarSecaoEspecifica === 'function') atualizarSecaoEspecifica(secaoAtual);
}
// ============================================================
// === MÓDULO DE BOLETOS E CONTAS A PAGAR (NOVO) ===
// ============================================================

window.lancarBoleto = function() {
    if(!checkPerm('boletos')) return; // Verifica permissão

    const desc = document.getElementById('bolDesc').value;
    const valor = parseFloat(document.getElementById('bolValor').value);
    const data = document.getElementById('bolData').value;
    const codigo = document.getElementById('bolCodigo').value;

    if(!desc || !valor || !data) return alert("Preencha Descrição, Valor e Vencimento!");

    const novoBoleto = {
        id: Date.now(),
        desc: desc,
        valor: valor,
        vencimento: data,
        codigo: codigo,
        status: 'PENDENTE', 
        dataPagamento: null
    };

    if(!window.db.boletos) window.db.boletos = [];
    window.db.boletos.push(novoBoleto);

    registrarLog('Boletos', `Cadastrou conta: ${desc} (${fmtMoeda(valor)})`);
    if(window.salvarNuvem) window.salvarNuvem();

    alert("Conta Registrada!");
    // Limpa o formulário
    document.getElementById('bolDesc').value = '';
    document.getElementById('bolValor').value = '';
    document.getElementById('bolCodigo').value = '';
    
    window.renderizarBoletos();
}

window.renderizarBoletos = function() {
    const grid = document.getElementById('gridBoletos');
    const filtro = document.getElementById('filtroBoletos').value;
    grid.innerHTML = '';

    if(!window.db.boletos) window.db.boletos = [];

    let totalVencido = 0;
    let totalAberto = 0;
    let totalPago = 0;
    
    // Data de hoje (zerada para comparação correta)
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    // Ordena por data
    const listaOrdenada = [...window.db.boletos].sort((a,b) => new Date(a.vencimento) - new Date(b.vencimento));

    listaOrdenada.forEach(b => {
        const dataVenc = new Date(b.vencimento + 'T12:00:00'); // Fuso horário corrigido
        const diffTempo = dataVenc - hoje;
        const diasRestantes = Math.ceil(diffTempo / (1000 * 60 * 60 * 24)); 

        // Somas
        if(b.status === 'PAGO') {
            totalPago += b.valor;
        } else {
            totalAberto += b.valor;
            if(diasRestantes < 0) totalVencido += b.valor;
        }

        // Filtros Visuais
        if(filtro === 'PENDENTE' && b.status === 'PAGO') return;
        if(filtro === 'PAGO' && b.status !== 'PAGO') return;

        // Cores e Etiquetas
        let classeBorda = '';
        let badgeData = '';
        let textoData = '';

        if (b.status === 'PAGO') {
            classeBorda = 'b-pago'; badgeData = 'badge-green'; textoData = '✅ PAGO';
        } else {
            if (diasRestantes < 0) {
                classeBorda = 'b-vencido'; badgeData = 'badge-red'; textoData = `🚨 Venceu há ${Math.abs(diasRestantes)} dias`;
            } else if (diasRestantes === 0) {
                classeBorda = 'b-vencido'; badgeData = 'badge-red'; textoData = `⚠️ VENCE HOJE!`;
            } else if (diasRestantes <= 3) {
                classeBorda = 'b-atencao'; badgeData = 'badge-yellow'; textoData = `⏳ Vence em ${diasRestantes} dias`;
            } else {
                classeBorda = 'b-dia'; badgeData = 'badge-blue'; textoData = `📅 Vence dia ${fmtDataSimples(b.vencimento)}`;
            }
        }

        const btnAcao = b.status === 'PENDENTE' 
            ? `<button class="btn-pagar pendente" onclick="toggleStatusBoleto(${b.id})">💸 Confirmar Pagamento</button>`
            : `<button class="btn-pagar desfazer" onclick="toggleStatusBoleto(${b.id})">↩️ Desfazer (Tornar Pendente)</button>`;

        const html = `
            <div class="boleto-card ${classeBorda}">
                <div>
                    <div class="bol-header">
                        <span style="font-weight:bold; color:var(--text-sub); font-size:0.8rem;">#${b.id.toString().slice(-4)}</span>
                        <span class="bol-data ${badgeData}">${textoData}</span>
                    </div>
                    <div style="font-weight:bold; font-size:1.1rem; margin-bottom:5px;">${b.desc}</div>
                    ${b.codigo ? `<div style="font-size:0.75rem; color:#aaa; overflow:hidden; text-overflow:ellipsis; margin-bottom:5px;">📠 ${b.codigo}</div>` : ''}
                </div>
                <div>
                    <div class="bol-valor">${fmtMoeda(b.valor)}</div>
                    ${btnAcao}
                    <button onclick="removerBoleto(${b.id})" style="background:none; border:none; color:#e74c3c; width:100%; margin-top:5px; cursor:pointer; font-size:0.8rem;">Excluir</button>
                </div>
            </div>`;
        grid.innerHTML += html;
    });

    // Atualiza os números no topo
    document.getElementById('bolTotalVencido').innerText = fmtMoeda(totalVencido);
    document.getElementById('bolTotalAberto').innerText = fmtMoeda(totalAberto);
    document.getElementById('bolTotalPago').innerText = fmtMoeda(totalPago);
}

window.toggleStatusBoleto = function(id) {
    if(!checkPerm('boletos')) return; // Verifica permissão
    
    const b = window.db.boletos.find(x => x.id === id);
    
    if(b) {
        if(b.status === 'PENDENTE') {
            // MARCA COMO PAGO
            b.status = 'PAGO';
            b.dataPagamento = new Date().toISOString();
            registrarLog('Boletos', `Pagou conta: ${b.desc}`);
            
            // --- REMOVI AQUI A PARTE QUE PERGUNTA SOBRE LANÇAR EM EXTRAS ---
            
        } else {
            // REABRE A CONTA (VOLTA PARA PENDENTE)
            b.status = 'PENDENTE';
            b.dataPagamento = null;
            registrarLog('Boletos', `Reabriu conta: ${b.desc}`);
        }
        
        if(window.salvarNuvem) window.salvarNuvem();
        window.renderizarBoletos();
    }
}
window.removerBoleto = function(id) {
    if(!checkPerm('boletos')) return;
    if(confirm("Tem certeza que deseja apagar essa conta?")) {
        window.db.boletos = window.db.boletos.filter(x => x.id !== id);
        if(window.salvarNuvem) window.salvarNuvem();
        window.renderizarBoletos();
    }
}
window.atualizarPrevisao = function() {
    const listUrgent = document.getElementById('listUrgent');
    const listWeekly = document.getElementById('listWeekly');
    const listMonthly = document.getElementById('listMonthly');
    const inputData = document.getElementById('dataPrevisaoBase');
    const filtroLoja = document.getElementById('filtroEmpresaPrevisao');
    
    // 1. Configura Data (Hoje se estiver vazio)
    if (!inputData.value) inputData.value = new Date().toISOString().split('T')[0];
    const dataRefStr = inputData.value; 
    
    // 2. Popula o Select de Lojas (se estiver vazio)
    // Isso garante que se você adicionar uma loja nova, ela aparece aqui automaticamente
    if (filtroLoja.options.length <= 1) {
        const lojasUnicas = [...new Set(window.db.funcionarios.map(f => f.empresa).filter(Boolean))].sort();
        lojasUnicas.forEach(loja => {
            filtroLoja.innerHTML += `<option value="${loja}">${loja}</option>`;
        });
    }

    const lojaSelecionada = filtroLoja.value;

    // Limpa as colunas
    listUrgent.innerHTML = ''; listWeekly.innerHTML = ''; listMonthly.innerHTML = '';
    
    let totalUrgent = 0, totalWeekly = 0, totalMonthly = 0;

    // --- PROCESSAR FUNCIONÁRIOS ---
    window.db.funcionarios.forEach(f => {
        // FILTRO: Se tiver loja selecionada e não for a do funcionário, pula
        if (lojaSelecionada && f.empresa !== lojaSelecionada) return;

        // Calcula Saldo Devedor
        const totalGanhos = window.calcularGanhosNoMes(f.id, dataRefStr);
        const totalPago = window.getTotalPagoNoMes(f.id, dataRefStr);
        const saldoDevedor = totalGanhos - totalPago;

        if (saldoDevedor > 0.1) {
            let htmlCard = `
                <div class="k-info">
                    <h4>${f.nome}</h4>
                    <p>${f.empresa || 'Sem Loja'}</p>
                </div>
                <div class="k-value">${fmtMoeda(saldoDevedor)}</div>
            `;

            // Coluna Vermelha: Diaristas e Motoboys
            if (f.tipo === 'Diaria') {
                totalUrgent += saldoDevedor;
                listUrgent.innerHTML += `<div class="k-card border-urgent">${htmlCard}</div>`;
            }
            // Coluna Azul: Semanais e Quinzenais
            else if (f.tipo === 'Semanal' || f.tipo === 'Quinzenal') {
                totalWeekly += saldoDevedor;
                listWeekly.innerHTML += `<div class="k-card border-weekly">${htmlCard}</div>`;
            }
            // Coluna Verde: Mensalistas
            else {
                totalMonthly += saldoDevedor;
                listMonthly.innerHTML += `<div class="k-card border-monthly">${htmlCard}</div>`;
            }
        }
    });

    // --- PROCESSAR BOLETOS (CONTAS) ---
    // Regra: Só mostra boletos se estiver vendo "Todas as Lojas" 
    // (Pois boletos geralmente não têm o campo 'empresa' vinculado ainda)
    if(window.db.boletos && lojaSelecionada === "") {
        const dataReferencia = new Date(dataRefStr + 'T12:00:00');
        
        window.db.boletos.forEach(b => {
            if(b.status !== 'PAGO') {
                const dataVenc = new Date(b.vencimento + 'T12:00:00');
                const diffDias = Math.ceil((dataVenc - dataReferencia) / (1000 * 60 * 60 * 24));
                
                let htmlBoleto = `
                    <div class="k-info">
                        <h4>🧾 ${b.desc}</h4>
                        <p>Vence: ${fmtDataSimples(b.vencimento)}</p>
                    </div>
                    <div class="k-value" style="color:#d35400">${fmtMoeda(b.valor)}</div>
                `;

                if (diffDias <= 1) { 
                    totalUrgent += b.valor;
                    listUrgent.innerHTML += `<div class="k-card border-boleto" style="background:#fff5e6">${htmlBoleto}</div>`;
                } else if (diffDias <= 7) { 
                    totalWeekly += b.valor;
                    listWeekly.innerHTML += `<div class="k-card border-boleto">${htmlBoleto}</div>`;
                }
            }
        });
    }

    // Atualiza Totais
    document.getElementById('sumUrgent').innerText = fmtMoeda(totalUrgent);
    document.getElementById('sumWeekly').innerText = fmtMoeda(totalWeekly);
    document.getElementById('sumMonthly').innerText = fmtMoeda(totalMonthly);
    document.getElementById('totalGeralPrev').innerText = "Total: " + fmtMoeda(totalUrgent + totalWeekly + totalMonthly);

    // Placeholder se vazio
    const vazio = '<div style="text-align:center; color:#ccc; padding:20px; font-style:italic;">Nada pendente</div>';
    if(listUrgent.innerHTML === '') listUrgent.innerHTML = vazio;
    if(listWeekly.innerHTML === '') listWeekly.innerHTML = vazio;
    if(listMonthly.innerHTML === '') listMonthly.innerHTML = vazio;
}

// --- NOVA FUNÇÃO DE EXTRATO DETALHADO (Correção) ---
window.mostrarDetalhesCalculo = function(idFunc, dataStr) {
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    if(!func) return;

    // 1. Refaz os cálculos
    const [anoRef, mesRef] = dataStr.split('-');
    
    // A. Salário / Diária Base
    const salarioBase = window.calcularTetoLiberado(func, dataStr);

    // B. Presença / Passagem
    let totalPassagens = 0;
    let diasPresenca = 0;
    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const registro = window.db.presencas[diaStr].find(r => r.id == idFunc);
            if(registro && ['Presente', 'Atrasado'].includes(registro.status)) {
                 if (func.tipo !== 'Diaria') totalPassagens += (func.passagem || 0); 
                 diasPresenca++;
            }
        }
    });

    // C. Extras e Motoboy
    const totalComissoes = window.getTotalComissoesMes(idFunc, dataStr); 
    const totalEntregas = window.getTotalMotoboyMes(idFunc, dataStr); 

    // D. O que já foi pago
    const totalPago = window.getTotalPagoNoMes(idFunc, dataStr);

    // E. Totais
    const totalGanho = salarioBase + totalPassagens + totalComissoes + totalEntregas;
    const saldoDisponivel = totalGanho - totalPago;
    const corSaldo = saldoDisponivel >= 0 ? '#27ae60' : '#c0392b';

    // 2. Monta o HTML do Modal
    const el = document.getElementById('corpoDetalhes');
    
    // Só mostra linhas que têm valor (> 0) para não poluir
    let html = `<div style="text-align:center; font-weight:bold; color:#7f8c8d; margin-bottom:15px; font-size:1.1rem; border-bottom:1px solid #eee; padding-bottom:10px;">
        ${func.nome}<br><small style="font-weight:normal; font-size:0.8rem">Referência: ${mesRef}/${anoRef}</small>
    </div>`;

    if(totalEntregas > 0) html += `<div class="detalhes-linha"><span>🏍️ Entregas (Motoboy)</span><span class="detalhes-destaque" style="color:#d35400;">+ ${fmtMoeda(totalEntregas)}</span></div>`;
    
    if(totalComissoes > 0) html += `<div class="detalhes-linha"><span>⭐ Comissões</span><span class="detalhes-destaque" style="color:#8e44ad;">+ ${fmtMoeda(totalComissoes)}</span></div>`;
    
    if(totalPassagens > 0) html += `<div class="detalhes-linha"><span>🚌 Transporte/Presença (${diasPresenca} dias)</span><span class="detalhes-destaque">+ ${fmtMoeda(totalPassagens)}</span></div>`;

    if(salarioBase > 0) html += `<div class="detalhes-linha"><span>📅 Salário Base / Diárias</span><span class="detalhes-destaque">+ ${fmtMoeda(salarioBase)}</span></div>`;

    // Linha de Soma Total Ganho
    html += `<div class="detalhes-linha" style="background:#f9f9f9; font-weight:bold; margin-top:5px;"><span>∑ Total Ganho</span><span>${fmtMoeda(totalGanho)}</span></div>`;

    // Linha do que já foi pago
    if(totalPago > 0) {
        html += `<div class="detalhes-linha" style="color:#c0392b;"><span>💸 Já Recebeu (Vales/Salário)</span><strong>- ${fmtMoeda(totalPago)}</strong></div>`;
    }

    // Saldo Final Grande
    html += `
        <div class="detalhes-total" style="display: flex; justify-content: space-between; padding: 15px 0 0 0; margin-top: 10px; border-top: 2px solid #333; font-weight: 800; font-size: 1.3rem; color:${corSaldo}">
            <span>DISPONÍVEL</span>
            <span>${fmtMoeda(saldoDisponivel)}</span>
        </div>
        <p style="font-size:0.75rem; color:#aaa; text-align:center; margin-top:10px;">
            * Valores calculados com base nos lançamentos até hoje.
        </p>
    `;

    el.innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
}