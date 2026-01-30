
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat, Group } from './types';

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

const TypingIndicator = () => (
  <div className="flex gap-1 items-center ml-2">
    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce"></div>
  </div>
);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chats' | 'groups' | 'admin' | 'supabase'>('chats');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false); // Simulação de digitação
  
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
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (session?.user) {
      fetchChats();
      fetchGroups();
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user || !supabase || (!activeChat && !activeGroup)) return;

    const targetId = activeChat?.id || activeGroup?.id;
    const channel = supabase
      .channel(`chat-${targetId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        // Lógica simplificada para exibição de mensagens no chat ativo
        setMessages(prev => [...prev, msg]);
      })
      .subscribe();

    if (activeChat) fetchMessages(activeChat.id);
    // if (activeGroup) fetchGroupMessages(activeGroup.id); // Implementar se tabela group_messages existir

    return () => { supabase.removeChannel(channel); };
  }, [session, activeChat, activeGroup]);

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

  const fetchGroups = async () => {
    if (!supabase) {
      // Mock groups para teste
      setGroups([{ id: 'g1', name: 'Elite Noir', created_by: 'system', created_at: new Date().toISOString() }]);
      return;
    };
    const { data } = await supabase.from('groups').select('*');
    if (data) setGroups(data);
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
      alert("Configurações do Supabase não encontradas.");
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').ilike('phone', `%${searchQuery}%`);
    if (error) alert("Erro na busca: " + error.message);
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

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setTimeout(() => { setIsOtpSent(true); setAuthLoading(false); }, 800);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setTimeout(async () => {
      const mockUser = { id: 'test-user-id', phone: phone };
      setSession({ user: mockUser });
      await syncProfile(mockUser);
      setAuthLoading(false);
    }, 800);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || (!activeChat && !activeGroup) || !session || !supabase) return;
    if (userProfile?.suspended_until && new Date(userProfile.suspended_until) > new Date()) {
      alert("Você está suspenso.");
      return;
    }
    const content = inputValue;
    setInputValue('');
    
    // Simulação sutil de digitação ao enviar
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);

    await supabase.from('messages').insert({
      sender_id: session.user.id,
      receiver_id: activeChat?.id || activeGroup?.id,
      content: content
    });
  };

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (sbUrl && sbKey) saveSupabaseConfig(sbUrl, sbKey);
  };

  const sqlCode = `
-- 1. Tabela de Perfis
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  phone TEXT UNIQUE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  booster_until TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Mensagens
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Grupos
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Membros do Grupo
CREATE TABLE group_members (
  group_id UUID REFERENCES groups ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Habilitar Realtime para mensagens e grupos
  `.trim();

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6 text-white font-sans">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] border border-white/5 mt-10 animate-in">
        <h2 className="text-2xl font-black mb-4 text-center uppercase tracking-widest">{isOtpSent ? 'Código' : 'Login'}</h2>
        <form onSubmit={isOtpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
          {!isOtpSent ? <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 64 9..." className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none text-sm" /> : <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="000000" required maxLength={6} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl tracking-widest font-bold" />}
          <button disabled={authLoading} type="submit" className="w-full noir-button p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest mt-4">{authLoading ? '...' : (isOtpSent ? 'Confirmar' : 'Entrar')}</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white overflow-hidden font-sans">
      {/* Sidebar de Navegação */}
      <aside className={`${activeChat || activeGroup || selectedUser || view === 'supabase' ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <button onClick={() => { setSession(null); setUserProfile(null); }} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sair</button>
        </div>
        
        <div className="flex flex-col gap-2 mb-6">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setView('chats'); setActiveChat(null); setActiveGroup(null); setSelectedUser(null); }} className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest ${view === 'chats' ? 'bg-white text-black' : 'bg-zinc-900'}`}>Chats</button>
            <button onClick={() => { setView('groups'); setActiveChat(null); setActiveGroup(null); setSelectedUser(null); }} className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest ${view === 'groups' ? 'bg-white text-black' : 'bg-zinc-900'}`}>Grupos</button>
          </div>
          {userProfile?.is_admin && (
            <>
              <button onClick={() => { setView('admin'); setActiveChat(null); setActiveGroup(null); }} className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest ${view === 'admin' ? 'bg-white text-black' : 'bg-zinc-900'}`}>Admin Panel</button>
              <button onClick={() => { setView('supabase'); setActiveChat(null); setActiveGroup(null); setSelectedUser(null); }} className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest ${view === 'supabase' ? 'bg-blue-600 text-white' : 'bg-zinc-900'}`}>Config Supabase</button>
            </>
          )}
        </div>

        {view === 'chats' && (
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {chats.map(chat => (
              <button key={chat.id} onClick={() => setActiveChat(chat)} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${activeChat?.id === chat.id ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5'}`}>
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">👤</div>
                <p className="font-bold text-xs truncate">{chat.phone}</p>
              </button>
            ))}
          </div>
        )}

        {view === 'groups' && (
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {groups.map(group => (
              <button key={group.id} onClick={() => setActiveGroup(group)} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${activeGroup?.id === group.id ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5'}`}>
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-xs">{group.name.slice(0, 2).toUpperCase()}</div>
                <p className="font-bold text-xs truncate">{group.name}</p>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl">
        {view === 'supabase' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in">
            <h1 className="text-3xl font-black mb-8">CONFIGURAÇÃO DO BANCO</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <form onSubmit={handleSaveSupabase} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-50 ml-2">URL do Projeto</label>
                  <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://..." className="w-full bg-zinc-900 border border-white/5 p-4 rounded-2xl text-xs outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-50 ml-2">Anon Key (Public)</label>
                  <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJ..." className="w-full bg-zinc-900 border border-white/5 p-4 rounded-2xl text-xs outline-none" />
                </div>
                <button type="submit" className="w-full bg-white text-black p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest">Salvar e Conectar</button>
              </form>
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase opacity-50 ml-2">SQL Schema Atualizado (Grupos inclusos)</p>
                <pre className="bg-zinc-950 p-6 rounded-3xl text-[9px] font-mono text-zinc-400 border border-white/5 overflow-x-auto whitespace-pre-wrap leading-relaxed">{sqlCode}</pre>
              </div>
            </div>
          </div>
        ) : view === 'admin' ? (
          <div className="flex-1 flex flex-col h-full animate-in">
            <div className="p-10 border-b border-white/5 bg-white/[0.01]">
              <h2 className="text-xs font-black uppercase tracking-widest mb-4 opacity-50">Pesquisar Contas</h2>
              <div className="flex gap-4">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Número ou ID..." className="flex-1 bg-zinc-900 border border-white/5 p-4 rounded-2xl text-xs outline-none" />
                <button onClick={handleAdminSearch} className="bg-white text-black px-10 rounded-2xl font-bold text-[10px] uppercase tracking-widest">Buscar</button>
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/3 border-r border-white/5 overflow-y-auto custom-scrollbar p-6 space-y-2">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => setSelectedUser(u)} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${selectedUser?.id === u.id ? 'bg-white text-black' : 'hover:bg-white/5 bg-zinc-900/50'}`}>
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">👤</div>
                    <div className="text-left"><p className="text-[10px] font-bold truncate">{u.phone}</p></div>
                  </button>
                ))}
              </div>
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                {selectedUser ? (
                  <div className="space-y-10">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-3xl">👤</div>
                      <div><h3 className="text-xl font-black">{selectedUser.phone}</h3><p className="text-[9px] uppercase font-bold text-zinc-500">UID: {selectedUser.id}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="glass p-6 rounded-3xl space-y-4">
                        <button onClick={() => updateSelectedUser({ is_verified: !selectedUser.is_verified })} className={`w-full p-4 rounded-xl flex justify-between font-bold text-[10px] ${selectedUser.is_verified ? 'bg-blue-600' : 'bg-zinc-800'}`}>VERIFICADO <span>{selectedUser.is_verified ? 'ON' : 'OFF'}</span></button>
                        <button onClick={() => updateSelectedUser({ is_admin: !selectedUser.is_admin })} className={`w-full p-4 rounded-xl flex justify-between font-bold text-[10px] ${selectedUser.is_admin ? 'bg-red-600' : 'bg-zinc-800'}`}>ADMIN <span>{selectedUser.is_admin ? 'ON' : 'OFF'}</span></button>
                      </div>
                      <div className="glass p-6 rounded-3xl space-y-4">
                        <textarea value={systemMsg} onChange={e => setSystemMsg(e.target.value)} placeholder="Mensagem do Sistema..." className="w-full h-24 bg-zinc-900 border border-white/5 rounded-2xl p-4 text-xs resize-none outline-none" />
                        <button onClick={sendSystemMessage} className="w-full bg-white text-black p-4 rounded-2xl font-bold text-[10px] uppercase">Enviar Aviso</button>
                      </div>
                    </div>
                  </div>
                ) : <div className="h-full flex flex-col items-center justify-center opacity-10"><p className="text-[10px] font-black uppercase tracking-[0.5em]">Gerenciador Noir</p></div>}
              </div>
            </div>
          </div>
        ) : (activeChat || activeGroup) ? (
          <>
            <header className="h-24 flex items-center px-10 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                {activeChat ? '👤' : '👥'}
              </div>
              <div className="ml-4 flex-1">
                <div className="flex items-center">
                  <h2 className="text-sm font-black">{activeChat?.phone || activeGroup?.name}</h2>
                  {isTyping && (
                    <div className="flex items-center gap-1.5 ml-3">
                      <span className="text-[8px] font-bold uppercase text-zinc-500 animate-pulse">digitando</span>
                      <TypingIndicator />
                    </div>
                  )}
                </div>
                <span className="text-[8px] font-bold uppercase opacity-30 tracking-widest">{activeChat ? 'Criptografia Noir' : `${groups.find(g => g.id === activeGroup?.id)?.description || 'Canal Coletivo'}`}</span>
              </div>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-4 custom-scrollbar">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session.user.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-4 rounded-[1.5rem] ${m.sender_id === session.user.id ? 'bg-white text-black' : m.sender_id === SYSTEM_ID ? 'bg-zinc-800 border-l-4 border-white text-white italic' : 'bg-zinc-900 text-white'}`}>
                    <p className="text-sm">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-10 pt-0">
              <form onSubmit={sendMessage} className="bg-zinc-900/50 rounded-[2.5rem] p-2 flex items-center gap-2 border border-white/5">
                <input value={inputValue} onChange={e => {
                  setInputValue(e.target.value);
                  // Simulação de presença ao digitar (poderia enviar evento ao Supabase aqui)
                }} placeholder="Escreva..." className="flex-1 bg-transparent outline-none px-6 py-2 text-sm" />
                <button type="submit" className="w-12 h-12 bg-white text-black rounded-[1.5rem] flex items-center justify-center">➤</button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5">
            <Logo size="lg" /><p className="text-[10px] font-black uppercase tracking-[0.5em] mt-10">Concord Messenger</p>
          </div>
        )}
      </main>
    </div>
  );
}
