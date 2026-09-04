import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const companyId = formData.get('company_id') as string;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado na requisição.' }, { status: 400 });
        }

        if (!companyId) {
            return NextResponse.json({ error: 'O ID da empresa (company_id) é obrigatório.' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Criar o registro na tabela bank_statements como IN_REVIEW
        // Utilizando o mês atual como month_year por padrão (pode ser iterado no futuro)
        const date = new Date();
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;

        const { data: statement, error: statementError } = await supabase
            .from('bank_statements')
            .insert({
                company_id: companyId,
                month_year: monthYear,
                status: 'IN_REVIEW'
            })
            .select()
            .single();

        if (statementError || !statement) {
            console.error("Erro no Supabase (Bank Statements):", statementError);
            return NextResponse.json({ error: 'Erro ao registrar o lote no banco de dados.' }, { status: 500 });
        }

        // 2. Extrair dados via Gemini
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type || 'application/pdf';

        const ai = new GoogleGenAI(); // Utiliza a chave em process.env.GEMINI_API_KEY

        const categoriasEnum = [
            'Alimentação', 'Transporte', 'Moradia', 'Serviços/Utilidades', 'Lazer',
            'Saúde', 'Salário', 'Investimentos', 'Transferências', 'Outros'
        ];

        const responseSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    data: { type: Type.STRING, description: "Data da transação no formato YYYY-MM-DD" },
                    descricao: { type: Type.STRING, description: "Descrição detalhada da transação" },
                    categoria: {
                        type: Type.STRING,
                        description: "Categoria sugerida para a transação",
                        enum: categoriasEnum
                    },
                    tipo: { type: Type.STRING, description: "Entrada ou Saída", enum: ["Entrada", "Saída"] },
                    valor: { type: Type.NUMBER, description: "Valor monetário da transação (absoluto)" }
                },
                required: ["data", "descricao", "categoria", "tipo", "valor"]
            }
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Extraia as transações financeiras deste documento (extrato bancário). Classifique obrigatoriamente a Categoria e garanta a ordenação das transações pela data (da mais recente para a mais antiga). Retorne os dados estritamente conforme o JSON Schema de array solicitado.' },
                        {
                            inlineData: {
                                data: buffer.toString('base64'),
                                mimeType
                            }
                        }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            }
        });

        const text = response.text;

        if (!text) {
            // Se falhou feio na extração, removemos o lote recém-criado em IN_REVIEW
            await supabase.from('bank_statements').delete().eq('id', statement.id);
            return NextResponse.json({ error: 'A inteligência artificial não retornou dados processados.' }, { status: 500 });
        }

        let extractedTransactions: any[];
        try {
            extractedTransactions = JSON.parse(text);
            if (!Array.isArray(extractedTransactions)) throw new Error('Não é um array');
        } catch (e: any) {
            await supabase.from('bank_statements').delete().eq('id', statement.id);
            console.error("Failed to parse JSON response", text);
            return NextResponse.json({ error: `Falha ao fazer parse do resultado da IA: ${e.message}` }, { status: 500 });
        }

        // 3. Inserir em lote na tabela transactions
        const transactionsToInsert = extractedTransactions.map(tx => ({
            statement_id: statement.id,
            company_id: companyId,
            date: tx.data,
            description: tx.descricao,
            original_category: tx.categoria,
            final_category: tx.categoria, // Começa igual a original, a contabilidade altera se preciso
            type: tx.tipo,
            amount: tx.valor,
            status: 'IN_REVIEW'
        }));

        const { error: transactionsError } = await supabase
            .from('transactions')
            .insert(transactionsToInsert);

        if (transactionsError) {
            console.error("Erro no Supabase (Transactions):", transactionsError);
            // Poderíamos deletar a statement num fluxo transacional, mas o ideal seria transações fortes via Postgres function, ou pelo menos deletar aqui:
            await supabase.from('bank_statements').delete().eq('id', statement.id);
            return NextResponse.json({ error: 'Erro ao registrar as transações extraídas no banco de dados.' }, { status: 500 });
        }

        // 4. Retornar resposta de sucesso
        return NextResponse.json({
            success: true,
            message: 'Extrato recebido, pré-processado pela IA e encaminhado com sucesso para análise da Equipe Contábil.',
            statementId: statement.id,
            totalTransactions: transactionsToInsert.length
        });

    } catch (error: any) {
        console.error("Error processing request:", error);

        let errorMessage = 'Erro interno no servidor.';
        if (error.status === 404) {
            errorMessage = 'Configuração do modelo falhou. Gemini-3.6-flash instável ou 404.';
        } else if (error.message?.includes('API key')) {
            errorMessage = 'Erro na chave de API do Gemini.';
        } else if (error.message) {
            errorMessage = `Erro sistêmico: ${error.message}`;
        }

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
