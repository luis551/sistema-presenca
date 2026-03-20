window.db = { funcionarios: [], presencas: {}, pagamentos: [], extras: [], users: [], entregas: [], audit: [], boletos: [] };
window.currentUser = null;
let editingId = null;
const FIREBASE_AREAS = {
    funcionarios: 'rh_funcionarios',
    presencas: 'rh_presencas',
    users: 'rh_users',
    pagamentos: 'rh_pagamentos',
    extras: 'rh_extras',
    entregas: 'rh_entregas',
    audit: 'rh_audit',
    boletos: 'rh_boletos'
};

async function salvarRegistro(area, id, dados) {
    if (window.salvarItemNuvem) {
        await window.salvarItemNuvem(area, String(id), dados);
    }
}

async function deletarRegistro(area, id) {
    if (window.deletarItemNuvem) {
        await window.deletarItemNuvem(area, String(id));
    }
}
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
    if(!tbody) return;
    if(!window.db.audit || window.db.audit.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#aaa;">Nenhum registro encontrado.</td></tr>';
        return;
    }
    const logs = [...window.db.audit].sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 100);
    const linhas = logs.map(l => {
        const d = new Date(l.data);
        const dataFmt = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        return `<tr><td>${dataFmt}</td><td><strong>${l.user}</strong></td><td>${l.acao}</td><td>${l.detalhes}</td></tr>`;
    }).join('');
    tbody.innerHTML = linhas;
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
        valorFixo = 60;
        valorPorEntrega = 5;
    } else {
        valorFixo = 0;
        valorPorEntrega = 9;
    }

    const totalReceber = valorFixo + (totalEntregas * valorPorEntrega);
    document.getElementById('previewMotoTotal').innerText = totalReceber.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    return { totalEntregas, totalReceber };
}

