
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat } from './types';

// ADICIONE SEU NÚMERO AQUI (Apenas números, sem espaços ou símbolos)
const ADMIN_NUMBERS = [
  '64981183571', 
  '5564981183571',
  '+5564981183571'
];

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

  const [phone, setPhone] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Checagem de Admin em tempo real baseada no número
  const isActuallyAdmin = session?.user?.phone && ADMIN_NUMBERS.some(n => 
    n.replace(/\D/g, '') === session.user.phone.replace(/\D/g, '')
  );

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
    if (!isSupabaseConfigured || !supabase) return;

    const userPhone = user.phone || phone;
    const cleanPhone = userPhone.replace(/\D/g, '');
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

  const fetchExploreUsers = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('profiles').select('*').limit(50);
    if (data) setAllUsers(data.filter(u => u.id !== session.user.id));
  };

  const fetchChats = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
      .order('created_at', { ascending: false });
    
    if (data) {
      const ids = Array.from(new Set(data.flatMap((m: any) => m.sender_id === session.user.id ? m.receiver_id : m.sender_id)));
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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeChat || !supabase || !session) return;
    const msg = { sender_id: session.user.id, receiver_id: activeChat.id, content: inputValue };
    await supabase.from('messages').insert(msg);
    setInputValue('');
    fetchMessages();
  };

  useEffect(() => {
    if (session && isSupabaseConfigured) {
      if (view === 'explore') fetchExploreUsers();
      if (view === 'chats') fetchChats();
      if (activeChat) fetchMessages();

      const sub = supabase.channel('realtime_concord').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchChats();
        if (activeChat) fetchMessages();
      }).subscribe();

      return () => { supabase.removeChannel(sub); };
    }
  }, [session, activeChat, view]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-10 h-10 border-4 border-white/5 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] mt-10 animate-in">
        <form onSubmit={(e) => { e.preventDefault(); if(isOtpSent) { const s = {user: {id: 'u-'+phone.replace(/\D/g,''), phone}}; localStorage.setItem('CONCORD_SESSION', JSON.stringify(s)); setSession(s); syncProfile(s.user); } else setIsOtpSent(true); }} className="space-y-6">
          <h2 className="text-2xl font-black mb-6 text-center uppercase tracking-widest">Acesso Noir</h2>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Número (ex: 64981183571)" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/30 transition-all" />
          {isOtpSent && <input placeholder="Código 000000" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl font-bold animate-in" />}
          <button type="submit" className="w-full noir-button p-5 rounded-2xl font-black uppercase text-[11px] tracking-widest">
            {isOtpSent ? 'Confirmar Entrada' : 'Receber Código'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white font-sans overflow-hidden">
      <aside className={`${activeChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <div className="flex gap-4 items-center">
             {isActuallyAdmin && <button onClick={() => setView('admin')} className={`text-[9px] font-black uppercase px-4 py-2 rounded-xl border-2 transition-all ${view === 'admin' ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'text-white border-white/20'}`}>Painel</button>}
             <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-[9px] font-bold uppercase text-zinc-600 hover:text-white transition-colors">Sair</button>
          </div>
        </div>
        
        <nav className="flex flex-col gap-1 mb-8">
          <button onClick={() => { setView('chats'); setActiveChat(null); }} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'chats' ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5 text-zinc-400'}`}>Conversas</button>
          <button onClick={() => { setView('explore'); setActiveChat(null); }} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'explore' ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5 text-zinc-400'}`}>Explorar Rede</button>
          <button onClick={() => { setView('profile'); setActiveChat(null); }} className={`p-4 rounded-2xl text-[10px] font-black uppercase text-left transition-all ${view === 'profile' ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5 text-zinc-400'}`}>Identidade</button>
        </nav>

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
          {view === 'chats' && chats.map(chat => (
            <button key={chat.id} onClick={() => { setActiveChat(chat); setView('chats'); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat?.id === chat.id ? 'bg-white text-black' : 'hover:bg-white/5 bg-white/[0.02]'}`}>
              <div className="w-11 h-11 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                 {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : '👤'}
              </div>
              <div className="text-left overflow-hidden">
                <p className="font-black text-[11px] uppercase truncate">{chat.display_name || chat.phone}</p>
                <p className="text-[8px] opacity-40 uppercase font-black">Ativo</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl">
        {view === 'admin' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <header className="flex gap-12 mb-12 border-b border-white/5 pb-6">
               <button onClick={() => setAdminSubView('supabase')} className={`text-[11px] font-black uppercase tracking-widest ${adminSubView === 'supabase' ? 'text-blue-500' : 'text-zinc-600'}`}>Infraestrutura</button>
               <button onClick={() => setAdminSubView('sql')} className={`text-[11px] font-black uppercase tracking-widest ${adminSubView === 'sql' ? 'text-green-500' : 'text-zinc-600'}`}>SQL Editor</button>
            </header>

            {adminSubView === 'supabase' ? (
              <div className="max-w-xl space-y-10">
                <div className="p-8 bg-blue-500/10 rounded-[3rem] border border-blue-500/20 space-y-6">
                   <h4 className="text-[11px] font-black uppercase text-blue-400">Status do Nodo</h4>
                   <p className="text-[12px] text-zinc-400 leading-relaxed">Defina a URL e a Anon Key do seu projeto Supabase para que todos os usuários se conectem automaticamente ao seu banco.</p>
                </div>

                <div className="space-y-6">
                  <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="URL do Supabase" className="w-full bg-zinc-900 p-5 rounded-2xl text-xs outline-none border border-white/5 focus:border-white/20" />
                  <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="Anon Key" className="w-full bg-zinc-900 p-5 rounded-2xl text-xs outline-none border border-white/5 focus:border-white/20" />
                  <button onClick={() => saveSupabaseConfig(sbUrl, sbKey)} className="w-full bg-white text-black p-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Salvar Configurações</button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in">
                 <h2 className="text-3xl font-black uppercase tracking-tighter text-green-500">Node Script</h2>
                 <p className="text-xs text-zinc-500">Execute este comando no SQL Editor do Supabase para criar as tabelas necessárias.</p>
                 <pre className="bg-zinc-900/50 p-8 rounded-[2rem] text-[10px] text-green-400/80 overflow-x-auto font-mono border border-white/5 whitespace-pre-wrap">
                   {`create table if not exists profiles (\n  id uuid references auth.users on delete cascade primary key,\n  phone text unique,\n  display_name text,\n  avatar_url text,\n  bio text,\n  is_admin boolean default false,\n  created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);\n\ncreate table if not exists messages (\n  id uuid default gen_random_uuid() primary key,\n  sender_id uuid references profiles(id),\n  receiver_id uuid references profiles(id),\n  content text not null,\n  created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);`}
                 </pre>
              </div>
            )}
          </div>
        ) : view === 'explore' ? (
          <div className="flex-1 p-12 overflow-y-auto animate-in">
            <h1 className="text-4xl font-black uppercase mb-12 tracking-tighter">Explorar Rede</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {allUsers.map(user => (
                <div key={user.id} className="glass p-10 rounded-[3.5rem] flex flex-col items-center gap-6 text-center border border-white/[0.03] hover:border-white/10 transition-all group">
                   <div className="w-24 h-24 rounded-[2.8rem] bg-zinc-900 overflow-hidden shadow-2xl border border-white/10 group-hover:scale-110 transition-all">
                      {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-3xl">👤</div>}
                   </div>
                   <div>
                      <h3 className="font-black text-[14px] uppercase tracking-wide">{user.display_name || user.phone}</h3>
                      <p className="text-[9px] opacity-30 font-black mt-2 uppercase tracking-widest">Usuário Verificado</p>
                   </div>
                   <button onClick={() => { setActiveChat({id: user.id, display_name: user.display_name, avatar_url: user.avatar_url}); setView('chats'); }} className="w-full bg-white text-black p-5 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:scale-[1.05] transition-all">Abrir Canal</button>
                </div>
              ))}
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
                   <span className="text-[9px] font-black uppercase opacity-40 tracking-widest">Sinal Online</span>
                </div>
              </div>
              <button onClick={() => setActiveChat(null)} className="lg:hidden text-[10px] font-black uppercase px-6 py-3 rounded-xl border border-white/10">Voltar</button>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar bg-black/5">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session?.user?.id ? 'justify-end' : 'justify-start'} animate-in`}>
                  <div className={`max-w-[70%] p-6 rounded-[2.5rem] shadow-2xl relative ${m.sender_id === session?.user?.id ? 'bg-white text-black rounded-tr-none' : 'bg-zinc-900 text-white border border-white/10 rounded-tl-none'}`}>
                    <p className="text-sm font-semibold leading-relaxed">{m.content}</p>
                    <span className={`text-[8px] font-black uppercase mt-3 block opacity-20 ${m.sender_id === session?.user?.id ? 'text-right' : 'text-left'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-12 pt-0">
               <form onSubmit={sendMessage} className="bg-zinc-900/40 backdrop-blur-3xl rounded-[3.5rem] p-3 flex items-center gap-3 border border-white/5 shadow-2xl focus-within:border-white/20 transition-all">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Transmitir mensagem..." className="flex-1 bg-transparent outline-none px-8 py-5 text-sm font-semibold" />
                  <button type="submit" className="w-16 h-16 bg-white text-black rounded-[2.5rem] flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all">➤</button>
               </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10 select-none animate-pulse">
            <Logo size="lg" />
            <p className="text-[11px] font-black uppercase tracking-[1.5em] mt-12">Concord Digital Node</p>
          </div>
        )}
      </main>
    </div>
  );
}
