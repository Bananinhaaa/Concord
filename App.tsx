
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat, Group, Contact } from './types';

const ADMIN_NUMBERS = ['64981183571', '+5564981183571', '5564981183571'];
const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'; 

const SQL_SCHEMA = `-- 1. TABELA DE PERFIS
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  phone text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. HABILITAR BUSCA ENTRE USUÁRIOS (RLS)
-- Sem isso, um usuário não consegue "achar" o outro.
alter table profiles enable row level security;

-- Permitir que qualquer pessoa logada veja os perfis (necessário para busca)
create policy "Perfis visíveis para todos" on profiles for select using (true);

-- Permitir que o usuário edite apenas o próprio perfil
create policy "Usuários editam próprio perfil" on profiles for update using (auth.uid() = id);

-- 3. MENSAGENS E RELAÇÕES
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id),
  receiver_id uuid,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  contact_id uuid references profiles(id),
  status text default 'accepted',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- INSTRUÇÃO DE STORAGE:
-- Vá em STORAGE -> NEW BUCKET -> Nome: 'avatars' -> Marque 'Public bucket'.
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
  const [view, setView] = useState<'chats' | 'groups' | 'contacts' | 'profile' | 'admin'>('chats');
  const [adminSubView, setAdminSubView] = useState<'supabase' | 'users' | 'sql'>('supabase');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');

  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const [sbUrl, setSbUrl] = useState(localStorage.getItem('CONCORD_SB_URL') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('CONCORD_SB_KEY') || '');

  const [phone, setPhone] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    const userPhone = user.phone || phone || '';
    const cleanPhone = userPhone.replace(/\D/g, '');
    const isAdmin = ADMIN_NUMBERS.some(n => cleanPhone.includes(n.replace(/\D/g, '')));
    
    const localKey = `CONCORD_PROFILE_${user.id || 'mock'}`;
    const localData = localStorage.getItem(localKey);
    let profile = localData ? JSON.parse(localData) : null;

    if (supabase && isSupabaseConfigured) {
      try {
        const { data: remote } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (remote) {
          profile = { ...profile, ...remote };
        } else {
          const { data: inserted } = await supabase.from('profiles').insert({
            id: user.id,
            phone: userPhone,
            display_name: profile?.display_name || `Agente_${userPhone.slice(-4)}`,
            is_admin: isAdmin
          }).select().single();
          if (inserted) profile = inserted;
        }
      } catch (e) { console.warn("Sync: Gerenciando perfil..."); }
    }

    if (!profile) {
      profile = {
        id: user.id || 'mock-' + cleanPhone,
        phone: userPhone,
        display_name: `Agente_${userPhone.slice(-4)}`,
        is_admin: isAdmin,
        avatar_url: '',
        bio: ''
      };
    }

    if (isAdmin) profile.is_admin = true;

    setUserProfile(profile);
    setEditName(profile.display_name || '');
    setEditBio(profile.bio || '');
    setEditAvatar(profile.avatar_url || '');
    localStorage.setItem(localKey, JSON.stringify(profile));
  };

  const handleUpdateProfile = async () => {
    if (!userProfile) return;
    const updateData = { display_name: editName, bio: editBio, avatar_url: editAvatar };
    const localKey = `CONCORD_PROFILE_${userProfile.id}`;
    const updatedProfile = { ...userProfile, ...updateData };
    localStorage.setItem(localKey, JSON.stringify(updatedProfile));

    if (supabase && isSupabaseConfigured) {
      await supabase.from('profiles').update(updateData).eq('id', userProfile.id);
    }

    setUserProfile(updatedProfile);
    alert("Identidade Atualizada.");
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
    if (!supabase || !isSupabaseConfigured || !session) return alert("Configure o Supabase primeiro.");
    
    const cleanSearch = newContactPhone.replace(/\D/g, '');
    if (!cleanSearch) return alert("Digite um número.");

    // Busca o usuário pelo telefone (limpo)
    const { data: allProfiles, error } = await supabase.from('profiles').select('*');
    if (error) return alert("Erro ao acessar rede. Verifique o SQL Editor.");

    const target = allProfiles?.find(p => p.phone?.replace(/\D/g, '') === cleanSearch);
    
    if (!target) return alert("Agente não encontrado. Ele precisa entrar no site ao menos uma vez.");
    if (target.id === session.user.id) return alert("Você não pode adicionar a si mesmo.");

    await supabase.from('contacts').insert({ user_id: session.user.id, contact_id: target.id });
    setNewContactPhone('');
    fetchContacts();
    alert(`Agente ${target.display_name || target.phone} adicionado.`);
  };

  const fetchContacts = async () => {
    if (!supabase || !isSupabaseConfigured || !session) return;
    const { data } = await supabase.from('contacts').select('contact_id').eq('user_id', session.user.id);
    if (data) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', data.map(c => c.contact_id));
      if (p) setContacts(p);
    }
  };

  const fetchChats = async () => {
    if (!supabase || !isSupabaseConfigured || !session) return;
    const { data } = await supabase.from('messages').select('sender_id, receiver_id').or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`);
    if (data) {
      const ids = Array.from(new Set(data.flatMap((m: any) => m.sender_id === session.user.id ? m.receiver_id : m.sender_id)));
      const { data: profiles } = await supabase.from('profiles').select('id, phone, display_name, avatar_url').in('id', ids);
      setChats(profiles || []);
    }
  };

  const fetchGroups = async () => {
    if (!supabase || !isSupabaseConfigured) return;
    const { data } = await supabase.from('groups').select('*');
    if (data) setGroups(data);
  };

  const handleCreateGroup = async () => {
    if (!supabase || !session) return;
    await supabase.from('groups').insert({ name: newGroupName, description: newGroupDesc, created_by: session.user.id });
    setNewGroupName(''); setNewGroupDesc('');
    fetchGroups();
    alert("Grupo Criado.");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || (!activeChat && !activeGroup) || !supabase || !session) return;
    const targetId = activeChat?.id || activeGroup?.id;
    await supabase.from('messages').insert({ sender_id: session.user.id, receiver_id: targetId, content: inputValue });
    setInputValue('');
  };

  useEffect(() => {
    if (session) { fetchChats(); fetchGroups(); fetchContacts(); }
  }, [session, view]);

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] mt-10 animate-in">
        <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-widest">{isOtpSent ? 'Validar' : 'Acesso Noir'}</h2>
        <form onSubmit={(e) => { e.preventDefault(); if(isOtpSent) { const s = {user: {id: 'u-'+phone.replace(/\D/g,''), phone}}; localStorage.setItem('CONCORD_SESSION', JSON.stringify(s)); setSession(s); syncProfile(s.user); } else setIsOtpSent(true); }} className="space-y-4">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Seu Telefone..." className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/30" />
          {isOtpSent && <input placeholder="000000" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl font-bold" />}
          <button type="submit" className="w-full noir-button p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest mt-4">Sincronizar</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white font-sans overflow-hidden">
      <aside className={`${activeChat || activeGroup ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-8">
          <Logo size="sm" />
          <div className="flex gap-4">
             {userProfile?.is_admin && <button onClick={() => setView('admin')} className={`text-[9px] font-bold uppercase px-3 py-1 rounded-lg border-2 ${view === 'admin' ? 'bg-white text-black border-white' : 'text-white border-white/20 hover:border-white'}`}>Admin</button>}
             <button onClick={() => { localStorage.removeItem('CONCORD_SESSION'); setSession(null); }} className="text-[9px] font-bold uppercase text-zinc-600 hover:text-red-500 transition-colors">Sair</button>
          </div>
        </div>
        
        <div onClick={() => setView('profile')} className={`flex items-center gap-4 mb-8 p-4 rounded-3xl border transition-all cursor-pointer ${view === 'profile' ? 'bg-white text-black border-white shadow-xl' : 'bg-white/[0.03] border-white/5 hover:bg-white/5'}`}>
           <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10">
              {userProfile?.avatar_url ? <img src={userProfile.avatar_url} className="w-full h-full object-cover" /> : '👤'}
           </div>
           <div className="overflow-hidden">
              <p className="font-bold text-xs truncate">{userProfile?.display_name || 'Agente'}</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest ${view === 'profile' ? 'text-black/40' : 'opacity-30'}`}>{userProfile?.phone}</p>
           </div>
        </div>

        <nav className="flex flex-col gap-1 mb-6">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Menu</span>
            <button onClick={() => setView('contacts')} title="Nova Conversa" className="w-8 h-8 bg-white text-black rounded-xl flex items-center justify-center text-sm font-bold hover:scale-110 active:scale-95 transition-all shadow-xl">+</button>
          </div>
          <button onClick={() => setView('chats')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left transition-all ${view === 'chats' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Mensagens</button>
          <button onClick={() => setView('groups')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left transition-all ${view === 'groups' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Coletivos</button>
          <button onClick={() => setView('contacts')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left transition-all ${view === 'contacts' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Sincronia</button>
          <button onClick={() => setView('profile')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left transition-all ${view === 'profile' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Identidade</button>
        </nav>

        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
          {view === 'chats' && chats.map(chat => (
            <button key={chat.id} onClick={() => {setActiveChat(chat); setActiveGroup(null);}} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat?.id === chat.id ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                 {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : '👤'}
              </div>
              <p className="font-bold text-xs truncate text-left">{chat.display_name || chat.phone}</p>
            </button>
          ))}
          {view === 'groups' && groups.map(group => (
            <button key={group.id} onClick={() => {setActiveGroup(group); setActiveChat(null);}} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeGroup?.id === group.id ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-xs shrink-0">{group.name.slice(0, 2).toUpperCase()}</div>
              <p className="font-bold text-xs truncate">{group.name}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl animate-in">
        {view === 'admin' ? (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-20 flex items-center px-10 border-b border-white/5 gap-8 bg-white/[0.01]">
               <button onClick={() => setAdminSubView('supabase')} className={`text-[10px] font-black uppercase tracking-widest ${adminSubView === 'supabase' ? 'text-blue-500 border-b-2 border-blue-500 pb-1' : 'text-zinc-600'}`}>Nodo Supabase</button>
               <button onClick={() => setAdminSubView('sql')} className={`text-[10px] font-black uppercase tracking-widest ${adminSubView === 'sql' ? 'text-green-500 border-b-2 border-green-500 pb-1' : 'text-zinc-600'}`}>SQL Editor</button>
            </header>
            <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
              {adminSubView === 'supabase' ? (
                <div className="max-w-md space-y-6 animate-in">
                  <h2 className="text-2xl font-black uppercase">Infraestrutura</h2>
                  <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="URL do Projeto Supabase" className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5" />
                  <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="Anon Key" className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5" />
                  <button onClick={() => saveSupabaseConfig(sbUrl, sbKey)} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold uppercase text-[10px]">Ativar Nodo</button>
                  <div className="mt-8 p-6 bg-white/[0.02] rounded-[2rem] border border-white/5">
                    <h4 className="text-[10px] font-black uppercase mb-4 tracking-widest text-blue-400">Buckets Obrigatórios:</h4>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      Vá em <b>Storage</b> no seu Supabase:<br/>
                      1. Crie um bucket chamado <b>avatars</b>.<br/>
                      2. Deixe-o como <b>Public</b>.<br/>
                      3. Sem isso, as fotos não sincronizam entre contas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in">
                  <h2 className="text-2xl font-black uppercase">Script de Sincronia</h2>
                  <p className="text-xs text-zinc-500">Para que os usuários se encontrem, as permissões RLS abaixo são fundamentais:</p>
                  <pre className="bg-zinc-900 p-6 rounded-2xl border border-white/10 text-[10px] text-green-500 overflow-x-auto whitespace-pre font-mono max-h-96">
                    {SQL_SCHEMA}
                  </pre>
                  <button onClick={() => { navigator.clipboard.writeText(SQL_SCHEMA); alert("Copiado!"); }} className="bg-white text-black px-6 py-3 rounded-xl text-[10px] font-bold uppercase">Copiar SQL</button>
                </div>
              )}
            </div>
          </div>
        ) : view === 'contacts' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-10">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Sincronia</h1>
              <div className="flex gap-4">
                <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Buscar número (+55...)" className="bg-zinc-900 p-4 rounded-2xl text-xs border border-white/5 w-64" />
                <button onClick={handleAddContact} className="bg-white text-black px-8 rounded-2xl text-[10px] font-bold uppercase">Buscar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contacts.map(c => (
                <div key={c.id} className="glass p-8 rounded-[3rem] flex flex-col items-center gap-4 text-center hover:bg-white/[0.04] transition-all border border-white/[0.02] animate-in">
                   <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 overflow-hidden border border-white/10 shadow-xl">
                      {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" /> : '👤'}
                   </div>
                   <h3 className="font-bold text-sm">{c.display_name || c.phone}</h3>
                   <button onClick={() => { setActiveChat({id: c.id, display_name: c.display_name, avatar_url: c.avatar_url}); setView('chats'); }} className="w-full bg-white text-black p-4 rounded-2xl text-[10px] font-bold uppercase">Iniciar Chat</button>
                </div>
              ))}
              {contacts.length === 0 && <div className="col-span-full py-20 text-center opacity-10 uppercase font-black tracking-widest">Nenhum rastro direto.</div>}
            </div>
          </div>
        ) : view === 'profile' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-12">Identidade</h1>
            <div className="max-w-xl space-y-10">
              <div className="flex flex-col md:flex-row gap-10 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-48 h-48 rounded-[3.5rem] bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-white/40 transition-all shadow-2xl relative group shrink-0">
                   {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover" /> : <Logo size="lg" />}
                   <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] font-black uppercase border border-white/20 p-2 rounded-xl">Alterar</span>
                   </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <div className="space-y-4">
                   <h3 className="text-xl font-black uppercase">Foto Digital</h3>
                   <p className="text-xs text-zinc-400 font-medium">Sua foto é convertida para Base64. Futuramente, ela será enviada para o bucket <b>avatars</b> do seu Supabase.</p>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-zinc-800 text-[10px] font-black uppercase px-8 py-3 rounded-2xl border border-white/5">Abrir Arquivos</button>
                </div>
              </div>
              <div className="space-y-8 bg-white/[0.02] p-10 rounded-[3rem] border border-white/5">
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Seu Nome..." className="w-full bg-zinc-900 p-5 rounded-3xl text-sm font-bold outline-none border border-white/5 focus:border-white/20" />
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Diretrizes..." className="w-full h-40 bg-zinc-900 p-5 rounded-3xl text-sm outline-none border border-white/5 resize-none" />
                <button onClick={handleUpdateProfile} className="w-full bg-white text-black p-6 rounded-[2.5rem] font-black uppercase text-[11px] tracking-[0.3em] shadow-2xl transition-all hover:scale-[1.01]">Sincronizar</button>
              </div>
            </div>
          </div>
        ) : (activeChat || activeGroup) ? (
          <>
            <header className="h-24 flex items-center px-10 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-lg">
                {activeChat?.avatar_url ? <img src={activeChat.avatar_url} className="w-full h-full object-cover" /> : (activeChat ? '👤' : '👥')}
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-sm font-black truncate uppercase tracking-tight">{activeChat?.display_name || activeChat?.phone || activeGroup?.name}</h2>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                   <span className="text-[8px] font-black uppercase opacity-30 tracking-widest">Sinal Noir Estável</span>
                </div>
              </div>
              <button onClick={() => { setActiveChat(null); setActiveGroup(null); }} className="lg:hidden ml-4 text-[10px] font-black uppercase opacity-50">Sair</button>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar bg-black/40">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session?.user?.id ? 'justify-end' : 'justify-start'} animate-in`}>
                  <div className={`max-w-[80%] p-5 rounded-[2.2rem] shadow-2xl relative ${m.sender_id === session?.user?.id ? 'bg-white text-black' : 'bg-zinc-900 text-white border border-white/10'}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{m.content}</p>
                    <span className={`text-[7px] font-black uppercase mt-2 block text-right ${m.sender_id === session?.user?.id ? 'text-black/30' : 'text-white/20'}`}>{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-5 select-none"><Logo size="sm" /><p className="mt-4 text-[10px] font-black uppercase tracking-widest">Aguardando rastro digital...</p></div>}
            </div>
            <div className="p-10 pt-0 bg-gradient-to-t from-black to-transparent">
               <form onSubmit={sendMessage} className="bg-zinc-900/60 backdrop-blur-xl rounded-[2.8rem] p-2 flex items-center gap-2 border border-white/5 focus-within:border-white/20 transition-all shadow-2xl">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Transmitir..." className="flex-1 bg-transparent outline-none px-6 py-4 text-sm font-medium" />
                  <button type="submit" className="w-14 h-14 bg-white text-black rounded-[2rem] flex items-center justify-center hover:scale-105 active:scale-95 shadow-xl transition-all">➤</button>
               </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5 select-none animate-pulse">
            <Logo size="lg" />
            <p className="text-[10px] font-black uppercase tracking-[1em] mt-10">Concord Digital Node</p>
          </div>
        )}
      </main>
    </div>
  );
}