window.lancarEntregaMoto = async function() {
    if(!checkPerm('moto')) return; 

    const idFunc = document.getElementById('selMotoId').value;
    const data = document.getElementById('dataMoto').value;
    const turno = document.getElementById('selMotoTurno').value;

    if(!idFunc || !data) {
        return alert("Selecione Motoboy e Data!");
    }

    const calc = window.calcularMotoPreview();
    const func = window.db.funcionarios.find(f => String(f.id) === String(idFunc));

    if(!func) {
        return alert("Motoboy não encontrado.");
    }

    const novoRegistro = {
        id: Date.now(),
        idFunc: String(idFunc),
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

    try {
        await salvarRegistro(FIREBASE_AREAS.entregas, novoRegistro.id, novoRegistro);

        window.db.entregas.push(novoRegistro);
        registrarLog('Motoboy', `Lançou diária de ${fmtMoeda(calc.totalReceber)} para ${func.nome}`);

        document.getElementById('qtdIfood').value = '';
        document.getElementById('qtd99').value = '';
        document.getElementById('qtdZap').value = '';

        window.renderizarMotoboys();
        window.atualizarDashboard();
        alert("Fechamento do Motoboy salvo na nuvem com sucesso!");
    } catch (erro) {
        console.error("Falha real ao salvar motoboy:", erro);
        alert("Erro: não foi possível salvar a diária do motoboy na nuvem. Nada foi confirmado.");
    }
}
window.renderizarMotoboys = function() {
    const grid = document.getElementById('gridMotoboys');
    const filtro = document.getElementById('filtroMotoHist');
    const painelResumo = document.getElementById('painelResumoMoto');
    const idFiltro = filtro.value; // Quem tá selecionado?

    grid.innerHTML = '';
    if(!window.db.entregas) window.db.entregas = [];

    // 1. Preenche o Select (Dropdow) se estiver vazio
    if (filtro.options.length <= 1) {
        // Pega nomes únicos para não repetir
        const mapNomes = new Map();
        window.db.funcionarios.forEach(f => {
            mapNomes.set(String(f.id), f.nome);
        });

        // Adiciona quem tem entrega mas talvez não seja funcionário ativo
        window.db.entregas.forEach(e => {
            if(!mapNomes.has(String(e.idFunc))) {
                mapNomes.set(String(e.idFunc), e.nomeFunc);
            }
        });
        
        mapNomes.forEach((nome, id) => {
             // Evita duplicatas no select
             if(!filtro.querySelector(`option[value="${id}"]`)){
                filtro.innerHTML += `<option value="${id}">${nome}</option>`;
            }
        });
    }

    // 2. Filtra a Lista (AGORA COM VISÃO VERDADEIRA)
    let lista = [...window.db.entregas];
    
    if (idFiltro) {
        // Descobre o nome do cara selecionado no filtro
        const op = filtro.querySelector(`option[value="${idFiltro}"]`);
        const nomeAlvo = op ? op.text.toLowerCase().trim() : "";
        
        // FILTRO DUPLO: Aceita se bater ID ou se bater NOME
        lista = lista.filter(e => {
            const idItem = String(e.idFunc || "");
            const nomeItem = String(e.nomeFunc || "").toLowerCase().trim();

            const bateuID = (idItem === String(idFiltro));
            // Verifica se o nome contém parte do nome alvo (ex: "Alex" acha "Alex da Silva")
            const bateuNome = (nomeAlvo !== "" && nomeItem.includes(nomeAlvo));

            return bateuID || bateuNome;
        });

        painelResumo.style.display = 'flex'; 
    } else {
        painelResumo.style.display = 'none'; 
    }

    // Ordena do mais recente para o antigo
    lista.sort((a,b) => new Date(b.data) - new Date(a.data));

    // 3. Calcula os Totais (Isso já estava certo, mas mantemos)
    const totalEntregas = lista.reduce((acc, curr) => acc + (parseInt(curr.totalEntregas) || 0), 0);
    const totalGrana = lista.reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);

    // Atualiza os números
    document.getElementById('sumEntregas').innerText = totalEntregas;
    document.getElementById('sumValorMoto').innerText = totalGrana.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    // 4. Renderiza os Cards
    if (lista.length === 0) { 
        grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhum registro encontrado para esse guerreiro.</p>'; 
        return; 
    }

    // Limita a 50 pra não travar
    const listaVisivel = lista.slice(0, 50);

    const htmlCards = listaVisivel.map(item => {
        const badgeClass = item.turno === 'Noite' ? 'shift-noite' : 'shift-dia';
        const icone = item.turno === 'Noite' ? '🌙' : '☀️';

        return `
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
    }).join('');

    grid.innerHTML = htmlCards;
}

window.removerEntrega = async function(id) {
    if(!checkPerm('moto')) return;

    if(!confirm("Deseja apagar este lançamento?")) return;

    const item = window.db.entregas.find(e => e.id === id);

    try {
        await deletarRegistro(FIREBASE_AREAS.entregas, id);
        if(item) registrarLog('Motoboy', `Removeu lançamento de ${item.nomeFunc}`);
        window.db.entregas = window.db.entregas.filter(e => e.id !== id);
        window.renderizarMotoboys();
        window.atualizarDashboard();
    } catch (erro) {
        console.error("Falha ao excluir entrega:", erro);
        alert("Erro: não foi possível excluir a entrega na nuvem. Nenhuma alteração local foi aplicada.");
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
    const html = window.db.users.map((u, index) => {
        const badge = u.isAdmin ? '<span class="badge-admin">ADMIN</span>' : '<span style="font-size:0.7rem; background:#ccc; padding:2px 5px; border-radius:4px;">USER</span>';
        const btnPass = `<button onclick="alert('Senha: ${u.pass}')" style="background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px; margin-right:5px;">👁️</button>`;
        const btnEdit = `<button onclick="editarUsuario(${index})" style="background:#f39c12; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px; margin-right:5px;">✏️</button>`;
        return `<div class="user-list-item"><div><strong>${u.user}</strong> ${badge}</div><div>${btnPass}${btnEdit}<button onclick="removerUsuario(${index})" style="background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px;">🗑️</button></div></div>`;
    }).join('');
    lista.innerHTML = html;
}

window.salvarUsuario = async function() {
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
        moto: document.getElementById('p_moto').checked,
        boletos: document.getElementById('p_boletos').checked
    };

    try {
        if(editIndex !== "") {
            const userAntigo = window.db.users[editIndex];
            const usuarioAtualizado = {
                id: userAntigo?.id || Date.now(),
                user,
                pass,
                isAdmin,
                perms
            };

            await salvarRegistro(FIREBASE_AREAS.users, usuarioAtualizado.id, usuarioAtualizado);
            window.db.users[editIndex] = usuarioAtualizado;
            registrarLog('Admin', `Editou usuário ${user}`);
            alert("Usuário atualizado com sucesso!");
        } else {
            const novoObjeto = {
                id: Date.now(),
                user,
                pass,
                isAdmin,
                perms
            };

            await salvarRegistro(FIREBASE_AREAS.users, novoObjeto.id, novoObjeto);
            window.db.users.push(novoObjeto);
            registrarLog('Admin', `Criou usuário ${user}`);
            alert("Usuário criado!");
        }
    } catch (erro) {
        console.error("Falha ao salvar usuário:", erro);
        alert("Erro: não foi possível salvar o usuário na nuvem. Operação cancelada.");
        return;
    }

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

window.removerUsuario = async function(index) {
    if(!confirm("Tem certeza que deseja apagar este usuário?")) return;

    const u = window.db.users[index];
    if (!u) return;

    try {
        if (u.id) {
            await deletarRegistro(FIREBASE_AREAS.users, u.id);
        }
        registrarLog('Admin', `Excluiu usuário ${u.user}`);
        window.db.users.splice(index, 1);
        renderizarListaUsuarios();
        if(document.getElementById('editUserIndex').value == index) {
            cancelarEdicaoUser();
        }
    } catch (erro) {
        console.error("Falha ao excluir usuário:", erro);
        alert("Erro: não foi possível excluir o usuário na nuvem. Nada foi removido localmente.");
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
window.processarFormularioFuncionario = async function() {
    if(!checkPerm('func')) return; 

    const nome = document.getElementById('fNome').value.trim();
    const empresa = document.getElementById('fEmpresa').value;
    const tipoPrincipal = document.getElementById('fTipoPrincipal').value;
    let tipoFinal = (tipoPrincipal === 'Diaria') ? 'Diaria' : document.getElementById('fFrequencia').value;
    const cargo = document.getElementById('fCargo').value.trim();
    const salario = parseFloat(document.getElementById('fSalario').value);
    const passagemInput = document.getElementById('fPassagem').value;
    const passagem = (tipoFinal !== 'Diaria' && passagemInput) ? parseFloat(passagemInput) : 0;
    const pix = document.getElementById('fPix').value.trim();
    const cpf = document.getElementById('fCpf').value.trim();
    const tel = document.getElementById('fTel').value.trim();
    const nasc = document.getElementById('fNasc').value;
    const entrada = document.getElementById('fEntrada').value;
    const end = document.getElementById('fEnd').value.trim();

    if (!nome || !cargo || !empresa || isNaN(salario)) return alert("Preencha os campos obrigatórios!");
    if (tipoFinal !== 'Diaria' && isNaN(passagem)) return alert("Preencha o valor da passagem!");
    if(!Array.isArray(window.db.funcionarios)) window.db.funcionarios = [];

    try {
        if (editingId !== null) {
            if(!confirm(`Salvar alterações para ${nome}?`)) return;

            const index = window.db.funcionarios.findIndex(f => String(f.id) === String(editingId));
            if (index === -1) return alert('Funcionário não encontrado para edição.');

            const funcAtualizado = { id: editingId, nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };

            await salvarRegistro(FIREBASE_AREAS.funcionarios, funcAtualizado.id, funcAtualizado);
            window.db.funcionarios[index] = funcAtualizado;
            registrarLog('Funcionario', `Editou funcionário ${nome}`);
            alert("Atualizado!");
            window.cancelarEdicao();
        } else {
            const novoFunc = { id: Date.now(), nome, empresa, tipo: tipoFinal, cargo, salario, passagem, pix, cpf, tel, nasc, entrada, end };

            await salvarRegistro(FIREBASE_AREAS.funcionarios, novoFunc.id, novoFunc);
            window.db.funcionarios.push(novoFunc);
            registrarLog('Funcionario', `Cadastrou funcionário ${nome}`);
            alert("Cadastrado!");
            document.querySelectorAll('#funcionarios input').forEach(input => input.value = '');
        }
    } catch (erro) {
        console.error("Falha ao salvar funcionário:", erro);
        alert("Erro: não foi possível salvar na nuvem. Operação cancelada.");
        return;
    }
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
window.removerFuncionario = async function(id) {
    if(!checkPerm('func')) return;

    if(!confirm("ATENÇÃO: Deseja realmente excluir este funcionário?")) return;

    const f = window.db.funcionarios.find(f => f.id === id);
    try {
        await deletarRegistro(FIREBASE_AREAS.funcionarios, id);
        if(f) registrarLog('Funcionario', `Excluiu funcionário ${f.nome}`);
        window.db.funcionarios = window.db.funcionarios.filter(f => f.id !== id);
        if (editingId === id) window.cancelarEdicao();
    } catch (erro) {
        console.error("Falha ao excluir funcionário:", erro);
        alert("Erro: não foi possível excluir o lançamento na nuvem. Nenhuma alteração local foi aplicada.");
    }
}
// Função para mudar a cor do cartão dinamicamente
window.atualizarCorCard = function(selectElement) { 
    const card = selectElement.closest('.presenca-card'); 
    const valor = selectElement.value;
    
    // Remove todas as classes de cor antigas para não bugar
    card.classList.remove('card-Presente', 'card-Atrasado', 'card-Falta', 'card-Atestado', 'card-Folga', 'card-Pendente');
    
    // Adiciona a nova classe (se tiver valor, põe a cor; se não, põe cinza)
    if(valor) {
        card.classList.add(`card-${valor}`);
    } else {
        card.classList.add('card-Pendente');
    }
}

// Função Principal de Carregar a Lista
// --- FUNÇÃO CORRIGIDA E ÚNICA: CARREGAR LISTA ---
window.carregarListaPresenca = function() {
    const data = document.getElementById('dataPresenca').value;
    const filtroEmpresa = document.getElementById('filtroEmpresaPresenca').value;
    
    if(!data) return alert("Selecione uma data");
    
    const grid = document.getElementById('gridCards');
    grid.innerHTML = '';
    
    // 1. MOSTRA A ÁREA
    document.getElementById('areaPresenca').style.display = 'block';
    
    // 2. MOSTRA O BOTÃO NO TOPO (A linha mágica que faltava na segunda versão)
    const btnTopo = document.getElementById('btnSalvarTopo');
    if(btnTopo) btnTopo.style.display = 'block';
    
    const registroDia = window.db.presencas[data] || [];
    
    // Filtra e Ordena os funcionários
    const funcionariosFiltrados = window.db.funcionarios
        .filter(f => { if (!filtroEmpresa) return true; return f.empresa === filtroEmpresa; })
        .sort((a, b) => a.nome.localeCompare(b.nome)); 
    
    funcionariosFiltrados.forEach(f => {
        const saved = registroDia.find(r => r.id === f.id);
        
        // --- LÓGICA DO STATUS ---
        const status = saved ? saved.status : ''; 
        const obs = saved ? saved.obs : '';
        
        // Define a classe da cor (se for vazio, fica cinza/pendente)
        const cardClass = status ? `card-${status}` : 'card-Pendente';

        let tagClass = 'tag-mensal'; let tagText = 'MENSAL';
        if(f.tipo === 'Quinzenal') { tagClass = 'tag-quinzenal'; tagText = 'QUINZENAL'; }
        else if(f.tipo === 'Semanal') { tagClass = 'tag-semanal'; tagText = 'SEMANAL'; }
        else if(f.tipo === 'Diaria') { tagClass = 'tag-diaria'; tagText = `DIÁRIA: ${fmtMoeda(f.salario)}`; }
        
        const tipoBadge = `<span class="tag-tipo ${tagClass}">${tagText}</span>`;
        const card = document.createElement('div');
        
        // Adiciona a classe visual correta
        card.className = `presenca-card ${cardClass}`;
        card.setAttribute('data-id', f.id);
        
        // Monta o HTML do Card com o Select
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
window.lancarComissao = async function() {
    if(!checkPerm('fin')) return; 

    const idFunc = document.getElementById('selVendedorExtra').value;
    const data = document.getElementById('dataComissao').value;
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value);
    
    if(!idFunc || !data || isNaN(valorVendas)) return alert("Preencha o Vendedor, Data e Valor das Vendas!");
    
    let taxa = 0.07;
    if (valorVendas > 10000) {
        taxa = 0.10;
    }
    
    const valorComissao = valorVendas * taxa;
    const taxaTexto = (taxa * 100).toFixed(0) + "%";

    const func = window.db.funcionarios.find(f => f.id == idFunc);

    const novoExtra = { 
        id: Date.now(), 
        tipo: 'Comissao', 
        categoria: 'Vendas', 
        idFunc: String(idFunc), 
        beneficiario: func.nome, 
        valor: valorComissao, 
        data: data, 
        obs: `${taxaTexto} sobre ${fmtMoeda(valorVendas)}`
    };

    try {
        await salvarRegistro(FIREBASE_AREAS.extras, novoExtra.id, novoExtra);
        window.db.extras.push(novoExtra);
        registrarLog('Financeiro', `Lançou comissão de ${fmtMoeda(valorComissao)} (${taxaTexto}) para ${func.nome}`);
        document.getElementById('valorVendasInput').value = '';
        document.getElementById('previewComissaoValor').innerText = 'R$ 0,00';
        document.getElementById('previewComissaoValor').style.color = "";
        window.renderizarExtras();
        window.atualizarDashboard();
        alert(`Comissão de ${fmtMoeda(valorComissao)} (${taxaTexto}) lançada!`);
    } catch (erro) {
        console.error("Falha ao salvar comissão:", erro);
        alert("Erro: não foi possível salvar a comissão na nuvem. Operação cancelada.");
    }
}
// --- PREVIEW DA COMISSÃO (COM REGRA DE 10% ACIMA DE 10K) ---
window.atualizarPreviewComissao = function() {
    // 1. Pega o valor que você digitou
    const valorVendas = parseFloat(document.getElementById('valorVendasInput').value) || 0;
    
    // 2. Define a taxa (Super Meta)
    let taxa = 0.07; // Padrão 7%
    let icone = '';
    
    if (valorVendas > 10000) {
        taxa = 0.10; // Sobe para 10% se vender mais de 10k
        icone = '🔥';
    }
    
    // 3. Calcula
    const comissao = valorVendas * taxa;
    const porcentagemTexto = (taxa * 100).toFixed(0) + "%";
    
    // 4. Atualiza o texto roxo na tela com feedback visual
    const el = document.getElementById('previewComissaoValor');
    el.innerText = `${icone} ${comissao.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} (${porcentagemTexto})`;
    
    // Muda a cor pra destacar quando bate a meta
    if(taxa === 0.10) el.style.color = "#c0392b"; // Vermelho/Laranja de fogo
    else el.style.color = ""; // Volta ao normal
}
window.lancarDespesa = async function() {
    if(!checkPerm('fin')) return; 

    const tipo = document.getElementById('tipoDespesa').value;
    const data = document.getElementById('dataDespesa').value;
    const valorInput = document.getElementById('valorDespesa').value;
    const obs = document.getElementById('obsDespesa').value;

    if(!data || !valorInput) return alert("Preencha a Data e o Valor da despesa!");

    const valor = parseFloat(valorInput);

    const novoExtra = {
        id: Date.now(),
        tipo: 'Despesa',
        categoria: 'Saída',
        idFunc: 'LOJA',
        beneficiario: tipo,
        valor: valor,
        data: data,
        obs: obs
    };

    try {
        await salvarRegistro(FIREBASE_AREAS.extras, novoExtra.id, novoExtra);
        window.db.extras.push(novoExtra);
        registrarLog('Financeiro', `Lançou despesa: ${tipo} - ${fmtMoeda(valor)}`);
        document.getElementById('valorDespesa').value = '';
        document.getElementById('obsDespesa').value = '';
        window.renderizarExtras();
        window.atualizarDashboard();
        alert("Despesa registrada com sucesso!");
    } catch (erro) {
        console.error("Falha ao salvar despesa:", erro);
        alert("Erro: não foi possível salvar a despesa na nuvem. Operação cancelada.");
    }
}
window.removerExtra = async function(id) {
    if(!checkPerm('fin')) return;

    if(!confirm("Deseja apagar este lançamento?")) return;

    const item = window.db.extras.find(e => e.id === id);
    try {
        await deletarRegistro(FIREBASE_AREAS.extras, id);
        if(item) registrarLog('Financeiro', `Removeu ${item.tipo} de ${item.beneficiario}`);
        window.db.extras = window.db.extras.filter(e => e.id !== id);
        window.renderizarExtras();
        window.atualizarDashboard();
    } catch (erro) {
        console.error("Falha ao excluir extra/despesa:", erro);
        alert("Erro: não foi possível excluir o lançamento na nuvem. Nenhuma alteração local foi aplicada.");
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

    const html = listaVisivel.map(item => {
        const cor = item.tipo === 'Comissao' ? 'extra-comissao' : 'extra-despesa';
        const tituloCor = item.tipo === 'Comissao' ? 'txt-purple' : 'txt-orange';
        return `<div class="extra-card ${cor}"><div class="extra-info"><h4 class="${tituloCor}">${item.categoria} - ${item.beneficiario}</h4><span>📅 ${fmtData(item.data)} | ${item.obs}</span></div><div class="extra-val ${tituloCor}">${fmtMoeda(item.valor)}</div><button class="btn-delete-pag" onclick="removerExtra(${item.id})">🗑️</button></div>`;
    }).join('');
    grid.innerHTML = html;
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
// --- FUNÇÃO DETETIVE 2.0: SOMA BLINDADA (Expeto Edition) ---
window.getTotalMotoboyMes = function(idFunc, dataRefStr) {
    // 1. Verifica se tem loot (entregas)
    if (!window.db.entregas) return 0;

    // 2. Prepara as datas do turno atual
    const parts = dataRefStr.split('-'); 
    const anoRef = parseInt(parts[0]); 
    const mesRef = parseInt(parts[1]) - 1; // JS conta mês de 0 a 11
    
    // 3. Pega os dados do NPC (Funcionário)
    const funcObj = window.db.funcionarios.find(f => f.id == idFunc);
    
    // Função de limpeza (Remove acentos e espaços extras)
    const limparTexto = (texto) => {
        if (!texto) return "";
        return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    // Força o ID buscado ser String para não dar erro de tipo
    const idBusca = String(idFunc).trim();
    const nomeBusca = funcObj ? limparTexto(funcObj.nome) : "";

    console.log(`🕵️‍♂️ BUSCANDO LOOT DE: ${nomeBusca} (ID: ${idBusca}) no Mês ${mesRef+1}/${anoRef}`);

    // 4. Filtra e Soma (Onde a mágica acontece)
    return window.db.entregas.reduce((acc, entrega) => {
        if (!entrega.data) return acc;

        // Quebra a data da entrega
        const eParts = entrega.data.split('-'); 
        const eAno = parseInt(eParts[0]); 
        const eMes = parseInt(eParts[1]) - 1;

        // Limpa os dados da entrega (Blinda contra erro de tipo)
        const idEntrega = String(entrega.idFunc || "").trim();
        const nomeEntrega = limparTexto(entrega.nomeFunc);

        // --- CHECK DE PERCEPÇÃO (Comparações) ---
        // 1. Bate o Mês e Ano?
        const matchData = (eAno === anoRef && eMes === mesRef);

        // 2. É o mesmo cara? (Compara ID OU Nome parecido)
        const matchId = (idEntrega === idBusca);
        const matchNome = (nomeBusca !== "" && nomeEntrega.includes(nomeBusca)); // Usar includes é mais generoso

        if (matchData) {
            if (matchId || matchNome) {
                const valor = parseFloat(entrega.valorTotal) || 0;
                // console.log(`   ✅ SOMADO: R$ ${valor} | Entrega dia ${entrega.data}`);
                return acc + valor;
            } else {
                // console.log(`   ❌ IGNORADO: "${entrega.nomeFunc}" (Não é o alvo)`);
            }
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
    
    // Garante que o salário é um número
    const valorDiaria = parseFloat(func.salario) || 0;
    const valorPassagem = parseFloat(func.passagem) || 0;

    // 1. Salário Base (Se NÃO for Diarista, pega o fixo proporcional)
    if (func.tipo !== 'Diaria') totalGanhos = window.calcularTetoLiberado(func, dataRefStr);
    
    // 2. Presenças (Loop dia a dia)
    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const listaDia = window.db.presencas[diaStr]; 
            // Usa '==' para garantir que pega mesmo se um for string e outro numero
            const registro = listaDia.find(r => r.id == idFunc);
            
            if(registro) {
                if (func.tipo !== 'Diaria') { 
                    // MENSALISTA: Ganha Passagem se veio
                    if(registro.status === 'Presente' || registro.status === 'Atrasado') {
                        totalGanhos += valorPassagem; 
                    }
                } else { 
                    // DIARISTA: Ganha Diária
                    if(registro.status === 'Presente') {
                        totalGanhos += valorDiaria; // Diária Cheia
                    }
                    else if(registro.status === 'Atrasado') {
                        totalGanhos += (valorDiaria / 2); // Meia Diária
                    }
                }
            }
        }
    });
    
    // 3. Comissões e Entregas
    const totalComissoes = window.getTotalComissoesMes(idFunc, dataRefStr);
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
// --- CORREÇÃO DO SALDO ANTERIOR (OLHANDO O MÊS CHEIO) ---
// --- CORREÇÃO DO SALDO ANTERIOR SEPARADO (SALÁRIO E PASSAGEM) ---
window.getSaldoMesAnterior = function(idFunc, dataRefStr) {
    const parts = dataRefStr.split('-');
    const ano = parseInt(parts[0]);
    const mes = parseInt(parts[1]); 

    // Ignora Janeiro (pois dezembro é outro ano e não temos o ref do ano passado configurado pra virada ainda)
    if (mes === 1) return { salario: 0, passagem: 0 }; 

    let mesAnt = mes - 1;
    let anoAnt = ano;
    if (mesAnt === 0) { 
        mesAnt = 12;
        anoAnt = ano - 1;
    }
    
    // Pega o último dia do mês anterior
    const ultimoDia = new Date(anoAnt, mesAnt, 0).getDate(); 
    const refAnterior = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${ultimoDia}`;

    const func = window.db.funcionarios.find(f => f.id == idFunc);
    if(!func) return { salario: 0, passagem: 0 };

    // 1. Calcula Ganhos Separados
    let ganhoSalario = 0;
    let ganhoPassagem = 0;

    const valorDiaria = parseFloat(func.salario) || 0;
    const valorPassagem = parseFloat(func.passagem) || 0;

    if (func.tipo !== 'Diaria') ganhoSalario += window.calcularTetoLiberado(func, refAnterior);

    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoAnt}-${String(mesAnt).padStart(2, '0')}`)) { 
            const reg = window.db.presencas[diaStr].find(r => r.id == idFunc);
            if(reg) {
                if (func.tipo !== 'Diaria') { 
                    if(['Presente', 'Atrasado'].includes(reg.status)) ganhoPassagem += valorPassagem; 
                } else { 
                    if(reg.status === 'Presente') ganhoSalario += valorDiaria;
                    else if(reg.status === 'Atrasado') ganhoSalario += (valorDiaria / 2);
                }
            }
        }
    });

    ganhoSalario += window.getTotalComissoesMes(idFunc, refAnterior);
    ganhoSalario += window.getTotalMotoboyMes(idFunc, refAnterior);

    // 2. Calcula Pagamentos Separados
    let pagoSalario = 0;
    let pagoPassagem = 0;

    window.db.pagamentos.forEach(p => {
        if (p.idFunc == idFunc && p.data.startsWith(`${anoAnt}-${String(mesAnt).padStart(2, '0')}`)) {
            if (p.tipo === 'Passagem') pagoPassagem += p.valor;
            else pagoSalario += p.valor; // Salário e Vale descontam do Salário
        }
    });

    // Retorna as duas carteiras separadas!
    return {
        salario: ganhoSalario - pagoSalario,
        passagem: ganhoPassagem - pagoPassagem
    };
}


window.removerPagamento = async function(id) {
    if(!checkPerm('fin')) return; 

    if(!confirm("Cancelar este lançamento?")) return;

    const pag = window.db.pagamentos.find(p => p.id === id);
    try {
        await deletarRegistro(FIREBASE_AREAS.pagamentos, id);
        if(pag) registrarLog('Financeiro', `Excluiu ${pag.tipo} de ${fmtMoeda(pag.valor)} de ${pag.nomeFunc}`);
        window.db.pagamentos = window.db.pagamentos.filter(p => p.id !== id);
        window.atualizarPainelPagamentos(); 
        window.atualizarDashboard();
    } catch (erro) {
        console.error("Falha ao excluir pagamento:", erro);
        alert("Erro: não foi possível excluir o pagamento na nuvem. Nenhuma alteração local foi aplicada.");
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
    else rankContainer.innerHTML = sortedRank.map(([nome, vendas], index) => {
        const comissao = vendas * 0.07; const medalha = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index+1}`; const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
        return `<div class="ranking-item"><span class="rank-pos ${rankClass}">${medalha}</span><span class="rank-name">${nome}</span><div style="text-align:right;"><div class="rank-xp">Vendeu: ${fmtMoeda(vendas)}</div><small style="color:var(--text-sub);">Comissão: ${fmtMoeda(comissao)}</small></div></div>`;
    }).join('');
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
    const listContainer = document.getElementById('customSelectOptionsList');
    if(listContainer) {
        listContainer.innerHTML = `
            <div class="custom-option-item" onclick="selecionarFuncionarioCustom('', '🔍 Selecione um funcionário...')">
                <div class="custom-opt-avatar" style="background:#e74c3c">❌</div>
                <div class="custom-opt-info"><span class="custom-opt-name">Limpar Seleção</span></div>
            </div>
        `;
    }
    if(selVendedor) selVendedor.innerHTML = '<option value="">Selecione...</option>'; 
    if(selFiltroExtras) selFiltroExtras.innerHTML = '<option value="">Todos (Geral)</option><option value="DESPESAS">🔸 Despesas / Eventos</option>'; 
    if(selPrevisao) selPrevisao.innerHTML = '<option value="">Todos da Equipe</option>';

    // Pega todos os funcionários e ordena por nome
    const funcsOrdenados = [...window.db.funcionarios].sort((a, b) => a.nome.localeCompare(b.nome));
    
    // --- PARTE 1: Preencher os Menus (Carrega TODOS) ---
    funcsOrdenados.forEach(f => {
        if(listContainer) {
            const inicial = f.nome.charAt(0);
            listContainer.innerHTML += `
                <div class="custom-option-item" data-nome="${f.nome.toLowerCase()}" onclick="selecionarFuncionarioCustom('${f.id}', '${f.nome}')">
                    <div class="custom-opt-avatar">${inicial}</div>
                    <div class="custom-opt-info">
                        <span class="custom-opt-name">${f.nome}</span>
                        <span class="custom-opt-role">
                            <span class="role-badge">💼 ${f.cargo || 'Sem Cargo'}</span>
                            <span class="empresa-badge">🏢 ${f.empresa || 'Sem Loja'}</span>
                        </span>
                    </div>
                </div>
            `;
        }
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

window.lancarBoleto = async function() {
    if(!checkPerm('boletos')) return;

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
    try {
        await salvarRegistro(FIREBASE_AREAS.boletos, novoBoleto.id, novoBoleto);
        window.db.boletos.push(novoBoleto);
        registrarLog('Boletos', `Cadastrou conta: ${desc} (${fmtMoeda(valor)})`);
    } catch (erro) {
        console.error("Falha ao salvar boleto:", erro);
        alert("Erro: não foi possível salvar o boleto na nuvem. Operação cancelada.");
        return;
    }

    document.getElementById('bolDesc').value = '';
    document.getElementById('bolValor').value = '';
    document.getElementById('bolCodigo').value = '';

    window.renderizarBoletos();
    if(window.atualizarPrevisao) window.atualizarPrevisao();
    alert("Conta registrada!");
}
window.renderizarBoletos = function() {
    const grid = document.getElementById('gridBoletos');
    const filtroEl = document.getElementById('filtroBoletos');

    if (!grid) return;

    const filtro = filtroEl ? filtroEl.value : 'TODOS';
    grid.innerHTML = '';

    if (!window.db.boletos) window.db.boletos = [];

    let totalVencido = 0;
    let totalAberto = 0;
    let totalPago = 0;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const listaOrdenada = [...window.db.boletos].sort(
        (a, b) => new Date(a.vencimento) - new Date(b.vencimento)
    );

    const cards = [];

    listaOrdenada.forEach(b => {
        const dataVenc = new Date(b.vencimento + 'T12:00:00');
        const diffTempo = dataVenc - hoje;
        const diasRestantes = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));

        if (b.status === 'PAGO') {
            totalPago += parseFloat(b.valor || 0);
        } else {
            totalAberto += parseFloat(b.valor || 0);
            if (diasRestantes < 0) totalVencido += parseFloat(b.valor || 0);
        }

        if (filtro === 'PENDENTE' && b.status === 'PAGO') return;
        if (filtro === 'PAGO' && b.status !== 'PAGO') return;

        let classeBorda = '';
        let badgeData = '';
        let textoData = '';

        if (b.status === 'PAGO') {
            classeBorda = 'b-pago';
            badgeData = 'badge-green';
            textoData = '✅ PAGO';
        } else {
            if (diasRestantes < 0) {
                classeBorda = 'b-vencido';
                badgeData = 'badge-red';
                textoData = `🚨 Venceu há ${Math.abs(diasRestantes)} dias`;
            } else if (diasRestantes === 0) {
                classeBorda = 'b-vencido';
                badgeData = 'badge-red';
                textoData = '⚠️ VENCE HOJE!';
            } else if (diasRestantes <= 3) {
                classeBorda = 'b-atencao';
                badgeData = 'badge-yellow';
                textoData = `⏳ Vence em ${diasRestantes} dias`;
            } else {
                classeBorda = 'b-dia';
                badgeData = 'badge-blue';
                textoData = `📅 Vence em ${diasRestantes} dias`;
            }
        }

        const btnAcao = b.status === 'PENDENTE'
            ? `<button class="btn-pagar pendente" onclick="toggleStatusBoleto(${b.id})">💸 Confirmar Pagamento</button>`
            : `<button class="btn-pagar desfazer" onclick="toggleStatusBoleto(${b.id})">↩️ Desfazer (Tornar Pendente)</button>`;

        const dataFormatada = typeof fmtDataSimples === 'function'
            ? fmtDataSimples(b.vencimento)
            : b.vencimento;

        const html = `
            <div class="boleto-card ${classeBorda}">
                <div>
                    <div class="bol-header">
                        <span style="font-weight:bold; color:var(--text-sub); font-size:0.8rem;">#${String(b.id).slice(-4)}</span>

                        <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end;">
                            <span class="bol-data ${badgeData}">${textoData}</span>
                            <span style="font-size:0.7rem; color:#888; margin-top:3px; font-weight:bold;">Dia: ${dataFormatada}</span>
                        </div>
                    </div>

                    <div style="font-weight:bold; font-size:1.1rem; margin-bottom:5px;">${b.desc}</div>

                    ${b.codigo ? `
                        <div style="font-size:0.75rem; color:#aaa; overflow:hidden; text-overflow:ellipsis; margin-bottom:5px;">
                            📠 ${b.codigo}
                        </div>
                    ` : ''}
                </div>

                <div>
                    <div class="bol-valor">${fmtMoeda(b.valor)}</div>
                    ${btnAcao}
                    <button onclick="removerBoleto(${b.id})" style="background:none; border:none; color:#e74c3c; width:100%; margin-top:5px; cursor:pointer; font-size:0.8rem;">
                        Excluir
                    </button>
                </div>
            </div>
        `;

        cards.push(html);
    });

    grid.innerHTML = cards.join('');

    const totalVencidoEl = document.getElementById('bolTotalVencido');
    const totalAbertoEl = document.getElementById('bolTotalAberto');
    const totalPagoEl = document.getElementById('bolTotalPago');

    if (totalVencidoEl) totalVencidoEl.innerText = fmtMoeda(totalVencido);
    if (totalAbertoEl) totalAbertoEl.innerText = fmtMoeda(totalAberto);
    if (totalPagoEl) totalPagoEl.innerText = fmtMoeda(totalPago);
};

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
                classeBorda = 'b-dia'; badgeData = 'badge-blue'; textoData = `📅 Vence em ${diasRestantes} dias`;
            }
        }

        const btnAcao = b.status === 'PENDENTE' 
            ? `<button class="btn-pagar pendente" onclick="toggleStatusBoleto(${b.id})">💸 Confirmar Pagamento</button>`
            : `<button class="btn-pagar desfazer" onclick="toggleStatusBoleto(${b.id})">↩️ Desfazer (Tornar Pendente)</button>`;

        // Formata a data bonitinha (ex: 29/01/2026)
        const dataFormatada = fmtDataSimples(b.vencimento);

        const html = `
            <div class="boleto-card ${classeBorda}">
                <div>
                    <div class="bol-header">
                        <span style="font-weight:bold; color:var(--text-sub); font-size:0.8rem;">#${b.id.toString().slice(-4)}</span>
                        
                        <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end;">
                            <span class="bol-data ${badgeData}">${textoData}</span>
                            <span style="font-size:0.7rem; color:#888; margin-top:3px; font-weight:bold;">Dia: ${dataFormatada}</span>
                        </div>

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
        cards.push(html);
    });

    grid.innerHTML = cards.join('');

    document.getElementById('bolTotalVencido').innerText = fmtMoeda(totalVencido);
    document.getElementById('bolTotalAberto').innerText = fmtMoeda(totalAberto);
    document.getElementById('bolTotalPago').innerText = fmtMoeda(totalPago);
window.toggleStatusBoleto = async function(id) {
    if(!checkPerm('boletos')) return;

    const b = window.db.boletos.find(x => x.id === id);

    if(b) {
        const atualizado = { ...b };

        if(atualizado.status === 'PENDENTE') {
            atualizado.status = 'PAGO';
            atualizado.dataPagamento = new Date().toISOString();
        } else {
            atualizado.status = 'PENDENTE';
            atualizado.dataPagamento = null;
        }

        try {
            await salvarRegistro(FIREBASE_AREAS.boletos, atualizado.id, atualizado);
            Object.assign(b, atualizado);
            if(b.status === 'PAGO') {
                registrarLog('Boletos', `Pagou conta: ${b.desc}`);
            } else {
                registrarLog('Boletos', `Reabriu conta: ${b.desc}`);
            }
            window.renderizarBoletos();

            const secaoAtiva = document.querySelector('.section.active')?.id;
            if(secaoAtiva === 'previsao' && window.atualizarPrevisao) {
                window.atualizarPrevisao();
            }
        } catch (erro) {
            console.error("Falha ao atualizar boleto:", erro);
            alert("Erro: não foi possível atualizar o status do boleto na nuvem. Nada foi alterado.");
        }
    }
}
window.removerBoleto = async function(id) {
    if(!checkPerm('boletos')) return;

    if(!confirm("Tem certeza que deseja apagar essa conta?")) return;

    const item = window.db.boletos.find(x => x.id === id);
    try {
        await deletarRegistro(FIREBASE_AREAS.boletos, id);
        if(item) registrarLog('Boletos', `Removeu conta: ${item.desc}`);
        window.db.boletos = window.db.boletos.filter(x => x.id !== id);
        window.renderizarBoletos();
        if(window.atualizarPrevisao) window.atualizarPrevisao();
    } catch (erro) {
        console.error("Falha ao excluir boleto:", erro);
        alert("Erro: não foi possível excluir o boleto na nuvem. Nenhuma alteração local foi aplicada.");
    }
}
// --- PREVISÃO FINAL 8.0 (SINCRONIZADA COM PAGAMENTO) ---
window.atualizarPrevisao = function() {
    const listUrgent = document.getElementById('listUrgent');
    const listWeekly = document.getElementById('listWeekly');
    
    // 1. PEGAR OS DADOS
    const inputData = document.getElementById('dataPrevisaoBase');
    const filtroLoja = document.getElementById('filtroEmpresaPrevisao');
    const filtroPeriodo = document.getElementById('filtroPeriodoPrevisao'); 
    
    if (!inputData.value) inputData.value = new Date().toISOString().split('T')[0];
    const dataRefStr = inputData.value;
    
    const periodoSelecionado = filtroPeriodo ? filtroPeriodo.value : 'MES';
    const lojaSelecionada = filtroLoja.value.trim().toLowerCase();

    listUrgent.innerHTML = ''; 
    listWeekly.innerHTML = '';
    
    let totalUrgent = 0;
    let totalWeekly = 0;

    // 2. CONFIGURAR DATAS E DETECTAR "SEMANA DE PAGAMENTO"
    let rangeSalario = null;
    let rangePassagem = null;
    
    let ehSemanaPagtoQuinzenal = false;
    let ehSemanaPagtoMensal = false;

    if (periodoSelecionado !== 'MES') {
        const dataBase = new Date(dataRefStr + 'T12:00:00');
        const diaSemana = dataBase.getDay(); 
        const diffSegunda = dataBase.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1);
        
        const start = new Date(dataBase); start.setDate(diffSegunda);
        const end = new Date(start); end.setDate(start.getDate() + 6);

        if (periodoSelecionado === 'SEMANA_PASSADA') {
            start.setDate(start.getDate() - 7); end.setDate(end.getDate() - 7);
        }
        
        const fmt = (d) => d.toISOString().split('T')[0];
        rangeSalario = { start: fmt(start), end: fmt(end) };
        
        const startPass = new Date(start); startPass.setDate(start.getDate() - 7);
        const endPass = new Date(end); endPass.setDate(end.getDate() - 7);
        rangePassagem = { start: fmt(startPass), end: fmt(endPass) };

        // --- DETECTOR DE DATA DE PAGAMENTO (Igual ao Pagamento) ---
        let checkDate = new Date(start);
        while (checkDate <= end) {
            const diaDoMes = checkDate.getDate();
            // Quinzenal: Semana do dia 5 ou dia 20
            if ([1,2,3,4,5,6,7,15,16,17,18,19,20,21,22].includes(diaDoMes)) ehSemanaPagtoQuinzenal = true;
            // Mensal: Semana do dia 5 ou 10
            if ([1,2,3,4,5,6,7,8,9,10].includes(diaDoMes)) ehSemanaPagtoMensal = true;
            checkDate.setDate(checkDate.getDate() + 1);
        }
    } else {
        // Se for Mês, considera tudo pago
        ehSemanaPagtoQuinzenal = true;
        ehSemanaPagtoMensal = true;
    }

    // --- 3. PROCESSAR FUNCIONÁRIOS ---
    window.db.funcionarios.forEach(f => {
        // FILTRO DE LOJA
        const empresaFunc = (f.empresa || '').trim().toLowerCase();
        if (lojaSelecionada !== "" && empresaFunc !== lojaSelecionada) return;

        let totalGanhos = 0;
        let totalPago = 0;
        let dividaAnt = 0;

        // --- CÁLCULOS ---
        if (periodoSelecionado === 'MES') {
            totalGanhos = window.calcularGanhosNoMes(f.id, dataRefStr);
            totalPago = window.getTotalPagoNoMes(f.id, dataRefStr);
            if(window.getDividaMesAnterior) dividaAnt = window.getDividaMesAnterior(f.id, dataRefStr);
        } 
        else if (rangeSalario) {
            const valorDiaria = parseFloat(f.salario) || 0;
            const valorPassagem = parseFloat(f.passagem) || 0;

            // A. SALÁRIO BASE (LÓGICA DO PAGAMENTO APLICADA)
            if (f.tipo === 'Quinzenal') {
                // Se é semana de pagamento, soma 50%. Se não, soma ZERO.
                if (ehSemanaPagtoQuinzenal) {
                    totalGanhos += (valorDiaria / 2); 
                }
            } 
            else if (f.tipo === 'Mensal') {
                // Se é semana de pagamento, soma 100%. Se não, ZERO.
                if (ehSemanaPagtoMensal) {
                    totalGanhos += valorDiaria;
                }
            } 
            else if (f.tipo === 'Semanal') {
                // Semanal recebe sempre proporcional
                totalGanhos += (valorDiaria / 30) * 7; 
            }
            // Diarista calcula via presença abaixo

            // B. PRESENÇAS / PASSAGEM (Isso corre sempre)
            Object.keys(window.db.presencas).forEach(dia => {
                const registro = window.db.presencas[dia].find(r => r.id == f.id);
                if (!registro) return;

                if (f.tipo === 'Diaria') {
                    if (dia >= rangeSalario.start && dia <= rangeSalario.end) {
                        if (registro.status === 'Presente') totalGanhos += valorDiaria;
                        if (registro.status === 'Atrasado') totalGanhos += (valorDiaria / 2);
                    }
                } else {
                    // Mensalista/Quinzenal: Recebe Passagem da SEMANA ANTERIOR
                    if (dia >= rangePassagem.start && dia <= rangePassagem.end) {
                        if(['Presente', 'Atrasado'].includes(registro.status)) totalGanhos += valorPassagem;
                    }
                }
            });

            // C. EXTRAS E ENTREGAS
            window.db.extras.forEach(e => {
                if (e.data >= rangeSalario.start && e.data <= rangeSalario.end) {
                    if ((String(e.idFunc) === String(f.id) || e.beneficiario === f.nome) && e.tipo === 'Comissao') totalGanhos += e.valor;
                }
            });
            if (window.db.entregas) {
                window.db.entregas.forEach(e => {
                    if (e.data >= rangeSalario.start && e.data <= rangeSalario.end && String(e.idFunc) === String(f.id)) totalGanhos += e.valorTotal;
                });
            }

            // D. DESCONTA O QUE JÁ FOI PAGO
            totalPago = window.getPagamentosRange(f.id, rangeSalario.start, rangeSalario.end);
        }
        
        // SALDO FINAL
        const saldo = (totalGanhos + dividaAnt) - totalPago;

        // SE TIVER SALDO POSITIVO, MOSTRA
        if (saldo > 0.1) {
            const htmlCard = `
                <div class="k-card ${f.tipo === 'Diaria' ? 'urgent' : 'normal'}">
                    <div class="k-info">
                        <h4>${f.nome}</h4>
                        <p>${f.empresa || 'Sem Loja'} • <small>${f.tipo}</small></p>
                        ${dividaAnt < 0 ? `<small style="color:red">(Dívida Ant: ${fmtMoeda(dividaAnt)})</small>` : ''}
                    </div>
                    <div class="k-actions">
                        <span class="k-value">${fmtMoeda(saldo)}</span>
                        <button class="btn-pay-card" onclick="irParaPagamento(${f.id})">PAGAR ➜</button>
                    </div>
                </div>
            `;
            
            if (f.tipo === 'Diaria') {
                totalUrgent += saldo;
                listUrgent.innerHTML += htmlCard;
            } else {
                totalWeekly += saldo;
                listWeekly.innerHTML += htmlCard;
            }
        }
    });

    // --- 4. BOLETOS (FILTRO DE LOJA APLICADO) ---
    if(window.db.boletos && verificarPermissao('boletos') && lojaSelecionada === "") { 
        const hojeStr = new Date().toISOString().split('T')[0];
        window.db.boletos.forEach(b => {
            if(b.status !== 'PAGO') {
                let mostrar = false;
                const dt = b.vencimento;
                if(periodoSelecionado === 'MES') mostrar = true; 
                else if(rangeSalario && dt >= rangeSalario.start && dt <= rangeSalario.end) mostrar = true; 
                if(dt < hojeStr) mostrar = true; 

                if (mostrar) {
                    const isVencido = dt < hojeStr;
                    const isHoje = dt === hojeStr;
                    let statusClass = isVencido || isHoje ? 'urgent' : 'normal';
                    let textoStatus = isVencido ? '🚨 VENCIDO' : (isHoje ? '⚠️ VENCE HOJE' : `Vence: ${fmtDataSimples(dt)}`);
                    let corTexto = isVencido ? 'red' : (isHoje ? 'orange' : '#d35400');

                    const htmlBoleto = `
                        <div class="k-card ${statusClass}">
                            <div class="k-info">
                                <h4>🧾 ${b.desc}</h4>
                                <p>${textoStatus}</p>
                            </div>
                            <div class="k-actions">
                                <span class="k-value" style="color:${corTexto}">${fmtMoeda(b.valor)}</span>
                                <button class="btn-pay-card" style="background:#e67e22" onclick="window.showSection('boletos', null)">VER</button>
                            </div>
                        </div>
                    `;
                    if (isVencido || isHoje) { totalUrgent += b.valor; listUrgent.innerHTML += htmlBoleto; } 
                    else { totalWeekly += b.valor; listWeekly.innerHTML += htmlBoleto; }
                }
            }
        });
    }

    document.getElementById('sumUrgent').innerText = fmtMoeda(totalUrgent);
    document.getElementById('sumWeekly').innerText = fmtMoeda(totalWeekly);
    document.getElementById('totalGeralPrev').innerText = "Total Previsto: " + fmtMoeda(totalUrgent + totalWeekly);
    
    const vazio = '<div style="text-align:center;color:#ccc;padding:20px;font-style:italic">Nada pendente nesta lista</div>';
    if(listUrgent.innerHTML === '') listUrgent.innerHTML = vazio;
    if(listWeekly.innerHTML === '') listWeekly.innerHTML = vazio;
}
// --- FUNÇÃO DE EXTRATO DETALHADO (CORRIGIDA PARA DIARISTA) ---
window.mostrarDetalhesCalculo = function(idFunc, dataStr) {
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    if(!func) return;

    // 1. Refaz os cálculos
    const [anoRef, mesRef] = dataStr.split('-');
    
    // A. Salário Base (Zero para diarista)
    const salarioBase = window.calcularTetoLiberado(func, dataStr);

    // B. Presença / Passagem / Diárias
    let totalPresencaValor = 0; // Nome genérico para (Passagem OU Diária)
    let diasPresenca = 0;
    
    const valorDiaria = parseFloat(func.salario) || 0;
    const valorPassagem = parseFloat(func.passagem) || 0;

    Object.keys(window.db.presencas).forEach(diaStr => {
        if(diaStr.startsWith(`${anoRef}-${mesRef}`)) { 
            const registro = window.db.presencas[diaStr].find(r => r.id == idFunc);
            
            if(registro) {
                // LÓGICA MENSALISTA
                if (func.tipo !== 'Diaria') {
                    if(['Presente', 'Atrasado'].includes(registro.status)) {
                        totalPresencaValor += valorPassagem; 
                        diasPresenca++;
                    }
                } 
                // LÓGICA DIARISTA (AQUI ESTAVA O ERRO ANTES)
                else {
                    if(registro.status === 'Presente') {
                        totalPresencaValor += valorDiaria;
                        diasPresenca++;
                    }
                    else if(registro.status === 'Atrasado') {
                        totalPresencaValor += (valorDiaria / 2);
                        diasPresenca++; // Conta como dia trabalhado, mas recebe metade
                    }
                }
            }
        }
    });

    // C. Extras e Motoboy
    const totalComissoes = window.getTotalComissoesMes(idFunc, dataStr); 
    const totalEntregas = window.getTotalMotoboyMes(idFunc, dataStr); 

    // D. O que já foi pago
    const totalPago = window.getTotalPagoNoMes(idFunc, dataStr);

    // E. Totais
    const totalGanho = salarioBase + totalPresencaValor + totalComissoes + totalEntregas;
    const saldoDisponivel = totalGanho - totalPago;
    const corSaldo = saldoDisponivel >= 0 ? '#27ae60' : '#c0392b';

    // 2. Monta o HTML do Modal
    const el = document.getElementById('corpoDetalhes');
    
    let html = `<div style="text-align:center; font-weight:bold; color:#7f8c8d; margin-bottom:15px; font-size:1.1rem; border-bottom:1px solid #eee; padding-bottom:10px;">
        ${func.nome}<br><small style="font-weight:normal; font-size:0.8rem">Referência: ${mesRef}/${anoRef}</small>
    </div>`;

    if(totalEntregas > 0) html += `<div class="detalhes-linha"><span>🏍️ Entregas (Motoboy)</span><span class="detalhes-destaque" style="color:#d35400;">+ ${fmtMoeda(totalEntregas)}</span></div>`;
    
    if(totalComissoes > 0) html += `<div class="detalhes-linha"><span>⭐ Comissões</span><span class="detalhes-destaque" style="color:#8e44ad;">+ ${fmtMoeda(totalComissoes)}</span></div>`;
    
    // LINHA INTELIGENTE: Muda o texto dependendo se é Diarista ou Mensalista
    if(totalPresencaValor > 0) {
        const textoLabel = func.tipo === 'Diaria' ? '☀️ Diárias Realizadas' : '🚌 Vale Transporte';
        html += `<div class="detalhes-linha"><span>${textoLabel} (${diasPresenca} dias)</span><span class="detalhes-destaque">+ ${fmtMoeda(totalPresencaValor)}</span></div>`;
    }

    if(salarioBase > 0) html += `<div class="detalhes-linha"><span>📅 Salário Base Fixo</span><span class="detalhes-destaque">+ ${fmtMoeda(salarioBase)}</span></div>`;

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
            * Para Diaristas: Presente = 100% | Atrasado = 50% da diária.
        </p>
    `;

    el.innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
}

