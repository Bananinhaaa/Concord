
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat, Group, Contact } from './types';

const ADMIN_NUMBERS = ['64981183571', '+5564981183571', '5564981183571'];
const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'; 

const SQL_SCHEMA = `-- EXECUTE ESTE SCRIPT NO SQL EDITOR DO SUPABASE
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  phone text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
);`;

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

  const [phone, setPhone] = useState('+5564981183571');
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
        }
      } catch (e) { console.warn("Sync: Perfil remoto não encontrado, usando local."); }
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

    // Atualiza estado e campos de edição
    setUserProfile(profile);
    setEditName(profile.display_name || '');
    setEditBio(profile.bio || '');
    setEditAvatar(profile.avatar_url || '');
    
    // Persiste no local storage para garantir carregamento da foto
    localStorage.setItem(localKey, JSON.stringify(profile));
  };

  const handleUpdateProfile = async () => {
    if (!userProfile) return;
    const updateData = { display_name: editName, bio: editBio, avatar_url: editAvatar };
    
    // Persistência Local
    const localKey = `CONCORD_PROFILE_${userProfile.id}`;
    const updatedProfile = { ...userProfile, ...updateData };
    localStorage.setItem(localKey, JSON.stringify(updatedProfile));

    if (supabase && isSupabaseConfigured) {
      try {
        await supabase.from('profiles').update(updateData).eq('id', userProfile.id);
      } catch (e) { console.error("Erro ao salvar no Supabase:", e); }
    }

    setUserProfile(updatedProfile);
    alert("Sua identidade foi sincronizada com sucesso!");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return alert("A imagem é muito pesada (Máx 2MB).");
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
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

  const handleAddContact = async () => {
    if (!supabase || !isSupabaseConfigured || !session) return alert("Agente, conecte o Nodo Supabase no painel Admin.");
    const { data } = await supabase.from('profiles').select('id').eq('phone', newContactPhone).single();
    if (!data) return alert("Este rastro digital não existe no Nodo Central.");
    await supabase.from('contacts').insert({ user_id: session.user.id, contact_id: data.id });
    setNewContactPhone('');
    fetchContacts();
    alert("Contato sincronizado à sua rede.");
  };

  const fetchContacts = async () => {
    if (!supabase || !isSupabaseConfigured || !session) return;
    const { data } = await supabase.from('contacts').select('contact_id').eq('user_id', session.user.id);
    if (data) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', data.map(c => c.contact_id));
      if (p) setContacts(p);
    }
  };

  const fetchGroups = async () => {
    if (!supabase || !isSupabaseConfigured) return;
    const { data } = await supabase.from('groups').select('*');
    if (data) setGroups(data);
  };

  const handleCreateGroup = async () => {
    if (!supabase || !isSupabaseConfigured || !session) return alert("Erro de sincronia com o banco.");
    await supabase.from('groups').insert({ name: newGroupName, description: newGroupDesc, created_by: session.user.id });
    setNewGroupName(''); setNewGroupDesc('');
    fetchGroups();
    alert("Coletivo formado com sucesso.");
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

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-10 h-10 border-2 border-white/5 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] mt-10 animate-in">
        <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-widest">{isOtpSent ? 'Validar Código' : 'Acesso à Rede'}</h2>
        <form onSubmit={(e) => { e.preventDefault(); if(isOtpSent) { const s = {user: {id: 'u-'+phone.replace(/\D/g,''), phone}}; localStorage.setItem('CONCORD_SESSION', JSON.stringify(s)); setSession(s); syncProfile(s.user); } else setIsOtpSent(true); }} className="space-y-4">
          <input value={phone} disabled={isOtpSent} onChange={e => setPhone(e.target.value)} placeholder="+55..." className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/30 transition-all" />
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
             {userProfile?.is_admin && (
               <button onClick={() => setView('admin')} className={`text-[9px] font-bold uppercase px-3 py-1 rounded-lg border-2 ${view === 'admin' ? 'bg-white text-black border-white' : 'text-white border-white/20 hover:border-white'}`}>Admin</button>
             )}
             <button onClick={() => { localStorage.removeItem('CONCORD_SESSION'); setSession(null); }} className="text-[9px] font-bold uppercase text-zinc-600 hover:text-red-500 transition-colors">Sair</button>
          </div>
        </div>
        
        <div onClick={() => setView('profile')} className={`flex items-center gap-4 mb-8 p-4 rounded-3xl border transition-all cursor-pointer ${view === 'profile' ? 'bg-white text-black border-white shadow-xl' : 'bg-white/[0.03] border-white/5 hover:bg-white/5'}`}>
           <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10 shadow-inner">
              {userProfile?.avatar_url ? <img src={userProfile.avatar_url} className="w-full h-full object-cover" /> : '👤'}
           </div>
           <div className="overflow-hidden">
              <p className="font-bold text-xs truncate">{userProfile?.display_name || 'Agente'}</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest ${view === 'profile' ? 'text-black/40' : 'opacity-30'}`}>{userProfile?.phone}</p>
           </div>
        </div>

        <nav className="flex flex-col gap-1 mb-6">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Menu de Acesso</span>
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
               <button onClick={() => setAdminSubView('supabase')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${adminSubView === 'supabase' ? 'text-blue-500 border-b-2 border-blue-500 pb-1' : 'text-zinc-600 hover:text-white'}`}>Nodo Supabase</button>
               <button onClick={() => setAdminSubView('sql')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${adminSubView === 'sql' ? 'text-green-500 border-b-2 border-green-500 pb-1' : 'text-zinc-600 hover:text-white'}`}>SQL Editor</button>
               <button onClick={() => setAdminSubView('users')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${adminSubView === 'users' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-600 hover:text-white'}`}>Gestão Usuários</button>
            </header>
            <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
              {adminSubView === 'supabase' ? (
                <div className="max-w-md space-y-6 animate-in">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Infraestrutura Central</h2>
                  <p className="text-xs text-zinc-500 leading-relaxed">Conecte o rastro digital ao banco de dados principal. Sem isso, as mensagens não serão persistentes entre sessões.</p>
                  <div className="space-y-4">
                    <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="URL do Projeto" className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 focus:border-blue-500/30 transition-all" />
                    <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="Anon Key" className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 focus:border-blue-500/30 transition-all" />
                  </div>
                  <button onClick={() => saveSupabaseConfig(sbUrl, sbKey)} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">Conectar Agora</button>
                  <button onClick={clearSupabaseConfig} className="w-full text-[9px] uppercase font-bold text-zinc-600 hover:text-red-500 transition-colors underline decoration-dotted">Desativar Nodo Atual</button>
                </div>
              ) : adminSubView === 'sql' ? (
                <div className="space-y-6 animate-in">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Arquitetura SQL</h2>
                  <p className="text-xs text-zinc-500">Copie o código abaixo e cole no **SQL Editor** do Supabase para criar a estrutura vital do Concord.</p>
                  <div className="relative group">
                    <pre className="bg-zinc-900 p-6 rounded-2xl border border-white/10 text-[10px] text-green-500 overflow-x-auto whitespace-pre font-mono custom-scrollbar max-h-96">
                      {SQL_SCHEMA}
                    </pre>
                    <button onClick={() => { navigator.clipboard.writeText(SQL_SCHEMA); alert("Script SQL copiado para a área de transferência."); }} className="absolute top-4 right-4 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase px-3 py-1 rounded-lg border border-white/10 transition-colors">Copiar</button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20 animate-pulse">
                   <Logo size="lg" />
                   <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em]">Rastreando Agentes na Rede...</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'contacts' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Sincronia de Rede</h1>
              <div className="flex gap-4 w-full md:w-auto">
                <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Número (+55...)" className="flex-1 md:w-64 bg-zinc-900 p-4 rounded-2xl text-xs border border-white/5 focus:border-white/20 outline-none transition-all" />
                <button onClick={handleAddContact} className="bg-white text-black px-8 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:scale-105 transition-all">Sincronizar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {contacts.map(c => (
                <div key={c.id} className="glass p-8 rounded-[3rem] flex flex-col items-center gap-6 text-center hover:bg-white/[0.04] transition-all group border border-white/[0.02]">
                   <div className="w-24 h-24 rounded-[2.5rem] bg-zinc-900 overflow-hidden border border-white/10 shadow-2xl relative">
                      {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" /> : '👤'}
                      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   </div>
                   <div className="space-y-1">
                     <h3 className="font-black text-sm uppercase tracking-tight">{c.display_name || 'Agente Desconhecido'}</h3>
                     <p className="text-[9px] font-bold opacity-30 tracking-widest">{c.phone}</p>
                   </div>
                   <button onClick={() => { setActiveChat({id: c.id, display_name: c.display_name, avatar_url: c.avatar_url}); setView('chats'); }} className="w-full bg-white text-black p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:translate-y-[-2px] transition-all">Iniciar Transmissão</button>
                </div>
              ))}
              {contacts.length === 0 && (
                <div className="col-span-full py-32 text-center opacity-5 select-none">
                  <p className="text-6xl font-black uppercase tracking-[1em]">Vazio</p>
                  <p className="text-[10px] font-bold uppercase mt-4 tracking-widest">Nenhum agente sincronizado à sua rede privada.</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'groups' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Coletivos Noir</h1>
              <div className="flex gap-4 w-full md:w-auto">
                <div className="flex flex-col gap-2 flex-1 md:w-64">
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nome do Grupo" className="bg-zinc-900 p-4 rounded-2xl text-xs border border-white/5 outline-none" />
                  <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Objetivo Principal" className="bg-zinc-900 p-3 rounded-2xl text-[9px] border border-white/5 outline-none opacity-50 focus:opacity-100 transition-opacity" />
                </div>
                <button onClick={handleCreateGroup} className="bg-white text-black px-8 rounded-2xl text-[10px] font-bold uppercase h-fit py-4 shadow-xl hover:scale-105 transition-all">Formar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {groups.map(g => (
                <button key={g.id} onClick={() => { setActiveGroup(g); setActiveChat(null); setView('chats'); }} className="glass p-12 rounded-[3.5rem] text-left hover:bg-white/[0.04] transition-all group border border-white/[0.02] shadow-lg">
                   <h4 className="text-xl font-black mb-2 uppercase group-hover:text-white transition-colors">{g.name}</h4>
                   <p className="text-xs opacity-40 italic font-medium leading-relaxed">{g.description || 'Nenhum rastro de objetivo definido para este coletivo.'}</p>
                </button>
              ))}
            </div>
          </div>
        ) : view === 'profile' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-12">Identidade Digital</h1>
            <div className="max-w-xl space-y-10">
              <div className="flex flex-col md:flex-row gap-10 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-48 h-48 rounded-[3.5rem] bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-white/40 transition-all shadow-2xl relative group shrink-0">
                   {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover" /> : <Logo size="lg" />}
                   <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity p-4 text-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] border-b border-white/20 pb-1 mb-2">Alterar Rastro</span>
                      <span className="text-[7px] opacity-50 uppercase">Toque para selecionar</span>
                   </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <div className="space-y-4">
                   <h3 className="text-xl font-black uppercase">Foto de Perfil</h3>
                   <p className="text-xs text-zinc-400 font-medium leading-relaxed">Seu avatar é convertido em um rastro Base64 e armazenado localmente para garantir que sua identidade nunca desapareça na névoa digital.</p>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-zinc-800 text-[10px] font-black uppercase px-8 py-3 rounded-2xl border border-white/5 hover:bg-zinc-700 transition-colors shadow-lg">Acessar Arquivos</button>
                </div>
              </div>
              <div className="space-y-8 bg-white/[0.02] p-10 rounded-[3rem] border border-white/5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-20 ml-2">Codinome Público</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ex: Agente Noir" className="w-full bg-zinc-900 p-5 rounded-3xl text-sm font-bold outline-none border border-white/5 focus:border-white/20 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-20 ml-2">Diretrizes / Bio</label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Sua história no Noir Peak..." className="w-full h-40 bg-zinc-900 p-5 rounded-3xl text-sm outline-none border border-white/5 resize-none focus:border-white/20 transition-all font-medium leading-relaxed" />
                </div>
                <button onClick={handleUpdateProfile} className="w-full bg-white text-black p-6 rounded-[2.5rem] font-black uppercase text-[11px] tracking-[0.3em] shadow-2xl hover:translate-y-[-4px] active:scale-95 transition-all">Sincronizar Identidade</button>
              </div>
            </div>
          </div>
        ) : (activeChat || activeGroup) ? (
          <>
            <header className="h-24 flex items-center px-10 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-lg">
                {activeChat?.avatar_url ? <img src={activeChat.avatar_url} className="w-full h-full object-cover" /> : (activeChat ? '👤' : '👥')}
              </div>
              <div className="ml-4 flex-1 overflow-hidden">
                <h2 className="text-sm font-black truncate uppercase tracking-tight">{activeChat?.display_name || activeChat?.phone || activeGroup?.name}</h2>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                   <span className="text-[8px] font-black uppercase opacity-30 tracking-widest block truncate">Transmissão Segura Ativa</span>
                </div>
              </div>
              <button onClick={() => { setActiveChat(null); setActiveGroup(null); }} className="lg:hidden ml-4 text-[10px] font-black uppercase opacity-50 hover:opacity-100 transition-opacity">Voltar</button>
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
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-5 pointer-events-none select-none">
                   <Logo size="lg" />
                   <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em]">O silêncio precede a revelação</p>
                </div>
              )}
            </div>
            <div className="p-10 pt-0 bg-gradient-to-t from-black to-transparent">
               <form onSubmit={sendMessage} className="bg-zinc-900/60 backdrop-blur-xl rounded-[2.8rem] p-2 flex items-center gap-2 border border-white/5 focus-within:border-white/20 transition-all shadow-2xl">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Sussurrar na névoa..." className="flex-1 bg-transparent outline-none px-6 py-4 text-sm font-medium" />
                  <button type="submit" className="w-14 h-14 bg-white text-black rounded-[2rem] flex items-center justify-center hover:scale-105 active:scale-95 shadow-xl transition-all text-xl">➤</button>
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
