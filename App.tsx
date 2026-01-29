
import React, { useState, useEffect, useRef } from 'react';
import { Message, Contact, Group, UserProfile, Story } from './types';

const chatChannel = new BroadcastChannel('concord_noir_sync');

const COUNTRIES = [
  { code: '+55', name: 'Brasil', flag: '🇧🇷' },
  { code: '+1', name: 'EUA/Canadá', flag: '🇺🇸' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+44', name: 'Reino Unido', flag: '🇬🇧' },
  { code: '+244', name: 'Angola', flag: '🇦🇴' },
  { code: '+81', name: 'Japão', flag: '🇯🇵' },
];

const SUGGESTED_PEOPLE: Contact[] = [
  { id: 'u3', username: 'lucas_art', name: 'Lucas Rocha', avatar: 'https://i.pravatar.cc/150?u=lucas', status: 'online', bio: 'Designer & Dreamer' },
  { id: 'u4', username: 'carla_dev', name: 'Carla Mendes', avatar: 'https://i.pravatar.cc/150?u=carla', status: 'offline', bio: 'Code is poetry.' },
  { id: 'u5', username: 'john_noir', name: 'John Doe', avatar: 'https://i.pravatar.cc/150?u=john', status: 'busy', bio: 'Focus mode.' },
];

const INITIAL_CONTACTS: Contact[] = [
  { id: '1', username: 'ana_silva', name: 'Ana Silva', avatar: 'https://i.pravatar.cc/150?u=ana', status: 'online', bio: 'Minimalista por escolha.' },
  { id: '2', username: 'marcos_sz', name: 'Marcos Souza', avatar: 'https://i.pravatar.cc/150?u=marcos', status: 'busy', bio: 'Offline is the new luxury.' },
];

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('concord_logged') === 'true');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [activeTab, setActiveTab] = useState<'chats' | 'groups' | 'stories' | 'add-friends' | 'settings'>('chats');
  const [activeId, setActiveId] = useState<string>('1');
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('concord_profile');
    return saved ? JSON.parse(saved) : {
      id: 'me-' + Math.random().toString(36).substr(2, 9),
      username: 'noir_member',
      name: 'Membro Concord',
      avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Noir',
      bio: 'O silêncio é ouro.',
      phoneNumber: '',
      theme: 'dark'
    };
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('concord_contacts');
    return saved ? JSON.parse(saved) : INITIAL_CONTACTS;
  });

  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem('concord_groups');
    return saved ? JSON.parse(saved) : [
      { id: 'g1', name: 'Círculo Noir', avatar: 'https://i.pravatar.cc/150?u=noir', description: 'Onde o essencial é discutido.' }
    ];
  });

  const [stories, setStories] = useState<Story[]>(() => {
    const saved = localStorage.getItem('concord_stories');
    return saved ? JSON.parse(saved) : [
      { id: 's1', userId: '1', userName: 'Ana Silva', userAvatar: 'https://i.pravatar.cc/150?u=ana', imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=500', timestamp: new Date().toISOString() }
    ];
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('concord_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [viewingStory, setViewingStory] = useState<Story | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('concord_profile', JSON.stringify(profile));
    localStorage.setItem('concord_logged', isLoggedIn.toString());
    localStorage.setItem('concord_groups', JSON.stringify(groups));
    localStorage.setItem('concord_contacts', JSON.stringify(contacts));
    localStorage.setItem('concord_stories', JSON.stringify(stories));
  }, [profile, isLoggedIn, groups, contacts, stories]);

  useEffect(() => {
    localStorage.setItem('concord_messages', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleSync = (event: MessageEvent) => {
      if (event.data.type === 'NEW_MESSAGE') setMessages(prev => [...prev, event.data.message]);
    };
    chatChannel.addEventListener('message', handleSync);
    return () => chatChannel.removeEventListener('message', handleSync);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.phoneNumber.trim().length > 5) setIsLoggedIn(true);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const newMessage: Message = { id: Date.now().toString(), senderId: profile.id, senderName: profile.name, targetId: activeId, text: inputValue, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, newMessage]);
    chatChannel.postMessage({ type: 'NEW_MESSAGE', message: newMessage });
    setInputValue('');
  };

  const handleAddFriend = (friend: Contact) => {
    if (contacts.find(c => c.id === friend.id)) return;
    setContacts([...contacts, friend]);
    setActiveTab('chats');
    setActiveId(friend.id);
  };

  const handlePostStory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newStory: Story = {
          id: 's-' + Date.now(),
          userId: profile.id,
          userName: profile.name,
          userAvatar: profile.avatar,
          imageUrl: reader.result as string,
          timestamp: new Date().toISOString()
        };
        setStories([newStory, ...stories]);
      };
      reader.readAsDataURL(file);
    }
  };

  const activeEntity = activeTab === 'chats' ? contacts.find(c => c.id === activeId) : groups.find(g => g.id === activeId);
  const currentChatMessages = messages.filter(m => m.targetId === activeId);

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-4 bg-black">
        <div className="w-full max-w-sm glass p-10 rounded-[3rem] border border-white/5 shadow-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-black text-3xl font-black mb-6 mx-auto">C</div>
            <h1 className="text-2xl font-bold mb-2">Acesso Exclusivo</h1>
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Noir Edition</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="flex gap-2">
              <select className="bg-zinc-900 border border-white/10 p-4 rounded-2xl text-white text-sm outline-none appearance-none cursor-pointer">
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input type="tel" placeholder="Telefone" required value={profile.phoneNumber} onChange={(e) => setProfile(p => ({...p, phoneNumber: e.target.value}))} className="flex-1 bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none text-white placeholder:text-zinc-700" />
            </div>
            <button type="submit" className="w-full noir-button p-4 rounded-2xl font-bold text-sm tracking-widest uppercase">Autenticar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex p-6 gap-6 bg-black">
      {/* Sidebar Nav */}
      <nav className="w-20 glass rounded-[2.5rem] flex flex-col items-center py-10 gap-8 shrink-0">
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-black font-black text-lg mb-4">C</div>
        {[
          { id: 'chats', icon: <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /> },
          { id: 'groups', icon: <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
          { id: 'stories', icon: <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
          { id: 'add-friends', icon: <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /> }
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`p-3 rounded-2xl transition-all ${activeTab === item.id ? 'bg-white text-black scale-110 shadow-lg' : 'text-zinc-600 hover:text-white'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
          </button>
        ))}
        <button onClick={() => setActiveTab('settings')} className={`mt-auto p-3 rounded-2xl transition-all ${activeTab === 'settings' ? 'bg-white text-black scale-110 shadow-lg' : 'text-zinc-600 hover:text-white'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
      </nav>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Painel Esquerdo Condicional */}
        {(activeTab === 'chats' || activeTab === 'groups') && (
          <aside className="w-80 glass rounded-[2.5rem] flex flex-col p-8 shrink-0">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold">{activeTab === 'chats' ? 'Mensagens' : 'Grupos'}</h2>
              {activeTab === 'groups' && <button onClick={() => setIsCreateGroupOpen(true)} className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center hover:bg-white hover:text-black">+</button>}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto">
              {(activeTab === 'chats' ? contacts : groups).map(item => (
                <button key={item.id} onClick={() => setActiveId(item.id)} className={`w-full p-4 flex items-center gap-4 rounded-3xl transition-all ${activeId === item.id ? 'bg-white text-black shadow-2xl' : 'hover:bg-white/5 text-zinc-400 hover:text-white'}`}>
                  <img src={item.avatar} className="w-10 h-10 rounded-2xl object-cover" alt="" />
                  <p className="font-bold text-xs truncate">{item.name}</p>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Janela Central Conteúdo */}
        <main className="flex-1 glass rounded-[3rem] flex flex-col relative overflow-hidden shadow-2xl">
          {activeTab === 'stories' ? (
            <div className="flex-1 p-16 overflow-y-auto">
              <div className="flex items-center justify-between mb-12">
                <h2 className="text-5xl font-black tracking-tighter">Stories</h2>
                <button onClick={() => storyInputRef.current?.click()} className="noir-button px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest">Postar Story</button>
                <input type="file" ref={storyInputRef} onChange={handlePostStory} accept="image/*" className="hidden" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {stories.map(story => (
                  <div key={story.id} onClick={() => setViewingStory(story)} className="aspect-[3/4] glass rounded-[2rem] overflow-hidden relative cursor-pointer group hover:scale-[1.02] transition-all border border-white/5">
                    <img src={story.imageUrl} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-6 left-6 flex items-center gap-3">
                      <img src={story.userAvatar} className="w-8 h-8 rounded-xl border border-white/20" alt="" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">{story.userName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'add-friends' ? (
            <div className="flex-1 p-16 max-w-4xl mx-auto w-full overflow-y-auto">
              <h2 className="text-5xl font-black mb-12 tracking-tighter">Descobrir</h2>
              <div className="glass rounded-[2rem] p-4 flex items-center gap-4 mb-12">
                <svg className="w-6 h-6 text-zinc-500 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} placeholder="Buscar por @username..." className="flex-1 bg-transparent border-none outline-none p-4 text-sm" />
              </div>
              <div className="space-y-6">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-4">Sugestões Noir</h3>
                {SUGGESTED_PEOPLE.filter(p => p.username.includes(friendSearch)).map(person => (
                  <div key={person.id} className="glass p-6 rounded-[2.5rem] flex items-center justify-between group hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-6">
                      <img src={person.avatar} className="w-16 h-16 rounded-[1.5rem] object-cover" alt="" />
                      <div>
                        <h4 className="font-bold text-lg">{person.name}</h4>
                        <p className="text-xs text-zinc-500 font-mono">@{person.username}</p>
                      </div>
                    </div>
                    <button onClick={() => handleAddFriend(person)} className="noir-button px-6 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest">Adicionar</button>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'settings' ? (
             <div className="flex-1 p-16 max-w-4xl mx-auto w-full overflow-y-auto">
              <h2 className="text-5xl font-black mb-12 tracking-tighter">Identidade</h2>
              <div className="space-y-12">
                <div className="flex items-center gap-12 p-10 glass rounded-[3rem]">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <img src={profile.avatar} className="w-40 h-40 rounded-[2.5rem] object-cover group-hover:brightness-50 transition-all ring-1 ring-white/10" />
                    <input type="file" ref={fileInputRef} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if(file){
                        const reader = new FileReader();
                        reader.onloadend = () => setProfile(p => ({...p, avatar: reader.result as string}));
                        reader.readAsDataURL(file);
                      }
                    }} accept="image/*" className="hidden" />
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Exibição</label>
                      <input value={profile.name} onChange={(e) => setProfile(p => ({...p, name: e.target.value}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none font-bold" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Username (@)</label>
                      <input value={profile.username} onChange={(e) => setProfile(p => ({...p, username: e.target.value.toLowerCase()}))} className="w-full bg-white/5 p-4 rounded-2xl outline-none font-mono text-xs" />
                    </div>
                  </div>
                </div>
                <div className="p-10 glass rounded-[3rem] space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Bio</label>
                    <textarea value={profile.bio} onChange={(e) => setProfile(p => ({...p, bio: e.target.value}))} className="w-full bg-white/5 p-6 rounded-[2rem] outline-none h-32 resize-none text-sm leading-relaxed" />
                  </div>
                  <div className="flex items-center justify-between p-6 bg-white/5 rounded-[2rem]">
                    <span className="text-xs font-bold opacity-40">Telefone: {profile.phoneNumber}</span>
                    <button onClick={() => setIsLoggedIn(false)} className="px-6 py-2 border border-red-900 text-red-900 text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-red-900 hover:text-white">Sair</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Header do Chat */}
              <header className="h-24 flex items-center px-10 border-b border-white/5">
                <div className="flex items-center gap-5">
                  <img src={activeEntity?.avatar} className="w-12 h-12 rounded-2xl object-cover" alt="" />
                  <div>
                    <h2 className="font-bold text-xl tracking-tight">{activeEntity?.name}</h2>
                    <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Ativo agora</span>
                  </div>
                </div>
              </header>
              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                {currentChatMessages.map((msg) => {
                  const isMe = msg.senderId === profile.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%]">
                        {!isMe && <span className="text-[10px] font-black uppercase tracking-tighter opacity-20 ml-2 mb-1 block">{msg.senderName}</span>}
                        <div className={`p-5 ${isMe ? 'bg-white text-black rounded-[2rem] rounded-tr-sm' : 'bg-zinc-900 text-white rounded-[2rem] rounded-tl-sm border border-white/5'}`}>
                          <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {/* Input */}
              <div className="p-10 pt-0">
                <form onSubmit={handleSendMessage} className="glass rounded-[2rem] p-3 flex items-center gap-4">
                  <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Sussurre em silêncio..." className="flex-1 bg-transparent border-none outline-none px-6 text-sm placeholder:text-zinc-700" />
                  <button type="submit" className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${inputValue.trim() ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-700'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                </form>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Visualizador de Story */}
      {viewingStory && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg aspect-[9/16] relative rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
            <img src={viewingStory.imageUrl} className="w-full h-full object-cover" alt="" />
            <div className="absolute top-0 left-0 w-full p-8 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent">
              <img src={viewingStory.userAvatar} className="w-10 h-10 rounded-2xl border border-white/20" alt="" />
              <div className="flex-1">
                <p className="font-bold text-sm">{viewingStory.userName}</p>
                <p className="text-[10px] opacity-40 uppercase tracking-widest">Postado agora</p>
              </div>
              <button onClick={() => setViewingStory(null)} className="text-white hover:rotate-90 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="absolute top-2 left-4 right-4 flex gap-1">
              <div className="h-0.5 flex-1 bg-white/40 rounded-full overflow-hidden">
                <div className="h-full bg-white animate-[progress_5s_linear_forwards]" />
              </div>
            </div>
          </div>
          <style>{`
            @keyframes progress { from { width: 0%; } to { width: 100%; } }
          `}</style>
        </div>
      )}

      {/* Modal Criar Grupo */}
      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass p-10 rounded-[3rem] w-full max-w-sm">
            <h3 className="text-2xl font-bold mb-6">Novo Grupo</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if(!newGroupName.trim()) return;
              const g = { id: 'g-'+Date.now(), name: newGroupName, avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${newGroupName}`, description: '' };
              setGroups([...groups, g]);
              setIsCreateGroupOpen(false);
              setNewGroupName('');
              setActiveTab('groups');
              setActiveId(g.id);
            }} className="space-y-6">
              <input autoFocus placeholder="Nome do grupo..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full bg-zinc-900 border border-white/10 p-4 rounded-2xl outline-none text-white" />
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsCreateGroupOpen(false)} className="flex-1 p-4 rounded-2xl border border-white/10 font-bold text-[10px] uppercase tracking-widest">Cancelar</button>
                <button type="submit" className="flex-1 noir-button p-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
