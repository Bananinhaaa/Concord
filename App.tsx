
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Contact, UserProfile } from './types';
import Peer, { DataConnection } from 'peerjs';
import { generateAIResponse } from './geminiService';

const REGISTRY_API = "https://jsonblob.com/api/jsonBlob/1344426563725705216"; 
const NOTIFICATION_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const Logo: React.FC<{ className?: string, size?: 'sm' | 'md' | 'lg', syncing?: boolean }> = ({ className, size = 'md', syncing }) => {
  const containerSize = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-32 h-32' : 'w-16 h-16';
  
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className={`relative ${containerSize} group cursor-pointer`}>
        <div className={`absolute inset-0 bg-white opacity-10 rounded-xl transition-all duration-1000 ${syncing ? 'animate-ping' : 'rotate-45'}`}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent rounded-xl rotate-12 opacity-20"></div>
        <div className="relative h-full w-full bg-black border border-white/20 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl">
          <svg viewBox="0 0 100 100" className="w-1/2 h-1/2 fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
            <path d="M50 5 L 95 50 L 50 95 L 5 50 Z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M50 20 L 80 50 L 50 80 L 20 50 Z" />
            <circle cx="50" cy="50" r="5" fill="white" className={syncing ? 'animate-pulse' : ''} />
          </svg>
        </div>
      </div>
      {size !== 'sm' && (
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[0.5em] leading-none mb-2">CONCORD</h1>
          <div className="flex items-center justify-center gap-2 opacity-30">
            <span className="text-[7px] font-bold tracking-[0.4em] uppercase">Apex Protocol • Realtime</span>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem('concord_logged') === 'true';
    } catch {
      return false;
    }
  });
  
  const [activeTab, setActiveTab] = useState<'chats' | 'add-friends' | 'settings'>('chats');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalUsers, setGlobalUsers] = useState<UserProfile[]>([]);
  const [connections, setConnections] = useState<Record<string, DataConnection>>({});
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('concord_profile');
      return saved ? JSON.parse(saved) : {
        id: '',
        username: '',
        name: '',
        avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${Math.random()}`,
        bio: 'Ecoando no Noir Peak.',
        phoneNumber: '',
        theme: 'dark'
      };
    } catch {
      return { id: '', username: '', name: '', avatar: '', bio: '', phoneNumber: '', theme: 'dark' };
    }
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const saved = localStorage.getItem('concord_contacts');
      const initial = saved ? JSON.parse(saved) : [];
      const aiContact: Contact = {
        id: 'concord_gemini_ai',
        username: 'gemini',
        name: 'Concord AI',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=gemini&backgroundColor=000000',
        status: 'online',
        bio: 'O oráculo silencioso do Noir Peak.'
      };
      if (!initial.some((c: Contact) => c.id === aiContact.id)) {
        initial.unshift(aiContact);
      }
      return initial;
    } catch {
      return [];
    }
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('concord_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inputValue, setInputValue] = useState('');
  const peerRef = useRef<Peer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.3;
  }, []);

  // Função robusta de anúncio de presença
  const announcePresence = useCallback(async (forcedId?: string) => {
    const currentId = forcedId || profile.id;
    if (!currentId || !profile.username) return;
    
    setIsSyncing(true);
    try {
      const res = await fetch(REGISTRY_API, { cache: 'no-cache' });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      
      // Remove versões antigas de mim mesmo e usuários offline há mais de 10 min
      const now = Date.now();
      const otherUsers = users.filter((u: any) => 
        u.username !== profile.username && 
        u.id !== currentId &&
        (now - (u.lastSeen || 0) < 600000) 
      );
      
      const me = {
        id: currentId,
        name: profile.name,
        username: profile.username,
        avatar: profile.avatar,
        bio: profile.bio,
        lastSeen: now
      };

      await fetch(REGISTRY_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: [...otherUsers, me] })
      });
      console.log("Nodo anunciado com sucesso.");
    } catch (e) {
      console.error("Erro ao anunciar presença:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [profile.id, profile.name, profile.username, profile.avatar, profile.bio]);

  // Heartbeat: atualiza presença a cada 30 segundos enquanto logado
  useEffect(() => {
    if (isLoggedIn && profile.id) {
      const interval = setInterval(() => announcePresence(), 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, profile.id, announcePresence]);

  // Inicialização do Peer
  useEffect(() => {
    if (isLoggedIn && profile.username && !peerRef.current) {
      const peerId = `concord_${profile.username.toLowerCase()}`;
      const peer = new Peer(peerId);
      
      peer.on('open', (id) => {
        setProfile(p => ({ ...p, id }));
        announcePresence(id);
      });

      peer.on('connection', (conn) => {
        conn.on('data', (data: any) => {
          if (data.type === 'message') {
            const msg = data.payload as Message;
            setMessages(prev => [...prev, msg]);
            audioRef.current?.play().catch(() => {});
            
            setContacts(prev => {
              if (prev.find(c => c.id === msg.senderId)) return prev;
              return [...prev, {
                id: msg.senderId,
                name: msg.senderName,
                username: msg.senderId.replace('concord_', ''),
                avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.senderId}`,
                status: 'online'
              } as Contact];
            });
          }
        });
        setConnections(prev => ({ ...prev, [conn.peer]: conn }));
      });

      peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'unavailable-id') {
          alert("Este @username já está ativo em outro dispositivo. Por favor, use um nome diferente.");
          handleLogout();
        }
      });

      peerRef.current = peer;
      return () => {
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }
      };
    }
  }, [isLoggedIn, profile.username, announcePresence]);

  const fetchGlobalUsers = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(REGISTRY_API, { cache: 'no-cache' });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      // Filtra usuários que não deram sinal nos últimos 10 minutos
      const active = users.filter((u: any) => (Date.now() - (u.lastSeen || 0)) < 600000);
      setGlobalUsers(active);
    } catch (e) {
      setGlobalUsers([]); 
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('concord_profile', JSON.stringify(profile));
      localStorage.setItem('concord_logged', 'true');
      localStorage.setItem('concord_contacts', JSON.stringify(contacts));
      localStorage.setItem('concord_messages', JSON.stringify(messages));
    }
  }, [profile, isLoggedIn, contacts, messages]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.name && profile.username) setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        alert("A imagem é muito grande. Use uma imagem menor que 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const startChat = (user: UserProfile) => {
    setContacts(prev => {
      if (prev.find(c => c.id === user.id)) return prev;
      return [...prev, {
        id: user.id,
        name: user.name,
        username: user.username,
        avatar: user.avatar,
        status: 'online',
        bio: user.bio
      } as Contact];
    });
    setActiveId(user.id);
    setActiveTab('chats');
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeId) return;

    const userText = inputValue;
    const newMessage: Message = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      senderId: profile.id,
      senderName: profile.name,
      targetId: activeId,
      text: userText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');

    if (activeId === 'concord_gemini_ai') {
      const aiResponseText = await generateAIResponse(userText);
      const aiMessage: Message = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        senderId: 'concord_gemini_ai',
        senderName: 'Concord AI',
        targetId: profile.id,
        text: aiResponseText,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
      audioRef.current?.play().catch(() => {});
      return;
    }

    let conn = connections[activeId];
    if (!conn && peerRef.current) {
      conn = peerRef.current.connect(activeId);
      setConnections(prev => ({ ...prev, [activeId]: conn }));
      conn.on('open', () => conn.send({ type: 'message', payload: newMessage }));
      conn.on('error', () => alert("Erro ao conectar com o Nodo remoto. Pode estar offline."));
    } else if (conn) {
      conn.send({ type: 'message', payload: newMessage });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
        <Logo className="mb-20" size="lg" />
        <div className="w-full max-w-md glass p-10 rounded-[3rem] border border-white/5 shadow-2xl animate-in">
          <form onSubmit={handleLogin} className="space-y-6">
            <h2 className="text-[10px] font-bold mb-8 text-center uppercase tracking-[0.5em] opacity-40">Identidade P2P</h2>
            <input required placeholder="Seu Nome" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl outline-none text-white focus:border-white/30 transition-all" />
            <input required placeholder="Seu @username (Ex: usuario1)" value={profile.username} onChange={e => setProfile({...profile, username: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl outline-none text-white focus:border-white/30 transition-all font-mono text-sm" />
            <p className="text-[9px] opacity-20 text-center italic">Use nomes diferentes em cada dispositivo para testar.</p>
            <button type="submit" className="w-full noir-button p-5 rounded-2xl font-black uppercase tracking-widest text-[11px] mt-6">Ativar Nodo</button>
          </form>
        </div>
      </div>
    );
  }

  const activeContact = contacts.find(c => c.id === activeId) || globalUsers.find(u => u.id === activeId);
  const currentChatMessages = messages.filter(m => 
    (m.senderId === profile.id && m.targetId === activeId) || 
    (m.senderId === activeId && m.targetId === profile.id)
  );

  return (
    <div className="h-screen w-full flex p-6 gap-6 bg-black text-white selection:bg-white selection:text-black">
      <nav className="w-24 glass rounded-[3.5rem] flex flex-col items-center py-12 gap-10 shrink-0 border border-white/5">
        <Logo size="sm" syncing={isSyncing} />
        <div className="flex flex-col gap-8">
          {[
            { id: 'chats', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
            { id: 'add-friends', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
          ].map(item => (
            <button 
              key={item.id} 
              onClick={() => { setActiveTab(item.id as any); if(item.id === 'add-friends') fetchGlobalUsers(); }}
              className={`p-5 rounded-[2rem] transition-all relative group ${activeTab === item.id ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'text-zinc-700 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d={item.icon} /></svg>
            </button>
          ))}
        </div>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`mt-auto p-5 rounded-[2rem] transition-all ${activeTab === 'settings' ? 'bg-white text-black scale-110' : 'text-zinc-700 hover:text-white'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
      </nav>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {activeTab === 'chats' && (
          <aside className="w-80 glass rounded-[3.5rem] p-8 flex flex-col shrink-0 border border-white/5 animate-in">
            <h2 className="text-2xl font-black mb-10 tracking-tighter">Nodo Local</h2>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {contacts.map(c => (
                <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full p-5 rounded-[2.5rem] flex items-center gap-4 transition-all relative ${activeId === c.id ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
                  <img src={c.avatar} className="w-12 h-12 rounded-xl object-cover" alt="" />
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="font-bold text-sm truncate">{c.name}</p>
                    <p className="text-[10px] opacity-40 truncate">@{c.username}</p>
                  </div>
                </button>
              ))}
              {contacts.length === 1 && (
                <div className="py-10 text-center opacity-20">
                  <p className="text-[10px] uppercase tracking-widest">Nenhum par encontrado</p>
                </div>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 glass rounded-[4rem] flex flex-col overflow-hidden relative border border-white/5 shadow-2xl">
          {activeTab === 'settings' ? (
            <div className="flex-1 p-16 max-w-2xl mx-auto w-full overflow-y-auto custom-scrollbar animate-in">
              <h2 className="text-6xl font-black tracking-tighter mb-12">Perfil</h2>
              <div className="space-y-12">
                <div className="flex items-center gap-10">
                  <div className="relative group">
                    <img src={profile.avatar} className="w-32 h-32 rounded-[2.5rem] object-cover border-2 border-white/10" alt="" />
                    <input type="file" ref={fileInputRef} onChange={handleAvatarFileChange} accept="image/*" className="hidden" />
                    
                    <div className="absolute -bottom-2 -right-2 flex gap-2">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-white text-black p-3 rounded-xl shadow-xl hover:scale-110 transition-all border border-black/10"
                          title="Fazer upload de foto"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeWidth="3" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        
                        <button 
                          onClick={() => setProfile({...profile, avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${Math.random()}`})}
                          className="bg-zinc-800 text-white p-3 rounded-xl shadow-xl hover:scale-110 transition-all border border-white/10"
                          title="Avatar aleatório"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{profile.name}</h3>
                    <p className="text-sm font-mono opacity-40">@{profile.username}</p>
                    <p className="text-[10px] uppercase tracking-widest mt-2 px-3 py-1 bg-white/5 rounded-full inline-block border border-white/5">Nodo: {profile.id ? 'Ativo' : 'Sincronizando...'}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2 block">Nome de Exibição</label>
                    <input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl outline-none focus:border-white/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2 block">Bio / Status</label>
                    <textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl outline-none focus:border-white/30 h-32 resize-none" />
                  </div>
                </div>

                <div className="pt-10 border-t border-white/5 flex gap-4">
                  <button onClick={() => { announcePresence(); setActiveTab('chats'); }} className="noir-button px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[11px]">Atualizar Nodo</button>
                  <button onClick={handleLogout} className="px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] border border-red-900/50 text-red-500 hover:bg-red-500/10 transition-all">Desconectar</button>
                </div>
              </div>
            </div>
          ) : activeTab === 'add-friends' ? (
            <div className="flex-1 p-16 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar animate-in">
              <div className="flex justify-between items-center mb-16">
                <div>
                  <h2 className="text-6xl font-black tracking-tighter">Explorar</h2>
                  <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-600 mt-4">Nodos ativos no Noir Peak</p>
                </div>
                <button onClick={fetchGlobalUsers} className="p-4 border border-white/10 rounded-2xl hover:bg-white/5 transition-all group">
                  <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-all duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {globalUsers.filter(u => u.id !== profile.id).length === 0 ? (
                  <div className="col-span-2 py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                    <p className="opacity-30 uppercase tracking-[0.3em] text-[10px] font-bold">Nenhum outro nodo detectado na rede</p>
                    <p className="text-[9px] opacity-10 mt-2 italic">Dica: Abra o site em outro navegador ou aba anônima com um @username diferente.</p>
                  </div>
                ) : (
                  globalUsers.filter(u => u.id !== profile.id).map(u => (
                    <div key={u.id} className="glass p-8 rounded-[3rem] flex items-center justify-between group hover:bg-white/5 border border-white/5 transition-all">
                      <div className="flex items-center gap-6">
                        <img src={u.avatar} className="w-16 h-16 rounded-2xl object-cover" alt="" />
                        <div>
                          <h3 className="text-xl font-bold">{u.name}</h3>
                          <p className="text-[10px] font-mono opacity-40">@{u.username}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-[8px] uppercase tracking-tighter opacity-30">Online</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => startChat(u)} className="noir-button px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest">Conectar</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'chats' && activeId ? (
            <>
              <header className="h-32 flex items-center px-12 border-b border-white/5 justify-between">
                <div className="flex items-center gap-6">
                  <img src={activeContact?.avatar} className="w-14 h-14 rounded-2xl object-cover" alt="" />
                  <div>
                    <h2 className="text-xl font-black">{activeContact?.name}</h2>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-green-500">
                      {activeId === 'concord_gemini_ai' ? 'Conexão Oráculo Sincronizada' : 'P2P Link Direto Ativo'}
                    </p>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar">
                {currentChatMessages.map(m => (
                  <div key={m.id} className={`flex ${m.senderId === profile.id ? 'justify-end' : 'justify-start'} animate-in`}>
                    <div className={`max-w-[70%] p-6 rounded-[2.5rem] ${m.senderId === profile.id ? 'bg-white text-black rounded-tr-sm' : 'bg-zinc-900 text-white rounded-tl-sm'}`}>
                      <p className="text-base font-medium">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-12 pt-0">
                <form onSubmit={sendMessage} className="glass rounded-[2.5rem] p-3 flex items-center gap-4 border border-white/5">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Escreva uma mensagem..." className="flex-1 bg-transparent border-none outline-none px-6 py-3 text-lg" />
                  <button type="submit" className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-10">
              <Logo size="lg" />
              <p className="text-[10px] font-bold uppercase tracking-[0.5em] mt-10">Apex Noir Protocol • Sincronizado</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