window.salvarPresencaDia = async function() {
    if(!checkPerm('pres')) return; 

    const data = document.getElementById('dataPresenca').value;
    if(!data) return alert("Selecione uma data!");

    const cards = document.querySelectorAll('.presenca-card');
    if(cards.length === 0) return alert("Nenhum funcionário listado para salvar.");

    const listaExistente = window.db.presencas[data] || [];
    const mapaPresenca = new Map();

    listaExistente.forEach(p => {
        const idSeguro = parseInt(p.id);
        if (!isNaN(idSeguro)) mapaPresenca.set(idSeguro, p);
    });

    let contador = 0;

    cards.forEach(card => {
        const idCard = parseInt(card.getAttribute('data-id'));

        if (!isNaN(idCard)) {
            const select = card.querySelector('.status-presenca');
            const status = select ? select.value : '';

            const inputObs = card.querySelector('.obs-presenca');
            const obs = inputObs ? inputObs.value : '';

            mapaPresenca.set(idCard, {
                id: idCard,
                status: status,
                obs: obs
            });

            if(status) contador++;
        }
    });

    const listaFinal = Array.from(mapaPresenca.values());

    try {
        await salvarRegistro(FIREBASE_AREAS.presencas, data, {
            data: data,
            registros: listaFinal
        });
        window.db.presencas[data] = listaFinal;
        registrarLog('Presenca', `Salvou chamada de ${fmtData(data)} (${contador} registros)`);
    } catch (erro) {
        console.error("Falha ao salvar presença:", erro);
        alert("Erro: não foi possível salvar a lista na nuvem. Nada foi confirmado.");
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarTopo');
    if(btnSalvar) {
        const textoOriginal = btnSalvar.innerText;
        btnSalvar.innerText = "✅ Salvo!";
        btnSalvar.style.backgroundColor = "#27ae60";

        setTimeout(() => {
            btnSalvar.innerText = textoOriginal;
            btnSalvar.style.backgroundColor = "";
        }, 2000);
    } else {
        alert("✅ Lista Salva com Sucesso!");
    }

    window.carregarListaPresenca();
}

// ============================================================
// === NOVA LÓGICA DE FILTRO SEMANAL (COLE NO FINAL DO ARQUIVO) ===
// ============================================================

// 1. Descobre a Segunda e o Domingo da semana baseada na data escolhida
window.getRangeDatas = function(tipo, dataBaseStr) {
    // Se for MÊS, retorna nulo pra usar a lógica antiga
    if (tipo === 'MES') return null;

    const dataBase = new Date(dataBaseStr + 'T12:00:00'); 
    const diaSemana = dataBase.getDay(); // 0=Dom, 1=Seg...
    
    // Volta até a Segunda-Feira
    const diffSegunda = dataBase.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1);
    
    const start = new Date(dataBase);
    start.setDate(diffSegunda); // Segunda-feira

    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Domingo

    // Se escolheu "Semana Passada", volta 7 dias
    if (tipo === 'SEMANA_PASSADA') {
        start.setDate(start.getDate() - 7);
        end.setDate(end.getDate() - 7);
    }
    
    const fmt = (d) => d.toISOString().split('T')[0];
    return { start: fmt(start), end: fmt(end) };
}

