
import { createClient } from '@supabase/supabase-js';

/**
 * CONFIGURAÇÃO GLOBAL DO NODO
 * Para que todos os seus amigos entrem automaticamente sem link de convite:
 * 1. No seu painel do Supabase, vá em Project Settings -> API.
 * 2. Copie a 'Project URL' e a 'anon public key'.
 * 3. Se você não usar Variáveis de Ambiente na Vercel, você pode colar elas aqui embaixo entre as aspas.
 */
const GLOBAL_URL = process.env.SUPABASE_URL || localStorage.getItem('CONCORD_SB_URL') || '';
const GLOBAL_KEY = process.env.SUPABASE_ANON_KEY || localStorage.getItem('CONCORD_SB_KEY') || '';

export const isSupabaseConfigured = 
  GLOBAL_URL.length > 0 && 
  GLOBAL_URL.startsWith('http') && 
  GLOBAL_KEY.length > 0;

// Inicializa o cliente único para todos os usuários
export const supabase = isSupabaseConfigured 
  ? createClient(GLOBAL_URL, GLOBAL_KEY) 
  : null as any;

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('CONCORD_SB_URL', url);
  localStorage.setItem('CONCORD_SB_KEY', key);
  window.location.reload();
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('CONCORD_SB_URL');
  localStorage.removeItem('CONCORD_SB_KEY');
  localStorage.removeItem('CONCORD_SESSION');
  window.location.reload();
};
