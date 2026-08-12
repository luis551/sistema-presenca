(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MotoPaymentRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const DATA_INICIO_REGRA_40_4 = '2026-07-14';
    const DATA_INICIO_REGRA_60_5 = '2026-08-12';
    const REGRAS = Object.freeze({
        noiteLegado: Object.freeze({
            valorDiaria: 60,
            valorPorEntrega: 5,
            versao: 'noturno-legado-60-5'
        }),
        noite40e4: Object.freeze({
            valorDiaria: 40,
            valorPorEntrega: 4,
            versao: 'noturno-2026-07-14-40-4'
        }),
        noite60e5: Object.freeze({
            valorDiaria: 60,
            valorPorEntrega: 5,
            versao: 'noturno-2026-08-12-60-5'
        }),
        dia: Object.freeze({
            valorDiaria: 0,
            valorPorEntrega: 9,
            versao: 'diurno-0-9'
        })
    });

    function obterRegraPagamento(turno, dataEntrega) {
        if (turno !== 'Noite') return REGRAS.dia;
        if (dataEntrega >= DATA_INICIO_REGRA_60_5) return REGRAS.noite60e5;
        if (dataEntrega >= DATA_INICIO_REGRA_40_4) return REGRAS.noite40e4;
        return REGRAS.noiteLegado;
    }

    function calcularPagamento(turno, dataEntrega, totalEntregas) {
        const quantidade = Number(totalEntregas);
        if (!Number.isInteger(quantidade) || quantidade < 0) {
            throw new Error('A quantidade de entregas deve ser um inteiro maior ou igual a zero.');
        }

        const regra = obterRegraPagamento(turno, dataEntrega);
        return {
            regra,
            totalEntregas: quantidade,
            totalReceber: regra.valorDiaria + (quantidade * regra.valorPorEntrega)
        };
    }

    return Object.freeze({
        calcularPagamento,
        obterRegraPagamento
    });
});
