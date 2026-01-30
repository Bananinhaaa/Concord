
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured } from './supabaseClient';
import { Message, UserProfile, Chat } from './types';

// LISTA DE NÚMEROS QUE TERÃO ACESSO AO PAINEL ADMIN
const ADMIN_NUMBERS = ['64981183571', '+5564981183571', '5564981183571'];

const SQL_SCHEMA = `-- EXECUTE ISSO NO SQL EDITOR DO SUPABASE
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  phone text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table profiles enable row level security;
create policy "Perfis visíveis para todos" on profiles for select using (true);
create policy "Usuários editam próprio perfil" on profiles for update using (auth.uid() = id);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id),
  receiver_id uuid,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  contact_id uuid references profiles(id),
  status text default 'accepted',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
`;

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const s = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-20 h-20' : 'w-12 h-12';
  return (
    <div className={`${s} bg-white rounded-xl flex items-center justify-center shadow-2xl`}>
      <div className="w-1/2 h-1/2 bg-black rotate-45"></div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chats' | 'contacts' | 'profile' | 'admin'>('chats');
  const [adminSubView, setAdminSubView] = useState<'supabase' | 'sql'>('supabase');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');

  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newContactPhone, setNewContactPhone] = useState('');

  const [sbUrl, setSbUrl] = useState(localStorage.getItem('CONCORD_SB_URL') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('CONCORD_SB_KEY') || '');

  const [phone, setPhone] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get('join');
    if (joinToken) {
      try {
        const decoded = atob(joinToken);
        const { url, key } = JSON.parse(decoded);
        if (url && key) {
          localStorage.setItem('CONCORD_SB_URL', url);
          localStorage.setItem('CONCORD_SB_KEY', key);
          window.location.href = window.location.origin;
          return;
        }
      } catch (e) { console.error("Token de convite inválido"); }
    }

    const init = async () => {
      setLoading(true);
      const stored = localStorage.getItem('CONCORD_SESSION');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSession(parsed);
        await syncProfile(parsed.user);
      }
      setLoading(false);
    };
    init();
  }, []);

  const syncProfile = async (user: any) => {
    if (!isSupabaseConfigured || !supabase) return;

    const userPhone = user.phone || phone;
    const cleanPhone = userPhone.replace(/\D/g, '');
    // Verifica se é admin limpando todos os caracteres não numéricos
    const isAdmin = ADMIN_NUMBERS.some(n => n.replace(/\D/g, '') === cleanPhone);
    
    try {
      const { data: remote } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      let profile = remote;

      if (!remote) {
        const { data: inserted } = await supabase.from('profiles').insert({
          id: user.id,
          phone: userPhone,
          display_name: `Agente_${userPhone.slice(-4)}`,
          is_admin: isAdmin
        }).select().single();
        profile = inserted;
      } else if (remote.is_admin !== isAdmin) {
        // Atualiza status de admin se necessário
        const { data: updated } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', user.id).select().single();
        profile = updated;
      }

      if (profile) {
        setUserProfile(profile);
        setEditName(profile.display_name || '');
        setEditBio(profile.bio || '');
        setEditAvatar(profile.avatar_url || '');
      }
    } catch (e) { 
      setUserProfile({ id: user.id, phone: userPhone, is_admin: isAdmin } as any);
    }
  };

  const generateInviteLink = () => {
    const data = JSON.stringify({ url: sbUrl, key: sbKey });
    const token = btoa(data);
    return `${window.location.origin}?join=${token}`;
  };

  const handleUpdateProfile = async () => {
    if (!userProfile || !supabase) return;
    const updateData = { display_name: editName, bio: editBio, avatar_url: editAvatar };
    await supabase.from('profiles').update(updateData).eq('id', userProfile.id);
    setUserProfile({ ...userProfile, ...updateData });
    alert("Identidade Sincronizada.");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAddContact = async () => {
    if (!supabase || !isSupabaseConfigured) return;
    const cleanSearch = newContactPhone.replace(/\D/g, '');
    const { data: allProfiles } = await supabase.from('profiles').select('*');
    const target = allProfiles?.find(p => p.phone?.replace(/\D/g, '') === cleanSearch);
    
    if (!target) return alert("Agente não encontrado no banco de dados.");
    
    await supabase.from('contacts').insert({ user_id: session.user.id, contact_id: target.id });
    setNewContactPhone('');
    fetchContacts();
    alert("Agente vinculado.");
  };

  const fetchContacts = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('contacts').select('contact_id').eq('user_id', session.user.id);
    if (data) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', data.map(c => c.contact_id));
      if (p) setContacts(p);
    }
  };

  const fetchChats = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('messages').select('sender_id, receiver_id').or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`);
    if (data) {
      const ids = Array.from(new Set(data.flatMap((m: any) => m.sender_id === session.user.id ? m.receiver_id : m.sender_id)));
      const { data: profiles } = await supabase.from('profiles').select('id, phone, display_name, avatar_url').in('id', ids);
      setChats(profiles || []);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeChat || !supabase || !session) return;
    await supabase.from('messages').insert({ sender_id: session.user.id, receiver_id: activeChat.id, content: inputValue });
    setInputValue('');
  };

  useEffect(() => {
    if (session && isSupabaseConfigured) {
      fetchChats();
      fetchContacts();
      const sub = supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchChats();
      }).subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, [session, activeChat, view]);

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-8 h-8 border-4 border-white/10 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] mt-10 animate-in">
        {!isSupabaseConfigured ? (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-black uppercase text-red-500">Nodo Offline</h2>
            <p className="text-xs text-zinc-500">Aguardando Link de Convite do Administrador...</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if(isOtpSent) { const s = {user: {id: 'u-'+phone.replace(/\D/g,''), phone}}; localStorage.setItem('CONCORD_SESSION', JSON.stringify(s)); setSession(s); syncProfile(s.user); } else setIsOtpSent(true); }} className="space-y-4">
            <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-widest">Acesso Noir</h2>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Número de Telefone..." className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/30 transition-all" />
            {isOtpSent && <input placeholder="Código de Verificação" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl font-bold animate-in" />}
            <button type="submit" className="w-full noir-button p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest">{isOtpSent ? 'Confirmar' : 'Receber Código'}</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white font-sans overflow-hidden">
      <aside className={`${activeChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <div className="flex gap-4 items-center">
             {userProfile?.is_admin && <button onClick={() => setView('admin')} className={`text-[9px] font-black uppercase px-4 py-2 rounded-xl border-2 transition-all ${view === 'admin' ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'text-white border-white/20'}`}>Painel</button>}
             <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-[9px] font-bold uppercase text-zinc-600 hover:text-white transition-colors">Sair</button>
          </div>
        </div>
        
        <nav className="flex flex-col gap-1 mb-6">
          <button onClick={() => setView('chats')} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'chats' ? 'bg-white text-black' : 'hover:bg-white/5 text-zinc-400'}`}>Mensagens</button>
          <button onClick={() => setView('contacts')} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'contacts' ? 'bg-white text-black' : 'hover:bg-white/5 text-zinc-400'}`}>Sincronia</button>
          <button onClick={() => setView('profile')} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'profile' ? 'bg-white text-black' : 'hover:bg-white/5 text-zinc-400'}`}>Identidade</button>
        </nav>

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
          {chats.map(chat => (
            <button key={chat.id} onClick={() => { setActiveChat(chat); setView('chats'); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat?.id === chat.id ? 'bg-white text-black' : 'hover:bg-white/5 bg-white/[0.02]'}`}>
              <div className="w-11 h-11 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 shadow-lg border border-white/10">
                 {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : '👤'}
              </div>
              <div className="text-left overflow-hidden">
                <p className="font-black text-[11px] uppercase truncate">{chat.display_name || chat.phone}</p>
                <p className="text-[9px] opacity-40 uppercase font-bold">Transmitindo...</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl">
        {view === 'admin' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <header className="flex gap-12 mb-12 border-b border-white/5 pb-6">
               <button onClick={() => setAdminSubView('supabase')} className={`text-[11px] font-black uppercase tracking-widest transition-all ${adminSubView === 'supabase' ? 'text-blue-500 border-b-2 border-blue-500 pb-6 -mb-6.5' : 'text-zinc-600'}`}>Infraestrutura</button>
               <button onClick={() => setAdminSubView('sql')} className={`text-[11px] font-black uppercase tracking-widest transition-all ${adminSubView === 'sql' ? 'text-green-500 border-b-2 border-green-500 pb-6 -mb-6.5' : 'text-zinc-600'}`}>SQL Editor</button>
            </header>

            {adminSubView === 'supabase' ? (
              <div className="max-w-xl space-y-10">
                <div className="p-8 bg-blue-500/10 rounded-[3rem] border border-blue-500/20 space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <h4 className="text-[11px] font-black uppercase text-blue-400 tracking-widest">Convite Automático</h4>
                   </div>
                   <p className="text-[12px] text-zinc-400 leading-relaxed">Este link configura o Supabase dos seus Agentes automaticamente. Envie para quem você quer que entre na rede.</p>
                   <button onClick={() => { navigator.clipboard.writeText(generateInviteLink()); alert("Link de Convite Copiado!"); }} className="w-full bg-white text-black p-5 rounded-2xl text-[10px] font-black uppercase shadow-[0_10px_30px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all">Copiar Link de Convite</button>
                </div>

                <div className="space-y-6 pt-10 border-t border-white/5">
                  <h3 className="text-[12px] font-black uppercase opacity-40">Dados do Nodo Local</h3>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase opacity-30 ml-2">URL Supabase</label>
                      <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} className="w-full bg-zinc-900 p-5 rounded-2xl text-[11px] outline-none border border-white/5 focus:border-white/20" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase opacity-30 ml-2">Anon Key</label>
                      <input value={sbKey} onChange={e => setSbKey(e.target.value)} className="w-full bg-zinc-900 p-5 rounded-2xl text-[11px] outline-none border border-white/5 focus:border-white/20" />
                    </div>
                  </div>
                  <button onClick={() => saveSupabaseConfig(sbUrl, sbKey)} className="w-full bg-zinc-800 p-5 rounded-2xl font-black uppercase text-[10px] border border-white/10 hover:bg-zinc-700 transition-all">Atualizar Nodo Admin</button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in">
                 <h2 className="text-3xl font-black uppercase tracking-tighter text-green-500">Node Script</h2>
                 <p className="text-xs text-zinc-500">Copie o script abaixo e cole no SQL Editor do seu projeto Supabase para habilitar o banco de dados.</p>
                 <pre className="bg-zinc-900/50 p-8 rounded-[2rem] text-[10px] text-green-400/80 overflow-x-auto font-mono custom-scrollbar border border-white/5">{SQL_SCHEMA}</pre>
                 <button onClick={() => { navigator.clipboard.writeText(SQL_SCHEMA); alert("Script Copiado!"); }} className="bg-white text-black px-10 py-5 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:scale-105 transition-all">Copiar Script SQL</button>
              </div>
            )}
          </div>
        ) : view === 'contacts' ? (
          <div className="flex-1 p-12 overflow-y-auto animate-in">
            <div className="flex justify-between items-center mb-12">
              <h1 className="text-4xl font-black uppercase tracking-tighter">Sincronia</h1>
              <div className="flex gap-4">
                <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Número do Agente..." className="bg-zinc-900 p-5 rounded-2xl text-xs border border-white/5 w-72 focus:border-white/30 outline-none" />
                <button onClick={handleAddContact} className="bg-white text-black px-10 rounded-2xl text-[10px] font-black uppercase shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:scale-105 transition-all">Conectar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {contacts.map(c => (
                <div key={c.id} className="glass p-10 rounded-[3.5rem] flex flex-col items-center gap-6 text-center border border-white/[0.03] hover:border-white/10 transition-all group">
                   <div className="w-24 h-24 rounded-[2.8rem] bg-zinc-900 overflow-hidden shadow-2xl border border-white/10 group-hover:scale-105 transition-all">
                      {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-3xl">👤</div>}
                   </div>
                   <div>
                      <h3 className="font-black text-[13px] uppercase tracking-wide">{c.display_name || c.phone}</h3>
                      <p className="text-[10px] opacity-30 font-bold mt-1 uppercase">Sinal Verificado</p>
                   </div>
                   <button onClick={() => { setActiveChat({id: c.id, display_name: c.display_name, avatar_url: c.avatar_url}); setView('chats'); }} className="w-full bg-white text-black p-5 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:bg-zinc-200 transition-all">Abrir Canal</button>
                </div>
              ))}
              {contacts.length === 0 && (
                <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[4rem] opacity-20">
                   <p className="text-[11px] font-black uppercase tracking-widest">Nenhuma sincronia ativa</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'profile' ? (
          <div className="flex-1 p-12 overflow-y-auto animate-in">
            <h1 className="text-4xl font-black uppercase mb-14 tracking-tighter">Identidade</h1>
            <div className="max-w-2xl space-y-10 bg-white/[0.01] p-12 rounded-[4.5rem] border border-white/5 shadow-3xl">
                <div onClick={() => fileInputRef.current?.click()} className="w-44 h-44 rounded-[3.5rem] bg-zinc-900 mx-auto overflow-hidden cursor-pointer border-2 border-dashed border-white/10 hover:border-white/40 transition-all flex items-center justify-center group relative">
                   {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover group-hover:opacity-50 transition-all" /> : <span className="opacity-20 text-5xl">+</span>}
                   <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-[10px] font-black uppercase bg-black/50 px-4 py-2 rounded-lg">Alterar</span>
                   </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-30 ml-4">Codinome</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Agente X..." className="w-full bg-zinc-900 p-6 rounded-3xl text-[13px] font-black outline-none border border-white/5 focus:border-white/20 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-30 ml-4">Diretrizes (Bio)</label>
                    <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Escreva algo sobre você..." className="w-full h-40 bg-zinc-900 p-6 rounded-3xl text-[13px] outline-none border border-white/5 resize-none focus:border-white/20 transition-all" />
                  </div>
                </div>
                <button onClick={handleUpdateProfile} className="w-full bg-white text-black p-7 rounded-[2.8rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-[0_15px_40px_rgba(255,255,255,0.15)] hover:scale-[1.01] transition-all">Sincronizar Identidade</button>
            </div>
          </div>
        ) : activeChat ? (
          <>
            <header className="h-28 flex items-center px-12 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-xl">
                {activeChat.avatar_url ? <img src={activeChat.avatar_url} className="w-full h-full object-cover" /> : '👤'}
              </div>
              <div className="ml-6 flex-1">
                <h2 className="text-base font-black uppercase tracking-tight leading-none">{activeChat.display_name || activeChat.phone}</h2>
                <div className="flex items-center gap-2 mt-2">
                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></div>
                   <span className="text-[9px] font-black uppercase opacity-40 tracking-widest">Sinal Noir Criptografado</span>
                </div>
              </div>
              <button onClick={() => setActiveChat(null)} className="lg:hidden text-[10px] font-black uppercase px-5 py-3 rounded-xl border border-white/10">Voltar</button>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar bg-black/10">
              {messages.filter(m => (m.sender_id === session.user.id && m.receiver_id === activeChat.id) || (m.sender_id === activeChat.id && m.receiver_id === session.user.id)).map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session?.user?.id ? 'justify-end' : 'justify-start'} animate-in`}>
                  <div className={`max-w-[70%] p-6 rounded-[2.5rem] shadow-2xl relative ${m.sender_id === session?.user?.id ? 'bg-white text-black rounded-tr-none' : 'bg-zinc-900 text-white border border-white/10 rounded-tl-none'}`}>
                    <p className="text-sm font-semibold leading-relaxed tracking-wide">{m.content}</p>
                    <span className={`text-[8px] font-black uppercase mt-3 block opacity-30 ${m.sender_id === session?.user?.id ? 'text-right' : 'text-left'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • Transmitido
                    </span>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-5 select-none"><Logo size="md" /><p className="mt-6 text-[11px] font-black uppercase tracking-[0.5em]">Frequência Vazia</p></div>}
            </div>
            <div className="p-12 pt-0 bg-gradient-to-t from-black to-transparent">
               <form onSubmit={sendMessage} className="bg-zinc-900/40 backdrop-blur-3xl rounded-[3.5rem] p-3 flex items-center gap-3 border border-white/5 shadow-2xl focus-within:border-white/20 transition-all">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Escreva sua mensagem..." className="flex-1 bg-transparent outline-none px-8 py-5 text-sm font-semibold placeholder:text-zinc-700" />
                  <button type="submit" className="w-16 h-16 bg-white text-black rounded-[2.5rem] flex items-center justify-center shadow-[0_10px_30px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all">➤</button>
               </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5 select-none animate-pulse">
            <Logo size="lg" />
            <p className="text-[11px] font-black uppercase tracking-[1.5em] mt-12">Concord Digital Node</p>
            <p className="text-[9px] font-bold uppercase mt-4 tracking-[0.5em]">Noir Peak Operations</p>
          </div>
        )}
      </main>
    </div>
  );
}
