"use client";

import { useState, useEffect } from "react";
import { UploadCloud, Loader2, ArrowUpRight, ArrowDownRight, DollarSign, Activity, FileText, Lock, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ClientDashboard() {
  const [company, setCompany] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statements, setStatements] = useState<any[]>([]);
  const [activeStatement, setActiveStatement] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setupMockAndFetch();
  }, []);

  useEffect(() => {
    if (!company) return;

    // Realtime Magic: Fica ouvindo o Banco de Dados sem precisar dar F5
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bank_statements',
          filter: `company_id=eq.${company.id}`
        },
        (payload) => {
          fetchStatements(company.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company, supabase]);

  const setupMockAndFetch = async () => {
    setLoading(true);
    // Chama rota auxiliar para criar a empresa caso não exista
    await fetch('/api/setup-mock');

    // Busca a Empresa Demo
    const { data: comp } = await supabase.from('companies').select('*').eq('cnpj', '00000000000191').single();
    if (comp) {
      setCompany(comp);
      fetchStatements(comp.id);
    }
    setLoading(false);
  };

  const fetchStatements = async (companyId: string) => {
    const { data } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (data) setStatements(data);
  };

  const handleUpload = async () => {
    if (!file || !company) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_id", company.id);

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Limpa input e recarrega lotes
      setFile(null);
      fetchStatements(company.id);

    } catch (err: any) {
      setError(err.message || "Erro desconhecido ao enviar.");
    } finally {
      setUploading(false);
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const CATEGORIAS = [
    'Alimentação', 'Transporte', 'Moradia', 'Serviços/Utilidades', 'Lazer',
    'Saúde', 'Salário', 'Investimentos', 'Transferências', 'Outros'
  ];

  const loadDRE = async (statement: any) => {
    if (statement.status !== 'APPROVED') return;

    setActiveStatement({ title: `Extrato: ${statement.month_year}` });
    setIsEditing(false); // Reset edit state when loading a new DRE
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('statement_id', statement.id)
      .order('date', { ascending: false });

    if (data) setTransactions(data);
  };

  const loadAllDRE = async () => {
    const approvedStatements = statements.filter(s => s.status === 'APPROVED');
    if (approvedStatements.length === 0) return;

    setActiveStatement({ title: 'Consolidado (Todos)' });
    setIsEditing(false);

    const statementIds = approvedStatements.map(s => s.id);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .in('statement_id', statementIds)
      .order('date', { ascending: false });

    if (data) setTransactions(data);
  };

  const handleCategoryChange = (transactionId: string, newCategory: string) => {
    setTransactions(prev => prev.map(tx =>
      tx.id === transactionId ? { ...tx, final_category: newCategory } : tx
    ));
  };

  const handleDeleteTx = async (txId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta transação? Isso afetará os cálculos da DRE.")) return;

    // Atualiza a UI imediatamente para sensação de tempo real
    setTransactions(prev => prev.filter(t => t.id !== txId));

    // Exclui do banco de dados
    await supabase.from('transactions').delete().eq('id', txId);
  };

  const saveCorrections = async () => {
    setSaving(true);
    for (const tx of transactions) {
      await supabase
        .from('transactions')
        .update({ final_category: tx.final_category })
        .eq('id', tx.id);
    }
    setSaving(false);
    setIsEditing(false);
    alert("Categorias alteradas e DRE recalculada com sucesso!");
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-slate-100"><Loader2 className="animate-spin w-8 h-8" /></div>;
  }

  const totalEntradas = transactions.filter(t => t.type === 'Entrada').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalSaidas = transactions.filter(t => t.type === 'Saída').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const saldoLiquido = totalEntradas - totalSaidas;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans p-6 md:p-10 select-none">
      <div className="max-w-6xl mx-auto space-y-10">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Painel do Cliente
            </h1>
            <p className="text-slate-400 mt-1">Bem-vindo, <strong className="text-white">{company?.name || 'Carregando...'}</strong></p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Upload Area */}
          <div className="md:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">Enviar Fatura</h2>
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 relative">
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-900/20 file:text-indigo-400 hover:file:bg-indigo-900/30 mb-6"
              />
              {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                {uploading ? "Enviando..." : "Processar Extrato"}
              </button>
            </div>

            <div className="flex items-center justify-between mt-8 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">Meus Extratos</h2>
              {statements.some(s => s.status === 'APPROVED') && (
                <button onClick={loadAllDRE} className="text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition">
                  Consolidar Todos
                </button>
              )}
            </div>
            <div className="space-y-3">
              {statements.map(stmt => (
                <div key={stmt.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">Mês: {stmt.month_year}</span>
                    {stmt.status === 'IN_REVIEW' ? (
                      <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-500/30 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Em Análise
                      </span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-500 text-xs px-2 py-1 rounded border border-emerald-500/30">
                        Liberado
                      </span>
                    )}
                  </div>

                  {stmt.status === 'APPROVED' ? (
                    <button
                      onClick={() => loadDRE(stmt)}
                      className="text-xs bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 w-full py-2 rounded-lg transition"
                    >
                      Visualizar DRE e Relatórios
                    </button>
                  ) : (
                    <div className="text-xs text-slate-500 text-center flex items-center justify-center gap-1 py-1">
                      <Lock className="w-3 h-3" /> Aguardando Equipe Contábil
                    </div>
                  )}
                </div>
              ))}
              {statements.length === 0 && <p className="text-sm text-slate-500">Nenhum extrato processado ainda.</p>}
            </div>
          </div>

          {/* DRE Area */}
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="w-5 h-5" /> Demonstração do Resultado (DRE)</h2>

            {activeStatement ? (
              <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total de Entradas</p>
                    <h3 className="text-2xl font-bold text-emerald-400">$ {totalEntradas.toFixed(2)}</h3>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total de Saídas (Custos)</p>
                    <h3 className="text-2xl font-bold text-rose-400">$ {totalSaidas.toFixed(2)}</h3>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Resultado Líquido</p>
                    <h3 className={`text-2xl font-bold ${saldoLiquido >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      $ {saldoLiquido.toFixed(2)}
                    </h3>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold">Transações Qualificadas ({activeStatement.title})</h3>
                    <div>
                      {!isEditing ? (
                        <button onClick={() => setIsEditing(true)} className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg transition">
                          Ajustar Categorias
                        </button>
                      ) : (
                        <button onClick={saveCorrections} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 disabled:opacity-50">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Salvar Ajustes
                        </button>
                      )}
                    </div>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Categoria Oficial</th><th className="p-3 text-right">Valor ($)</th><th className="p-3 w-10 text-center"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-800/30">
                          <td className="p-3 text-slate-400">{tx.date}</td>
                          <td className="p-3 text-slate-200">{tx.description}</td>
                          <td className="p-3">
                            <select
                              value={tx.final_category || tx.original_category}
                              disabled={!isEditing}
                              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                              className={`bg-indigo-500/10 border ${isEditing ? 'border-indigo-500' : 'border-indigo-500/20'} text-indigo-400 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none font-semibold text-xs ${!isEditing ? 'cursor-not-allowed' : ''}`}
                            >
                              {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          </td>
                          <td className={`p-3 text-right ${tx.type === 'Entrada' ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {tx.type === 'Entrada' ? '+' : '-'} {Number(tx.amount).toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
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
              <div className="bg-slate-900/30 border border-dashed border-slate-800 h-96 rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-4">
                <Activity className="w-16 h-16 opacity-20" />
                <p>Selecione um extrato "Liberado" na lista ao lado.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