// 2. Soma Ganhos (Diárias + Comissões) SÓ dentro das datas
window.calcularGanhosRange = function(idFunc, startStr, endStr) {
    const func = window.db.funcionarios.find(f => f.id == idFunc);
    if (!func) return 0;

    let ganhos = 0;
    const valorDiaria = parseFloat(func.salario) || 0;
    const valorPassagem = parseFloat(func.passagem) || 0;

    // A. Varre dias de presença
    Object.keys(window.db.presencas).forEach(dia => {
        if (dia >= startStr && dia <= endStr) {
            const registro = window.db.presencas[dia].find(r => r.id == idFunc);
            if (registro) {
                if (func.tipo === 'Diaria') {
                    if (registro.status === 'Presente') ganhos += valorDiaria;
                    if (registro.status === 'Atrasado') ganhos += (valorDiaria / 2);
                } else {
                    // Mensalista na visão semanal: conta só passagem/presença
                    if (['Presente', 'Atrasado'].includes(registro.status)) {
                        ganhos += valorPassagem;
                    }
                }
            }
        }
    });

    // B. Comissões / Extras
    window.db.extras.forEach(e => {
        if (e.data >= startStr && e.data <= endStr) {
            if (String(e.idFunc) === String(idFunc) && e.tipo === 'Comissao') {
                ganhos += e.valor;
            }
        }
    });

    // C. Motoboy
    if (window.db.entregas) {
        window.db.entregas.forEach(e => {
            if (e.data >= startStr && e.data <= endStr && String(e.idFunc) === String(idFunc)) {
                ganhos += e.valorTotal;
            }
        });
    }

    return ganhos;
}

