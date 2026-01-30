
import React, { useState, useEffect, useRef } from 'react';
import { supabase, saveSupabaseConfig, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import { Message, UserProfile, Chat, Group, Contact } from './types';

const ADMIN_NUMBERS = ['64981183571', '+5564981183571', '5564981183571'];
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
  const [view, setView] = useState<'chats' | 'groups' | 'contacts' | 'profile' | 'admin'>('chats');
  const [adminSubView, setAdminSubView] = useState<'users' | 'supabase'>('users');
  
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Profile Edit States
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Contacts Action
  const [newContactPhone, setNewContactPhone] = useState('');
  
  // Create Group State
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Admin States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [systemMsg, setSystemMsg] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Supabase Config States
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('CONCORD_SB_URL') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('CONCORD_SB_KEY') || '');

  // Auth States
  const [phone, setPhone] = useState('+5564981183571');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkSession = async () => {
      setLoading(true);
      if (supabase) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setSession(currentSession);
          await syncProfile(currentSession.user);
        }
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const syncProfile = async (user: any) => {
    const userPhone = user.phone || phone || '';
    // Melhoria na verificação de Admin: verifica se o número limpo contém o alvo
    const cleanPhone = userPhone.replace(/\D/g, '');
    const isAdmin = ADMIN_NUMBERS.some(n => cleanPhone.includes(n.replace(/\D/g, '')));
    
    if (!supabase) {
      // Perfil Mock para modo offline ou configuração inicial
      const mockProfile: UserProfile = {
        id: user.id || 'mock-id',
        phone: userPhone,
        display_name: editName || `Agente_${userPhone.slice(-4)}`,
        avatar_url: editAvatar,
        bio: editBio,
        is_admin: isAdmin,
        is_verified: true,
        is_banned: false,
        booster_until: null,
        suspended_until: null,
        created_at: new Date().toISOString()
      };
      setUserProfile(mockProfile);
      setEditName(mockProfile.display_name || '');
      return;
    }

    try {
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      
      if (!profile) {
        const { data: newProfile } = await supabase.from('profiles').insert({
          id: user.id,
          phone: userPhone,
          is_admin: isAdmin,
          display_name: `Agente_${userPhone.slice(-4)}`
        }).select().single();
        profile = newProfile;
      } else if (profile.is_admin !== isAdmin) {
        await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', user.id);
        profile.is_admin = isAdmin;
      }

      setUserProfile(profile);
      setEditName(profile.display_name || '');
      setEditBio(profile.bio || '');
      setEditAvatar(profile.avatar_url || '');
    } catch (e) { 
      console.error("Erro na sincronização de perfil:", e);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchChats();
      fetchGroups();
      fetchContacts();
    }
  }, [session, view]);

  useEffect(() => {
    if (!session?.user || !supabase || (!activeChat && !activeGroup)) return;
    const targetId = activeChat?.id || activeGroup?.id;
    const channel = supabase.channel(`live-${targetId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const m = p.new as Message;
      setMessages(prev => [...prev, m]);
    }).subscribe();
    fetchMessages(targetId!);
    return () => { supabase.removeChannel(channel); };
  }, [session, activeChat, activeGroup]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const fetchChats = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('messages').select('sender_id, receiver_id').or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`);
    if (data) {
      const ids = Array.from(new Set(data.flatMap((m: any) => m.sender_id === session.user.id ? m.receiver_id : m.sender_id)));
      const { data: profiles } = await supabase.from('profiles').select('id, phone, display_name, avatar_url').in('id', ids.filter(id => id !== SYSTEM_ID));
      const chatList = (profiles || []).map(p => ({ id: p.id, phone: p.phone, display_name: p.display_name, avatar_url: p.avatar_url }));
      setChats(chatList);
    }
  };

  const fetchGroups = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('groups').select('*');
    if (data) setGroups(data);
  };

  const fetchContacts = async () => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('contacts').select('contact_id').eq('user_id', session.user.id);
    if (data) {
      const ids = data.map(c => c.contact_id);
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
      if (profiles) setContacts(profiles);
    }
  };

  const fetchMessages = async (targetId: string) => {
    if (!supabase || !session) return;
    const { data } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${session.user.id}),receiver_id.eq.${targetId}`).order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const handleUpdateProfile = async () => {
    if (!userProfile) return;
    setIsProcessingAction(true);
    
    const updateData = {
      display_name: editName,
      bio: editBio,
      avatar_url: editAvatar
    };

    if (supabase) {
      try {
        const { error } = await supabase.from('profiles').update(updateData).eq('id', userProfile.id);
        if (error) throw error;
        setUserProfile({ ...userProfile, ...updateData });
        alert("Identidade Digital sincronizada com o Nodo Central.");
      } catch (e: any) {
        alert("Erro ao salvar no banco: " + e.message);
      }
    } else {
      // Fallback para modo sem banco
      setUserProfile({ ...userProfile, ...updateData });
      alert("Identidade Digital salva localmente. (Sem conexão com banco de dados)");
    }
    setIsProcessingAction(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return alert("Arquivo muito grande. Máximo 2MB.");
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddContact = async (targetId?: string) => {
    if (!supabase || !session) return;
    let finalTargetId = targetId;
    
    if (!finalTargetId) {
      const { data: targetUser } = await supabase.from('profiles').select('id').eq('phone', newContactPhone).single();
      if (!targetUser) return alert("Usuário não encontrado.");
      finalTargetId = targetUser.id;
    }

    const { error } = await supabase.from('contacts').insert({ user_id: session.user.id, contact_id: finalTargetId, status: 'accepted' });
    if (!error) {
      setNewContactPhone('');
      fetchContacts();
      fetchChats();
      alert("Contato adicionado.");
    }
  };

  const handleCreateGroup = async () => {
    if (!supabase || !newGroupName.trim() || !session) return;
    const { data: group } = await supabase.from('groups').insert({
      name: newGroupName,
      description: newGroupDesc,
      created_by: session.user.id
    }).select().single();
    if (group) {
      setNewGroupName('');
      setNewGroupDesc('');
      fetchGroups();
      alert("Grupo criado.");
    }
  };

  const handleAdminSearch = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('*').ilike('phone', `%${searchQuery}%`);
    if (data) setSearchResults(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || (!activeChat && !activeGroup) || !supabase || !session) return;
    const targetId = activeChat?.id || activeGroup?.id;
    await supabase.from('messages').insert({ sender_id: session.user.id, receiver_id: targetId, content: inputValue });
    setInputValue('');
  };

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (sbUrl && sbKey) {
      saveSupabaseConfig(sbUrl, sbKey);
    } else {
      alert("Preencha ambos os campos para conectar.");
    }
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black"><div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin"></div></div>;

  if (!session) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6 text-white font-sans">
      <Logo size="lg" />
      <div className="w-full max-w-md glass p-10 rounded-[3rem] border border-white/5 mt-10 animate-in">
        <h2 className="text-2xl font-black mb-4 text-center uppercase tracking-widest">{isOtpSent ? 'Código' : 'Entrar'}</h2>
        <form onSubmit={(e) => { 
          e.preventDefault(); 
          if(isOtpSent) { 
            const mockId = 'u-' + Math.random().toString(36).substr(2, 9); 
            setSession({user: {id: mockId, phone}}); 
            syncProfile({id: mockId, phone}); 
          } else {
            setIsOtpSent(true); 
          }
        }} className="space-y-4">
          {!isOtpSent ? <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55..." className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none" /> : <input value={otp} placeholder="000000" className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white text-center text-xl font-bold" />}
          <button type="submit" className="w-full noir-button p-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest mt-4">Continuar</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-6 bg-black text-white overflow-hidden font-sans">
      <aside className={`${activeChat || activeGroup || selectedUser ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 glass rounded-[3rem] p-8 flex-col shrink-0 border border-white/5`}>
        <div className="flex items-center justify-between mb-8">
          <Logo size="sm" />
          <div className="flex gap-4">
             {userProfile?.is_admin && <button onClick={() => { setView('admin'); setAdminSubView('users'); }} className={`text-[10px] font-bold uppercase ${view === 'admin' ? 'text-white' : 'text-zinc-500'}`}>Admin</button>}
             <button onClick={() => { setSession(null); setUserProfile(null); setView('chats'); }} className="text-[10px] font-bold uppercase text-zinc-500 hover:text-red-500">Sair</button>
          </div>
        </div>
        
        <div className="flex items-center gap-4 mb-8 bg-white/[0.03] p-4 rounded-3xl border border-white/5">
           <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
              {userProfile?.avatar_url ? <img src={userProfile.avatar_url} className="w-full h-full object-cover" /> : '👤'}
           </div>
           <div className="overflow-hidden">
              <p className="font-bold text-xs truncate">{userProfile?.display_name}</p>
              <p className="text-[8px] font-bold opacity-30 uppercase tracking-widest">{userProfile?.phone}</p>
           </div>
        </div>

        <nav className="flex flex-col gap-1 mb-6">
          <button onClick={() => setView('chats')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left ${view === 'chats' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Chats</button>
          <button onClick={() => setView('groups')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left ${view === 'groups' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Grupos</button>
          <button onClick={() => setView('contacts')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left ${view === 'contacts' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Contatos</button>
          <button onClick={() => setView('profile')} className={`p-3 rounded-xl text-[10px] font-bold uppercase text-left ${view === 'profile' ? 'bg-white text-black' : 'hover:bg-white/5'}`}>Perfil</button>
        </nav>

        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
          {view === 'chats' && chats.map(chat => (
            <button key={chat.id} onClick={() => {setActiveChat(chat); setActiveGroup(null);}} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${activeChat?.id === chat.id ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5'}`}>
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                 {chat.avatar_url ? <img src={chat.avatar_url} className="w-full h-full object-cover" /> : '👤'}
              </div>
              <div className="text-left overflow-hidden">
                <p className="font-bold text-xs truncate">{chat.display_name || chat.phone}</p>
                {!contacts.some(c => c.id === chat.id) && <span className="text-[7px] font-black uppercase text-blue-500">Desconhecido</span>}
              </div>
            </button>
          ))}
          {view === 'groups' && groups.map(group => (
            <button key={group.id} onClick={() => {setActiveGroup(group); setActiveChat(null);}} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${activeGroup?.id === group.id ? 'bg-white text-black shadow-xl' : 'hover:bg-white/5'}`}>
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-xs shrink-0">{group.name.slice(0, 2).toUpperCase()}</div>
              <p className="font-bold text-xs truncate">{group.name}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden border border-white/5 relative shadow-2xl animate-in">
        {view === 'admin' ? (
          <div className="flex-1 flex flex-col h-full">
            <header className="h-20 flex items-center px-10 border-b border-white/5 gap-10 bg-white/[0.01]">
               <button onClick={() => setAdminSubView('users')} className={`text-[10px] font-black uppercase tracking-widest ${adminSubView === 'users' ? 'text-white border-b-2 border-white pb-1' : 'text-zinc-600 hover:text-zinc-400'}`}>Gestão de Usuários</button>
               <button onClick={() => setAdminSubView('supabase')} className={`text-[10px] font-black uppercase tracking-widest ${adminSubView === 'supabase' ? 'text-blue-500 border-b-2 border-blue-500 pb-1' : 'text-zinc-600 hover:text-zinc-400'}`}>Nodo Supabase</button>
            </header>
            
            {adminSubView === 'users' ? (
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/3 border-r border-white/5 p-6 space-y-4">
                  <div className="flex gap-2">
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Número..." className="flex-1 bg-zinc-900 p-3 rounded-xl text-xs outline-none border border-white/5 focus:border-white/20" />
                    <button onClick={handleAdminSearch} className="bg-white text-black px-4 rounded-xl text-[10px] font-bold uppercase">Buscar</button>
                  </div>
                  <div className="space-y-1 overflow-y-auto custom-scrollbar h-[calc(100vh-300px)]">
                    {searchResults.map(u => (
                      <button key={u.id} onClick={() => setSelectedUser(u)} className={`w-full p-3 rounded-xl text-left text-[10px] font-bold ${selectedUser?.id === u.id ? 'bg-white text-black' : 'hover:bg-white/5'}`}>{u.phone}</button>
                    ))}
                    {searchResults.length === 0 && searchQuery && <p className="text-center py-10 opacity-20 text-[10px] uppercase font-bold">Nenhum rastro encontrado</p>}
                  </div>
                </div>
                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                   {selectedUser ? (
                     <div className="space-y-6 animate-in">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center overflow-hidden border border-white/5">
                             {selectedUser.avatar_url ? <img src={selectedUser.avatar_url} className="w-full h-full object-cover" /> : '👤'}
                          </div>
                          <div>
                            <h3 className="font-black">{selectedUser.phone}</h3>
                            <p className="text-[10px] opacity-30 uppercase tracking-widest">UID: {selectedUser.id}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <button onClick={() => setSelectedUser(null)} className="bg-zinc-800 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/5 hover:bg-zinc-700">Fechar Ficha</button>
                           <button className="bg-red-600/10 text-red-500 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-red-500/20 hover:bg-red-600 hover:text-white">Banir Agente</button>
                        </div>
                     </div>
                   ) : (
                     <div className="h-full flex items-center justify-center opacity-10 uppercase font-black tracking-widest flex-col gap-4">
                       <Logo size="lg" />
                       <span>Central de Inteligência Noir</span>
                     </div>
                   )}
                </div>
              </div>
            ) : (
              <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleSaveSupabase} className="max-w-md space-y-6 animate-in">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Nodo Central</h2>
                  <p className="text-xs text-zinc-400">Configure aqui o acesso à infraestrutura de dados. Sem isso, as mensagens e identidades não serão persistentes.</p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-30">Project URL</label>
                    <input value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://..." className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 focus:border-white/20" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-30">Anon Public Key</label>
                    <input value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="Agente..." className="w-full bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 focus:border-white/20" />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-blue-900/20 hover:scale-[1.02] transition-transform">Conectar Nodo</button>
                  <button type="button" onClick={clearSupabaseConfig} className="w-full bg-transparent text-zinc-500 border border-white/5 p-3 rounded-2xl font-bold uppercase text-[8px] hover:text-white">Desconectar Banco Atual</button>
                </form>
              </div>
            )}
          </div>
        ) : view === 'contacts' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-10">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Sincronia</h1>
              <div className="flex gap-4">
                <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Número (+55...)" className="bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 w-64 focus:border-white/20" />
                <button onClick={() => handleAddContact()} className="bg-white text-black px-8 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:shadow-xl">Adicionar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {contacts.map(c => (
                <div key={c.id} className="glass p-8 rounded-[3rem] flex flex-col items-center text-center gap-6 group hover:bg-white/[0.04] transition-all">
                  <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 flex items-center justify-center overflow-hidden border border-white/10 shadow-2xl">
                    {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" /> : '👤'}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-lg">{c.display_name || c.phone}</h4>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">{c.phone}</p>
                    <p className="text-[9px] text-zinc-500 italic mt-2 line-clamp-2">{c.bio || 'Sem biografia noir.'}</p>
                  </div>
                  <button onClick={() => { setActiveChat({ id: c.id, phone: c.phone, display_name: c.display_name, avatar_url: c.avatar_url }); setView('chats'); }} className="w-full bg-white text-black p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest group-hover:scale-105 transition-transform shadow-xl">Mensagem</button>
                </div>
              ))}
              {contacts.length === 0 && <div className="col-span-full py-20 text-center opacity-20 font-black uppercase tracking-[0.5em] select-none">Nenhum agente sincronizado</div>}
            </div>
          </div>
        ) : view === 'profile' ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-10">Identidade Digital</h1>
            <div className="max-w-xl space-y-8 animate-in">
              <div className="flex gap-8 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-40 h-40 rounded-[3rem] bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-white/40 transition-all shadow-2xl group relative">
                   {editAvatar ? <img src={editAvatar} className="w-full h-full object-cover" /> : <Logo size="lg" />}
                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] font-bold uppercase tracking-widest border border-white/20 p-2 rounded-xl">Alterar Foto</span>
                   </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <div className="flex-1 space-y-4">
                   <p className="text-xs text-zinc-400 leading-relaxed font-medium">Sua foto será convertida em rastro digital e visível para todos os nodos da rede.</p>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-zinc-800 text-[10px] font-black uppercase px-6 py-3 rounded-xl border border-white/5 hover:bg-zinc-700 transition-colors">Acessar Arquivos</button>
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-30 ml-2 tracking-widest">Nome Público</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Codinome..." className="w-full bg-zinc-900 p-5 rounded-3xl text-xs outline-none border border-white/5 focus:border-white/20" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-30 ml-2 tracking-widest">Biografia Noir</label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Escreva algo sobre sua presença..." className="w-full h-40 bg-zinc-900 p-5 rounded-3xl text-xs outline-none border border-white/5 resize-none focus:border-white/20 custom-scrollbar" />
                </div>
                <button disabled={isProcessingAction} onClick={handleUpdateProfile} className="w-full bg-white text-black p-6 rounded-[2rem] font-bold uppercase text-[10px] tracking-[0.2em] shadow-2xl hover:translate-y-[-4px] transition-all disabled:opacity-50">Sincronizar Identidade</button>
              </div>
            </div>
          </div>
        ) : view === 'groups' && !activeGroup ? (
          <div className="flex-1 p-12 overflow-y-auto custom-scrollbar">
             <div className="flex justify-between items-center mb-10">
              <h1 className="text-3xl font-black uppercase tracking-tighter">Coletivos Noir</h1>
              <div className="flex gap-4">
                <div className="flex flex-col gap-2">
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nome do Coletivo" className="bg-zinc-900 p-4 rounded-2xl text-xs outline-none border border-white/5 w-64 focus:border-white/20" />
                  <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Diretriz Principal" className="bg-zinc-900 p-4 rounded-2xl text-[9px] outline-none border border-white/5 w-64 focus:border-white/20" />
                </div>
                <button onClick={handleCreateGroup} className="bg-white text-black px-8 rounded-2xl text-[10px] font-bold uppercase self-start py-4 hover:shadow-2xl transition-all">Formar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {groups.map(g => (
                 <button key={g.id} onClick={() => setActiveGroup(g)} className="glass p-10 rounded-[3.5rem] text-left hover:bg-white/[0.04] transition-all group border border-white/[0.03]">
                    <h3 className="text-xl font-black mb-2 uppercase group-hover:text-white">{g.name}</h3>
                    <p className="text-xs opacity-40 italic">{g.description || 'Sem diretrizes definidas.'}</p>
                 </button>
               ))}
               {groups.length === 0 && <div className="col-span-full py-20 text-center opacity-10 font-black uppercase tracking-[1em]">Nenhum coletivo ativo</div>}
            </div>
          </div>
        ) : (activeChat || activeGroup) ? (
          <>
            <header className="h-24 flex items-center px-10 border-b border-white/5 shrink-0 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10 shadow-lg">
                {activeChat?.avatar_url ? <img src={activeChat.avatar_url} className="w-full h-full object-cover" /> : (activeChat ? '👤' : '👥')}
              </div>
              <div className="ml-4 flex-1 overflow-hidden">
                <div className="flex items-center">
                  <h2 className="text-sm font-black truncate">{activeChat?.display_name || activeChat?.phone || activeGroup?.name}</h2>
                  {isTyping && <div className="ml-3"><TypingIndicator /></div>}
                </div>
                <span className="text-[8px] font-bold uppercase opacity-30 tracking-widest block truncate">{activeChat ? 'Criptografia de Ponto-a-Ponto' : `${activeGroup?.description}`}</span>
              </div>
              {activeChat && !contacts.some(c => c.id === activeChat.id) && (
                <div className="flex gap-2">
                  <button onClick={() => handleAddContact(activeChat.id)} className="bg-blue-600/10 text-blue-400 border border-blue-600/20 px-6 py-2 rounded-xl text-[9px] font-bold uppercase hover:bg-blue-600 hover:text-white transition-all">Aceitar Conexão</button>
                  <button onClick={() => { setActiveChat(null); fetchChats(); }} className="bg-zinc-800 border border-white/5 px-6 py-2 rounded-xl text-[9px] font-bold uppercase hover:text-red-500 transition-all">Bloquear</button>
                </div>
              )}
              {(activeChat || activeGroup) && <button onClick={() => { setActiveChat(null); setActiveGroup(null); }} className="lg:hidden ml-4 text-[10px] font-bold uppercase opacity-50">Voltar</button>}
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar bg-black/10">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === session?.user?.id || m.sender_id === 'mock-id' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] p-5 rounded-[2rem] shadow-2xl relative ${m.sender_id === session?.user?.id || m.sender_id === 'mock-id' ? 'bg-white text-black' : m.sender_id === SYSTEM_ID ? 'bg-zinc-800 border-l-4 border-white text-white italic' : 'bg-zinc-900 text-white border border-white/5'}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    <span className="text-[7px] font-bold uppercase opacity-30 mt-2 block text-right">{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-center py-20 opacity-10 text-[10px] uppercase font-black tracking-[0.3em]">O silêncio ecoa na névoa digital</p>}
            </div>
            <div className="p-10 pt-0">
              {(!activeChat || contacts.some(c => c.id === activeChat.id)) ? (
                <form onSubmit={sendMessage} className="bg-zinc-900/50 rounded-[2.5rem] p-2 flex items-center gap-2 border border-white/5 focus-within:border-white/20 transition-all shadow-2xl">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Transmitir mensagem..." className="flex-1 bg-transparent outline-none px-6 py-3 text-sm" />
                  <button type="submit" className="w-14 h-14 bg-white text-black rounded-[1.8rem] flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl">➤</button>
                </form>
              ) : (
                <div className="bg-zinc-900/40 p-6 rounded-3xl border border-white/5 text-center backdrop-blur-md">
                   <p className="text-[10px] font-black uppercase opacity-30 tracking-[0.2em]">Conexão pendente de aprovação</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-5 select-none pointer-events-none">
            <Logo size="lg" />
            <p className="text-[10px] font-black uppercase tracking-[1em] mt-10">Concord Messenger</p>
          </div>
        )}
      </main>
    </div>
  );
}
