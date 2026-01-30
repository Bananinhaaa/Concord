
import { createClient } from '@supabase/supabase-js';

// TENTE COLOCAR SUAS CHAVES AQUI ENTRE AS ASPAS PARA CONFIGURAÇÃO PERMANENTE
const HARDCODED_URL = ''; 
const HARDCODED_KEY = '';

const GLOBAL_URL = HARDCODED_URL || process.env.SUPABASE_URL || localStorage.getItem('CONCORD_SB_URL') || '';
const GLOBAL_KEY = HARDCODED_KEY || process.env.SUPABASE_ANON_KEY || localStorage.getItem('CONCORD_SB_KEY') || '';

export const isSupabaseConfigured = 
  GLOBAL_URL.length > 0 && 
  GLOBAL_URL.startsWith('http') && 
  GLOBAL_KEY.length > 0;

// Inicializa o cliente. Se não houver config, retorna um proxy para evitar erros de 'undefined'
export const supabase = isSupabaseConfigured 
  ? createClient(GLOBAL_URL, GLOBAL_KEY) 
  : null;

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('CONCORD_SB_URL', url);
  localStorage.setItem('CONCORD_SB_KEY', key);
  window.location.reload();
};

export const clearSupabaseConfig = () => {
  localStorage.clear();
  window.location.reload();
};
