"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle, FileText, Activity, Users, Trash2 } from "lucide-react";

export default function AdminDashboard() {
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState("");
    const [statements, setStatements] = useState<any[]>([]);
    const [selectedStatementId, setSelectedStatementId] = useState("");
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const supabase = createClient();

    const CATEGORIAS = [
        'Alimentação', 'Transporte', 'Moradia', 'Serviços/Utilidades', 'Lazer',
        'Saúde', 'Salário', 'Investimentos', 'Transferências', 'Outros'
    ];

    useEffect(() => {
        fetchCompanies();
    }, []);

    useEffect(() => {
        if (selectedCompanyId) {
            fetchStatements(selectedCompanyId);
            setTransactions([]);
            setSelectedStatementId("");
        }
    }, [selectedCompanyId]);

    useEffect(() => {
        if (selectedStatementId) {
            fetchTransactions(selectedStatementId);
        }
    }, [selectedStatementId]);

    const fetchCompanies = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('companies').select('*');
        if (data) {
            setCompanies(data);
            if (data.length > 0) setSelectedCompanyId(data[0].id);
        }
        setLoading(false);
    };

    const fetchStatements = async (companyId: string) => {
        const { data, error } = await supabase
            .from('bank_statements')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (data) setStatements(data);
    };

    const fetchTransactions = async (statementId: string) => {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('statement_id', statementId)
            .order('date', { ascending: false });

        if (data) setTransactions(data);
    };

    const handleCategoryChange = (transactionId: string, newCategory: string) => {
        setTransactions(prev => prev.map(tx =>
            tx.id === transactionId ? { ...tx, final_category: newCategory } : tx
        ));
    };

    const handleDeleteTx = async (txId: string) => {
        if (!confirm("Tem certeza que deseja excluir esta transação?")) return;

        // Atualiza a UI imediatamente para sensação de tempo real
        setTransactions(prev => prev.filter(t => t.id !== txId));

        // Exclui do banco de dados
        await supabase.from('transactions').delete().eq('id', txId);
    };

    const handleAprovar = async () => {
        if (!selectedStatementId || transactions.length === 0) return;
        setSaving(true);

        // 1. Atualizar transacoes no Supabase
        for (const tx of transactions) {
            await supabase
                .from('transactions')
                .update({ final_category: tx.final_category, status: 'APPROVED' })
                .eq('id', tx.id);
        }

        // 2. Atualizar lote
        await supabase
            .from('bank_statements')
            .update({ status: 'APPROVED' })
            .eq('id', selectedStatementId);

        alert("Lote aprovado com sucesso! O cliente já pode ver as métricas.");

        setSaving(false);
        // Don't deselect, just refresh to show it as approved
        fetchStatements(selectedCompanyId);
    };

    const currentStatement = statements.find(s => s.id === selectedStatementId);
    const isApproved = currentStatement?.status === 'APPROVED';
    const [isEditing, setIsEditing] = useState(false);

    // Reseta estado de edição
    useEffect(() => {
        setIsEditing(!isApproved);
    }, [selectedStatementId, isApproved]);

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100"><Loader2 className="animate-spin w-8 h-8" /></div>;
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-10 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">

                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Users className="text-indigo-400" />
                            Painel Contábil - Auditoria (HITL)
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">Revise e aprove as classificações sugeridas pela Inteligência Artificial.</p>
                    </div>

                    <div className="w-full md:w-80">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Empresa Cliente</label>
                        <select
                            value={selectedCompanyId}
                            onChange={(e) => setSelectedCompanyId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors"
                        >
                            <option value="" disabled>Selecione uma empresa</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Coluna Lotes */}
                    <div className="lg:col-span-1 space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-slate-400" />
                            Histórico de Lotes
                        </h2>
                        <div className="space-y-3">
                            {statements.length === 0 ? (
                                <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-slate-500 text-sm text-center">
                                    Nenhum extrato processado para esta empresa.
                                </div>
                            ) : (
                                statements.map(stmt => (
                                    <button
                                        key={stmt.id}
                                        onClick={() => setSelectedStatementId(stmt.id)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${selectedStatementId === stmt.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}
                                    >
                                        <div className="font-bold text-white">Extrato {stmt.month_year}</div>
                                        {stmt.status === 'IN_REVIEW' ? (
                                            <div className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                                                <Activity className="w-3 h-3" /> Aguardando Revisão
                                            </div>
                                        ) : (
                                            <div className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> Aprovado
                                            </div>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Coluna Area de Trabalho */}
                    <div className="lg:col-span-3">
                        {selectedStatementId ? (
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[700px]">
                                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                                    <h3 className="font-bold text-lg">
                                        {isApproved && !isEditing ? "Lote Auditado" : "Revisão de Transações"}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {isApproved && !isEditing && (
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-lg font-semibold text-sm transition"
                                            >
                                                Corrigir Classificações
                                            </button>
                                        )}
                                        {isEditing && (
                                            <button
                                                onClick={handleAprovar}
                                                disabled={saving}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-semibold text-sm transition flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                {isApproved ? "Salvar Correções" : "Aprovar e Liberar DRE"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-y-auto flex-1 p-0">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-slate-950 sticky top-0 z-10 shadow-md">
                                            <tr className="border-b border-slate-800 text-slate-400">
                                                <th className="p-4">Data</th>
                                                <th className="p-4">Descrição</th>
                                                <th className="p-4">Categoria Original (IA)</th>
                                                <th className="p-4">Categoria Final (Auditoria)</th>
                                                <th className="p-4 text-right">Valor ($)</th>
                                                <th className="p-4 w-10 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {transactions.map(tx => (
                                                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="p-4 text-slate-300 font-medium whitespace-nowrap">{tx.date}</td>
                                                    <td className="p-4 text-slate-100">{tx.description}</td>
                                                    <td className="p-4 text-slate-500 text-xs line-through">{tx.original_category}</td>
                                                    <td className="p-4">
                                                        <select
                                                            value={tx.final_category || tx.original_category}
                                                            disabled={!isEditing}
                                                            onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                                                            className={`bg-slate-950 border border-slate-700 text-slate-200 rounded-md px-3 py-1.5 focus:border-indigo-500 outline-none w-full appearance-none font-semibold text-xs ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className={`p-4 text-right font-bold whitespace-nowrap ${tx.type === 'Entrada' ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                        {tx.type === 'Entrada' ? '+' : '-'} $ {Number(tx.amount).toFixed(2).replace('.', ',')}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={() => handleDeleteTx(tx.id)}
                                                            disabled={!isEditing}
                                                            className={`text-slate-500 hover:text-rose-500 transition-colors ${!isEditing ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                            title="Excluir Transação"
                                                        >
                                                            <Trash2 className="w-4 h-4 mx-auto" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full min-h-[400px] border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 gap-4">
                                <FileText className="w-12 h-12 opacity-20" />
                                <p>Selecione um lote no menu lateral para iniciar ou visualizar a revisão.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
