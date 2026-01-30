
import { createClient } from '@supabase/supabase-js';

// Tenta obter do ambiente ou do localStorage do navegador
const getSupabaseConfig = () => {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_ANON_KEY;
  
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('CONCORD_SB_URL') : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('CONCORD_SB_KEY') : null;

  return {
    url: envUrl || localUrl || '',
    key: envKey || localKey || ''
  };
};

const config = getSupabaseConfig();

export const isSupabaseConfigured = 
  config.url.length > 0 && 
  config.url.startsWith('http') && 
  config.key.length > 0;

// Inicializa o cliente se tivermos os dados mínimos
export const supabase = isSupabaseConfigured 
  ? createClient(config.url, config.key) 
  : null as any;

// Função para salvar configuração manualmente
export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('CONCORD_SB_URL', url);
  localStorage.setItem('CONCORD_SB_KEY', key);
  window.location.reload();
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('CONCORD_SB_URL');
  localStorage.removeItem('CONCORD_SB_KEY');
  window.location.reload();
};
