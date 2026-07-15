(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ValeStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const STATUS_VALIDOS = new Set(['PENDENTE', 'PAGO']);
    const CAMPOS_CONTROLE = ['status', 'statusVersion', 'statusUpdatedAt', 'statusUpdatedBy'];

    function normalizarStatus(status) {
        return status === 'PENDENTE' ? 'PENDENTE' : 'PAGO';
    }

    function validarVale(dados) {
        if (!dados || dados.tipo !== 'Vale') throw new Error('O lançamento informado não é um vale.');
    }

    function calcularAtualizacao(dadosAtuais, statusDesejado, uid, updatedAt) {
        validarVale(dadosAtuais);
        if (!STATUS_VALIDOS.has(statusDesejado)) throw new Error('Status de vale inválido.');
        if (!uid) throw new Error('Usuário autenticado ausente.');

        const statusAtual = normalizarStatus(dadosAtuais.status);
        const versaoAtual = Number.isInteger(dadosAtuais.statusVersion) && dadosAtuais.statusVersion >= 0
            ? dadosAtuais.statusVersion
            : 0;

        return {
            changed: statusAtual !== statusDesejado,
            statusAtual,
            statusDesejado,
            patch: {
                status: statusDesejado,
                statusVersion: versaoAtual + 1,
                statusUpdatedAt: updatedAt,
                statusUpdatedBy: uid
            }
        };
    }

    function protegerRestauracao(dadosAtuais, dadosBackup) {
        if (!dadosBackup || dadosBackup.tipo !== 'Vale') {
            return { ...dadosBackup };
        }

        const protegido = { ...dadosBackup };
        if (!dadosAtuais || dadosAtuais.tipo !== 'Vale') {
            protegido.status = normalizarStatus(dadosBackup.status);
            CAMPOS_CONTROLE.slice(1).forEach(campo => delete protegido[campo]);
            return protegido;
        }

        CAMPOS_CONTROLE.forEach(campo => {
            if (campo === 'status') protegido.status = normalizarStatus(dadosAtuais.status);
            else if (Object.prototype.hasOwnProperty.call(dadosAtuais, campo)) protegido[campo] = dadosAtuais[campo];
            else delete protegido[campo];
        });
        return protegido;
    }

    return Object.freeze({ calcularAtualizacao, normalizarStatus, protegerRestauracao });
});
