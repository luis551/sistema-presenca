window.db = { funcionarios: [], presencas: {}, pagamentos: [], extras: [], users: [], entregas: [], audit: [], boletos: [] };
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

    if (window.db.audit.length > 200) {
        window.db.audit = window.db.audit.slice(-200);
    }
}

function renderizarAudit() {
    const tbody = document.getElementById('tbodyAudit');
    if(!tbody) return;
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

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-theme');
    if(window.atualizarDashboard) window.atualizarDashboard();
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
        valorFixo = 60;
        valorPorEntrega = 5;
    } else {
        valorFixo = 0;
        valorPorEntrega = 9;
    }

    const totalReceber = valorFixo + (totalEntregas * valorPorEntrega);
    const previewEl = document.getElementById('previewMotoTotal');
    if(previewEl) previewEl.innerText = totalReceber.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    return { totalEntregas, totalReceber };
}

window.lancarEntregaMoto = async function() {
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

    registrarLog('Motoboy', `Lançou diária de ${fmtMoeda(calc.totalReceber)} para ${func.nome}`);
    
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_entregas', novoRegistro.id, novoRegistro);
    
    alert("Fechamento do Motoboy Salvo!");
    
    document.getElementById('qtdIfood').value = '';
    document.getElementById('qtd99').value = '';
    document.getElementById('qtdZap').value = '';
}

// FORMATADORES
const fmtMoeda = (v) => v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const fmtData = (d) => { if(!d) return '-'; return new Date(d).toLocaleDateString('pt-BR', {timeZone: 'UTC'}); };
const fmtDataSimples = (d) => { if(!d) return '--/--/--'; const [ano, mes, dia] = d.split('-'); return `${dia}/${mes}/${ano}`; };

window.copiarTexto = function(texto) { const el = document.createElement('textarea'); el.value = texto; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); alert('Chave Pix copiada!'); }

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
    
    let funcData = { id: editingId || Date.now(), nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };

    if (editingId !== null) {
        registrarLog('Funcionario', `Editou funcionário ${nome}`);
    } else {
        registrarLog('Funcionario', `Cadastrou funcionário ${nome}`);
    }

    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_funcionarios', funcData.id, funcData);
    alert(editingId ? "Atualizado!" : "Cadastrado!");
    window.cancelarEdicao();
}
// ============================================================
// === PARTE 2: PRESENÇAS, EXTRAS, COMISSÕES E BOLETOS ===
// ============================================================

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
    document.getElementById('tituloFormFunc').style.color = "var(--dark)";
    document.getElementById('btnSalvarFunc').innerText = "+ Cadastrar Funcionário";
    document.getElementById('btnCancelarEdit').style.display = "none";
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
    const funcionariosFiltrados = window.db.funcionarios
        .filter(f => { if (!filtroEmpresa) return true; return f.empresa === filtroEmpresa; })
        .sort((a, b) => a.nome.localeCompare(b.nome)); 
    
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
                <option value="" disabled ${status === '' ? 'selected' : ''}>❓ Selecione...</option>
                <option value="Presente" ${status === 'Presente' ? 'selected' : ''}>✅ Presente</option>
                <option value="Atrasado" ${status === 'Atrasado' ? 'selected' : ''}>⚠️ Atrasado</option>
                <option value="Falta" ${status === 'Falta' ? 'selected' : ''}>❌ Falta</option>
                <option value="Atestado" ${status === 'Atestado' ? 'selected' : ''}>🔵 Atestado</option>
                <option value="Folga" ${status === 'Folga' ? 'selected' : ''}>🟢 Folga</option>
            </select>
            <input type="text" class="obs-presenca" value="${obs}" placeholder="Obs (opcional)">
        `;
        grid.appendChild(card);
    });
}

window.salvarPresencaDia = async function() {
    if(!checkPerm('pres')) return; 
    const data = document.getElementById('dataPresenca').value;
    if(!data) return alert("Selecione uma data!");
    const cards = document.querySelectorAll('.presenca-card');
    
    const mapaPresenca = new Map();
    cards.forEach(card => {
        const idCard = parseInt(card.getAttribute('data-id'));
        const status = card.querySelector('.status-presenca').value;
        const obs = card.querySelector('.obs-presenca').value;
        if (!isNaN(idCard)) mapaPresenca.set(idCard, { id: idCard, status, obs });
    });

    const listaFinal = Array.from(mapaPresenca.values());
    registrarLog('Presenca', `Salvou chamada de ${fmtData(data)}`);

    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_presencas', data, { data: data, registros: listaFinal });
    alert("✅ Lista Salva!");
}

// --- EXTRAS E COMISSÕES ---
window.lancarComissao = async function() {
    if(!checkPerm('fin')) return; 
    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value);
    
    if(!idFunc || !data || isNaN(valorVendas)) return alert("Preencha os campos!");
    
    const taxa = valorVendas > 10000 ? 0.10 : 0.07;
    const valorComissao = valorVendas * taxa;
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    
    const novoExtra = { 
        id: Date.now(), tipo: 'Comissao', categoria: 'Vendas', 
        idFunc: String(idFunc), beneficiario: func.nome, valor: valorComissao, 
        data: data, obs: `${(taxa*100).toFixed(0)}% sobre ${fmtMoeda(valorVendas)}`
    };

    registrarLog('Financeiro', `Lançou comissão para ${func.nome}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert("Comissão lançada!");
}

