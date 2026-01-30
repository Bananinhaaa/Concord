
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat } from './types';

const ADMIN_PHONE = '64981183571';
const SYSTEM_ID = '00000000-0000-0000-0000-000000000000'; 

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
  const [view, setView] = useState<'chats' | 'admin' | 'supabase'>('chats');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  // Admin States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [systemMsg, setSystemMsg] = useState('');

  // Supabase Config States
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('CONCORD_SB_URL') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('CONCORD_SB_KEY') || '');

  // Auth States (MODO TESTE ATIVO)
  const [phone, setPhone] = useState('+5564981183571');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) await syncProfile(session.user);
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setSession(session);
        await syncProfile(session.user);
      }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => subscription.unsubscribe();
  }, []);

  const syncProfile = async (user: any) => {
    if (!supabase) {
      setUserProfile({
        id: user.id,
        phone: user.phone || phone,
        is_admin: (user.phone || phone).includes(ADMIN_PHONE),
        is_verified: true,
        is_banned: false,
        booster_until: null,
        suspended_until: null,
        created_at: new Date().toISOString()
      });
      return;
    }

    try {
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profile) {
        const { data: newProfile } = await supabase.from('profiles').insert({
          id: user.id,
          phone: user.phone || phone || '',
          is_admin: (user.phone || phone || '').includes(ADMIN_PHONE) || false
        }).select().single();
        profile = newProfile;
      }
      setUserProfile(profile);
    } catch (e) {
      console.error("Erro ao sincronizar perfil:", e);
    }
  };

  useEffect(() => {
    if (session?.user) fetchChats();
  }, [session]);

  useEffect(() => {
    if (!session?.user || !activeChat || !supabase) return;

    const channel = supabase
      .channel(`chat-${activeChat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === session.user.id && msg.receiver_id === activeChat.id) ||
          (msg.sender_id === activeChat.id && msg.receiver_id === session.user.id) ||
          (msg.sender_id === SYSTEM_ID && msg.receiver_id === session.user.id)
        ) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    fetchMessages(activeChat.id);
    return () => { supabase.removeChannel(channel); };
  }, [session, activeChat]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const fetchChats = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`);

    if (data) {
      const ids = Array.from(new Set(data.flatMap((m: any) => 
        m.sender_id === session.user.id ? m.receiver_id : m.sender_id
      )));
      const chatList = ids.map(id => ({ 
        id: id as string, 
        phone: id === SYSTEM_ID ? 'SISTEMA CONCORD' : `Usuário ${id.toString().slice(0, 5)}` 
      }));
      setChats(chatList);
    }
  };

  const fetchMessages = async (receiverId: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${session.user.id})`)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const handleAdminSearch = async () => {
    if (!supabase) {
      alert("Busca requer Supabase conectado.");
      return;
    }
    if (!searchQuery) return;
    const { data } = await supabase.from('profiles').select('*').ilike('phone', `%${searchQuery}%`);
    if (data) setSearchResults(data);
  };

  const updateSelectedUser = async (updates: Partial<UserProfile>) => {
    if (!selectedUser || !supabase) return;
    const { error } = await supabase.from('profiles').update(updates).eq('id', selectedUser.id);
    if (!error) {
      setSelectedUser({ ...selectedUser, ...updates });
      handleAdminSearch(); 
    }
  };

  const sendSystemMessage = async () => {
    if (!selectedUser || !systemMsg || !supabase) return;
    await supabase.from('messages').insert({
      sender_id: SYSTEM_ID,
      receiver_id: selectedUser.id,
      content: systemMsg
    });
    setSystemMsg('');
    alert('Mensagem oficial enviada.');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setTimeout(() => {
      setIsOtpSent(true);
      setAuthLoading(false);
    }, 800);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setTimeout(async () => {
      const mockUser = {
        id: 'mock-uuid-' + Math.random().toString(36).substr(2, 9),
        phone: phone,
      };
      const mockSession = { user: mockUser, access_token: 'fake-token' };
      setSession(mockSession);
      await syncProfile(mockUser);
      setAuthLoading(false);
    }, 800);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeChat || !session || !supabase) return;
    if (userProfile?.suspended_until && new Date(userProfile.suspended_until) > new Date()) {
      alert("Você está suspenso de falar temporariamente.");
      return;
    }
    const content = inputValue;
    setInputValue('');
    await supabase.from('messages').insert({
      sender_id: session.user.id,
      receiver_id: activeChat.id,
      content: content
    });
  };

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (sbUrl && sbKey) {
      saveSupabaseConfig(sbUrl, sbKey);
    } else {
      alert("Preencha ambos os campos.");
    }
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-black">
      <div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin"></div>
    </div>
  );

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6 text-white font-sans">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] border border-white/5 mt-10 animate-in">
        <h2 className="text-2xl font-black mb-4 text-center uppercase tracking-widest">
          {isOtpSent ? 'Verificar' : 'Entrar'}
        </h2>
        <form onSubmit={isOtpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
          {!isOtpSent ? (
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 64 9..." required className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none focus:border-white/30 text-sm" />
          ) : (
            <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="000000" required maxLength={6} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl tracking-[0.5em] font-bold" />
          )}
          <button disabled={authLoading} type="submit" className="w-full noir-button p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest mt-4">
            {authLoading ? 'Processando...' : (isOtpSent ? 'Confirmar' : 'Acessar')}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`${activeChat || selectedUser || view === 'supabase' ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <button onClick={() => { setSession(null); setUserProfile(null); }} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-red-500">Sair</button>
        </div>
        
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex gap-2">
            <button onClick={() => { setView('chats'); setActiveChat(null); setSelectedUser(null); }} className={`flex-1 p-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${view === 'chats' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500'}`}>Chats</button>
            {userProfile?.is_admin && (
              <button onClick={() => { setView('admin'); setActiveChat(null); }} className={`flex-1 p-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${view === 'admin' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500'}`}>Admin</button>
            )}
          </div>
          {userProfile?.is_admin && (
            <button onClick={() => { setView('supabase'); setActiveChat(null); setSelectedUser(null); }} className={`w-full p-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${view === 'supabase' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-500'}`}>Supabase Config</button>
          )}
        </div>

        {view === 'chats' ? (
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {chats.map(chat => (
              <button key={chat.id} onClick={() => setActiveChat(chat)} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat?.id === chat.id ? 'bg-white text-black scale-[1.02]' : 'hover:bg-white/5'}`}>
                <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-lg">👤</div>
                <div className="text-left overflow-hidden">
                  <p className="font-bold text-xs truncate">{chat.phone}</p>
                </div>
              </button>
            ))}
          </div>
        ) : view === 'admin' ? (
          <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Pesquisar Contas</p>
              <div className="flex gap-2">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Número..." className="flex-1 bg-zinc-900 border border-white/10 p-2 rounded-lg text-[10px]" />
                <button onClick={handleAdminSearch} className="bg-white text-black px-3 rounded-lg text-[10px] font-bold">OK</button>
              </div>
            </div>
            <div className="space-y-2">
              {searchResults.map(u => (
                <button key={u.id} onClick={() => setSelectedUser(u)} className={`w-full p-3 bg-zinc-900/50 border border-white/5 rounded-xl text-left hover:bg-white/5 transition-all ${selectedUser?.id === u.id ? 'border-white/30' : ''}`}>
                  <p className="text-[10px] font-bold">{u.phone}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      {/* Main Content */}
      <main className={`${!activeChat && !selectedUser && view !== 'supabase' ? 'hidden lg:flex' : 'flex'} flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl`}>
        {view === 'supabase' ? (
          <div className="flex-1 p-12 flex flex-col items-center justify-center space-y-8 animate-in max-w-2xl mx-auto w-full">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Configuração Supabase</h1>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Painel de Controle de Infraestrutura</p>
            </div>
            
            <form onSubmit={handleSaveSupabase} className="w-full space-y-6 glass p-10 rounded-[2.5rem] border-white/10">
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 ml-2">Supabase URL</label>
                <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xyz.supabase.co" className="w-full bg-zinc-900 border border-white/10 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 ml-2">Anon Key</label>
                <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJhb..." className="w-full bg-zinc-900 border border-white/10 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all font-mono" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="submit" className="flex-1 bg-white text-black p-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all">Salvar e Reiniciar</button>
                <button type="button" onClick={clearSupabaseConfig} className="bg-red-500/10 text-red-500 px-6 rounded-2xl text-[9px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Limpar</button>
              </div>
            </form>

            <div className="flex items-center gap-2 opacity-30">
              <div className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-[9px] font-bold uppercase tracking-widest">{isSupabaseConfigured ? 'Banco Conectado' : 'Aguardando Configuração'}</span>
            </div>
          </div>
        ) : view === 'admin' && selectedUser ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar space-y-10 animate-in">
             <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-zinc-900 rounded-[1.5rem] flex items-center justify-center text-3xl">👤</div>
              <div>
                <h1 className="text-2xl font-black">{selectedUser.phone}</h1>
                <p className="text-[9px] uppercase tracking-widest text-zinc-500">ID: {selectedUser.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass p-6 rounded-3xl space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Privilégios</p>
                <button onClick={() => updateSelectedUser({ is_verified: !selectedUser.is_verified })} className={`w-full p-4 rounded-xl flex justify-between items-center transition-all ${selectedUser.is_verified ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800'}`}>
                  <span className="text-[11px] font-bold uppercase">Verificado</span>
                  <div className={`w-4 h-4 rounded-full ${selectedUser.is_verified ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
                </button>
                <button onClick={() => updateSelectedUser({ is_admin: !selectedUser.is_admin })} className={`w-full p-4 rounded-xl flex justify-between items-center transition-all ${selectedUser.is_admin ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800'}`}>
                  <span className="text-[11px] font-bold uppercase">Admin</span>
                  <div className={`w-4 h-4 rounded-full ${selectedUser.is_admin ? 'bg-red-500' : 'bg-zinc-700'}`}></div>
                </button>
              </div>

              <div className="glass p-6 rounded-3xl space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status Boost</p>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 3, 6].map(m => (
                    <button key={m} onClick={() => {
                      const d = new Date(); d.setMonth(d.getMonth() + m);
                      updateSelectedUser({ booster_until: d.toISOString() });
                    }} className="bg-zinc-800 p-3 rounded-xl text-[9px] font-bold uppercase">+{m} Meses</button>
                  ))}
                  <button onClick={() => updateSelectedUser({ booster_until: null })} className="bg-red-500/10 text-red-500 p-3 rounded-xl text-[9px] font-bold uppercase">Reset</button>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Disciplina</p>
                <button onClick={() => updateSelectedUser({ is_banned: !selectedUser.is_banned })} className={`w-full p-4 rounded-xl font-bold text-[10px] uppercase ${selectedUser.is_banned ? 'bg-red-500 text-white' : 'bg-zinc-800 text-red-500'}`}>
                  {selectedUser.is_banned ? 'Desbanir' : 'Banir'}
                </button>
                <div className="flex gap-2">
                  <select onChange={(e) => {
                    if (!e.target.value) return;
                    const d = new Date(); d.setHours(d.getHours() + parseInt(e.target.value));
                    updateSelectedUser({ suspended_until: d.toISOString() });
                  }} className="flex-1 bg-zinc-800 p-3 rounded-xl text-[10px] font-bold outline-none border-none">
                    <option value="">Suspender</option>
                    <option value="1">1h</option>
                    <option value="24">24h</option>
                    <option value="168">7d</option>
                  </select>
                  <button onClick={() => updateSelectedUser({ suspended_until: null })} className="bg-zinc-800 px-4 rounded-xl text-[10px]">X</button>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Msg Sistema</p>
                <textarea value={systemMsg} onChange={e => setSystemMsg(e.target.value)} placeholder="Conteúdo oficial..." className="w-full h-20 bg-zinc-900 p-3 rounded-xl text-xs outline-none border border-white/5 resize-none" />
                <button onClick={sendSystemMessage} className="w-full p-3 bg-white text-black rounded-xl font-bold text-[9px] uppercase tracking-widest">Enviar</button>
              </div>
            </div>
          </div>
        ) : view === 'chats' && activeChat ? (
          <>
            <header className="h-20 flex items-center px-10 border-b border-white/5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-lg">👤</div>
              <div className="ml-4">
                <h2 className="text-sm font-black">{activeChat.phone}</h2>
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Criptografado</span>
              </div>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session.user.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-[1.5rem] ${m.sender_id === session.user.id ? 'bg-white text-black rounded-tr-sm' : m.sender_id === SYSTEM_ID ? 'bg-zinc-800 text-white italic border-l-2' : 'bg-zinc-900 text-white rounded-tl-sm'}`}>
                    <p className="text-sm">{m.content}</p>
                    <span className="text-[7px] mt-1 block opacity-40">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 pt-0">
              <form onSubmit={sendMessage} className="bg-zinc-900/50 rounded-[2rem] p-1.5 flex items-center gap-2 border border-white/10">
                <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Mensagem..." className="flex-1 bg-transparent outline-none px-6 py-2 text-sm" />
                <button type="submit" className="w-10 h-10 bg-white text-black rounded-[1.2rem] flex items-center justify-center hover:scale-105 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5 animate-in">
            <Logo size="lg" />
            <p className="text-[10px] font-bold uppercase tracking-[0.5em] mt-10">Concord Messenger • Noir Edition</p>
          </div>
        )}
      </main>

      {userProfile?.suspended_until && new Date(userProfile.suspended_until) > new Date() && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 glass px-8 py-3 rounded-full border border-red-500/30 flex items-center gap-4 z-50">
          <span className="text-[9px] font-black uppercase text-red-500 tracking-widest">SESSÃO SUSPENSA</span>
          <span className="text-[11px] font-mono text-white/50">Até {new Date(userProfile.suspended_until).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
