
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Contact, UserProfile } from './types';
import Peer, { DataConnection } from 'peerjs';
import { generateAIResponse } from './geminiService';

// Usando um ID de Blob dinâmico ou garantindo que a URL não sofra cache
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
  const [isOnline, setIsOnline] = useState(false);
  
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

  const announcePresence = useCallback(async (forcedId?: string) => {
    const currentId = forcedId || profile.id;
    if (!currentId || !profile.username) return;
    
    setIsSyncing(true);
    try {
      // Adiciona timestamp para ignorar cache do navegador
      const res = await fetch(`${REGISTRY_API}?t=${Date.now()}`, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      
      const now = Date.now();
      // Filtra usuários: remove eu mesmo (por username ou id) e usuários inativos há > 5 min
      const otherUsers = users.filter((u: any) => 
        u.username !== profile.username && 
        u.id !== currentId &&
        (now - (u.lastSeen || 0) < 300000) 
      );
      
      const me = {
        id: currentId,
        name: profile.name,
        username: profile.username,
        avatar: profile.avatar,
        bio: profile.bio,
        lastSeen: now
      };

      const updatedUsers = [...otherUsers, me];

      const saveRes = await fetch(REGISTRY_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: updatedUsers })
      });

      if (saveRes.ok) {
        setIsOnline(true);
        console.log("Nodo Concord sincronizado.");
      }
    } catch (e) {
      console.error("Falha na sincronização do registro:", e);
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  }, [profile.id, profile.name, profile.username, profile.avatar, profile.bio]);

  const fetchGlobalUsers = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${REGISTRY_API}?t=${Date.now()}`, { 
        headers: { 'Cache-Control': 'no-cache' } 
      });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      const now = Date.now();
      // Mostra apenas quem deu sinal nos últimos 2 minutos
      const active = users.filter((u: any) => (now - (u.lastSeen || 0)) < 120000);
      setGlobalUsers(active);
    } catch (e) {
      console.error("Erro ao buscar usuários:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Heartbeat mais frequente (15s) para manter visibilidade
  useEffect(() => {
    if (isLoggedIn && profile.id) {
      announcePresence();
      const interval = setInterval(() => announcePresence(), 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, profile.id, announcePresence]);

  // Polling automático da lista de amigos quando a aba está aberta
  useEffect(() => {
    if (activeTab === 'add-friends') {
      fetchGlobalUsers();
      const interval = setInterval(() => fetchGlobalUsers(), 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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
            
            // Adiciona aos contatos se não existir
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
        if (err.type === 'unavailable-id') {
          alert("Erro: Este @username já está sendo usado agora. Escolha outro.");
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
      if (file.size > 300000) {
        alert("Imagem muito pesada (máx 300KB)");
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

    const newMessage: Message = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      senderId: profile.id,
      senderName: profile.name,
      targetId: activeId,
      text: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    const textToClear = inputValue;
    setInputValue('');

    if (activeId === 'concord_gemini_ai') {
      const aiResponseText = await generateAIResponse(textToClear);
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
            <h2 className="text-[10px] font-bold mb-8 text-center uppercase tracking-[0.5em] opacity-40">Portal de Acesso</h2>
            <input required placeholder="Como quer ser chamado?" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl outline-none text-white focus:border-white/30 transition-all" />
            <input required placeholder="Username (ex: juca88)" value={profile.username} onChange={e => setProfile({...profile, username: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl outline-none text-white focus:border-white/30 transition-all font-mono text-sm" />
            <p className="text-[9px] opacity-20 text-center leading-relaxed">Cada dispositivo precisa de um username único para ser encontrado na rede.</p>
            <button type="submit" className="w-full noir-button p-5 rounded-2xl font-black uppercase tracking-widest text-[11px] mt-6">Entrar no Peak</button>
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
    <div className="h-screen w-full flex p-6 gap-6 bg-black text-white">
      <nav className="w-24 glass rounded-[3.5rem] flex flex-col items-center py-12 gap-10 shrink-0 border border-white/5">
        <Logo size="sm" syncing={isSyncing} />
        <div className="flex flex-col gap-8">
          {[
            { id: 'chats', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
            { id: 'add-friends', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
          ].map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)}
              className={`p-5 rounded-[2rem] transition-all relative group ${activeTab === item.id ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'text-zinc-700 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d={item.icon} /></svg>
              {item.id === 'add-friends' && globalUsers.filter(u => u.id !== profile.id).length > 0 && activeTab !== 'add-friends' && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black"></div>
              )}
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
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black tracking-tighter">Nodos</h2>
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
            </div>
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
                        <button onClick={() => fileInputRef.current?.click()} className="bg-white text-black p-3 rounded-xl shadow-xl hover:scale-110 transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                        </button>
                        <button onClick={() => setProfile({...profile, avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${Math.random()}`})} className="bg-zinc-800 text-white p-3 rounded-xl shadow-xl hover:scale-110 transition-all border border-white/10">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{profile.name}</h3>
                    <p className="text-sm font-mono opacity-40">@{profile.username}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-[10px] uppercase tracking-widest opacity-50">{isOnline ? 'Nodo Visível na Rede' : 'Desconectado'}</span>
                    </div>
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
                  <button onClick={() => { announcePresence(); setActiveTab('chats'); }} className="noir-button px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[11px]">Salvar e Sincronizar</button>
                  <button onClick={handleLogout} className="px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] border border-red-900/50 text-red-500 hover:bg-red-500/10 transition-all">Sair do Nodo</button>
                </div>
              </div>
            </div>
          ) : activeTab === 'add-friends' ? (
            <div className="flex-1 p-16 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar animate-in">
              <div className="flex justify-between items-center mb-16">
                <div>
                  <h2 className="text-6xl font-black tracking-tighter">Explorar</h2>
                  <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-600 mt-4">Nodos ativos em tempo real</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] opacity-20 uppercase font-bold tracking-widest">Auto-refresh ativo</span>
                  <div className="w-2 h-2 bg-white/20 rounded-full animate-pulse"></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {globalUsers.filter(u => u.id !== profile.id && u.id).length === 0 ? (
                  <div className="col-span-2 py-24 text-center border-2 border-dashed border-white/5 rounded-[4rem]">
                    <div className="mb-6 opacity-10 flex justify-center">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                    </div>
                    <p className="opacity-30 uppercase tracking-[0.3em] text-[10px] font-bold">Aguardando outros nodos entrarem no Noir Peak...</p>
                    <p className="text-[9px] opacity-10 mt-3 italic max-w-xs mx-auto">Tente abrir o site no seu celular e criar um perfil com outro @username.</p>
                  </div>
                ) : (
                  globalUsers.filter(u => u.id !== profile.id && u.id).map(u => (
                    <div key={u.id} className="glass p-8 rounded-[3rem] flex items-center justify-between group hover:bg-white/5 border border-white/5 transition-all">
                      <div className="flex items-center gap-6">
                        <img src={u.avatar} className="w-16 h-16 rounded-2xl object-cover bg-black" alt="" />
                        <div>
                          <h3 className="text-xl font-bold">{u.name}</h3>
                          <p className="text-[10px] font-mono opacity-40">@{u.username}</p>
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
                  <img src={activeContact?.avatar} className="w-14 h-14 rounded-2xl object-cover bg-black" alt="" />
                  <div>
                    <h2 className="text-xl font-black">{activeContact?.name}</h2>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-green-500">P2P Link Direto Ativo</p>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar">
                {currentChatMessages.map(m => (
                  <div key={m.id} className={`flex ${m.senderId === profile.id ? 'justify-end' : 'justify-start'} animate-in`}>
                    <div className={`max-w-[70%] p-6 rounded-[2.5rem] ${m.senderId === profile.id ? 'bg-white text-black rounded-tr-sm shadow-xl' : 'bg-zinc-900 text-white rounded-tl-sm border border-white/5'}`}>
                      <p className="text-base font-medium leading-relaxed">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-12 pt-0">
                <form onSubmit={sendMessage} className="glass rounded-[2.5rem] p-3 flex items-center gap-4 border border-white/5">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Escreva uma mensagem..." className="flex-1 bg-transparent border-none outline-none px-6 py-3 text-lg" />
                  <button type="submit" className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 transition-all shadow-lg active:scale-95">
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