// 3. Soma Pagamentos (Vales) SÓ dentro das datas
window.getPagamentosRange = function(idFunc, startStr, endStr) {
    return window.db.pagamentos.reduce((acc, p) => {
        if (String(p.idFunc) === String(idFunc) && p.data >= startStr && p.data <= endStr) {
            return acc + p.valor;
        }
        return acc;
    }, 0);
}


// --- FUNÇÃO DE TELETRANSPORTE (DO CARD PARA O PAGAMENTO) ---
window.irParaPagamento = function(idFunc) {
    // 1. Acha o botão do menu de pagamentos pra deixar ele "aceso" na barra lateral
    const btnMenu = document.querySelector("button[onclick*='pagamentos']");
    
    // 2. Muda a tela visualmente para a seção de Pagamentos
    window.showSection('pagamentos', btnMenu);

    // 3. Seleciona o funcionário no Dropdown lá da tela de pagamentos
    const select = document.getElementById('selectFuncionarioPagamento');
    
    if(select) {
        // Define o valor do select
        select.value = idFunc;
        
        // 4. Força o sistema a carregar os dados desse funcionário (Totais, Vales, etc)
        // Isso faz aparecer o card verde/vermelho com os cálculos
        if(window.atualizarPainelPagamentos) {
            window.atualizarPainelPagamentos();
        }
        
        // 5. Rola a tela pra cima pra facilitar a visão
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        console.error("Erro: Não achei o campo de seleção de funcionário.");
    }
}

// --- FUNÇÃO CÉREBRO: O CÁLCULO MESTRE DO SISTEMA (CORRIGIDO) ---
window.calcularSaldoExato = function(f, dataRefStr, tipoPeriodo) {
    let totalGanhos = 0;
    let totalPago = 0;
    let dividaAnt = 0;

    // --- MODO 1: MÊS COMPLETO (Acumulado) ---
    if (tipoPeriodo === 'MES') {
        totalGanhos = window.calcularGanhosNoMes(f.id, dataRefStr);
        totalPago = window.getTotalPagoNoMes(f.id, dataRefStr);
        
        // CORREÇÃO AQUI: Agora chama a função certa "getSaldoMesAnterior"
        if(window.getSaldoMesAnterior) {
            dividaAnt = window.getSaldoMesAnterior(f.id, dataRefStr);
        }
    } 
    
    // --- MODO 2: SEMANAL ---
    else {
        const dataBase = new Date(dataRefStr + 'T12:00:00');
        const diaSemana = dataBase.getDay(); 
        const diffSegunda = dataBase.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1);
        
        // Define a SEMANA DO SALÁRIO (Segunda a Domingo)
        const start = new Date(dataBase); start.setDate(diffSegunda);
        const end = new Date(start); end.setDate(start.getDate() + 6);

        if (tipoPeriodo === 'SEMANA_PASSADA') {
            start.setDate(start.getDate() - 7); end.setDate(end.getDate() - 7);
        }
        
        const fmt = (d) => d.toISOString().split('T')[0];
        const rangeSalario = { start: fmt(start), end: fmt(end) };
        
        // Define a SEMANA DA PASSAGEM (Anterior)
        const startPass = new Date(start); startPass.setDate(start.getDate() - 7);
        const endPass = new Date(end); endPass.setDate(end.getDate() - 7);
        const rangePassagem = { start: fmt(startPass), end: fmt(endPass) };

        const valorDiaria = parseFloat(f.salario) || 0;
        const valorPassagem = parseFloat(f.passagem) || 0;

        // A. SALÁRIO PROPORCIONAL
        if (f.tipo !== 'Diaria') {
            totalGanhos += (valorDiaria / 30) * 7; 
        }

        // B. PRESENÇAS / PASSAGEM
        Object.keys(window.db.presencas).forEach(dia => {
            const registro = window.db.presencas[dia].find(r => r.id == f.id);
            if (!registro) return;

            if (f.tipo === 'Diaria') {
                if (dia >= rangeSalario.start && dia <= rangeSalario.end) {
                    if (registro.status === 'Presente') totalGanhos += valorDiaria;
                    if (registro.status === 'Atrasado') totalGanhos += (valorDiaria / 2);
                }
            } else {
                if (dia >= rangePassagem.start && dia <= rangePassagem.end) {
                    if(['Presente', 'Atrasado'].includes(registro.status)) {
                        totalGanhos += valorPassagem;
                    }
                }
            }
        });

        // C. EXTRAS E ENTREGAS
        window.db.extras.forEach(e => {
            if (e.data >= rangeSalario.start && e.data <= rangeSalario.end) {
                if ((String(e.idFunc) === String(f.id) || e.beneficiario === f.nome) && e.tipo === 'Comissao') {
                    totalGanhos += e.valor;
                }
            }
        });
        if (window.db.entregas) {
            window.db.entregas.forEach(e => {
                if (e.data >= rangeSalario.start && e.data <= rangeSalario.end && String(e.idFunc) === String(f.id)) {
                    totalGanhos += e.valorTotal;
                }
            });
        }

        totalPago = window.getPagamentosRange(f.id, rangeSalario.start, rangeSalario.end);
    }

    return (totalGanhos + dividaAnt) - totalPago;
}
// ============================================================
// === MÓDULO BI (VISÃO DE ÁGUIA 2.0) ===
// ============================================================