window.lancarDespesa = async function() {
    if(!checkPerm('fin')) return; 
    const tipo = document.getElementById('tipoDespesa').value; 
    const data = document.getElementById('dataDespesa').value;
    const valor = parseFloat(document.getElementById('valorDespesa').value);
    const obs = document.getElementById('obsDespesa').value;

    if(!data || isNaN(valor)) return alert("Preencha data e valor!");

    const novoExtra = { 
        id: Date.now(), tipo: 'Despesa', categoria: 'Saída', 
        idFunc: 'LOJA', beneficiario: tipo, valor: valor, data: data, obs: obs 
    };

    registrarLog('Financeiro', `Lançou despesa: ${tipo}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert("Despesa registrada!");
}

window.removerExtra = async function(id) { 
    if(!checkPerm('fin')) return; 
    if(confirm("Apagar este registro?")) { 
        if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_extras', id);
    } 
}

// --- BOLETOS ---
window.lancarBoleto = async function() {
    if(!checkPerm('boletos')) return; 
    const desc = document.getElementById('bolDesc').value;
    const valor = parseFloat(document.getElementById('bolValor').value);
    const data = document.getElementById('bolData').value;
    const codigo = document.getElementById('bolCodigo').value;

    if(!desc || isNaN(valor) || !data) return alert("Preencha os campos!");

    const novoBoleto = { id: Date.now(), desc, valor, vencimento: data, codigo, status: 'PENDENTE', dataPagamento: null };
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', novoBoleto.id, novoBoleto);
    alert("Conta registrada!");
}

window.toggleStatusBoleto = async function(id) {
    if(!checkPerm('boletos')) return; 
    const b = window.db.boletos.find(x => x.id === id);
    if(b) {
        b.status = b.status === 'PENDENTE' ? 'PAGO' : 'PENDENTE';
        b.dataPagamento = b.status === 'PAGO' ? new Date().toISOString() : null;
        if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', id, b);
    }
}

window.removerBoleto = async function(id) {
    if(!checkPerm('boletos')) return;
    if(confirm("Apagar essa conta?")) {
        if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_boletos', id);
    }
}
// ============================================================
// === PARTE 2: PRESENÇAS, EXTRAS, COMISSÕES E BOLETOS ===
// ============================================================

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
    document.getElementById('tituloFormFunc').style.color = "var(--dark)";
    document.getElementById('btnSalvarFunc').innerText = "+ Cadastrar Funcionário";
    document.getElementById('btnCancelarEdit').style.display = "none";
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
    const funcionariosFiltrados = window.db.funcionarios
        .filter(f => { if (!filtroEmpresa) return true; return f.empresa === filtroEmpresa; })
        .sort((a, b) => a.nome.localeCompare(b.nome)); 
    
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
                <option value="" disabled ${status === '' ? 'selected' : ''}>❓ Selecione...</option>
                <option value="Presente" ${status === 'Presente' ? 'selected' : ''}>✅ Presente</option>
                <option value="Atrasado" ${status === 'Atrasado' ? 'selected' : ''}>⚠️ Atrasado</option>
                <option value="Falta" ${status === 'Falta' ? 'selected' : ''}>❌ Falta</option>
                <option value="Atestado" ${status === 'Atestado' ? 'selected' : ''}>🔵 Atestado</option>
                <option value="Folga" ${status === 'Folga' ? 'selected' : ''}>🟢 Folga</option>
            </select>
            <input type="text" class="obs-presenca" value="${obs}" placeholder="Obs (opcional)">
        `;
        grid.appendChild(card);
    });
}

window.salvarPresencaDia = async function() {
    if(!checkPerm('pres')) return; 
    const data = document.getElementById('dataPresenca').value;
    if(!data) return alert("Selecione uma data!");
    const cards = document.querySelectorAll('.presenca-card');
    
    const mapaPresenca = new Map();
    cards.forEach(card => {
        const idCard = parseInt(card.getAttribute('data-id'));
        const status = card.querySelector('.status-presenca').value;
        const obs = card.querySelector('.obs-presenca').value;
        if (!isNaN(idCard)) mapaPresenca.set(idCard, { id: idCard, status, obs });
    });

    const listaFinal = Array.from(mapaPresenca.values());
    registrarLog('Presenca', `Salvou chamada de ${fmtData(data)}`);

    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_presencas', data, { data: data, registros: listaFinal });
    alert("✅ Lista Salva!");
}

