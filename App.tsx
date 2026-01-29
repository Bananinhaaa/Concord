
import React, { useState, useEffect, useRef } from 'react';
import { Message, Contact, Group, UserProfile, Story } from './types';

// Canal de comunicação entre abas (Simula o servidor em tempo real)
const chatChannel = new BroadcastChannel('concord_noir_sync');
const NOTIFICATION_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const COUNTRIES = [
  { code: '+55', name: 'Brasil', flag: '🇧🇷' },
  { code: '+1', name: 'EUA/Canadá', flag: '🇺🇸' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
];

const Logo: React.FC<{ className?: string, size?: 'sm' | 'md' | 'lg' }> = ({ className, size = 'md' }) => {
  const dimensions = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-24 h-24' : 'w-14 h-14';
  const fontSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-5xl' : 'text-3xl';
  
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className={`relative group ${dimensions}`}>
        {/* Camadas da Logo Artística */}
        <div className="absolute inset-0 bg-white rounded-[1.4rem] rotate-3 group-hover:rotate-6 transition-transform duration-500 opacity-20 blur-sm"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white to-zinc-500 rounded-[1.4rem] -rotate-3 group-hover:-rotate-12 transition-transform duration-500 opacity-20"></div>
        <div className="relative h-full w-full bg-black border border-white/20 rounded-[1.4rem] flex items-center justify-center overflow-hidden shadow-2xl group-hover:border-white/40 transition-colors">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent)]"></div>
          <span className={`${fontSize} font-black text-white tracking-tighter select-none`}>C</span>
          {/* Detalhe de "Pico/Peak" minimalista */}
          <div className="absolute bottom-1 right-1 w-2 h-2 bg-white rounded-full opacity-50"></div>
        </div>
      </div>
      {size !== 'sm' && (
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[0.2em] leading-none mb-1">CONCORD</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-4 bg-zinc-800"></div>
            <span className="text-[7px] font-bold tracking-[0.5em] text-zinc-500 uppercase">Noir Peak Edition</span>
            <div className="h-px w-4 bg-zinc-800"></div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('concord_logged') === 'true');
  const [activeTab, setActiveTab] = useState<'chats' | 'add-friends' | 'stories' | 'settings'>('chats');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('concord_profile');
    return saved ? JSON.parse(saved) : {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      username: '',
      name: '',
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${Math.random()}`,
      bio: 'Disponível no Concord.',
      phoneNumber: '',
      theme: 'dark'
    };
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('concord_contacts');
    return saved ? JSON.parse(saved) : [];
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('concord_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [stories, setStories] = useState<Story[]>(() => {
    const saved = localStorage.getItem('concord_stories');
    return saved ? JSON.parse(saved) : [];
  });

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.4;
  }, []);

  // Persistência e Sincronização do Registro
  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('concord_profile', JSON.stringify(profile));
      localStorage.setItem('concord_logged', 'true');
      
      // Atualiza o registro global para que outros encontrem a versão mais recente
      const registry = JSON.parse(localStorage.getItem('concord_registry') || '[]');
      const index = registry.findIndex((u: any) => u.id === profile.id);
      if (index !== -1) {
        registry[index] = profile;
      } else {
        registry.push(profile);
      }
      localStorage.setItem('concord_registry', JSON.stringify(registry));
    } else {
      localStorage.removeItem('concord_logged');
    }
  }, [profile, isLoggedIn]);

  useEffect(() => {
    localStorage.setItem('concord_contacts', JSON.stringify(contacts));
    localStorage.setItem('concord_messages', JSON.stringify(messages));
    localStorage.setItem('concord_stories', JSON.stringify(stories));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [contacts, messages, stories]);

  // Sincronização em tempo real
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;

      if (type === 'NEW_MESSAGE') {
        const msg = payload as Message;
        // Recebendo mensagem de outro usuário para mim
        if (msg.targetId === profile.id) {
          setMessages(prev => [...prev, msg]);
          audioRef.current?.play().catch(() => {});
          if (msg.senderId !== activeId) {
            setUnreadCounts(prev => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
          }
        }
        // Sincronizando minha própria mensagem enviada em outra aba
        else if (msg.senderId === profile.id) {
          // Verifica se já não temos essa mensagem (para evitar duplicatas)
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      }
    };

    chatChannel.addEventListener('message', handleMessage);
    return () => chatChannel.removeEventListener('message', handleMessage);
  }, [profile.id, activeId]);

  useEffect(() => {
    if (activeId && unreadCounts[activeId]) {
      setUnreadCounts(prev => {
        const n = { ...prev };
        delete n[activeId];
        return n;
      });
    }
  }, [activeId]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.name && profile.username) setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setActiveId(null);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeId) return;

    const newMessage: Message = {
      id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
      senderId: profile.id,
      senderName: profile.name,
      targetId: activeId,
      text: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    chatChannel.postMessage({ type: 'NEW_MESSAGE', payload: newMessage });
    setInputValue('');
  };

  const findUsers = () => {
    const registry = JSON.parse(localStorage.getItem('concord_registry') || '[]');
    return registry.filter((u: UserProfile) => 
      u.id !== profile.id && 
      (u.username.toLowerCase().includes(searchQuery.toLowerCase()) || u.phoneNumber.includes(searchQuery))
    );
  };

  const startChat = (user: UserProfile) => {
    if (!contacts.find(c => c.id === user.id)) {
      setContacts([...contacts, { ...user, status: 'online' }]);
    }
    setActiveId(user.id);
    setActiveTab('chats');
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
        <Logo className="mb-16" size="lg" />
        <div className="w-full max-w-sm glass p-10 rounded-[3rem] border border-white/5 shadow-2xl">
          <h2 className="text-xl font-bold mb-8 text-center tracking-tight">Iniciar Sessão</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <input required placeholder="Nome Completo" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-zinc-900/50 border border-white/10 p-4 rounded-2xl outline-none text-white focus:border-white/30 transition-all" />
            <input required placeholder="@username" value={profile.username} onChange={e => setProfile({...profile, username: e.target.value.toLowerCase()})} className="w-full bg-zinc-900/50 border border-white/10 p-4 rounded-2xl outline-none text-white focus:border-white/30 transition-all font-mono" />
             <div className="flex gap-2">
              <select className="bg-zinc-900/50 border border-white/10 p-4 rounded-2xl text-white outline-none appearance-none">
                {COUNTRIES.map(c => <option key={c.code} value={c.code} className="bg-black">{c.flag}</option>)}
              </select>
              <input required type="tel" placeholder="Telefone" value={profile.phoneNumber} onChange={e => setProfile({...profile, phoneNumber: e.target.value})} className="flex-1 bg-zinc-900/50 border border-white/10 p-4 rounded-2xl outline-none text-white focus:border-white/30 transition-all" />
            </div>
            <button type="submit" className="w-full noir-button p-5 rounded-2xl font-black uppercase tracking-widest text-[10px] mt-4">Criar Identidade</button>
          </form>
        </div>
      </div>
    );
  }

  const activeContact = contacts.find(c => c.id === activeId);
  const currentChatMessages = messages.filter(m => 
    (m.senderId === profile.id && m.targetId === activeId) || 
    (m.senderId === activeId && m.targetId === profile.id)
  );

  return (
    <div className="h-screen w-full flex p-6 gap-6 bg-black text-white selection:bg-white selection:text-black">
      {/* Sidebar Navigation */}
      <nav className="w-24 glass rounded-[3rem] flex flex-col items-center py-12 gap-10 shrink-0 border border-white/5">
        <Logo size="sm" />
        <div className="flex flex-col gap-6">
          {[
            { id: 'chats', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
            { id: 'add-friends', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
            { id: 'stories', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
          ].map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)}
              className={`p-5 rounded-[1.8rem] transition-all relative group ${activeTab === item.id ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d={item.icon} /></svg>
              {item.id === 'chats' && Object.keys(unreadCounts).length > 0 && (
                <span className="absolute top-3 right-3 w-3 h-3 bg-white rounded-full ring-4 ring-black" />
              )}
              {/* Tooltip */}
              <span className="absolute left-full ml-4 px-3 py-1 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {item.id.replace('-', ' ')}
              </span>
            </button>
          ))}
        </div>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`mt-auto p-5 rounded-[1.8rem] transition-all group relative ${activeTab === 'settings' ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="absolute left-full ml-4 px-3 py-1 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Perfil</span>
        </button>
      </nav>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Painel Lateral - Lista de Conversas */}
        {activeTab === 'chats' && (
          <aside className="w-80 glass rounded-[3rem] p-8 flex flex-col shrink-0 border border-white/5">
            <h2 className="text-2xl font-black mb-10 tracking-tighter">Mensagens</h2>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {contacts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-6">
                  <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1.5" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25-9 3.694-9 8.25c0 2.152.894 4.111 2.36 5.61l-1.09 3.51a.75.75 0 00.959.932l3.414-1.284a9.141 9.141 0 003.357.482z" /></svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest">A quiet place</p>
                  <p className="text-[9px] mt-2 leading-relaxed italic">Vá em "Descobrir" para iniciar uma conversa.</p>
                </div>
              ) : (
                contacts.map(c => (
                  <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full p-5 rounded-[2.2rem] flex items-center gap-4 transition-all relative ${activeId === c.id ? 'bg-white text-black shadow-2xl' : 'hover:bg-white/5'}`}>
                    <div className="relative shrink-0">
                      <img src={c.avatar} className="w-12 h-12 rounded-[1.2rem] object-cover ring-1 ring-white/10" alt="" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="font-bold text-sm truncate">{c.name}</p>
                      <p className={`text-[10px] opacity-40 truncate font-mono ${activeId === c.id ? 'text-black' : 'text-zinc-500'}`}>@{c.username}</p>
                    </div>
                    {unreadCounts[c.id] > 0 && (
                      <div className="min-w-[1.2rem] h-[1.2rem] bg-white text-black text-[9px] font-black rounded-full flex items-center justify-center ring-4 ring-black animate-bounce">
                        {unreadCounts[c.id]}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Conteúdo Principal */}
        <main className="flex-1 glass rounded-[3.5rem] flex flex-col overflow-hidden relative border border-white/5 shadow-2xl">
          {activeTab === 'add-friends' ? (
            <div className="flex-1 p-20 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar">
              <h2 className="text-6xl font-black mb-16 tracking-tighter">Descobrir</h2>
              <div className="relative mb-16 group">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Username ou Telefone..." className="w-full bg-white/5 border border-white/10 p-8 rounded-[2.5rem] outline-none text-xl focus:border-white/30 focus:bg-white/[0.08] transition-all" />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-20">
                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
              <div className="space-y-6">
                {findUsers().length === 0 ? (
                  <div className="p-24 text-center glass rounded-[4rem] border-dashed border-white/10 opacity-30">
                    <p className="text-[10px] font-bold uppercase tracking-[0.5em] mb-4">A rede está silenciosa</p>
                    <p className="text-[11px] leading-relaxed max-w-xs mx-auto">Para testar o tempo real, abra este site em uma aba anônima e crie uma nova conta.</p>
                  </div>
                ) : (
                  findUsers().map((u: UserProfile) => (
                    <div key={u.id} className="glass p-10 rounded-[3.5rem] flex items-center justify-between group hover:bg-white/5 transition-all border border-white/5">
                      <div className="flex items-center gap-10">
                        <img src={u.avatar} className="w-24 h-24 rounded-[2.2rem] object-cover ring-1 ring-white/10" alt="" />
                        <div>
                          <h3 className="text-3xl font-black mb-1">{u.name}</h3>
                          <p className="text-xs font-mono text-zinc-600">@{u.username}</p>
                        </div>
                      </div>
                      <button onClick={() => startChat(u)} className="noir-button px-10 py-5 rounded-[1.8rem] font-black text-[10px] uppercase tracking-[0.2em]">Conectar</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <div className="flex-1 p-20 max-w-3xl mx-auto w-full overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-16">
                <h2 className="text-6xl font-black tracking-tighter">Identidade</h2>
                <button onClick={handleLogout} className="px-8 py-3 border border-red-900/30 text-red-700 text-[10px] font-bold uppercase tracking-widest rounded-2xl hover:bg-red-900 hover:text-white transition-all">Sair da Conta</button>
              </div>
              
              <div className="space-y-12">
                <div className="flex items-center gap-12 p-12 glass rounded-[4rem] border border-white/10">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <img src={profile.avatar} className="w-44 h-44 rounded-[3rem] object-cover group-hover:brightness-50 transition-all ring-1 ring-white/20" alt="" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setProfile(p => ({...p, avatar: reader.result as string}));
                        reader.readAsDataURL(file);
                      }
                    }} />
                  </div>
                  <div className="flex-1 space-y-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600 ml-1">Nome de Exibição</label>
                      <input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-white/5 p-5 rounded-2xl outline-none text-xl font-bold focus:border-white/20 border border-transparent transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600 ml-1">Username (@)</label>
                      <input value={profile.username} onChange={e => setProfile({...profile, username: e.target.value.toLowerCase()})} className="w-full bg-white/5 p-5 rounded-2xl outline-none font-mono text-sm focus:border-white/20 border border-transparent transition-all" />
                    </div>
                  </div>
                </div>

                <div className="p-12 glass rounded-[4rem] border border-white/10 space-y-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600 ml-1">Biografia Noir</label>
                    <textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} placeholder="Sussurre algo sobre você..." className="w-full bg-white/5 p-8 rounded-[2.5rem] outline-none h-40 resize-none text-base leading-relaxed border border-transparent focus:border-white/20 transition-all" />
                  </div>
                  <div className="flex items-center justify-between p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Verificado via</span>
                      <span className="text-sm font-mono mt-1 opacity-60">{profile.phoneNumber}</span>
                    </div>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.5)]"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'chats' && activeId ? (
            <>
              <header className="h-32 flex items-center px-12 border-b border-white/5 justify-between">
                <div className="flex items-center gap-8">
                  <div className="relative group cursor-pointer">
                    <img src={activeContact?.avatar} className="w-16 h-16 rounded-[1.8rem] object-cover ring-2 ring-white/10 group-hover:scale-105 transition-transform" alt="" />
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-[6px] border-black" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">{activeContact?.name}</h2>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">Protocolo Ativo</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button className="w-14 h-14 rounded-2xl border border-white/5 flex items-center justify-center hover:bg-white hover:text-black transition-all group">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent)]">
                {currentChatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10">
                    <Logo className="scale-125 mb-10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em]">Ainda não há ecos aqui</p>
                  </div>
                )}
                {currentChatMessages.map((m) => {
                  const isMe = m.senderId === profile.id;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                      <div className={`max-w-[70%] group`}>
                        <div className={`p-7 rounded-[2.8rem] shadow-2xl transition-all ${isMe ? 'bg-white text-black rounded-tr-sm' : 'bg-zinc-900 border border-white/10 text-white rounded-tl-sm'}`}>
                          <p className="text-base font-medium leading-relaxed">{m.text}</p>
                        </div>
                        <span className={`text-[8px] font-black uppercase mt-3 block tracking-widest ${isMe ? 'text-right text-zinc-600' : 'text-zinc-500'}`}>
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-12 pt-0">
                <form onSubmit={handleSendMessage} className="glass rounded-[2.8rem] p-4 flex items-center gap-6 border border-white/10 shadow-2xl focus-within:border-white/20 transition-all">
                  <input 
                    value={inputValue} 
                    onChange={e => setInputValue(e.target.value)}
                    placeholder="Sussurre sua mensagem..." 
                    className="flex-1 bg-transparent border-none outline-none px-8 py-4 text-lg placeholder:text-zinc-800"
                  />
                  <button type="submit" className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center transition-all duration-500 ${inputValue.trim() ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.3)] rotate-0' : 'bg-zinc-900 text-zinc-700 opacity-50'}`}>
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeWidth="3" /></svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
               <Logo className="mb-16 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-1000" size="lg" />
               <div className="max-w-xs space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-[0.6em] text-zinc-600">The Silence is Louder</p>
                 <p className="text-[11px] leading-relaxed text-zinc-700 font-medium">Selecione uma alma inquieta para iniciar um diálogo criptografado no protocol Concord.</p>
               </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