let chartExpandido = null;
let contextoAtualBI = '';

window.abrirGraficoBI = function(tipo) {
    contextoAtualBI = tipo;
    const modal = document.getElementById('modalGraficozao');
    const titulo = document.getElementById('tituloGraficoExpandido');
    const selectTipo = document.getElementById('biTipoGrafico');
    
    // Datas Padrão
    if(!document.getElementById('biDataInicio').value) {
        const hoje = new Date();
        document.getElementById('biDataInicio').value = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        document.getElementById('biDataFim').value = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    // Recupera preferência
    const pref = localStorage.getItem(`pref_grafico_${tipo}`);
    selectTipo.value = pref || ((tipo === 'financeiro') ? 'doughnut' : 'bar');

    titulo.innerText = (tipo === 'financeiro') ? "💰 Análise Financeira" : "🏆 Performance de Vendas";
    modal.style.display = 'flex';
    
    setTimeout(() => window.filtrarGraficoExpandido(), 100);
}

window.filtrarGraficoExpandido = function() {
    const inicio = document.getElementById('biDataInicio').value;
    const fim = document.getElementById('biDataFim').value;
    const tipo = document.getElementById('biTipoGrafico').value;
    const resumo = document.getElementById('biResumo');

    if (!inicio || !fim) return;
    localStorage.setItem(`pref_grafico_${contextoAtualBI}`, tipo);

    let labels = [], valores = [], cores = [], total = 0;

    if (contextoAtualBI === 'financeiro') {
        let sal = 0, com = 0, moto = 0, loja = 0;
        window.db.pagamentos.forEach(p => { if (p.data >= inicio && p.data <= fim) sal += p.valor; });
        window.db.extras.forEach(e => {
            if (e.data >= inicio && e.data <= fim) {
                if (e.tipo === 'Despesa') loja += e.valor; else com += e.valor;
            }
        });
        if(window.db.entregas) window.db.entregas.forEach(e => { if (e.data >= inicio && e.data <= fim) moto += e.valorTotal; });

        labels = ['Salários', 'Comissões', 'Motoboys', 'Despesas'];
        valores = [sal, com, moto, loja];
        cores = ['#27ae60', '#8e44ad', '#d35400', '#c0392b'];
        total = sal + com + moto + loja;
        resumo.innerHTML = `Gasto Total: <span style="color:#c0392b">${total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span>`;
    
    } else { // Vendas
        let ranking = {};
        window.db.extras.forEach(e => {
            if (e.data >= inicio && e.data <= fim && e.tipo === 'Comissao') {
                let taxa = (e.obs && e.obs.includes('10%')) ? 0.10 : 0.07;
                let val = e.valor / taxa;
                if(!ranking[e.beneficiario]) ranking[e.beneficiario] = 0;
                ranking[e.beneficiario] += val;
                total += val;
            }
        });
        const sorted = Object.entries(ranking).sort(([,a],[,b]) => b-a);
        labels = sorted.map(i=>i[0]); valores = sorted.map(i=>i[1]);
        cores = valores.map(()=>'#f1c40f');
        resumo.innerHTML = `Vendido: <span style="color:#f39c12">${total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span>`;
    }

    const ctx = document.getElementById('canvasGraficozao').getContext('2d');
    if (chartExpandido) chartExpandido.destroy();

    const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };
    if (tipo === 'bar' || tipo === 'line') options.scales = { y: { beginAtZero: true } };

    chartExpandido = new Chart(ctx, { type: tipo, data: { labels, datasets: [{ label: 'R$', data: valores, backgroundColor: cores }] }, options });
}


// --- FUNÇÃO DO CLIQUE NO DROPDOWN BONITO (AGORA 100% BLINDADA) ---
window.selecionarFuncionarioCustom = function(id, nome) {
    document.getElementById('customSelectLabel').innerHTML = id ? `✅ ${nome}` : `🔍 Selecione um funcionário...`;
    document.getElementById('customSelectDropdown').classList.remove('show');
    const busca = document.getElementById('customSelectSearch');
    if(busca) busca.value = ''; 
    window.filtrarCustomSelect(); 

    const selectOriginal = document.getElementById('selectFuncionarioPagamento');
    if(selectOriginal) {
        // 🚨 A MÁGICA SALVADORA: Se o <option> não existir no select escondido, a gente cria ele na marra!
        let optionExists = Array.from(selectOriginal.options).some(opt => opt.value === String(id));
        if (!optionExists) {
            selectOriginal.innerHTML += `<option value="${id}">${nome}</option>`;
        }
        
        selectOriginal.value = id; // Agora a seleção funciona 100%
        if(window.atualizarPainelPagamentos) window.atualizarPainelPagamentos(); 
    }
}

// --- VARIÁVEL GLOBAL PRA SABER QUAL ABA TÁ ABERTA ---
let modoPagamentoAtual = 'Salario'; 

window.mudarModoPagamento = function(modo) {
    modoPagamentoAtual = modo;
    document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + modo).classList.add('active');
    
    const tipoSelect = document.getElementById('tipoLancamento');
    if(tipoSelect) tipoSelect.value = modo === 'Salario' ? 'Pagamento' : modo;

    const divSubTipo = document.getElementById('divSubTipoSalario');
    if(divSubTipo) divSubTipo.style.display = (modo === 'Salario') ? 'flex' : 'none';
    
    if (window.atualizarPainelPagamentos) window.atualizarPainelPagamentos(); 
}