// --- EXTRAS E COMISSÕES ---
window.lancarComissao = async function() {
    if(!checkPerm('fin')) return; 
    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value);
    
    if(!idFunc || !data || isNaN(valorVendas)) return alert("Preencha os campos!");
    
    const taxa = valorVendas > 10000 ? 0.10 : 0.07;
    const valorComissao = valorVendas * taxa;
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    
    const novoExtra = { 
        id: Date.now(), tipo: 'Comissao', categoria: 'Vendas', 
        idFunc: String(idFunc), beneficiario: func.nome, valor: valorComissao, 
        data: data, obs: `${(taxa*100).toFixed(0)}% sobre ${fmtMoeda(valorVendas)}`
    };

    registrarLog('Financeiro', `Lançou comissão para ${func.nome}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert("Comissão lançada!");
}

window.lancarDespesa = async function() {
    if(!checkPerm('fin')) return; 
    const tipo = document.getElementById('tipoDespesa').value; 
    const data = document.getElementById('dataDespesa').value;
    const valor = parseFloat(document.getElementById('valorDespesa').value);
    const obs = document.getElementById('obsDespesa').value;

    if(!data || isNaN(valor)) return alert("Preencha data e valor!");

    const novoExtra = { 
        id: Date.now(), tipo: 'Despesa', categoria: 'Saída', 
        idFunc: 'LOJA', beneficiario: tipo, valor: valor, data: data, obs: obs 
    };

    registrarLog('Financeiro', `Lançou despesa: ${tipo}`);
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_extras', novoExtra.id, novoExtra);
    alert("Despesa registrada!");
}

window.removerExtra = async function(id) { 
    if(!checkPerm('fin')) return; 
    if(confirm("Apagar este registro?")) { 
        if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_extras', id);
    } 
}

// --- BOLETOS ---
window.lancarBoleto = async function() {
    if(!checkPerm('boletos')) return; 
    const desc = document.getElementById('bolDesc').value;
    const valor = parseFloat(document.getElementById('bolValor').value);
    const data = document.getElementById('bolData').value;
    const codigo = document.getElementById('bolCodigo').value;

    if(!desc || isNaN(valor) || !data) return alert("Preencha os campos!");

    const novoBoleto = { id: Date.now(), desc, valor, vencimento: data, codigo, status: 'PENDENTE', dataPagamento: null };
    if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', novoBoleto.id, novoBoleto);
    alert("Conta registrada!");
}

window.toggleStatusBoleto = async function(id) {
    if(!checkPerm('boletos')) return; 
    const b = window.db.boletos.find(x => x.id === id);
    if(b) {
        b.status = b.status === 'PENDENTE' ? 'PAGO' : 'PENDENTE';
        b.dataPagamento = b.status === 'PAGO' ? new Date().toISOString() : null;
        if(window.salvarItemNuvem) await window.salvarItemNuvem('rh_boletos', id, b);
    }
}

window.removerBoleto = async function(id) {
    if(!checkPerm('boletos')) return;
    if(confirm("Apagar essa conta?")) {
        if(window.deletarItemNuvem) await window.deletarItemNuvem('rh_boletos', id);
    }
}
// --- SISTEMA DE LOGIN ---
window.tentarLogin = function() {
    const user = document.getElementById('loginUser').value.toLowerCase();
    const pass = document.getElementById('loginPass').value;
    
    // Verifica se o banco de usuários já carregou da nuvem
    if(!window.db.users || window.db.users.length === 0) {
        alert("⏳ O sistema ainda está baixando os dados da nuvem. Aguarde 2 segundos e tente de novo.");
        return;
    }

    const u = window.db.users.find(x => x.user.toLowerCase() === user && x.pass === pass);
    
    if(u) {
        window.currentUser = u;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('user-badge').innerText = `👤 ${u.user}`;
        registrarLog('Sistema', 'Usuário logou no painel');
        window.showSection('dashboard');
    } else { 
        alert("❌ Usuário ou Senha incorretos!"); 
    }
}

// --- CONTROLE DE SEÇÕES (ABAS) ---
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    
    const btn = document.querySelector(`[onclick="showSection('${id}')"]`);
    if(btn) btn.classList.add('active');
    
    if(id === 'dashboard') window.atualizarDashboard();
    if(id === 'pagamentos') window.atualizarPainelPagamentos();
}

// --- DASHBOARD ---
window.atualizarDashboard = function() {
    const totalSalarios = window.db.pagamentos ? window.db.pagamentos.filter(p => p.tipo === 'Salário').reduce((a,b)=>a+b.valor, 0) : 0;
    const totalBoletos = window.db.boletos ? window.db.boletos.filter(b => b.status === 'PENDENTE').reduce((a,b)=>a+b.valor, 0) : 0;
    
    if(document.getElementById('dashTotalSalarios')) document.getElementById('dashTotalSalarios').innerText = fmtMoeda(totalSalarios);
    if(document.getElementById('dashContasAbertas')) document.getElementById('dashContasAbertas').innerText = fmtMoeda(totalBoletos);
    if(document.getElementById('dashTotalFuncionarios')) document.getElementById('dashTotalFuncionarios').innerText = window.db.funcionarios.length;
}

// Inicialização Final
window.atualizarInterface();