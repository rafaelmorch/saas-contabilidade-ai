import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Check if demo company exists
        const { data: existing } = await supabase.from('companies').select('*').eq('cnpj', '00000000000191').single();

        if (existing) {
            return NextResponse.json({ success: true, message: 'Empresa Demo já existe.', company: existing });
        }

        // Insert Demo Company
        const { data: newCompany, error } = await supabase
            .from('companies')
            .insert({ name: 'Empresa Demo Ltda', cnpj: '00000000000191' })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message, hint: 'Provavelmente bloqueado por RLS. Desative temporariamente para testes anonimos.' });
        }

        return NextResponse.json({ success: true, message: 'Empresa Demo criada!', company: newCompany });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