// --- ATUALIZA A TELA DE PAGAMENTOS (CÓDIGO ORIGINAL + CORREÇÃO ABSOLUTA) ---
window.atualizarPainelPagamentos = function() {
    const selectNativo = document.getElementById('selectFuncionarioPagamento');
    const dataInput = document.getElementById('dataPagamento')?.value; 
    const filtroPeriodo = document.getElementById('filtroPeriodoPagamento'); 
    
    const divAviso = document.getElementById('avisoSaldo');
    const divResumo = document.getElementById('resumoFinanceiro');
    const gridPag = document.getElementById('gridPagamentos');
    const divLista = document.getElementById('customSelectOptionsList');

    // 1. MÁGICA DA BUSCA BONITA: Força a atualização do SELECT escondido sempre!
    if (divLista) {
        let htmlLista = '';
        let htmlNativo = '<option value="">Selecione...</option>';
        
        (window.db.funcionarios || []).sort((a,b) => (a.nome||'').localeCompare(b.nome||'')).forEach(f => {
            const inicial = f.nome ? f.nome.charAt(0).toUpperCase() : '👤';
            const nomeLower = (f.nome || '').toLowerCase();
            
            htmlLista += `
                <div class="custom-option-item" data-nome="${nomeLower}" onclick="window.selecionarFuncionarioCustom('${f.id}', '${f.nome}')">
                    <div class="custom-opt-avatar">${inicial}</div>
                    <div class="custom-opt-info">
                        <span class="custom-opt-name">${f.nome}</span>
                        <span class="custom-opt-role">
                            <span class="role-badge">${f.cargo || 'S/ Cargo'}</span>
                            <span class="empresa-badge">${f.empresa || 'S/ Empresa'}</span>
                        </span>
                    </div>
                </div>
            `;
            htmlNativo += `<option value="${f.id}">${f.nome}</option>`;
        });
        
        if (divLista.children.length !== (window.db.funcionarios || []).length) {
            divLista.innerHTML = htmlLista;
        }
        // 🔥 AQUI MATA O BUG: Atualiza os IDs escondidos se eles estiverem vazios!
        if (selectNativo && selectNativo.options.length !== (window.db.funcionarios || []).length + 1) {
            selectNativo.innerHTML = htmlNativo;
        }
    }

    const idFunc = selectNativo ? selectNativo.value : '';

    // 2. SE NINGUÉM ESTIVER SELECIONADO, ESCONDE TUDO
    if(!idFunc) { 
        if(divAviso) divAviso.style.display = 'none'; 
        if(gridPag) gridPag.innerHTML = '<p style="text-align:center; width:100%; color:#999; margin-top: 20px;">🔍 Selecione um guerreiro acima para ver o histórico e o saldo.</p>';
        return; 
    }

    // 3. SEU CÓDIGO ORIGINAL COMEÇA AQUI EMBAIXO
    const dataRefStr = dataInput ? dataInput : new Date().toISOString().split('T')[0];
    const tipoPeriodo = filtroPeriodo ? filtroPeriodo.value : 'MES';
    const func = window.db.funcionarios.find(f => String(f.id) === String(idFunc));
    if(!func) return;
    
    let range = null;
    if(tipoPeriodo !== 'MES' && window.getRangeDatas) range = window.getRangeDatas(tipoPeriodo, dataRefStr);

    let totalComissoes = 0;
    let totalEntregas = 0;

    if(tipoPeriodo === 'MES') {
        if(window.getTotalComissoesMes) totalComissoes = window.getTotalComissoesMes(idFunc, dataRefStr);
        if(window.getTotalMotoboyMes) totalEntregas = window.getTotalMotoboyMes(idFunc, dataRefStr);
    } else if (range) {
        (window.db.extras || []).forEach(e => {
            if(e.data >= range.start && e.data <= range.end && (String(e.idFunc) === String(idFunc) || e.beneficiario === func.nome) && e.tipo === 'Comissao') {
                totalComissoes += e.valor;
            }
        });
        if (window.db.entregas) {
            window.db.entregas.forEach(e => {
                if(e.data >= range.start && e.data <= range.end && String(e.idFunc) === String(idFunc)) {
                    totalEntregas += e.valorTotal;
                }
            });
        }
    }

    const valorPassagem = parseFloat(func.passagem) || 0;
    const valorDiaria = parseFloat(func.salario) || 0;
    const [anoRef, mesRef] = dataRefStr.split('-');

    let valorTotalPassagem = 0;
    let valorTotalDiarias = 0;
    let diasContados = 0;
    let diasPassagemList = []; 

    Object.keys(window.db.presencas || {}).forEach(diaStr => {
        let deveContar = false;
        if(tipoPeriodo === 'MES') { if(diaStr.startsWith(`${anoRef}-${mesRef}`)) deveContar = true; }
        else if (range) { if(diaStr >= range.start && diaStr <= range.end) deveContar = true; }

        if(deveContar) {
            const reg = window.db.presencas[diaStr].find(r => String(r.id) === String(idFunc));
            if(reg) {
                if(func.tipo !== 'Diaria' && ['Presente', 'Atrasado'].includes(reg.status)) {
                    valorTotalPassagem += valorPassagem;
                    diasContados++;
                    const partesDia = diaStr.split('-');
                    diasPassagemList.push(`${partesDia[2]}/${partesDia[1]}`);
                } else if(func.tipo === 'Diaria') {
                    if(reg.status === 'Presente') { valorTotalDiarias += valorDiaria; diasContados++; }
                    else if (reg.status === 'Atrasado') { valorTotalDiarias += (valorDiaria / 2); diasContados++; }
                }
            }
        }
    });

    let salarioBase = 0;
    let saldoAnteriorSalario = 0;
    let saldoAnteriorPassagem = 0;

    if(tipoPeriodo === 'MES' && window.getSaldoMesAnterior) {
        const saldos = window.getSaldoMesAnterior(idFunc, dataRefStr);
        if (typeof saldos === 'object') {
            saldoAnteriorSalario = saldos.salario || 0;
            saldoAnteriorPassagem = saldos.passagem || 0;
        }
    }

    if(func.tipo !== 'Diaria') {
        if(tipoPeriodo === 'MES' && window.calcularTetoLiberado) {
            salarioBase = window.calcularTetoLiberado(func, dataRefStr) || 0;
        } else if (range) {
            salarioBase = (valorDiaria / 30) * 7;
        } else {
            salarioBase = valorDiaria;
        }
    }

    const ganhosPassagemTotal = valorTotalPassagem + saldoAnteriorPassagem;
    const ganhosSalarioTotal = salarioBase + valorTotalDiarias + totalComissoes + totalEntregas + saldoAnteriorSalario;

    let pagoSalario = 0;
    let pagoPassagem = 0;
    let totalValesAbertos = 0;
    let totalValesDescontados = 0;
    let pagamentosDesteCara = []; 

    (window.db.pagamentos || []).forEach(p => {
        if(String(p.idFunc) !== String(idFunc)) return;
        let entra = false;
        if(tipoPeriodo === 'MES') { if(p.data.startsWith(dataRefStr.slice(0,7))) entra = true; }
        else if (range) { if(p.data >= range.start && p.data <= range.end) entra = true; }

        if(entra) {
            pagamentosDesteCara.push(p);
            if(p.tipo === 'Passagem') pagoPassagem += p.valor;
            else if(p.tipo === 'Vale') {
                if(p.status === 'PENDENTE') totalValesAbertos += p.valor;
                else totalValesDescontados += p.valor; 
            }
            else pagoSalario += p.valor;
        }
    });

    const saldoLiquidoPassagem = ganhosPassagemTotal - pagoPassagem;
    const saldoLiquidoSalario = ganhosSalarioTotal - pagoSalario - totalValesDescontados; 

    if(divAviso) {
        divAviso.style.display = 'block';
        let htmlDetalhes = `<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.1); font-size:0.85rem;">`;

        if(modoPagamentoAtual === 'Salario') {
            const cor = saldoLiquidoSalario >= 0 ? '#d4edda' : '#f8d7da';
            const textoCor = saldoLiquidoSalario >= 0 ? '#155724' : '#721c24';
            divAviso.style.backgroundColor = cor;
            divAviso.style.color = textoCor;
            divAviso.style.border = `1px solid ${cor}`;

            if(saldoAnteriorSalario !== 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; font-weight:bold;"><span>${saldoAnteriorSalario > 0 ? '💚 Crédito Anterior' : '🔻 Dívida Anterior'}:</span> <span>${fmtMoeda(saldoAnteriorSalario)}</span></div>`;            
            if(salarioBase > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between;"><span>📅 Salário Base:</span> <span>${fmtMoeda(salarioBase)}</span></div>`;
            if(valorTotalDiarias > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between;"><span>☀️ Diárias (${diasContados}):</span> <span>${fmtMoeda(valorTotalDiarias)}</span></div>`;
            if(totalComissoes > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#8e44ad;"><span>⭐ Comissões:</span> <span>${fmtMoeda(totalComissoes)}</span></div>`;
            if(totalEntregas > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#d35400;"><span>🏍️ Entregas:</span> <span>${fmtMoeda(totalEntregas)}</span></div>`;
            
            if(totalValesAbertos > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#e67e22; font-weight:bold; margin-top:5px; border-top:1px dashed #ccc; padding-top:5px;"><span>⚠️ Vales Pendentes (NÃO descontado ainda):</span> <span>${fmtMoeda(totalValesAbertos)}</span></div>`;
            if(totalValesDescontados > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#c0392b; font-weight:bold; margin-top:5px; border-top:1px dashed #ccc; padding-top:5px;"><span>🎫 Vales Já Descontados:</span> <span>- ${fmtMoeda(totalValesDescontados)}</span></div>`;
            if(pagoSalario > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#c0392b; margin-top:5px; border-top:1px dashed #ccc; padding-top:5px;"><span>💸 Já Recebido:</span> <span>- ${fmtMoeda(pagoSalario)}</span></div>`;
            
            htmlDetalhes += `</div>`;

            divAviso.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:1.4rem;">💰 Líquido Salário: <strong>${fmtMoeda(saldoLiquidoSalario)}</strong></span>
                    ${func.pix ? `<div style="font-size:0.9rem; background:rgba(255,255,255,0.4); padding:4px 8px; border-radius:4px; border:1px solid rgba(0,0,0,0.1);"><strong>🔑 Pix:</strong> ${func.pix} <button class="btn-copy" onclick="window.copiarTexto('${func.pix}')">📋</button></div>` : ``}
                </div>
                ${htmlDetalhes}
                <div style="font-size:0.8rem; margin-top:5px; text-align:center; opacity:0.8;">(Passagem e Vales na outra aba)</div>
            `;
            const inputVal = document.getElementById('valorPagamento');
            if(inputVal && document.activeElement !== inputVal) inputVal.value = saldoLiquidoSalario > 0 ? saldoLiquidoSalario.toFixed(2) : '';

        } else if(modoPagamentoAtual === 'Vale') {
            const cor = '#fcf3cf'; 
            const textoCor = '#d35400';
            divAviso.style.backgroundColor = cor;
            divAviso.style.color = textoCor;
            divAviso.style.border = `1px solid #f1c40f`;

            htmlDetalhes += `<div style="display:flex; justify-content:space-between;"><span>💰 Saldo Total do Mês (Bruto):</span> <span>${fmtMoeda(ganhosSalarioTotal)}</span></div>`;
            if(pagoSalario > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#c0392b;"><span>💸 Salário Já Pago:</span> <span>- ${fmtMoeda(pagoSalario)}</span></div>`;
            
            htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#e67e22; font-weight:bold; margin-top:5px; border-top:1px dashed #e67e22; padding-top:5px;"><span>⚠️ Vales Pendentes:</span> <span>${fmtMoeda(totalValesAbertos)}</span></div>`;
            if(totalValesDescontados > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#c0392b; font-weight:bold; margin-top:5px; border-top:1px dashed #e67e22; padding-top:5px;"><span>🎫 Vales Já Descontados:</span> <span>- ${fmtMoeda(totalValesDescontados)}</span></div>`;

            htmlDetalhes += `</div>`;

            divAviso.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:1.4rem;">🎫 Total Pendente p/ Descontar: <strong>${fmtMoeda(totalValesAbertos)}</strong></span>
                </div>
                ${htmlDetalhes}
                <div style="font-size:0.8rem; margin-top:5px; text-align:center; opacity:0.8; font-weight:bold; color:#e67e22;">(O vale listado NÃO desconta do salário até você clicar em "Descontar do Salário" lá embaixo)</div>
            `;
            const inputVal = document.getElementById('valorPagamento');
            if(inputVal && document.activeElement !== inputVal) inputVal.value = ''; 
        
        } else {
            const cor = saldoLiquidoPassagem >= 0 ? '#e8daef' : '#f8d7da';
            const textoCor = saldoLiquidoPassagem >= 0 ? '#8e44ad' : '#721c24';
            divAviso.style.backgroundColor = cor;
            divAviso.style.color = textoCor;
            divAviso.style.border = `1px solid ${cor}`;

            if(saldoAnteriorPassagem !== 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; font-weight:bold;"><span>${saldoAnteriorPassagem > 0 ? '💚 Crédito Anterior' : '🔻 Dívida Anterior'}:</span> <span>${fmtMoeda(saldoAnteriorPassagem)}</span></div>`;

            if(valorTotalPassagem > 0) {
                htmlDetalhes += `<div style="display:flex; justify-content:space-between;"><span>🚌 Passagem Acumulada (${diasContados}d):</span> <span>${fmtMoeda(valorTotalPassagem)}</span></div>`;
                if (diasPassagemList.length > 0) htmlDetalhes += `<div style="font-size:0.75rem; color:#8e44ad; opacity:0.8; margin-top:2px; margin-bottom:5px; font-style:italic;">Dias computados: ${diasPassagemList.join(', ')}</div>`;
            }
            if(pagoPassagem > 0) htmlDetalhes += `<div style="display:flex; justify-content:space-between; color:#c0392b;"><span>💸 Já Pago:</span> <span>- ${fmtMoeda(pagoPassagem)}</span></div>`;
            htmlDetalhes += `</div>`;

            divAviso.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:1.4rem;">🚌 Líquido Passagem: <strong>${fmtMoeda(saldoLiquidoPassagem)}</strong></span>
                </div>
                ${htmlDetalhes}
            `;
            const inputVal = document.getElementById('valorPagamento');
            if(inputVal && document.activeElement !== inputVal) inputVal.value = saldoLiquidoPassagem > 0 ? saldoLiquidoPassagem.toFixed(2) : '';
        }
    }

    if(divResumo) {
        divResumo.style.display = 'flex';
        const sSalario = document.getElementById('resumoSalario'); if(sSalario) sSalario.innerText = fmtMoeda(pagoSalario);
        const sPassagem = document.getElementById('resumoPassagem'); if(sPassagem) sPassagem.innerText = fmtMoeda(pagoPassagem);
        const sVale = document.getElementById('resumoVale'); if(sVale) sVale.innerText = fmtMoeda(totalValesDescontados); 
    }

    // 4. RENDERIZA OS PAGAMENTOS ANTIGOS DESSE FUNCIONÁRIO LÁ EMBAIXO
    if (window.filtrarGridPagamentos) {
        window.filtrarGridPagamentos(idFunc, tipoPeriodo, dataRefStr, range);
    } else {
        if (gridPag) {
            gridPag.innerHTML = '';
            if(pagamentosDesteCara.length === 0) {
                 gridPag.innerHTML = '<p style="text-align:center; width:100%; color:#999; margin-top: 20px;">Nenhum pagamento registrado neste período.</p>';
            } else {
                pagamentosDesteCara.sort((a,b) => new Date(b.data) - new Date(a.data));
                pagamentosDesteCara.forEach(pag => {
                    let icone = '💰'; let corBorda = 'var(--success)'; let corValor = 'var(--success)';
                    if(pag.tipo === 'Vale') { icone = '🎫'; corBorda = 'var(--warning)'; corValor = 'var(--warning)'; }
                    if(pag.tipo === 'Passagem') { icone = '🚌'; corBorda = 'var(--purple)'; corValor = 'var(--purple)'; }
                    const d = pag.data ? pag.data.split('-').reverse().join('/') : '--/--/----';
                    gridPag.innerHTML += `
                        <div class="pagamento-card" style="border-top-color: ${corBorda}; margin-bottom: 10px;">
                            <div class="pag-header">
                                <span class="pag-date">📅 ${d}</span>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn-print-pag" onclick="window.gerarRecibo(${pag.id})" title="Imprimir Recibo">🖨️</button>
                                    <button class="btn-delete-pag" onclick="window.removerPagamento(${pag.id})" title="Apagar Lançamento">🗑️</button>
                                </div>
                            </div>
                            <div class="pag-nome">${icone} ${pag.tipo}</div>
                            <div class="pag-footer">
                                <span class="pag-valor" style="color: ${corValor};">${fmtMoeda(pag.valor)}</span>
                            </div>
                        </div>`;
                });
            }
        }
    }
}
// 3. Atualiza a Lista de Pagamentos (Visual - Agora separando pelas Abas!)
window.filtrarGridPagamentos = function(idFunc, tipoPeriodo, dataRefStr, range) {
    const gridPag = document.getElementById('gridPagamentos');
    if(!gridPag) return;
    gridPag.innerHTML = '';

    let lista = window.db.pagamentos.filter(p => {
        if(String(p.idFunc) !== String(idFunc)) return false;
        if(tipoPeriodo === 'MES') {
            if(!p.data.startsWith(dataRefStr.slice(0,7))) return false;
        } else if(range) {
            if(p.data < range.start || p.data > range.end) return false;
        }

        // 🔮 MAGIA DO FILTRO DAS ABAS: Só mostra os cards da aba que está aberta
        if (modoPagamentoAtual === 'Salario' && p.tipo !== 'Pagamento') return false;
        if (modoPagamentoAtual === 'Vale' && p.tipo !== 'Vale') return false;
        if (modoPagamentoAtual === 'Passagem' && p.tipo !== 'Passagem') return false;

        return true;
    });

    lista.sort((a,b) => new Date(b.data) - new Date(a.data));
    window.renderizarCardsPagamento(lista);
}


// 4. Lançar (Agora sabe qual aba está aberta)
// 4. Lançar (Agora sabe qual aba está aberta automaticamente)
window.lancarPagamento = async function() {
    if(!checkPerm('fin')) return; 

    const idFunc = document.getElementById('selectFuncionarioPagamento').value;
    const valor = parseFloat(document.getElementById('valorPagamento').value);
    const data = document.getElementById('dataPagamento').value;
    const desc = document.getElementById('descPagamento').value;
    
    let tipo = '';
    let statusVale = null;

    if(modoPagamentoAtual === 'Passagem') tipo = 'Passagem';
    else if(modoPagamentoAtual === 'Vale') {
        tipo = 'Vale';
        statusVale = 'PENDENTE';
    } else {
        tipo = 'Pagamento';
    }

    if(!idFunc || !valor || !data) return alert("Preencha todos os campos obrigatórios!");

    const func = window.db.funcionarios.find(f => f.id == idFunc);
    if(!func) return alert("Funcionário não encontrado!");

    const novoPag = {
        id: Date.now(),
        idFunc: String(idFunc),
        nomeFunc: func.nome,
        tipo: tipo,
        valor: valor,
        data: data,
        desc: desc || '',
        status: statusVale || 'PAGO'
    };

    if(!Array.isArray(window.db.pagamentos)) window.db.pagamentos = [];
    try {
        await salvarRegistro(FIREBASE_AREAS.pagamentos, novoPag.id, novoPag);
        window.db.pagamentos.push(novoPag);
        registrarLog('Financeiro', `Lançou ${tipo} de ${fmtMoeda(valor)} para ${func.nome}`);
    } catch (erro) {
        console.error("Falha ao salvar pagamento:", erro);
        alert("Erro: não foi possível salvar o pagamento na nuvem. Operação cancelada.");
        return;
    }

    document.getElementById('valorPagamento').value = '';
    document.getElementById('descPagamento').value = '';

    window.atualizarPainelPagamentos();
    window.atualizarDashboard();
    alert("Operação registrada!");
}

window.renderizarCardsPagamento = function(lista) {
    const grid = document.getElementById('gridPagamentos');
    if (lista.length === 0) { grid.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Nenhum registro.</p>'; return; }
    
    lista.forEach(p => {
        let cardClass = '', valorClass = '', icone = '';
        let botoesExtras = ''; // O Botão de Descontar do Vale
        
        if(p.tipo === 'Vale') {
            if (p.status === 'PENDENTE') {
                cardClass = 'pagamento-card pag-vale'; 
                valorClass = 'pag-valor valor-vale'; 
                icone = '⏳ VALE (AGUARDANDO DESCONTO)';
                botoesExtras = `<button style="background:var(--success); color:white; border:none; padding:8px 10px; border-radius:4px; cursor:pointer; font-weight:bold; width:100%; margin-bottom:10px;" onclick="toggleStatusValePagamento(${p.id})">💸 Descontar do Salário Agora</button>`;
            } else {
                cardClass = 'pagamento-card'; 
                cardClass += ' pag-salario'; 
                valorClass = 'pag-valor'; 
                icone = '✅ VALE (JÁ DESCONTADO)';
                botoesExtras = `<button style="background:#bdc3c7; color:white; border:none; padding:8px 10px; border-radius:4px; cursor:pointer; font-weight:bold; width:100%; margin-bottom:10px;" onclick="toggleStatusValePagamento(${p.id})">↩️ Desfazer Desconto</button>`;
            }
        } else if (p.tipo === 'Passagem') {
            cardClass = 'pagamento-card pag-passagem'; valorClass = 'pag-valor valor-passagem'; icone = '🚌 PASSAGEM';
        } else {
            cardClass = 'pagamento-card pag-salario'; valorClass = 'pag-valor valor-salario'; icone = '💰 SALÁRIO';
        }

        const card = document.createElement('div'); card.className = cardClass;
        
        // Deixa o card cinza/transparente se o vale já foi descontado
        if(p.tipo === 'Vale' && p.status !== 'PENDENTE') {
            card.style.opacity = '0.7';
            card.style.borderTopColor = '#7f8c8d';
        }

        card.innerHTML = `
            <div class="pag-header"><span class="pag-date">📅 ${fmtData(p.data)}</span><div class="pag-nome">${p.nomeFunc}</div></div>
            <div class="pag-desc" style="font-weight:bold; font-size:0.8em; color:var(--text-sub);">${icone}</div>
            <div class="pag-desc">"${p.desc || 'Sem descrição'}"</div>
            ${botoesExtras}
            <div class="pag-footer">
                <div class="${valorClass}">${fmtMoeda(p.valor)}</div>
                <div>
                    <button class="btn-print-pag" onclick="gerarRecibo(${p.id})">🖨️</button>
                    <button class="btn-delete-pag" onclick="removerPagamento(${p.id})">🗑️</button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}
// ============================================================
// === SISTEMA DE BACKUP LOCAL (SEGURANÇA TOTAL) ===
// ============================================================

// 1. FUNÇÃO PARA BAIXAR O ARQUIVO (EXPORTAR)
window.baixarBackupLocal = function() {
    // Verifica se tem algo pra salvar
    if(!window.db || !window.db.funcionarios) {
        if(!confirm("O sistema parece estar vazio. Deseja baixar um arquivo vazio mesmo assim?")) return;
    }

    // Cria o nome do arquivo com data e hora (Ex: BACKUP_RH_2026-02-11_19h30.json)
    const agora = new Date();
    const dataStr = agora.toISOString().split('T')[0];
    const horaStr = agora.getHours() + "h" + agora.getMinutes();
    const nomeArquivo = `BACKUP_RH_${dataStr}_${horaStr}.json`;

    // Transforma os dados do sistema em texto
    const dadosTexto = JSON.stringify(window.db, null, 2);

    // Cria um link invisível para baixar
    const blob = new Blob([dadosTexto], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`✅ Backup baixado: ${nomeArquivo}\nGuarde este arquivo em um local seguro (ex: Pen Drive ou Google Drive)!`);
}

// 2. FUNÇÃO PARA LER O ARQUIVO E RESTAURAR (IMPORTAR)
window.restaurarBackupLocal = function() {
    if(!checkPerm('fin')) return alert("Apenas Administradores podem restaurar backups.");

    if(!confirm("ATENCAO: isso vai validar um arquivo de backup para importacao segura. A tela so sera atualizada depois da confirmacao do Firebase.\n\nDeseja continuar?")) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = e => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;

        const leitor = new FileReader();

        leitor.onload = async evento => {
            try {
                const bruto = JSON.parse(evento.target.result);

                if(!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.funcionarios)) {
                    return alert("Erro: este arquivo nao parece ser um backup valido do Sistema RH.");
                }

                const dadosRestaurados = {
                    funcionarios: Array.isArray(bruto.funcionarios) ? bruto.funcionarios : [],
                    presencas: bruto.presencas && typeof bruto.presencas === 'object' ? bruto.presencas : {},
                    pagamentos: Array.isArray(bruto.pagamentos) ? bruto.pagamentos : [],
                    extras: Array.isArray(bruto.extras) ? bruto.extras : [],
                    users: Array.isArray(bruto.users) ? bruto.users : [],
                    entregas: Array.isArray(bruto.entregas) ? bruto.entregas : [],
                    audit: Array.isArray(bruto.audit) ? bruto.audit : [],
                    boletos: Array.isArray(bruto.boletos) ? bruto.boletos : []
                };

                const resumo = [
                    `Funcionarios: ${dadosRestaurados.funcionarios.length}`,
                    `Pagamentos: ${dadosRestaurados.pagamentos.length}`,
                    `Extras: ${dadosRestaurados.extras.length}`,
                    `Entregas: ${dadosRestaurados.entregas.length}`,
                    `Boletos: ${dadosRestaurados.boletos.length}`,
                    `Usuarios: ${dadosRestaurados.users.length}`,
                    `Presencas: ${Object.keys(dadosRestaurados.presencas).length}`,
                    `Audit(local): ${dadosRestaurados.audit.length}`
                ].join('\n');

                const confirmarEnvio = confirm(
                    `Backup validado com sucesso.\n\n${resumo}\n\nDeseja enviar esses dados para a nuvem agora?\nA interface so sera atualizada depois que todas as colecoes forem confirmadas.\nRegistros antigos que nao estiverem no arquivo nao sao apagados automaticamente.`
                );

                if(!confirmarEnvio) {
                    alert("Backup validado, mas nenhuma alteracao foi aplicada. Nada foi enviado para a nuvem e a interface atual foi preservada.");
                    return;
                }

                if (!window.salvarItemNuvem) throw new Error("Cliente Firebase indisponivel.");

                const salvarLista = async (colecao, lista) => {
                    for (const item of (lista || [])) {
                        if (item && typeof item.id !== 'undefined' && item.id !== null && item.id !== '') {
                            await window.salvarItemNuvem(colecao, String(item.id), item);
                        }
                    }
                };

                await salvarLista(FIREBASE_AREAS.funcionarios, dadosRestaurados.funcionarios);
                await salvarLista(FIREBASE_AREAS.pagamentos, dadosRestaurados.pagamentos);
                await salvarLista(FIREBASE_AREAS.extras, dadosRestaurados.extras);
                await salvarLista(FIREBASE_AREAS.entregas, dadosRestaurados.entregas);
                await salvarLista(FIREBASE_AREAS.boletos, dadosRestaurados.boletos);
                await salvarLista(FIREBASE_AREAS.users, dadosRestaurados.users);

                for (const dataKey of Object.keys(dadosRestaurados.presencas)) {
                    await window.salvarItemNuvem(FIREBASE_AREAS.presencas, String(dataKey), {
                        data: dataKey,
                        registros: dadosRestaurados.presencas[dataKey]
                    });
                }

                window.db = dadosRestaurados;
                window.db.lastUpdate = Date.now();

                if(window.atualizarInterface) window.atualizarInterface();
                if(window.atualizarDashboard) window.atualizarDashboard();
                if(window.atualizarPainelPagamentos) window.atualizarPainelPagamentos();
                if(window.renderizarMotoboys) window.renderizarMotoboys();
                if(window.renderizarExtras) window.renderizarExtras();
                if(window.renderizarBoletos) window.renderizarBoletos();
                if(window.renderizarAudit) window.renderizarAudit();
                if(window.atualizarPrevisao) window.atualizarPrevisao();

                alert("Backup importado com sucesso. A nuvem confirmou os dados antes da atualizacao local.");
            } catch (erro) {
                alert("Erro ao restaurar o backup: " + erro.message);
                console.error(erro);
            }
        };

        leitor.readAsText(arquivo);
    };

    input.click();
}
// ============================================================
// === CONTROLE DO MENU CUSTOMIZADO DE FUNCIONÁRIOS ===
// ============================================================
window.toggleCustomSelect = function() {
    document.getElementById('customSelectDropdown').classList.toggle('show');
    document.getElementById('customSelectSearch').focus();
}

window.filtrarCustomSelect = function() {
    const termo = document.getElementById('customSelectSearch').value.toLowerCase();
    const items = document.querySelectorAll('.custom-option-item');
    items.forEach(item => {
        const nomeAttr = item.getAttribute('data-nome');
        if(!nomeAttr) return; 
        if(nomeAttr.includes(termo)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}


// Magia de furtividade: Fecha a lista se clicar fora dela
document.addEventListener('click', function(e) {
    const trigger = document.getElementById('customSelectTrigger');
    const dropdown = document.getElementById('customSelectDropdown');
    if(trigger && dropdown) {
        if(!trigger.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    }
});
// ============================================================
// === SISTEMA DE STATUS DO VALE (PENDENTE / DESCONTADO) ===
// ============================================================
window.toggleStatusValePagamento = async function(id) {
    if(!checkPerm('fin')) return;

    const p = window.db.pagamentos.find(p => String(p.id) === String(id));
    if(!p) return;

    if(p.tipo !== 'Vale') return;

    const atualizado = { ...p };

    if(atualizado.status === 'PENDENTE') {
        atualizado.status = 'PAGO';
    } else {
        atualizado.status = 'PENDENTE';
    }

    try {
        await salvarRegistro(FIREBASE_AREAS.pagamentos, atualizado.id, atualizado);
        Object.assign(p, atualizado);

        if(p.status === 'PAGO') {
            registrarLog('Financeiro', `Quitou vale de ${fmtMoeda(p.valor)} para ${p.nomeFunc}`);
        } else {
            registrarLog('Financeiro', `Reabriu vale de ${fmtMoeda(p.valor)} para ${p.nomeFunc}`);
        }

        window.atualizarPainelPagamentos();

        const secaoAtiva = document.querySelector('.section.active')?.id;
        if(secaoAtiva === 'dashboard' && window.atualizarDashboard) {
            window.atualizarDashboard();
        }
    } catch (erro) {
        console.error("Falha ao atualizar status do vale:", erro);
        alert("Erro: não foi possível atualizar o vale na nuvem. Nada foi alterado.");
    }
}
