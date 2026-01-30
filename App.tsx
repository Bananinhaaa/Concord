
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat } from './types';

// CONFIGURAÇÃO DE ADMIN (Apenas números)
const ADMIN_NUMBERS = ['64981183571', '5564981183571'];

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const s = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-20 h-20' : 'w-12 h-12';
  return (
    <div className={`${s} bg-white rounded-xl flex items-center justify-center shadow-2xl transition-transform hover:rotate-12`}>
      <div className="w-1/2 h-1/2 bg-black rotate-45"></div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chats' | 'explore' | 'profile' | 'admin'>('chats');
  const [adminSubView, setAdminSubView] = useState<'supabase' | 'sql'>('supabase');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');

  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('CONCORD_SB_URL') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('CONCORD_SB_KEY') || '');

  const [phoneInput, setPhoneInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // DETECÇÃO DE ADMIN INFALÍVEL
  const isActuallyAdmin = useMemo(() => {
    const currentPhone = session?.user?.phone?.replace(/\D/g, '') || '';
    return ADMIN_NUMBERS.some(n => n.replace(/\D/g, '') === currentPhone);
  }, [session]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const stored = localStorage.getItem('CONCORD_SESSION');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSession(parsed);
        if (isSupabaseConfigured) await syncProfile(parsed.user);
      }
      setLoading(false);
    };
    init();
  }, []);

  const syncProfile = async (user: any) => {
    if (!supabase) return;
    const cleanPhone = user.phone.replace(/\D/g, '');
    const isAdmin = ADMIN_NUMBERS.some(n => n.replace(/\D/g, '') === cleanPhone);
    
    try {
      const { data: remote } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!remote) {
        const { data: inserted } = await supabase.from('profiles').insert({
          id: user.id,
          phone: user.phone,
          display_name: `Agente_${cleanPhone.slice(-4)}`,
          is_admin: isAdmin
        }).select().single();
        if (inserted) setupProfileState(inserted);
      } else {
        setupProfileState(remote);
      }
    } catch (e) { console.error("Sync error", e); }
  };

  const setupProfileState = (p: UserProfile) => {
    setUserProfile(p);
    setEditName(p.display_name || '');
    setEditBio(p.bio || '');
    setEditAvatar(p.avatar_url || '');
  };

  const fetchExploreUsers = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setAllUsers(data.filter(u => u.id !== session?.user?.id));
  };

  const fetchChats = async () => {
    if (!supabase || !session) return;
    const { data: msgs } = await supabase.from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`);
    
    if (msgs) {
      const ids = Array.from(new Set(msgs.flatMap((m: any) => m.sender_id === session.user.id ? m.receiver_id : m.sender_id)));
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, phone, display_name, avatar_url').in('id', ids);
        setChats(profiles || []);
      }
    }
  };

  const fetchMessages = async () => {
    if (!supabase || !session || !activeChat) return;
    const { data } = await supabase.from('messages')
      .select('*')
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${session.user.id})`)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const handleUpdateProfile = async () => {
    if (!supabase || !userProfile) return;
    const { error } = await supabase.from('profiles').update({
      display_name: editName,
      bio: editBio,
      avatar_url: editAvatar
    }).eq('id', userProfile.id);
    
    if (!error) {
      alert("Identidade Atualizada!");
      syncProfile(session.user);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOtpSent) {
      setIsOtpSent(true);
      return;
    }
    const clean = phoneInput.replace(/\D/g, '');
    const newSession = { user: { id: `user_${clean}`, phone: phoneInput } };
    localStorage.setItem('CONCORD_SESSION', JSON.stringify(newSession));
    setSession(newSession);
    if (isSupabaseConfigured) syncProfile(newSession.user);
  };

  useEffect(() => {
    if (session && isSupabaseConfigured && supabase) {
      fetchChats();
      fetchExploreUsers();
      if (activeChat) fetchMessages();

      const channel = supabase.channel('global')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          fetchChats();
          if (activeChat) fetchMessages();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchExploreUsers();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [session, activeChat, view]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-12 h-12 border-4 border-white/5 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] mt-10 animate-in shadow-[0_0_100px_rgba(255,255,255,0.05)]">
        <form onSubmit={handleLogin} className="space-y-6">
          <h2 className="text-2xl font-black text-center uppercase tracking-[0.3em]">Acesso Noir</h2>
          <div className="space-y-4">
            <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="Número (ex: 64981183571)" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/40 transition-all text-center tracking-widest font-bold" />
            {isOtpSent && <input placeholder="CÓDIGO 000000" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl font-black animate-in tracking-[1em]" maxLength={6} />}
          </div>
          <button type="submit" className="w-full noir-button p-6 rounded-2xl font-black uppercase text-[12px] tracking-widest">
            {isOtpSent ? 'Validar Entrada' : 'Solicitar Acesso'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${activeChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5 shadow-2xl`}>
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <div className="flex gap-4 items-center">
             {isActuallyAdmin && (
               <button onClick={() => setView('admin')} className={`text-[10px] font-black uppercase px-5 py-2.5 rounded-xl border-2 transition-all ${view === 'admin' ? 'bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.4)] scale-105' : 'text-white border-white/20 hover:border-white'}`}>Painel</button>
             )}
             <button onClick={() => clearSupabaseConfig()} className="text-[10px] font-bold uppercase text-zinc-500 hover:text-red-500 transition-colors">Sair</button>
          </div>
        </div>
        
        <nav className="flex flex-col gap-2 mb-8">
          {[
            { id: 'chats', label: 'Conversas' },
            { id: 'explore', label: 'Explorar Rede' },
            { id: 'profile', label: 'Minha Identidade' }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id as any); setActiveChat(null); }} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === tab.id ? 'bg-white text-black translate-x-2 shadow-xl' : 'hover:bg-white/5 text-zinc-500 hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
          {view === 'chats' && chats.map(chat => (
            <button key={chat.id} onClick={() => { setActiveChat(chat); setView('chats'); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat?.id === chat.id ? 'bg-white text-black scale-[1.02]' : 'hover:bg-white/5 bg-white/[0.02]'}`}>
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                 {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : <span className="text-xl">👤</span>}
              </div>
              <div className="text-left overflow-hidden">
                <p className="font-black text-[11px] uppercase truncate">{chat.display_name || chat.phone}</p>
                <p className="text-[9px] opacity-40 uppercase font-black">Sinal Estável</p>
              </div>
            </button>
          ))}
          {view === 'chats' && chats.length === 0 && (
             <div className="text-center py-10 opacity-20 uppercase font-black text-[9px] tracking-[0.3em]">Canais Vazios</div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl">
        {view === 'admin' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <h1 className="text-5xl font-black uppercase mb-12 tracking-tighter">Nodo Mestre</h1>
            <div className="flex gap-8 mb-12 border-b border-white/5 pb-6">
               <button onClick={() => setAdminSubView('supabase')} className={`text-[12px] font-black uppercase tracking-widest ${adminSubView === 'supabase' ? 'text-blue-500' : 'text-zinc-600'}`}>Infraestrutura</button>
               <button onClick={() => setAdminSubView('sql')} className={`text-[12px] font-black uppercase tracking-widest ${adminSubView === 'sql' ? 'text-green-500' : 'text-zinc-600'}`}>Comandos SQL</button>
            </div>

            {adminSubView === 'supabase' ? (
              <div className="max-w-2xl space-y-8">
                <div className="p-8 bg-blue-500/5 rounded-[3rem] border border-blue-500/10 space-y-4">
                  <p className="text-sm text-zinc-400">Insira os dados do seu projeto Supabase abaixo. Isso habilitará o banco de dados para todos os usuários.</p>
                </div>
                <div className="space-y-4">
                  <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="SUPABASE URL" className="w-full bg-zinc-900/50 p-6 rounded-2xl text-xs font-mono outline-none border border-white/5 focus:border-blue-500/30 transition-all" />
                  <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="ANON PUBLIC KEY" className="w-full bg-zinc-900/50 p-6 rounded-2xl text-xs font-mono outline-none border border-white/5 focus:border-blue-500/30 transition-all" />
                  <button onClick={() => saveSupabaseConfig(sbUrl, sbKey)} className="w-full bg-white text-black p-6 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-[0_10px_40px_rgba(255,255,255,0.1)] hover:scale-[1.02] transition-all">Salvar e Ativar Nodo</button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in">
                 <p className="text-xs text-zinc-500 uppercase font-black">Copie e execute no SQL Editor do Supabase:</p>
                 <pre className="bg-zinc-900 p-8 rounded-[2.5rem] text-[10px] text-green-500/80 overflow-x-auto font-mono border border-white/5 leading-loose">
{`-- 1. Tabela de Perfis
create table if not exists profiles (
  id uuid primary key,
  phone text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean default false,
  created_at timestamp with time zone default now()
);

-- 2. Tabela de Mensagens
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id),
  receiver_id uuid references profiles(id),
  content text not null,
  created_at timestamp with time zone default now()
);

-- 3. Habilitar Visibilidade Geral (IMPORTANTE)
alter table profiles enable row level security;
create policy "Público" on profiles for select using (true);
create policy "Update Próprio" on profiles for update using (true);
alter table messages enable row level security;
create policy "Mensagens Privadas" on messages for all using (true);`}
                 </pre>
              </div>
            )}
          </div>
        ) : view === 'explore' ? (
          <div className="flex-1 p-12 overflow-y-auto animate-in">
            <div className="flex justify-between items-end mb-16">
              <div>
                <h1 className="text-6xl font-black uppercase tracking-tighter">Rede</h1>
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-[0.5em] mt-2">Agentes Online no Setor</p>
              </div>
              <button onClick={fetchExploreUsers} className="text-[10px] font-black uppercase opacity-40 hover:opacity-100 transition-all">Recarregar Sinais</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {allUsers.map(user => (
                <div key={user.id} className="glass p-10 rounded-[3.5rem] flex flex-col items-center gap-6 text-center border border-white/[0.03] hover:border-white/10 transition-all group hover:-translate-y-2">
                   <div className="w-28 h-28 rounded-[3rem] bg-zinc-900 overflow-hidden shadow-2xl border border-white/10 group-hover:scale-105 transition-all">
                      {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-4xl">👤</div>}
                   </div>
                   <div>
                      <h3 className="font-black text-[16px] uppercase tracking-wide">{user.display_name || user.phone}</h3>
                      <p className="text-[10px] text-zinc-500 font-black mt-2 uppercase tracking-widest">{user.is_admin ? 'ADMINISTRADOR' : 'AGENTE VERIFICADO'}</p>
                   </div>
                   <button onClick={() => { setActiveChat({id: user.id, display_name: user.display_name, avatar_url: user.avatar_url}); setView('chats'); }} className="w-full bg-white text-black p-5 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:bg-zinc-200 transition-all">Estabelecer Conexão</button>
                </div>
              ))}
              {allUsers.length === 0 && (
                <div className="col-span-full py-32 text-center opacity-10">
                   <Logo size="lg" />
                   <p className="mt-8 uppercase font-black tracking-[1em]">Nenhum sinal detectado</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'profile' ? (
          <div className="flex-1 p-12 overflow-y-auto animate-in">
            <h1 className="text-6xl font-black uppercase mb-16 tracking-tighter">Identidade</h1>
            <div className="max-w-2xl bg-white/[0.01] p-12 rounded-[4.5rem] border border-white/5 shadow-3xl space-y-12">
                <div onClick={() => fileInputRef.current?.click()} className="w-48 h-48 rounded-[3.5rem] bg-zinc-900 mx-auto overflow-hidden cursor-pointer border-2 border-dashed border-white/10 hover:border-white/40 transition-all flex items-center justify-center group relative shadow-2xl">
                   {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover group-hover:opacity-40 transition-all" /> : <span className="opacity-20 text-6xl">+</span>}
                   <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/40">
                      <span className="text-[10px] font-black uppercase bg-white text-black px-4 py-2 rounded-xl">Alterar Foto</span>
                   </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                
                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase opacity-30 ml-6 tracking-widest">Codinome Público</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ex: Agente Zero" className="w-full bg-zinc-900/50 p-6 rounded-[2rem] text-[14px] font-black outline-none border border-white/5 focus:border-white/20 transition-all" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase opacity-30 ml-6 tracking-widest">Diretrizes (Bio)</label>
                    <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Fale sobre suas operações..." className="w-full h-40 bg-zinc-900/50 p-8 rounded-[2.5rem] text-[13px] outline-none border border-white/5 resize-none focus:border-white/20 transition-all" />
                  </div>
                </div>
                
                <button onClick={handleUpdateProfile} className="w-full bg-white text-black p-8 rounded-[3rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-[0_20px_50px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-95 transition-all">Sincronizar Dados</button>
            </div>
          </div>
        ) : activeChat ? (
          <>
            <header className="h-32 flex items-center px-12 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-16 h-16 rounded-[1.5rem] bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-2xl">
                {activeChat.avatar_url ? <img src={activeChat.avatar_url} className="w-full h-full object-cover" /> : <span className="text-2xl">👤</span>}
              </div>
              <div className="ml-8 flex-1">
                <h2 className="text-xl font-black uppercase tracking-tighter leading-none">{activeChat.display_name || activeChat.phone}</h2>
                <div className="flex items-center gap-3 mt-3">
                   <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_15px_#22c55e]"></div>
                   <span className="text-[10px] font-black uppercase opacity-40 tracking-[0.2em]">Canal Seguro Noir</span>
                </div>
              </div>
              <button onClick={() => setActiveChat(null)} className="lg:hidden text-[11px] font-black uppercase px-8 py-4 rounded-2xl border border-white/10 hover:bg-white hover:text-black transition-all">Fechar</button>
            </header>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar bg-black/10">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session?.user?.id ? 'justify-end' : 'justify-start'} animate-in`}>
                  <div className={`max-w-[75%] p-7 rounded-[2.8rem] shadow-2xl relative ${m.sender_id === session?.user?.id ? 'bg-white text-black rounded-tr-none' : 'bg-zinc-900 text-white border border-white/10 rounded-tl-none'}`}>
                    <p className="text-[15px] font-semibold leading-relaxed tracking-wide">{m.content}</p>
                    <span className={`text-[9px] font-black uppercase mt-4 block opacity-30 ${m.sender_id === session?.user?.id ? 'text-right' : 'text-left'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-5 select-none grayscale">
                  <Logo size="lg" />
                  <p className="mt-8 text-[12px] font-black uppercase tracking-[0.8em]">Frequência Isolada</p>
                </div>
              )}
            </div>

            <div className="p-12 pt-0">
               <form onSubmit={(e) => { e.preventDefault(); if(inputValue.trim() && supabase) { 
                 const msg = { sender_id: session.user.id, receiver_id: activeChat.id, content: inputValue };
                 supabase.from('messages').insert(msg).then(() => { setInputValue(''); fetchMessages(); });
               }}} className="bg-zinc-900/50 backdrop-blur-2xl rounded-[3.5rem] p-4 flex items-center gap-4 border border-white/5 shadow-3xl focus-within:border-white/20 transition-all">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Escreva sua mensagem noir..." className="flex-1 bg-transparent outline-none px-8 py-4 text-[15px] font-semibold placeholder:text-zinc-700" />
                  <button type="submit" className="w-16 h-16 bg-white text-black rounded-[2.2rem] flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all text-xl">➤</button>
               </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10 select-none animate-pulse grayscale">
            <Logo size="lg" />
            <div className="mt-16 text-center space-y-4">
              <p className="text-[14px] font-black uppercase tracking-[2em]">Concord Digital</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">Noir Peak Operations v1.2</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
