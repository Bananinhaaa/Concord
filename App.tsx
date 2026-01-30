
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Contact, UserProfile } from './types';
import Peer, { DataConnection } from 'peerjs';
import { generateAIResponse } from './geminiService';

// Novo ID de Registro (Atualizado para garantir persistência)
const REGISTRY_ID = "1344465499252604928";
const REGISTRY_API = `https://jsonblob.com/api/jsonBlob/${REGISTRY_ID}`;
const NOTIFICATION_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const Logo: React.FC<{ className?: string, size?: 'sm' | 'md' | 'lg', syncing?: boolean }> = ({ className, size = 'md', syncing }) => {
  const containerSize = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-32 h-32' : 'w-16 h-16';
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className={`relative ${containerSize} group cursor-pointer`}>
        <div className={`absolute inset-0 bg-white opacity-5 rounded-xl transition-all duration-1000 ${syncing ? 'animate-ping' : 'rotate-45'}`}></div>
        <div className="relative h-full w-full bg-black border border-white/10 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl">
          <svg viewBox="0 0 100 100" className="w-1/2 h-1/2 fill-white opacity-80">
            <path d="M50 5 L 95 50 L 50 95 L 5 50 Z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M50 20 L 80 50 L 50 80 L 20 50 Z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('concord_logged') === 'true');
  const [activeTab, setActiveTab] = useState<'chats' | 'add-friends' | 'settings'>('chats');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalUsers, setGlobalUsers] = useState<UserProfile[]>([]);
  const [connections, setConnections] = useState<Record<string, DataConnection>>({});
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline');
  const [errorMsg, setErrorMsg] = useState('');

  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('concord_profile');
    return saved ? JSON.parse(saved) : {
      id: '', username: '', name: '', 
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${Math.random()}`,
      bio: 'Ecoando no Noir Peak.', phoneNumber: '', theme: 'dark'
    };
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('concord_contacts');
    const initial = saved ? JSON.parse(saved) : [];
    if (!initial.some((c: any) => c.id === 'concord_gemini_ai')) {
      initial.unshift({
        id: 'concord_gemini_ai', username: 'gemini', name: 'Concord AI',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=gemini&backgroundColor=000000',
        status: 'online', bio: 'O oráculo do Noir Peak.'
      });
    }
    return initial;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('concord_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [inputValue, setInputValue] = useState('');
  const peerRef = useRef<Peer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
  }, []);

  // Sincronização ultra-defensiva
  const syncRegistry = useCallback(async (action: 'announce' | 'fetch', myId?: string) => {
    if (isSyncing) return;
    setIsSyncing(true);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    try {
      // Tenta ler o registro
      const getRes = await fetch(`${REGISTRY_API}?t=${Date.now()}`, { headers });
      
      if (!getRes.ok) {
         // Se o registro não existir, tenta criar um novo com a lista vazia
         if (getRes.status === 404) {
            await fetch(`https://jsonblob.com/api/jsonBlob`, {
               method: 'POST',
               headers,
               body: JSON.stringify({ users: [] })
            });
         }
         throw new Error(`Servidor indisponível (${getRes.status})`);
      }
      
      const data = await getRes.json();
      let users = Array.isArray(data.users) ? data.users : [];
      const now = Date.now();

      // Expira usuários inativos (3 minutos para ser mais tolerante)
      users = users.filter((u: any) => (now - (u.lastSeen || 0)) < 180000);

      if (action === 'announce' && myId && profile.username) {
        users = users.filter((u: any) => u.username !== profile.username && u.id !== myId);
        users.push({
          id: myId,
          name: profile.name,
          username: profile.username,
          avatar: profile.avatar,
          bio: profile.bio,
          lastSeen: now
        });

        const putRes = await fetch(REGISTRY_API, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ users })
        });
        
        if (putRes.ok) {
          setConnectionStatus('online');
          setErrorMsg('');
        }
      }

      setGlobalUsers(users);
    } catch (e: any) {
      console.warn("Sync Warning:", e.message);
      // Não trava a UI, apenas loga e marca como erro de sinal
      if (action === 'announce') {
        setConnectionStatus('error');
        setErrorMsg('Sinal fraco...');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [profile.name, profile.username, profile.avatar, profile.bio, isSyncing]);

  useEffect(() => {
    if (isLoggedIn && profile.username && !peerRef.current) {
      setConnectionStatus('connecting');
      const peerId = `concord_${profile.username.toLowerCase()}`;
      
      const peer = new Peer(peerId, {
        debug: 2,
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      peer.on('open', (id) => {
        setProfile(p => ({ ...p, id }));
        syncRegistry('announce', id);
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
                id: msg.senderId, name: msg.senderName,
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
        setConnectionStatus('error');
        if (err.type === 'browser-incompatible') {
          setErrorMsg('Navegador bloqueia P2P');
        } else if (err.type === 'unavailable-id') {
          setErrorMsg('Username em uso');
        } else {
          setErrorMsg(err.type);
        }
      });

      peerRef.current = peer;
    }
    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [isLoggedIn, profile.username]);

  useEffect(() => {
    if (isLoggedIn && profile.id) {
      const hBeat = setInterval(() => syncRegistry('announce', profile.id), 20000);
      const poll = setInterval(() => {
        if (activeTab === 'add-friends') syncRegistry('fetch');
      }, 8000);
      return () => { clearInterval(hBeat); clearInterval(poll); };
    }
  }, [isLoggedIn, profile.id, activeTab, syncRegistry]);

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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeId) return;

    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: profile.id,
      senderName: profile.name,
      targetId: activeId,
      text: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, msg]);
    const text = inputValue;
    setInputValue('');

    if (activeId === 'concord_gemini_ai') {
      const resp = await generateAIResponse(text);
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        senderId: 'concord_gemini_ai', senderName: 'Concord AI',
        targetId: profile.id, text: resp, timestamp: new Date().toISOString()
      }]);
      audioRef.current?.play().catch(() => {});
      return;
    }

    let conn = connections[activeId];
    if (!conn && peerRef.current) {
      conn = peerRef.current.connect(activeId);
      setConnections(prev => ({ ...prev, [activeId]: conn }));
      conn.on('open', () => conn.send({ type: 'message', payload: msg }));
    } else if (conn) {
      conn.send({ type: 'message', payload: msg });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-6">
        <Logo className="mb-10" size="lg" />
        <div className="w-full max-w-md glass p-10 rounded-[3rem] border border-white/5 animate-in">
          <form onSubmit={handleLogin} className="space-y-6">
            <h2 className="text-[10px] font-bold text-center uppercase tracking-[0.5em] opacity-40">Noir Peak Protocol</h2>
            <input required placeholder="Seu Nome" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none" />
            <input required placeholder="Username (ex: luffy)" value={profile.username} onChange={e => setProfile({...profile, username: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()})} className="w-full bg-zinc-900 border border-white/10 p-5 rounded-2xl text-white outline-none font-mono" />
            <button type="submit" className="w-full noir-button p-5 rounded-2xl font-black uppercase tracking-widest text-[11px]">Sincronizar</button>
          </form>
        </div>
      </div>
    );
  }

  const activeContact = contacts.find(c => c.id === activeId) || globalUsers.find(u => u.id === activeId);
  const currentChatMessages = messages.filter(m => (m.senderId === profile.id && m.targetId === activeId) || (m.senderId === activeId && m.targetId === profile.id));

  return (
    <div className="h-screen w-full flex p-4 md:p-6 gap-4 md:gap-6 bg-black text-white overflow-hidden">
      <nav className="w-16 md:w-24 glass rounded-[2.5rem] md:rounded-[3.5rem] flex flex-col items-center py-8 md:py-12 gap-6 md:gap-10 shrink-0 border border-white/5 shadow-2xl">
        <Logo size="sm" syncing={isSyncing} />
        <div className="flex flex-col gap-6 md:gap-8">
          {[
            { id: 'chats', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
            { id: 'add-friends', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
          ].map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)}
              className={`p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] transition-all relative ${activeTab === item.id ? 'bg-white text-black scale-110 shadow-xl' : 'text-zinc-700 hover:text-white'}`}
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d={item.icon} /></svg>
              {item.id === 'add-friends' && globalUsers.filter(u => u.id !== profile.id).length > 0 && <div className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-black animate-pulse"></div>}
            </button>
          ))}
        </div>
        <button onClick={() => setActiveTab('settings')} className={`mt-auto p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] transition-all ${activeTab === 'settings' ? 'bg-white text-black scale-110 shadow-xl' : 'text-zinc-700 hover:text-white'}`}>
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
      </nav>

      <div className="flex-1 flex gap-4 md:gap-6 overflow-hidden">
        {activeTab === 'chats' && (
          <aside className="hidden lg:flex w-80 glass rounded-[3.5rem] p-8 flex-col shrink-0 border border-white/5 animate-in shadow-xl">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black tracking-tighter">Nodos</h2>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-green-500 shadow-[0_0_10px_green]' : connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[8px] uppercase font-bold opacity-30 tracking-widest">{connectionStatus}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {contacts.map(c => (
                <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full p-5 rounded-[2.5rem] flex items-center gap-4 transition-all ${activeId === c.id ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
                  <img src={c.avatar} className="w-10 h-10 rounded-xl object-cover bg-black/20" alt="" />
                  <div className="text-left overflow-hidden">
                    <p className="font-bold text-sm truncate">{c.name}</p>
                    <p className="text-[9px] opacity-40 truncate">@{c.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        <main className="flex-1 glass rounded-[2.5rem] md:rounded-[4rem] flex flex-col overflow-hidden relative border border-white/5 shadow-2xl">
          {activeTab === 'settings' ? (
            <div className="flex-1 p-8 md:p-16 max-w-2xl mx-auto w-full overflow-y-auto custom-scrollbar animate-in">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-12">Perfil</h2>
              <div className="space-y-12">
                <div className="flex items-center gap-10">
                  <div className="relative">
                    <img src={profile.avatar} className="w-24 h-24 md:w-32 md:h-32 rounded-[2rem] border-2 border-white/10" alt="" />
                    <div className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full border-4 border-black ${connectionStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold">{profile.name}</h3>
                    <p className="text-sm opacity-40 font-mono">@{profile.username}</p>
                    {errorMsg && <p className="text-[10px] text-red-500 mt-2 font-bold uppercase tracking-widest animate-pulse">Status: {errorMsg}</p>}
                  </div>
                </div>
                <div className="pt-10 border-t border-white/5 space-y-4">
                  <button onClick={() => { syncRegistry('announce', profile.id); }} className="noir-button w-full p-5 rounded-2xl font-black uppercase text-[11px] tracking-widest">Forçar Sync</button>
                  <button onClick={handleLogout} className="w-full p-5 rounded-2xl font-black uppercase text-[11px] tracking-widest border border-red-500/20 text-red-500 hover:bg-red-500/5 transition-all">Sair</button>
                </div>
              </div>
            </div>
          ) : activeTab === 'add-friends' ? (
            <div className="flex-1 p-8 md:p-16 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar animate-in">
              <div className="mb-12 flex justify-between items-end">
                <div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter">Explorar</h2>
                  <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mt-4">Procurando nodos no Peak...</p>
                </div>
                <button onClick={() => syncRegistry('fetch')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 transition-all">
                  <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {globalUsers.filter(u => u.id !== profile.id).length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] opacity-30">
                    <p className="uppercase tracking-widest text-[10px] font-bold">Nenhum sinal encontrado</p>
                    <p className="text-[9px] mt-2 italic">Dica: Use outro dispositivo ou aba com outro username.</p>
                  </div>
                ) : (
                  globalUsers.filter(u => u.id !== profile.id).map(u => (
                    <div key={u.id} className="glass p-6 rounded-[2.5rem] flex items-center justify-between border border-white/5 hover:bg-white/5 transition-all group">
                      <div className="flex items-center gap-4">
                        <img src={u.avatar} className="w-12 h-12 rounded-xl object-cover bg-black" alt="" />
                        <div>
                          <p className="font-bold text-sm">{u.name}</p>
                          <p className="text-[9px] opacity-40 font-mono">@{u.username}</p>
                        </div>
                      </div>
                      <button onClick={() => { setContacts(p => [...p.filter(c => c.id !== u.id), { ...u, status: 'online' }]); setActiveId(u.id); setActiveTab('chats'); }} className="noir-button px-5 py-2 rounded-xl font-bold text-[9px] uppercase tracking-widest">Conectar</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeId ? (
            <>
              <header className="h-24 md:h-32 flex items-center px-8 md:px-12 border-b border-white/5 shrink-0">
                <img src={activeContact?.avatar} className="w-12 h-12 md:w-14 md:h-14 rounded-xl object-cover bg-black" alt="" />
                <div className="ml-4 md:ml-6">
                  <h2 className="text-lg md:text-xl font-black">{activeContact?.name}</h2>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-green-500">P2P Ativo</p>
                </div>
                <button onClick={() => setActiveId(null)} className="ml-auto lg:hidden p-4 bg-white/5 rounded-2xl">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-6 md:space-y-8 custom-scrollbar">
                {currentChatMessages.map(m => (
                  <div key={m.id} className={`flex ${m.senderId === profile.id ? 'justify-end' : 'justify-start'} animate-in`}>
                    <div className={`max-w-[85%] md:max-w-[70%] p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl ${m.senderId === profile.id ? 'bg-white text-black rounded-tr-sm' : 'bg-zinc-900 text-white rounded-tl-sm border border-white/5'}`}>
                      <p className="text-sm md:text-base font-medium leading-relaxed">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-8 md:p-12 pt-0 shrink-0">
                <form onSubmit={sendMessage} className="glass rounded-[1.5rem] md:rounded-[2.5rem] p-2 flex items-center gap-2 border border-white/10">
                  <input value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Sussurre algo..." className="flex-1 bg-transparent outline-none px-4 md:px-6 py-2 md:py-3 text-sm md:text-base" />
                  <button type="submit" className="w-10 h-10 md:w-14 md:h-14 bg-white text-black rounded-xl md:rounded-2xl flex items-center justify-center hover:scale-105 transition-all shadow-xl">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-10 p-10 text-center animate-in">
              <Logo size="lg" />
              <p className="text-[9px] font-bold uppercase tracking-[0.5em] mt-8">Noir Peak • Standby</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
