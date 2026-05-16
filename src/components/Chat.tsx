/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { signOut, updateProfile } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  collectionGroup,
  getDocs,
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  where,
  Timestamp,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ChatMessage, Channel } from '../types';
import { 
  BarChart2,
  Send, 
  Hash, 
  LogOut, 
  User as UserIcon, 
  Search,
  MoreVertical,
  Plus,
  Smile,
  Moon,
  Sun,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Trash2,
  Trash,
  Terminal,
  Activity,
  Layout,
  Lock,
  Unlock,
  Bell,
  UserPlus,
  Check,
  XCircle,
  Shield,
  Mic,
  Image as ImageIcon,
  Camera,
  Play,
  Pause,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subMinutes } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { setDoc, getDoc } from 'firebase/firestore';
import { JoinRequest } from '../types';

const EMOJIS = ['😀', '😂', '😍', '🤔', '🙌', '🔥', '✨', '👍', '❤️', '🎉', '🚀', '😎', '💡', '💯', '👋', '🤖'];

/**
 * Compresses an image to stay within Firestore/Auth limits.
 * Default max dimensions 400x400 with 0.7 quality usually results in ~20-40KB.
 */
const compressImage = (base64Str: string, maxWidth = 400, maxHeight = 400, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

const MatrixBackground = ({ color, isDarkMode }: { color: string, isDarkMode: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 33);
    const handleResize = () => {
      width = (canvas.width = window.innerWidth);
      height = (canvas.height = window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  }, [color, isDarkMode]);

  return <canvas ref={canvasRef} className={`fixed inset-0 pointer-events-none z-0 ${isDarkMode ? 'opacity-20' : 'opacity-10'}`} />;
};

const CustomAudioPlayer = ({ src, isDarkMode, isHackerMode, hackerColor, isOwn }: { src: string, isDarkMode: boolean, isHackerMode: boolean, hackerColor: string, isOwn: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 min-w-[180px]">
      <audio ref={audioRef} src={src} preload="auto" />
      <button 
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isHackerMode ? 'hover:bg-black/10' : (isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5')}`}
        style={isHackerMode ? { color: isOwn ? '#000' : hackerColor } : {}}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
      </button>

      <div className="flex flex-col flex-1 gap-1 w-full">
        <div className={`h-1.5 rounded-full overflow-hidden w-full min-w-[50px] ${isHackerMode ? (isOwn ? 'bg-black/20' : 'bg-white/10') : (isDarkMode ? 'bg-black' : 'bg-black/10')}`}>
          <div 
            className="h-full transition-all"
            style={{ 
              width: `${(currentTime / (duration || 60)) * 100}%`,
              backgroundColor: isHackerMode ? (isOwn ? '#000' : hackerColor) : (isDarkMode ? '#d1d5db' : '#4a4a4a')
            }}
          />
        </div>
        <div className="flex justify-between items-center px-0.5">
          <span className={`text-[10px] font-mono opacity-60 ${isHackerMode && isOwn ? 'text-black' : ''}`}>
            {formatTime(currentTime)} / {formatTime(duration || 0)}
          </span>
          <button 
            onClick={cycleSpeed}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${isHackerMode ? (isOwn ? 'bg-black/10 hover:bg-black/20' : 'border border-current opacity-60 hover:opacity-100') : (isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10')}`}
            style={isHackerMode ? { color: isOwn ? '#000' : hackerColor } : {}}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState({
    isDarkMode: false,
    isHackerMode: false,
    sidebarPosition: 'left' as 'left' | 'right',
    hackerColor: '#00ff00',
    bubbleColor: '#1a1a1a',
    hackerBackgroundEnabled: false,
    hackerBackgroundBrightness: 0.35,
    wallpaper: '',
    wallpaperBrightness: 0.2,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [wallpaperInput, setWallpaperInput] = useState('');

  // Load settings from Firestore
  useEffect(() => {
    if (!auth.currentUser) {
      setSettingsLoading(false);
      return;
    }

    const settingsRef = doc(db, 'users', auth.currentUser.uid, 'settings', 'config');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as any);
      } else {
        // Initialize default settings if they don't exist
        setDoc(settingsRef, settings);
      }
      setSettingsLoading(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const updateSetting = async (key: string, value: any) => {
    if (!auth.currentUser) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'config'), newSettings, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}/settings/config`);
    }
  };
  const { isDarkMode, isHackerMode, sidebarPosition, hackerColor, hackerBackgroundEnabled, hackerBackgroundBrightness = 0.35, wallpaper, wallpaperBrightness = 0.2 } = settings;

  // Helper to determine if a color is dark
  const isColorDark = (hex: string) => {
    if (!hex || hex === 'transparent') return false;
    const c = hex.substring(1);
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b = (rgb >>  0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
    return luma < 128;
  };

  const getHackerTextColor = (baseColor: string, isDark: boolean) => {
    if (isDark) {
      return isColorDark(baseColor) ? '#ffffff' : baseColor;
    } else {
      return isColorDark(baseColor) ? baseColor : '#1a1a1a';
    }
  };

  const hackerTextColor = getHackerTextColor(hackerColor, isDarkMode);
  const hackerBubbleContrastColor = isDarkMode 
    ? (isColorDark(hackerColor) ? '#ffffff' : '#000000')
    : (isColorDark(hackerColor) ? '#ffffff' : '#000000'); // same logic really, it depends on hackerColor
  const setIsDarkMode = (val: boolean) => updateSetting('isDarkMode', val);
  const setIsHackerMode = (val: boolean) => updateSetting('isHackerMode', val);
  const setSidebarPosition = (val: 'left' | 'right') => updateSetting('sidebarPosition', val);
  const setHackerColor = (val: string) => updateSetting('hackerColor', val);
  const setBubbleColor = (val: string) => updateSetting('bubbleColor', val);
  const setHackerBackgroundEnabled = (val: boolean) => updateSetting('hackerBackgroundEnabled', val);
  const setHackerBackgroundBrightness = (val: number) => updateSetting('hackerBackgroundBrightness', val);
  const setWallpaper = (val: string) => updateSetting('wallpaper', val);
  const setWallpaperBrightness = (val: number) => updateSetting('wallpaperBrightness', val);

  const [hackerCode, setHackerCode] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'visor' | 'outros'>('visor');
  const [expandedPfp, setExpandedPfp] = useState<string | null>(null);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [interceptedData, setInterceptedData] = useState<{[key: string]: any}>({});
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'channel' | 'message', name?: string, obj?: any } | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [messageContextMenu, setMessageContextMenu] = useState<{ x: number, y: number, message: ChatMessage } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ photoURL?: string, displayName?: string } | null>(null);

  // Synchronize current user profile from Firestore to bypass Auth 2KB limit for photoURL
  useEffect(() => {
    if (!auth.currentUser) {
      setCurrentUserProfile(null);
      return;
    }
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCurrentUserProfile({
          displayName: data.displayName || auth.currentUser?.displayName || '',
          photoURL: data.photoURL || auth.currentUser?.photoURL || ''
        });
      } else {
        setCurrentUserProfile({
          displayName: auth.currentUser?.displayName || '',
          photoURL: auth.currentUser?.photoURL || ''
        });
      }
    }, (err) => {
      console.error("Error listening to user profile:", err);
    });
    return () => unsubscribe();
  }, [auth.currentUser]);

  const safeUpdateProfile = async (user: any, data: { photoURL?: string, displayName?: string }) => {
    try {
      // Firebase Auth photoURL limit is 2048 characters.
      // If the URL/Base64 is longer, we skip Auth update and rely on Firestore.
      if (data.photoURL && data.photoURL.length > 2000) {
        console.warn("Photo URL too long for Firebase Auth. Storing in Firestore only.");
        await updateProfile(user, { ...data, photoURL: '' });
      } else {
        await updateProfile(user, data);
      }
    } catch (err: any) {
      // Catch "Photo URL too long" even if our 2000 catch somehow missed it
      if (err.code === 'auth/invalid-profile-attribute' || err.message?.includes('Photo URL too long')) {
        console.warn("Caught Auth photo limit error. Updating Firestore only.");
        if (data.displayName) {
          await updateProfile(user, { displayName: data.displayName });
        }
      } else {
        throw err;
      }
    }
  };

  const isAdmin = auth.currentUser?.email === (import.meta as any).env.VITE_ADMIN_EMAIL;
  const longPressTimer = useRef<any>(null);

  const handleMessageLongPress = (e: React.MouseEvent | React.TouchEvent, msg: ChatMessage) => {
    // Only handle touch or left click
    if ('button' in e && e.button !== 0) return;

    const coords = 'touches' in e ? e.touches[0] : e;
    const { clientX: x, clientY: y } = coords;

    longPressTimer.current = setTimeout(() => {
      setMessageContextMenu({ x, y, message: msg });
    }, 500); // 500ms for long press
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync typing status
  useEffect(() => {
    if (!auth.currentUser || !activeChannel) return;
    
    const typingRef = doc(db, 'channels', activeChannel, 'typing', auth.currentUser.uid);
    
    if (inputText.length > 0) {
      setDoc(typingRef, {
        text: inputText,
        name: auth.currentUser.displayName,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      setDoc(typingRef, { text: '', updatedAt: serverTimestamp() }, { merge: true });
    }

    // Clear typing on unmount or channel change
    return () => {
      setDoc(typingRef, { text: '', updatedAt: serverTimestamp() }, { merge: true });
    };
  }, [inputText, activeChannel]);

  // Hacker Mode: Intercept typing data
  useEffect(() => {
    if (!isHackerMode || !activeChannel) {
      setInterceptedData({});
      return;
    }

    const q = query(collection(db, 'channels', activeChannel, 'typing'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any = {};
      snapshot.docs.forEach(doc => {
        if (doc.id !== auth.currentUser?.uid) {
          const val = doc.data();
          if (val.text && val.text.length > 0) {
            data[doc.id] = val;
          }
        }
      });
      setInterceptedData(data);
    });

    return () => unsubscribe();
  }, [isHackerMode, activeChannel]);
  // Global theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Redirect if channel deleted
  useEffect(() => {
    if (activeChannel === 'general' || channels.length === 0) return;
    const exists = channels.find(c => c.id === activeChannel);
    if (!exists) {
      setActiveChannel('general');
    }
  }, [channels, activeChannel]);

  const handleUpdatePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhotoURL.trim() || !auth.currentUser) return;
    try {
      let photoToStore = newPhotoURL;
      
      // If it's a base64 string, compress it first
      if (photoToStore.startsWith('data:image')) {
        photoToStore = await compressImage(photoToStore);
      }

      await safeUpdateProfile(auth.currentUser, { photoURL: photoToStore });
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, { photoURL: photoToStore }, { merge: true });
      setNewPhotoURL('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    }
  };

  const handleHackerCode = (val: string) => {
    setHackerCode(val);
    if (val === '//admin') {
      setIsHackerMode(true);
      setHackerCode('');
    }
  };

  // Heartbeat to update lastSeen
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const updatePresence = async (isOffline = false) => {
      try {
        const userRef = doc(db, 'users', auth.currentUser!.uid);
        await setDoc(userRef, { 
          lastSeen: isOffline ? new Timestamp(0, 0) : serverTimestamp() 
        }, { merge: true });
      } catch (err) {
        console.error("Presence update failed", err);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 30 * 1000); // Every 30 seconds

    const handleUnload = () => {
      // Use best-effort to set offline on close
      updatePresence(true);
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Online Users Counter
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreNow = Timestamp.now();
      const thresholdSeconds = 60; // 1 minute threshold
      
      const online = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (!data.lastSeen) return false;
        return (firestoreNow.seconds - data.lastSeen.seconds) < thresholdSeconds;
      });
      
      setOnlineCount(online.length);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Listen for channels
    const q = query(collection(db, 'channels'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Channel[];
      
      // Ensure 'general' exists
      if (!chans.find(c => c.id === 'general')) {
         chans.push({ id: 'general', name: 'general', createdAt: null, createdBy: 'system', isPrivate: false, allowedUsers: [] });
      }
      
      setChannels(chans);
    });
    return () => unsubscribe();
  }, []);

  // Listen for join requests (if user is owner of any channel)
  useEffect(() => {
    if (!auth.currentUser) return;

    // We listen to all requests where the user might be an owner
    // For simplicity in this demo, we listen to all pending requests
    // A more production ready way would be a collectionGroup query or filtering by channelIds the user owns
    const q = query(collection(db, 'joinRequests'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JoinRequest[];
      setJoinRequests(reqs);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Listen for messages in current channel
    const q = query(
      collection(db, 'channels', activeChannel, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `channels/${activeChannel}/messages`);
    });

    return () => unsubscribe();
  }, [activeChannel]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interceptedData]);

  const filteredChannels = channels.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const publicChannels = filteredChannels.filter(c => !c.isPrivate);
  const privateChannels = filteredChannels.filter(c => c.isPrivate);

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser) return;

    const text = inputText;
    setInputText('');
    setSending(true);

    try {
      const currentPhotoURL = currentUserProfile?.photoURL || auth.currentUser.photoURL || '';
      await addDoc(collection(db, 'channels', activeChannel, 'messages'), {
        text,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Anonymous',
        senderPhoto: currentPhotoURL,
        timestamp: serverTimestamp(),
        channelId: activeChannel,
        type: 'text',
        bubbleColor: settings.bubbleColor || '#1a1a1a',
        ...(replyingTo ? {
          replyToId: replyingTo.id,
          replyToName: replyingTo.senderName,
          replyToText: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'File')
        } : {})
      });
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `channels/${activeChannel}/messages`);
    } finally {
      setSending(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const name = newChannelName.toLowerCase().replace(/\s+/g, '-');
    setSending(true);

    try {
      const docRef = await addDoc(collection(db, 'channels'), {
        name,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser!.uid,
        isPrivate: false,
        allowedUsers: [auth.currentUser!.uid]
      });
      setNewChannelName('');
      setShowAddChannel(false);
      setActiveChannel(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'channels');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteChannel = async (e: React.MouseEvent, channel: Channel) => {
    e.stopPropagation();
    if (channel.id === 'general') return;
    
    // Only creator or admin or hacker mode can delete
    if (channel.createdBy !== auth.currentUser?.uid && !isAdmin && !isHackerMode) {
      alert(isHackerMode ? 'PERMISSION_DENIED: UNAUTHORIZED_UID' : 'Somente o criador ou administradores podem apagar este canal.');
      return;
    }

    setDeleteConfirm({ id: channel.id, type: 'channel', name: channel.name });
  };

  const confirmDeleteChannel = async (id: string) => {
    try {
      // First delete all messages in the channel
      const messagesRef = collection(db, 'channels', id, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      
      const batch = writeBatch(db);
      messagesSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Then delete the channel
      batch.delete(doc(db, 'channels', id));
      
      await batch.commit();

      if (activeChannel === id) {
        setActiveChannel('general');
      }
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `channels/${id}`);
    }
  };

  const confirmClearChat = async (channelId: string) => {
    try {
      const messagesRef = collection(db, 'channels', channelId, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      
      const batch = writeBatch(db);
      messagesSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `channels/${channelId}/messages`);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setDeleteConfirm({ id: msgId, type: 'message' });
  };

  const confirmDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'channels', activeChannel, 'messages', msgId));
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `channels/${activeChannel}/messages/${msgId}`);
    }
  };

  const toggleChannelPrivacy = async () => {
    const channel = channels.find(c => c.id === activeChannel);
    if (!channel || channel.createdBy !== auth.currentUser?.uid) return;

    try {
      await setDoc(doc(db, 'channels', activeChannel), {
        isPrivate: !channel.isPrivate
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `channels/${activeChannel}`);
    }
  };

  const requestAccess = async () => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'joinRequests'), {
        channelId: activeChannel,
        channelName: channels.find(c => c.id === activeChannel)?.name,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        userPhoto: currentUserProfile?.photoURL || auth.currentUser.photoURL || '',
        status: 'pending',
        timestamp: serverTimestamp()
      });
      alert('Access requested!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'joinRequests');
    }
  };

  const handleProcessRequest = async (request: any, action: 'accept' | 'decline') => {
    try {
      if (action === 'accept') {
        const channelRef = doc(db, 'channels', request.channelId);
        const channelSnap = await getDoc(channelRef);
        if (channelSnap.exists()) {
          const channelData = channelSnap.data() as Channel;
          const allowedUsers = [...(channelData.allowedUsers || [])];
          if (!allowedUsers.includes(request.userId)) {
            allowedUsers.push(request.userId);
            await setDoc(channelRef, { allowedUsers }, { merge: true });
          }
        }
      }
      
      await setDoc(doc(db, 'joinRequests', request.id), {
        status: action === 'accept' ? 'accepted' : 'declined'
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'joinRequests');
    }
  };

  const handleSignOut = () => auth.signOut();

  const startRecording = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      if ('button' in e && e.button !== 0) return; // Only left click
      e.preventDefault();
    }
    
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 44100, channelCount: 1 } });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await sendFileMessage(base64Audio, 'audio');
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      if (err instanceof Error && err.name === 'NotFoundError') {
        alert('Microfone não encontrado. Por favor, conecte um microfone e tente novamente.');
      } else if (err instanceof Error && err.name === 'NotAllowedError') {
        alert('Permissão de microfone negada. Por favor, permita o acesso nas configurações do seu navegador.');
      } else {
        alert('Erro ao acessar o microfone. Verifique as permissões e se o dispositivo está conectado.');
      }
    }
  };

  const stopRecording = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 2) {
      alert('File too large (max 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      await sendFileMessage(base64Data, file.type.startsWith('image/') ? 'image' : 'file');
    };
  };

  const handleWallpaperFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 2) {
      alert('Arquivo muito grande (máx 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      setWallpaper(base64Data);
    };
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 1024 * 1024 * 2) {
      alert('Arquivo muito grande (máx 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      try {
        // Compress image to ensure it fits in Firestore (1MB limit)
        const compressedBase64 = await compressImage(rawBase64);
        
        await safeUpdateProfile(auth.currentUser!, { photoURL: compressedBase64 });
        const userRef = doc(db, 'users', auth.currentUser!.uid);
        await setDoc(userRef, { photoURL: compressedBase64 }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
      }
    };
  };

  const handleRemovePhoto = async () => {
    if (!auth.currentUser) return;
    if (!confirm('Tem certeza que deseja remover sua foto de perfil?')) return;
    try {
      await safeUpdateProfile(auth.currentUser, { photoURL: '' });
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, { photoURL: '' }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    }
  };

  const sendFileMessage = async (data: string, type: 'image' | 'audio' | 'file') => {
    if (!auth.currentUser) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'channels', activeChannel, 'messages'), {
        [type === 'audio' ? 'audioUrl' : type === 'image' ? 'imageUrl' : 'fileUrl']: data,
        type,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Anonymous',
        senderPhoto: auth.currentUser.photoURL || '',
        timestamp: serverTimestamp(),
        channelId: activeChannel,
        bubbleColor: settings.bubbleColor || '#1a1a1a',
        ...(replyingTo ? {
          replyToId: replyingTo.id,
          replyToName: replyingTo.senderName,
          replyToText: replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'File')
        } : {})
      });

      // Update message count in user profile
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentCount = userSnap.data().messageCount || 0;
        await setDoc(userRef, { messageCount: currentCount + 1 }, { merge: true });
      }

      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `channels/${activeChannel}/messages`);
    } finally {
      setSending(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    setShowStats(true);
    try {
      // Fetch all users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersData = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Try to count messages from collection group if index exists
      // If not, we rely on the messageCount field we just started tracking
      // To provide a better initial experience, let's also count current channel messages
      const globalMessagesSnap = await getDocs(query(collectionGroup(db, 'messages'))).catch(() => null);
      
      const counts: {[key: string]: number} = {};
      if (globalMessagesSnap) {
        globalMessagesSnap.docs.forEach(doc => {
          const senderId = doc.data().senderId;
          if (senderId) {
            counts[senderId] = (counts[senderId] || 0) + 1;
          }
        });
      }

      const firestoreNow = Timestamp.now();
      const thresholdSeconds = 60; // 1 minute threshold
      const thresholdAgo = firestoreNow.seconds - thresholdSeconds;

      const finalStats = usersData
        .map(user => {
          const name = user.displayName || user.username;
          if (!name) return null;

          const messageCount = counts[user.id] || user.messageCount || 0;
          const isOnline = user.lastSeen && user.lastSeen.seconds >= thresholdAgo;
          
          return {
            name: name,
            messages: messageCount,
            status: isOnline ? 'Online' : 'Offline',
            photo: user.photoURL,
            id: user.id
          };
        })
        .filter((user): user is any => user !== null)
        .sort((a, b) => b.messages - a.messages);

      setUserStats(finalStats);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex h-full overflow-hidden transition-all duration-300 ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'} ${isHackerMode ? (isDarkMode ? 'bg-black font-mono' : 'bg-white font-mono') : (isDarkMode ? 'bg-[#0a0a0a] text-white font-sans' : 'bg-white text-[#1a1a1a] font-sans')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
      <style>
        {`
          * {
            scrollbar-width: thin;
            scrollbar-color: ${isHackerMode ? `${hackerColor}33 transparent` : (isDarkMode ? 'rgba(255,255,255,0.1) transparent' : 'rgba(0,0,0,0.1) transparent')};
          }
          *::-webkit-scrollbar {
            width: 6px;
          }
          *::-webkit-scrollbar-track {
            background: transparent;
          }
          *::-webkit-scrollbar-thumb {
            background-color: ${isHackerMode ? `${hackerColor}44` : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')};
            border-radius: 20px;
          }
          ${isHackerMode ? `
          *::-webkit-scrollbar-thumb:hover {
            background-color: ${hackerColor}66;
          }
          ` : ''}
        `}
      </style>
      {isHackerMode && (
        <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] animate-pulse"></div>
      )}
      
      {/* Global Backgrounds */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {wallpaper && (
          <div 
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={{ 
              backgroundImage: `url(${wallpaper})`,
              opacity: wallpaperBrightness,
              filter: isHackerMode ? `contrast(140%) brightness(50%)` : 'none'
            }}
          />
        )}
        {isHackerMode && hackerBackgroundEnabled && (
          <div 
            className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity"
            style={{ opacity: hackerBackgroundBrightness }}
          >
             <div className={`absolute inset-0 ${isDarkMode ? 'bg-black/40' : 'bg-white/40'}`} />
             <div 
               className="h-full w-full opacity-60"
               style={{ 
                 backgroundImage: isDarkMode 
                  ? `linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%), repeating-linear-gradient(transparent 0px, transparent 1px, rgba(0,0,0,0.1) 1px, rgba(0,0,0,0.1) 2px)`
                  : `linear-gradient(rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 100%), repeating-linear-gradient(transparent 0px, transparent 1px, rgba(0,0,0,0.05) 1px, rgba(0,0,0,0.05) 2px)`,
                 backgroundSize: '100% 100%, 100% 3px'
               }}
             />
             <MatrixBackground color={hackerColor} isDarkMode={isDarkMode} />
          </div>
        )}
      </div>

      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed md:relative flex flex-col transition-all duration-300 z-[70] h-full ${isMobileMenuOpen ? 'translate-x-0' : (sidebarPosition === 'right' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')} ${isSidebarCollapsed ? 'md:w-20' : 'w-72'} border-r transition-colors ${(wallpaper || (isHackerMode && hackerBackgroundEnabled)) ? (isDarkMode ? 'bg-black/60 backdrop-blur-md border-white/5' : 'bg-white/60 backdrop-blur-md border-black/5') : (isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white border-black/10') : (isDarkMode ? 'bg-[#121212] border-white/5' : 'bg-[#f8f8f8] border-black/5'))}`} style={isHackerMode ? { borderColor: `${hackerColor}33`, left: sidebarPosition === 'left' ? 0 : 'auto', right: sidebarPosition === 'right' ? 0 : 'auto' } : { left: sidebarPosition === 'left' ? 0 : 'auto', right: sidebarPosition === 'right' ? 0 : 'auto' }}>
        <div className={`p-6 border-b flex flex-col gap-4 ${isSidebarCollapsed ? 'items-center' : ''} ${(wallpaper || (isHackerMode && hackerBackgroundEnabled)) ? 'border-transparent' : 'border-black/5'}`} style={isHackerMode ? { borderBottomColor: `${hackerColor}33` } : {}}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} w-full`}>
            {!isSidebarCollapsed && <h2 className={`text-xl font-bold tracking-tight ${isHackerMode ? 'uppercase' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? '> CHATS' : 'Chats'}</h2>}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowAddChannel(true)}
                className={`p-2 rounded-full transition-colors ${isHackerMode ? 'hover:bg-white/5 opacity-50' : (isDarkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-[#4a4a4a]')}`}
                style={isHackerMode ? { color: hackerTextColor } : {}}
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
          
          {!isSidebarCollapsed && (
            <div className={`relative group flex items-center px-3 py-2 rounded-xl transition-all ${isHackerMode ? (isDarkMode ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/10 shadow-sm')} border shadow-sm`} style={isHackerMode ? { borderColor: `${hackerColor}4d` } : {}}>
              <Search size={16} className={`mr-2 shrink-0 ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-black')}`} style={isHackerMode ? { color: hackerTextColor } : {}} />
              <input 
                type="text"
                placeholder={isHackerMode ? 'QUERY_STREAM' : 'Pesquisar chats...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-transparent border-none outline-none text-xs w-full placeholder:opacity-50 ${!isHackerMode ? (isDarkMode ? 'text-white' : 'text-black') : ''}`}
                style={isHackerMode ? { color: hackerTextColor } : {}}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className={`ml-1 shrink-0 transition-opacity ${isHackerMode ? 'opacity-50 hover:opacity-100' : (isDarkMode ? 'text-white/60 hover:text-white' : 'text-black/60 hover:text-black')}`}
                  style={isHackerMode ? { color: hackerTextColor } : {}}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {!isSidebarCollapsed && (
            <button 
              onClick={fetchStats}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all border ${isHackerMode ? (isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10') : (isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white' : 'bg-black/5 border-black/5 hover:bg-black/10 text-black')} text-xs font-medium`}
              style={isHackerMode ? { color: hackerTextColor, borderColor: `${hackerColor}4d` } : {}}
            >
              <BarChart2 size={16} />
              {isHackerMode ? 'ESTATISTICAS_QUERY' : 'Estatísticas'}
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto mt-4 px-3 space-y-4">
          {/* Public Chats */}
          {publicChannels.length > 0 && (
            <div className="space-y-1">
              {!isSidebarCollapsed && <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor, opacity: 0.3 } : {}}>{isHackerMode ? '// CHATS' : 'Chats'}</div>}
              {publicChannels.map(channel => (
                <div 
                  key={channel.id} 
                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${activeChannel === channel.id ? (isHackerMode ? '' : (isDarkMode ? 'bg-white text-black' : 'bg-[#1a1a1a] text-white')) : (isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'text-white/70 hover:bg-white/5' : 'text-[#4a4a4a] hover:bg-black/5'))} ${isSidebarCollapsed ? 'md:justify-center' : ''}`}
                  onClick={() => {
                    setActiveChannel(channel.id);
                    setIsMobileMenuOpen(false);
                  }}
                  style={isHackerMode ? (activeChannel === channel.id ? { backgroundColor: hackerColor, color: hackerBubbleContrastColor } : { color: hackerTextColor, opacity: 0.7 }) : {}}
                >
                  <div 
                    className="flex items-center gap-3 flex-1 min-w-0"
                    title={isSidebarCollapsed ? channel.name : undefined}
                  >
                    <Hash size={18} className={activeChannel === channel.id ? '' : (isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]'))} style={isHackerMode && activeChannel !== channel.id ? { color: hackerTextColor, opacity: 0.3 } : {}} />
                    {!isSidebarCollapsed && <span className="font-medium truncate flex-1 text-left">{isHackerMode ? `./${channel.name}` : channel.name}</span>}
                  </div>
                  
                  {!isSidebarCollapsed && (channel.createdBy === auth.currentUser?.uid || isHackerMode || isAdmin) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {isHackerMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: channel.id, type: 'clear', name: channel.name });
                          }}
                          className="p-1 hover:text-yellow-500 transition-all"
                        >
                          <Trash size={14} />
                        </button>
                      )}
                      {channel.id !== 'general' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: channel.id, type: 'channel', name: channel.name });
                          }}
                          className="p-1 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Private Chats */}
          {privateChannels.length > 0 && (
            <div className="space-y-1">
              {!isSidebarCollapsed && <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor, opacity: 0.3 } : {}}>{isHackerMode ? '// PRIVATE_ENCRYPTED' : 'Chats Privados'}</div>}
              {privateChannels.map(channel => (
                <div 
                  key={channel.id} 
                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${activeChannel === channel.id ? (isHackerMode ? '' : (isDarkMode ? 'bg-white text-black' : 'bg-[#1a1a1a] text-white')) : (isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'text-white/70 hover:bg-white/5' : 'text-[#4a4a4a] hover:bg-black/5'))} ${isSidebarCollapsed ? 'md:justify-center' : ''}`}
                  onClick={() => {
                    setActiveChannel(channel.id);
                    setIsMobileMenuOpen(false);
                  }}
                  style={isHackerMode ? (activeChannel === channel.id ? { backgroundColor: hackerColor, color: hackerBubbleContrastColor } : { color: hackerTextColor, opacity: 0.7 }) : {}}
                >
                  <div 
                    className="flex items-center gap-3 flex-1 min-w-0"
                    title={isSidebarCollapsed ? channel.name : undefined}
                  >
                    <Lock size={18} className={activeChannel === channel.id ? '' : (isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]'))} style={isHackerMode && activeChannel !== channel.id ? { color: hackerTextColor, opacity: 0.3 } : {}} />
                    {!isSidebarCollapsed && <span className="font-medium truncate flex-1 text-left">{isHackerMode ? `./${channel.name}` : channel.name}</span>}
                  </div>
                  
                  {!isSidebarCollapsed && (channel.createdBy === auth.currentUser?.uid || isHackerMode || isAdmin) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {isHackerMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: channel.id, type: 'clear', name: channel.name });
                          }}
                          className="p-1 hover:text-yellow-500 transition-all"
                        >
                          <Trash size={14} />
                        </button>
                      )}
                      {channel.id !== 'general' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: channel.id, type: 'channel', name: channel.name });
                          }}
                          className="p-1 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* Collapse Toggle Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsSidebarCollapsed(!isSidebarCollapsed);
          }}
          className={`absolute hidden md:flex ${sidebarPosition === 'right' ? '-left-3' : '-right-3'} top-20 w-6 h-6 rounded-full border items-center justify-center transition-all shadow-sm z-50 ${isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-white text-black border-white/5' : 'bg-white text-[#1a1a1a] border-black/5 hover:bg-[#f8f8f8]')}`}
          style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerTextColor } : {}}
        >
          {isSidebarCollapsed ? (sidebarPosition === 'right' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />) : (sidebarPosition === 'right' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />)}
        </button>

              <div className={`p-4 border-t transition-colors duration-300 ${(wallpaper || (isHackerMode && hackerBackgroundEnabled)) ? 'bg-transparent border-transparent' : (isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'border-white/5 bg-[#181818]' : 'border-black/5 bg-[#f0f0f0]'))}`} style={isHackerMode ? { borderTopColor: `${hackerColor}33` } : {}}>
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <div 
              onClick={() => (currentUserProfile?.photoURL || auth.currentUser?.photoURL) && setFullScreenPhoto(currentUserProfile?.photoURL || auth.currentUser?.photoURL || null)}
              className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-sm overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity ${isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-black border-white/5' : 'bg-white border-black/5')}`} 
              style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}
            >
               {currentUserProfile?.photoURL || auth.currentUser?.photoURL ? (
                 <img src={currentUserProfile?.photoURL || auth.currentUser?.photoURL} alt="pfp" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
               ) : (
                 <UserIcon size={20} style={isHackerMode ? { color: hackerTextColor } : {}} className={isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')} />
               )}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 overflow-hidden">
                <p className={`text-sm font-semibold truncate ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{currentUserProfile?.displayName || auth.currentUser?.displayName}</p>
                <p className={`text-xs truncate ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{auth.currentUser?.email}</p>
              </div>
            )}
            {!isSidebarCollapsed && (
              <button 
                onClick={handleSignOut}
                className={`p-2 rounded-full transition-colors ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/10 text-white/70' : 'hover:bg-black/10 text-[#4a4a4a]')}`}
                style={isHackerMode ? { color: hackerTextColor, opacity: 0.7 } : {}}
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={`flex-1 relative flex flex-col min-w-0 transition-colors duration-300 z-10 ${(wallpaper || (isHackerMode && hackerBackgroundEnabled)) ? 'bg-transparent' : (isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'))}`}>
        {/* Header */}
        <header className={`h-20 border-b px-4 md:px-8 flex items-center justify-between transition-colors duration-300 ${isHackerMode ? '' : (isDarkMode ? 'border-white/5' : 'border-black/5')}`} style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}>
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className={`p-2 rounded-lg md:hidden ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/50' : 'hover:bg-black/5 text-[#9e9e9e]')}`}
              style={isHackerMode ? { color: hackerTextColor } : {}}
            >
              <Layout size={24} />
            </button>
            <div className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center ${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/5 text-white' : 'bg-[#f8f8f8] text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
              {channels.find(c => c.id === activeChannel)?.isPrivate ? <Lock size={24} /> : <Hash size={24} />}
            </div>
            <div className="min-w-0">
              <h1 className={`text-base md:text-lg font-bold flex items-center gap-2 truncate ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                {channels.find(c => c.id === activeChannel)?.isPrivate && <Lock size={16} />}
                #{channels.find(c => c.id === activeChannel)?.name || activeChannel}
              </h1>
              <div className="flex items-center gap-2 overflow-hidden">
                <p className={`text-[10px] md:text-xs truncate ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? '// channel_established' : 'Talk about everything and nothing.'}</p>
                <div className={`flex items-center gap-1 text-[10px] md:text-xs font-medium shrink-0 ${isHackerMode ? '' : 'text-green-500'}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={isHackerMode ? { backgroundColor: hackerColor } : { backgroundColor: '#10b981' }}></span>
                  <span className="hidden sm:inline">{onlineCount} {isHackerMode ? 'ACTIVES' : (onlineCount === 1 ? 'user' : 'users')} online</span>
                  <span className="sm:hidden">{onlineCount} online</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {channels.find(c => c.id === activeChannel)?.createdBy === auth.currentUser?.uid && activeChannel !== 'general' && (
              <>
                <button 
                  onClick={toggleChannelPrivacy}
                  className={`p-2 rounded-full transition-colors flex items-center gap-2 ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/50' : 'hover:bg-black/5 text-[#9e9e9e]')}`}
                  style={isHackerMode ? { color: hackerTextColor } : {}}
                  title={channels.find(c => c.id === activeChannel)?.isPrivate ? 'Make Public' : 'Make Private'}
                >
                  {channels.find(c => c.id === activeChannel)?.isPrivate ? <Lock size={20} /> : <Unlock size={20} />}
                </button>

                {joinRequests.filter(r => r.channelId === activeChannel).length > 0 && (
                  <button 
                    onClick={() => setShowRequestsModal(true)}
                    className={`p-2 rounded-full transition-colors relative flex items-center gap-2 ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/50' : 'hover:bg-yellow-500/10 text-yellow-500')}`}
                    style={isHackerMode ? { color: hackerTextColor } : {}}
                  >
                    <Bell size={20} className="animate-bounce" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border border-white">
                      {joinRequests.filter(r => r.channelId === activeChannel).length}
                    </span>
                  </button>
                )}
              </>
            )}
            <button 
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-full transition-colors ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/50' : 'hover:bg-black/5 text-[#9e9e9e]')}`}
              style={isHackerMode ? { color: hackerTextColor, opacity: 0.5 } : {}}
            >
              <MoreVertical size={20} />
            </button>
          </div>
        </header>

        {/* Message List */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {/* Hacker Interceptor Panel - FIXED POSITION */}
          <AnimatePresence>
            {isHackerMode && Object.keys(interceptedData).length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-8 right-8 z-30 border p-4 rounded-xl font-mono text-[10px] shadow-2xl backdrop-blur-md"
                style={{ borderColor: `${hackerColor}4d`, backgroundColor: `${isDarkMode ? '#000000dd' : '#ffffffdd'}`, color: hackerTextColor }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={12} className="animate-pulse" />
                  <span className="font-bold tracking-tighter uppercase">BIT_INTERCEPT_STREAM_v4.2</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-hide">
                  {Object.entries(interceptedData).map(([uid, data]: [string, any]) => (
                    <div key={uid} className="flex gap-2">
                      <span className="opacity-40">[{data.name?.toUpperCase() || 'UNK_USER'}]</span>
                      <span className="break-all animate-typing"> {data.text}█</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-8 py-6 space-y-8 scroll-smooth relative z-10"
          >
            {(() => {
              const currentChannel = channels.find(c => c.id === activeChannel);
              const isOwner = currentChannel?.createdBy === auth.currentUser?.uid;
              const isAllowed = currentChannel?.allowedUsers?.includes(auth.currentUser?.uid || '') || !currentChannel?.isPrivate || isOwner || isHackerMode;

              if (!isAllowed) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 shadow-2xl ${isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/5') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`} style={isHackerMode ? { borderColor: `${hackerColor}4d`, border: '1px solid' } : {}}>
                      <Lock size={64} style={isHackerMode ? { color: hackerTextColor } : {}} className={!isHackerMode ? (isDarkMode ? 'text-white/20' : 'text-gray-300') : ''} />
                    </div>
                    <h2 className={`text-4xl font-bold mb-4 tracking-tighter ${isHackerMode ? 'uppercase animate-pulse' : ''}`}>
                      {isHackerMode ? 'SECURE_NODE_ENCRYPTED' : 'Access Restricted'}
                    </h2>
                    <p className={`max-w-md mx-auto mb-10 text-lg leading-relaxed ${isHackerMode ? 'opacity-50' : (isDarkMode ? 'text-white/50' : 'text-gray-500')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                      {isHackerMode 
                        ? 'This transmission node is protected by level-9 visual encryption. Establishing handshake...' 
                        : 'This channel is private. Only authorized members can view the message history.'}
                    </p>
                    <button 
                      onClick={requestAccess}
                      className={`group px-10 py-5 rounded-2xl font-bold transition-all flex items-center gap-3 transform hover:scale-105 active:scale-95 shadow-xl ${isHackerMode ? 'text-black' : (isDarkMode ? 'bg-white text-black' : 'bg-[#1a1a1a] text-white')}`}
                      style={isHackerMode ? { backgroundColor: hackerColor, boxShadow: `0 20px 25px -5px ${hackerColor}4d` } : {}}
                    >
                      <UserPlus size={24} />
                      <span className="text-lg">{isHackerMode ? 'INITIATE_HANDSHAKE' : 'Request Access'}</span>
                    </button>
                  </div>
                );
              }

              if (messages.length === 0) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`}>
                      {currentChannel?.isPrivate ? <Lock size={40} style={isHackerMode ? { color: hackerTextColor } : {}} /> : <Hash size={40} style={isHackerMode ? { color: hackerTextColor } : {}} />}
                    </div>
                    <p className={`text-lg font-medium ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? '[WAITING_FOR_DATA]' : `This is the start of the #${currentChannel?.name || activeChannel} channel.`}</p>
                    <p className={`text-sm ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} style={isHackerMode ? { color: hackerTextColor, opacity: 0.6 } : {}}>{isHackerMode ? 'Establish communication sequence.' : 'Say hi to everyone!'}</p>
                  </div>
                );
              }

              return messages.map((msg, idx) => {
                const isOwn = msg.senderId === auth.currentUser?.uid;
                const showAvatar = idx === 0 || messages[idx-1].senderId !== msg.senderId;
                
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-4 ${isOwn ? 'flex-row-reverse' : ''}`}
                    onMouseDown={(e) => handleMessageLongPress(e, msg)}
                    onMouseMove={cancelLongPress}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => handleMessageLongPress(e, msg)}
                    onTouchMove={cancelLongPress}
                    onTouchEnd={cancelLongPress}
                  >
                    <div 
                    onClick={() => msg.senderPhoto && setFullScreenPhoto(msg.senderPhoto)}
                    className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity ${!showAvatar ? 'invisible' : ''} ${!isHackerMode ? (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-[#f8f8f8] border-black/5') : ''}`} 
                    style={isHackerMode ? { 
                      borderColor: hackerColor, 
                      backgroundColor: wallpaper ? hackerColor : (isDarkMode ? '#000000' : '#ffffff'),
                      boxShadow: wallpaper ? `0 0 10px ${hackerColor}` : 'none'
                    } : {}}
                  >
                      {msg.senderPhoto ? (
                        <img src={msg.senderPhoto} alt="av" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon size={18} style={isHackerMode ? { color: wallpaper ? hackerBubbleContrastColor : hackerTextColor, opacity: 1 } : {}} className={isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]')} />
                      )}
                    </div>
                    <div className={`max-w-[70%] ${isOwn ? 'items-end' : ''} flex flex-col`}>
                      {showAvatar && (
                        <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <span 
                            className={`text-sm font-bold px-1.5 py-0.5 rounded ${isHackerMode ? '' : (isDarkMode ? 'text-white' : 'text-[#1a1a1a]')}`} 
                            style={isHackerMode ? { 
                              color: hackerBubbleContrastColor, 
                              backgroundColor: hackerColor,
                              boxShadow: wallpaper ? `0 0 10px ${hackerColor}` : 'none'
                            } : {}}
                          >
                            {isHackerMode && isAdmin && msg.senderId !== auth.currentUser?.uid ? `[ADMIN_VIEW] ${msg.senderName}` : msg.senderName}
                          </span>
                          <span 
                            className={`text-[10px] uppercase tracking-wider px-1 py-0.5 rounded ${isHackerMode ? '' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]')}`} 
                            style={isHackerMode ? { 
                              color: hackerBubbleContrastColor,
                              backgroundColor: `${hackerColor}80` 
                            } : {}}
                          >
                            {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}
                          </span>
                        </div>
                      )}
                      
                      {msg.replyToId && (
                        <div className={`px-3 py-1 mb-1 rounded-lg text-[10px] flex flex-col border-l-2 max-w-full overflow-hidden ${isOwn ? 'bg-black/5 border-black/20' : 'bg-black/5 border-black/20'} ${isHackerMode ? (isDarkMode ? 'bg-white/5 border-current' : 'bg-black/5 border-current') : ''}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                          <span className="font-bold opacity-70 truncate">{msg.replyToName}</span>
                          <span className="break-all opacity-50 italic line-clamp-2">{msg.replyToText}</span>
                        </div>
                      )}

                      <div className="relative group/msg">
                        <div 
                          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-all whitespace-pre-wrap max-w-full ${isOwn ? 'rounded-tr-none' : 'rounded-tl-none'} ${!isHackerMode ? (isOwn ? '' : (msg.bubbleColor ? '' : (isDarkMode ? 'bg-white/5 text-white' : 'bg-[#f5f5f5] text-[#1a1a1a]'))) : ''}`}
                          style={isHackerMode 
                            ? (isOwn ? { backgroundColor: hackerColor, color: hackerBubbleContrastColor } : { border: `1px solid ${hackerColor}33`, color: hackerTextColor }) 
                            : (msg.bubbleColor 
                                ? { backgroundColor: msg.bubbleColor, color: (msg.bubbleColor === '#ffffff' || msg.bubbleColor === '#fff') ? '#000' : '#fff' } 
                                : (isOwn 
                                    ? { backgroundColor: isDarkMode ? '#fff' : '#1a1a1a', color: isDarkMode ? '#000' : '#fff' } 
                                    : {}
                                  )
                              )}
                        >
                          {msg.type === 'audio' ? (
                            <CustomAudioPlayer 
                              src={msg.audioUrl!} 
                              isDarkMode={isDarkMode} 
                              isHackerMode={isHackerMode} 
                              hackerColor={hackerColor} 
                              isOwn={isOwn}
                            />
                          ) : msg.type === 'image' ? (
                            <div className="cursor-pointer overflow-hidden rounded-lg" onClick={() => setFullScreenPhoto(msg.imageUrl!)}>
                              <img src={msg.imageUrl} alt="attach" className="max-w-[250px] max-h-[300px] object-cover hover:scale-[1.02] transition-transform" />
                            </div>
                          ) : (
                            isHackerMode ? `>>> ${msg.text}` : msg.text
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              });
            })()}
          </div>
        </div>

        {/* Input Area */}
        {(() => {
          const currentChannel = channels.find(c => c.id === activeChannel);
          const isOwner = currentChannel?.createdBy === auth.currentUser?.uid;
          const isAllowed = currentChannel?.allowedUsers?.includes(auth.currentUser?.uid || '') || !currentChannel?.isPrivate || isOwner || isHackerMode;

          if (!isAllowed) return null;

          return (
            <div className="p-6 relative">
              <AnimatePresence>
                {replyingTo && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`absolute bottom-full left-6 right-6 p-4 mb-2 rounded-t-2xl border flex items-center justify-between shadow-lg backdrop-blur-md z-[100] ${isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-[#121212] border-white/5' : 'bg-[#f8f8f8] border-black/5')}`}
                    style={isHackerMode ? { borderColor: `${hackerColor}4d`, color: hackerTextColor } : {}}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{isHackerMode ? 'REPLY_TARGET' : 'Respondendo a'} {replyingTo.senderName}</span>
                      <p className="text-xs truncate italic opacity-50">{replyingTo.text || (replyingTo.type === 'image' ? 'Image' : replyingTo.type === 'audio' ? 'Audio' : 'File')}</p>
                    </div>
                    <button 
                      onClick={() => setReplyingTo(null)}
                      className={`p-1 rounded-full opacity-60 hover:opacity-100 ${isHackerMode ? 'hover:bg-white/10' : (isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/10')}`}
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                )}
                {showEmojiPicker && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className={`absolute bottom-[100px] right-6 p-4 rounded-3xl shadow-2xl border flex flex-wrap gap-2 w-72 z-40 ${isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-[#181818] border-white/10' : 'bg-white border-black/5')}`}
                    style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}
                  >
                    <div className="grid grid-cols-4 gap-2 w-full">
                      {EMOJIS.map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => addEmoji(emoji)}
                          className={`w-full aspect-square text-2xl flex items-center justify-center rounded-xl transition-all ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}`}
                          style={isHackerMode ? { color: hackerTextColor } : {}}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form 
                onSubmit={handleSendMessage}
                className={`rounded-2xl border p-2 flex items-end gap-2 focus-within:ring-2 transition-all shadow-sm ${wallpaper ? (isDarkMode ? 'bg-black/80 backdrop-blur-md border-white/5 focus-within:ring-white/10' : 'bg-white/80 backdrop-blur-md border-black/5 focus-within:ring-black/10') : (isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-white/5 border-white/5 focus-within:ring-white/10' : 'bg-[#f8f8f8] border-black/5 focus-within:ring-black/10'))}`}
                style={isHackerMode ? { borderColor: `${hackerColor}33`, ringColor: `${hackerColor}4d` } : {}}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileSelect} 
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-3 rounded-xl transition-colors ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/30' : 'hover:bg-black/5 text-[#9e9e9e]')}`}
                  style={isHackerMode ? { color: hackerTextColor, opacity: 0.5 } : {}}
                >
                  <ImageIcon size={20} />
                </button>

                <div className="flex-1 min-h-[44px] flex items-center relative">
                  {isRecording ? (
                    <div className="flex items-center gap-3 px-4 w-full">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-mono text-sm">{formatTime(recordingTime)}</span>
                      <span className="text-xs opacity-50 uppercase tracking-widest">{isHackerMode ? 'RECORDING_BITSTREAM...' : 'Recording Audio...'}</span>
                    </div>
                  ) : (
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                      className={`w-full bg-transparent border-none focus:ring-0 resize-none py-3 px-4 text-sm max-h-32 ${isHackerMode ? '' : (isDarkMode ? 'text-white placeholder:text-white/20' : 'text-[#1a1a1a] placeholder:text-[#9e9e9e]')}`}
                      placeholder={isHackerMode ? "> broadcast_pulse..." : "Mensagem..."}
                      style={isHackerMode ? { color: hackerTextColor } : {}}
                      rows={1}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 p-1">
                  {!inputText.trim() && (
                    <button 
                      type="button" 
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : (isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5 text-white/30' : 'hover:bg-black/5 text-[#9e9e9e]'))}`}
                      style={isHackerMode && !isRecording ? { color: hackerTextColor, opacity: 0.5 } : {}}
                    >
                      <Mic size={20} />
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2 rounded-xl transition-colors ${isHackerMode ? (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5') : (isDarkMode ? 'hover:bg-white/5 text-white/30' : 'hover:bg-black/5 text-[#9e9e9e]')} ${showEmojiPicker ? (isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/10') : (isDarkMode ? 'bg-white/10 text-white' : 'bg-black/10 text-black')) : ''}`}
                    style={isHackerMode ? { color: hackerTextColor, opacity: 0.3 } : {}}
                  >
                    <Smile size={20} style={showEmojiPicker && isHackerMode ? { opacity: 1 } : {}} />
                  </button>
                  <button 
                    type="submit" 
                    disabled={!inputText.trim() || sending}
                    className={`p-3 rounded-xl transition-all ${inputText.trim() ? (isHackerMode ? 'text-black shadow-lg' : (isDarkMode ? 'bg-white text-black shadow-lg shadow-white/5' : 'bg-[#1a1a1a] text-white shadow-lg shadow-black/10')) : (isHackerMode ? 'opacity-20' : (isDarkMode ? 'bg-white/5 text-white/20' : 'bg-[#f0f0f0] text-[#9e9e9e]'))}`}
                    style={isHackerMode && inputText.trim() ? { backgroundColor: hackerColor, boxShadow: `0 10px 15px -3px ${hackerColor}33` } : (isHackerMode ? { color: hackerTextColor } : {})}
                  >
                    <Send size={20} />
                  </button>
                </div>
              </form>
              <div className="mt-3 px-2 flex justify-between">
                 <p className={`text-[10px] uppercase tracking-widest font-medium ${isHackerMode ? '' : (isDarkMode ? 'text-white/20' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor, opacity: 0.4 } : {}}>{isHackerMode ? '[CMD] ENTER: SEND | SHIFT+ENTER: NEW_LINE' : 'Press Enter to send, Shift+Enter for new line'}</p>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Message Context Menu */}
      <AnimatePresence>
        {messageContextMenu && (
          <>
            <div className="fixed inset-0 z-[120]" onClick={() => setMessageContextMenu(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`fixed z-[130] w-48 rounded-xl shadow-2xl overflow-hidden border ${isHackerMode ? (isDarkMode ? 'bg-black border-white/10' : 'bg-white border-black/10') : (isDarkMode ? 'bg-[#121212] border-white/10' : 'bg-white border-black/10')}`}
              style={{ 
                left: Math.min(messageContextMenu.x, window.innerWidth - 200), 
                top: Math.min(messageContextMenu.y, window.innerHeight - 150),
                borderColor: isHackerMode ? `${hackerColor}33` : undefined,
                color: isHackerMode ? hackerColor : undefined
              }}
            >
              <div className="flex flex-col py-1">
                {(messageContextMenu.message.senderId === auth.currentUser?.uid || isAdmin || isHackerMode) && (
                  <button 
                    onClick={() => {
                      handleDeleteMessage(messageContextMenu.message.id);
                      setMessageContextMenu(null);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-red-500 ${isHackerMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
                  >
                    <Trash2 size={16} />
                    {isHackerMode ? 'PURGE_MESSAGE' : 'Apagar'}
                  </button>
                )}
                <button 
                  onClick={() => {
                    setReplyingTo(messageContextMenu.message);
                    setMessageContextMenu(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'text-white hover:bg-white/5' : 'text-[#1a1a1a] hover:bg-black/5')}`}
                >
                  <Check size={16} />
                  {isHackerMode ? 'RESPOND_DATA' : 'Responder'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Stats Modal */}
      <AnimatePresence>
        {showStats && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStats(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col border backdrop-blur-3xl ${isHackerMode ? (isDarkMode ? 'bg-black/5 border-white/10' : 'bg-white/20 border-black/10') : (isDarkMode ? 'bg-[#121212]/10 border-white/10 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]' : 'bg-white/10 border-white/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]')}`}
              style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerTextColor } : {}}
            >
              <div className={`p-6 border-b flex items-center justify-between ${isHackerMode ? 'border-white/10' : 'border-black/5'}`}>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Activity size={20} />
                    {isHackerMode ? 'SYSTEM_METRICS' : 'Estatísticas do Chat'}
                  </h3>
                  <p className="text-xs opacity-50 mt-1">
                    {isHackerMode ? 'QUANTUM_METADATA_ANALYSIS' : 'Análise de atividade dos membros'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowStats(false)}
                  className={`p-2 rounded-full transition-colors ${isHackerMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {statsLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-current opacity-50" />
                    <p className="text-sm font-mono animate-pulse">
                      {isHackerMode ? 'ACCESSING_DATALAKE...' : 'Carregando dados...'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Growth Chart */}
                    <div className={`p-6 rounded-2xl border ${isHackerMode ? (isDarkMode ? 'bg-white/5 border-white/10 backdrop-blur-sm' : 'bg-black/5 border-black/10 backdrop-blur-sm') : (isDarkMode ? 'bg-white/5 border-white/5 backdrop-blur-sm' : 'bg-white/30 border-black/5 backdrop-blur-sm')}`}>
                      <h4 className="text-sm font-bold mb-6 flex items-center gap-2">
                        <Users size={16} />
                        {isHackerMode ? 'MESSAGE_VOLUME_BY_NODE' : 'Ranking de Mensagens'}
                      </h4>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={userStats}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isHackerMode ? hackerColor + '22' : (isDarkMode ? '#ffffff11' : '#00000011')} vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              stroke={isHackerMode ? hackerColor : (isDarkMode ? '#ffffff66' : '#00000066')} 
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis 
                              stroke={isHackerMode ? hackerColor : (isDarkMode ? '#ffffff66' : '#00000066')} 
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: isHackerMode ? '#000' : (isDarkMode ? '#1a1a1a' : '#fff'),
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: isHackerMode ? hackerColor : undefined,
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                              }}
                              itemStyle={{ color: isHackerMode ? hackerColor : undefined }}
                              cursor={{ fill: isHackerMode ? `${hackerColor}33` : '#00000011', radius: 8 }}
                            />
                            <Bar 
                              dataKey="messages" 
                              radius={[8, 8, 0, 0]}
                              animationDuration={1500}
                            >
                              {userStats.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={isHackerMode ? hackerColor : (isDarkMode ? '#fff' : '#1a1a1a')} fillOpacity={0.8 - (index * 0.1)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Member Table */}
                    <div className={`overflow-x-auto rounded-2xl border backdrop-blur-md ${isHackerMode ? (isDarkMode ? 'bg-black/5 border-white/5' : 'bg-white/5 border-black/10') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white/20 border-white/20')}`}>
                      <table className="w-full text-left text-sm border-collapse">
                        <thead className={`${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/10 backdrop-blur-sm' : 'bg-white/30 backdrop-blur-sm')}`}>
                          <tr>
                            <th className="px-2 py-3 font-bold whitespace-nowrap">{isHackerMode ? 'ID_REF' : 'Membro'}</th>
                            <th className="px-2 py-3 font-bold whitespace-nowrap">{isHackerMode ? 'TX_COUNT' : 'Mensagens'}</th>
                            <th className="px-2 py-3 font-bold whitespace-nowrap">{isHackerMode ? 'NET_STATE' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isHackerMode ? 'divide-white/10' : 'border-black/5'}`}>
                          {userStats.map((user) => (
                            <tr key={user.id} className={`${isHackerMode ? 'hover:bg-white/5' : 'hover:bg-black/5'} transition-colors`}>
                              <td className="px-2 py-4">
                                <div className="flex items-center gap-3">
                                  {user.photo ? (
                                    <img src={user.photo} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/10') : (isDarkMode ? 'bg-white/10' : 'bg-white/20')}`}>
                                      <UserIcon size={14} />
                                    </div>
                                  )}
                                  <span className="font-medium whitespace-nowrap">{user.name}</span>
                                </div>
                              </td>
                              <td className="px-2 py-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-mono font-bold ${isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/10') : (isDarkMode ? 'bg-white/10' : 'bg-black/5')}`}>
                                  {user.messages}
                                </span>
                              </td>
                              <td className="px-2 py-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${user.status === 'Online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 opacity-50'}`} />
                                  <span className={`text-xs ${user.status === 'Online' ? 'text-green-500' : 'opacity-50'}`}>
                                    {isHackerMode ? (user.status === 'Online' ? 'ACTIVE' : 'IDLE') : user.status}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl transition-all ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-[#121212] text-white' : 'bg-white text-[#1a1a1a]')}`}
              style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerTextColor } : {}}
            >
              <div className="max-h-[85vh] overflow-y-auto p-8 scrollbar-hide">
                <div className="flex justify-between items-center mb-8">
                  <h3 className={`text-2xl font-bold tracking-tight ${isHackerMode ? 'uppercase' : ''}`}>{isHackerMode ? '[CONFIG]' : 'Configurações'}</h3>
                  <button onClick={() => setShowSettings(false)} className={`p-2 rounded-full ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                    <X size={20} />
                  </button>
                </div>

                <div className={`flex p-1 rounded-2xl mb-8 ${isDarkMode || (isHackerMode && isDarkMode) ? 'bg-white/5' : 'bg-black/5'}`}>
                  <button 
                    onClick={() => setSettingsTab('visor')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${settingsTab === 'visor' ? (isDarkMode || (isHackerMode && isDarkMode) ? 'bg-white/10 text-white' : 'bg-white text-black shadow-sm') : 'opacity-40 hover:opacity-100'}`}
                    style={isHackerMode && settingsTab === 'visor' ? { color: hackerTextColor } : {}}
                  >
                    Visor
                  </button>
                  <button 
                    onClick={() => setSettingsTab('outros')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${settingsTab === 'outros' ? (isDarkMode || (isHackerMode && isDarkMode) ? 'bg-white/10 text-white' : 'bg-white text-black shadow-sm') : 'opacity-40 hover:opacity-100'}`}
                    style={isHackerMode && settingsTab === 'outros' ? { color: hackerTextColor } : {}}
                  >
                    Perfil
                  </button>
                </div>
                
                <div className="space-y-6">
                  {settingsTab === 'visor' ? (
                    <>
                      {/* Theme Protocol */}
                      <div className={`p-6 rounded-2xl flex items-center justify-between ${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`} style={isHackerMode ? { backgroundColor: `${hackerColor}0d` } : {}}>
                        <div className="flex items-center gap-4">
                          {isDarkMode ? <Moon size={24} style={isHackerMode ? { color: hackerTextColor } : {}} className={!isHackerMode ? 'text-white' : ''} /> : <Sun size={24} className="text-orange-500" />}
                          <div>
                            <p className="font-bold">{isHackerMode ? 'DARK_PROTOCOL' : 'Modo Escuro'}</p>
                            <p className={`text-xs ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? 'Visual encryption mode.' : 'Fica mais leve na vista.'}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className={`w-14 h-8 rounded-full p-1 transition-colors ${isHackerMode ? '' : (isDarkMode ? 'bg-white' : 'bg-black/10')}`}
                          style={isHackerMode ? { backgroundColor: hackerColor } : {}}
                        >
                          <div className={`w-6 h-6 rounded-full shadow-sm transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-0'} ${isHackerMode ? (isDarkMode ? 'bg-black' : 'bg-white') : (isDarkMode ? 'bg-white' : 'bg-white')}`} />
                        </button>
                      </div>

                      {/* Bubble Color Selector */}
                      {!isAdmin && !isHackerMode && (
                        <div className={`p-6 rounded-2xl space-y-4 ${isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]'}`}>
                          <div className="flex items-center gap-4">
                            <Smile size={24} className={isDarkMode ? 'text-white' : 'text-black'} />
                            <div>
                              <p className="font-bold">Cor do Balão</p>
                              <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]'}`}>Mude a cor das suas mensagens.</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {['#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#ffffff'].map(color => (
                              <button
                                key={color}
                                onClick={() => setBubbleColor(color)}
                                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${settings.bubbleColor === color ? (isDarkMode ? 'border-white' : 'border-black') : 'border-transparent'}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                            <div className="relative group">
                              <input 
                                type="color" 
                                value={settings.bubbleColor || '#1a1a1a'}
                                onChange={(e) => setBubbleColor(e.target.value)}
                                className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer z-10"
                              />
                              <button
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all group-hover:scale-110 ${!['#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#ffffff'].includes(settings.bubbleColor) ? (isDarkMode ? 'border-white' : 'border-black') : 'border-transparent'}`}
                                style={{ background: `conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)` }}
                              >
                                <Palette size={14} className="text-white drop-shadow-md" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sidebar Orientation */}
                      <div className={`p-6 rounded-2xl flex flex-col gap-4 ${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`} style={isHackerMode ? { backgroundColor: `${hackerColor}0d` } : {}}>
                        <div className="flex items-center gap-4">
                          <Layout size={24} style={isHackerMode ? { color: hackerTextColor } : {}} />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">{isHackerMode ? 'UI_ORIENTATION' : 'Lado da Gaveta'}</p>
                            <p className={`text-[10px] sm:text-xs leading-tight ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? 'Map interface quadrants.' : 'Lado esquerdo ou direito.'}</p>
                          </div>
                        </div>
                        <div className={`flex p-1 rounded-xl w-full gap-1 overflow-hidden ${isDarkMode || (isHackerMode && isDarkMode) ? 'bg-white/5' : 'bg-black/5'}`}>
                          <button 
                            onClick={() => setSidebarPosition('left')}
                            className={`flex-1 py-2 text-[10px] sm:text-xs rounded-lg transition-all truncate px-1 min-w-0 ${sidebarPosition === 'left' ? (isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/10') : 'bg-white dark:bg-white/10 shadow-sm font-bold') : 'opacity-40 hover:opacity-100'}`}
                            style={isHackerMode && sidebarPosition === 'left' ? { color: hackerTextColor } : {}}
                          >
                            Esquerda
                          </button>
                          <button 
                            onClick={() => setSidebarPosition('right')}
                            className={`flex-1 py-2 text-[10px] sm:text-xs rounded-lg transition-all truncate px-1 min-w-0 ${sidebarPosition === 'right' ? (isHackerMode ? (isDarkMode ? 'bg-white/10' : 'bg-black/10') : 'bg-white dark:bg-white/10 shadow-sm font-bold') : 'opacity-40 hover:opacity-100'}`}
                            style={isHackerMode && sidebarPosition === 'right' ? { color: hackerTextColor } : {}}
                          >
                            Direita
                          </button>
                        </div>
                      </div>

                      {/* Hacker Matrix Effect - MOD: Moved to Visor tab */}
                      {isHackerMode && (
                        <div className={`p-6 rounded-2xl space-y-4 transition-all ${isHackerMode ? (isDarkMode ? 'bg-white/5 border' : 'bg-black/5 border') : ''}`} style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Terminal size={24} style={{ color: hackerTextColor }} />
                              <div>
                                <p className="font-bold uppercase tracking-widest text-xs">Efeito de Fundo</p>
                                <p className="text-[10px] opacity-40 uppercase">Cybernetic Matrix Protocol</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setHackerBackgroundEnabled(!hackerBackgroundEnabled)}
                              className={`w-12 h-6 rounded-full p-1 transition-colors`}
                              style={{ backgroundColor: hackerBackgroundEnabled ? hackerColor : 'rgba(255,255,255,0.1)' }}
                            >
                              <div className={`w-4 h-4 rounded-full bg-black transition-transform ${hackerBackgroundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          {hackerBackgroundEnabled && (
                            <div className="pt-2 space-y-2 border-t border-white/5">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
                                <span>Brilho do Efeito</span>
                                <span>{Math.round(hackerBackgroundBrightness * 100)}%</span>
                              </div>
                              <input 
                                type="range"
                                min="0.05"
                                max="1"
                                step="0.05"
                                value={hackerBackgroundBrightness}
                                onChange={(e) => setHackerBackgroundBrightness(parseFloat(e.target.value))}
                                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black dark:bg-white/10 dark:accent-white"
                                style={isHackerMode ? { accentColor: hackerColor } : {}}
                              />
                            </div>
                          )}

                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Cor do Sistema</label>
                            <div className="flex flex-wrap gap-2 items-center">
                              {['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#ff0000', '#ffffff'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setHackerColor(color)}
                                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${hackerColor === color ? 'border-white' : 'border-transparent'}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                              <div className="relative group">
                                <input 
                                  type="color"
                                  value={hackerColor}
                                  onChange={(e) => setHackerColor(e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <button
                                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all group-hover:scale-110 ${!['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#ff0000', '#ffffff'].includes(hackerColor) ? 'border-white' : 'border-white/20'}`}
                                  style={{ background: `conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)` }}
                                >
                                  <Palette size={14} className="text-white drop-shadow-md" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Wallpaper Selector */}
                      <div className={`p-6 rounded-2xl space-y-4 ${isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]'}`}>
                        <div className="flex items-center gap-4">
                          <ImageIcon size={24} className={isDarkMode ? 'text-white' : 'text-black'} />
                          <div>
                            <p className="font-bold">Plano de Fundo</p>
                            <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]'}`}>URL ou arquivo de imagem.</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <input 
                              type="url"
                              value={wallpaperInput}
                              onChange={(e) => setWallpaperInput(e.target.value)}
                              placeholder="https://imagem.jpg"
                              className={`flex-1 px-4 py-2 rounded-xl text-sm focus:outline-none ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/5 border'}`}
                            />
                            <button 
                              onClick={() => {
                                setWallpaper(wallpaperInput);
                                setWallpaperInput('');
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white hover:opacity-80'}`}
                            >
                              Aplicar
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <input 
                              type="file"
                              ref={wallpaperFileRef}
                              onChange={handleWallpaperFileSelect}
                              accept="image/*"
                              className="hidden"
                            />
                            <button 
                              onClick={() => wallpaperFileRef.current?.click()}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-black/10 hover:bg-black/5'}`}
                            >
                              Upload do Dispositivo
                            </button>
                            {wallpaper && (
                              <button 
                                onClick={() => setWallpaper('')}
                                className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-all"
                                title="Remover fundo"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>

                          {wallpaper && (
                            <div className="pt-2 space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
                                <span>Brilho do Fundo</span>
                                <span>{Math.round(wallpaperBrightness * 100)}%</span>
                              </div>
                              <input 
                                type="range"
                                min="0.05"
                                max="1"
                                step="0.05"
                                value={wallpaperBrightness}
                                onChange={(e) => setWallpaperBrightness(parseFloat(e.target.value))}
                                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black dark:bg-white/10 dark:accent-white"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 justify-center mb-6">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (currentUserProfile?.photoURL || auth.currentUser?.photoURL) {
                              setExpandedPfp(currentUserProfile?.photoURL || auth.currentUser?.photoURL || null);
                            }
                          }}
                          className={`w-20 h-20 rounded-full overflow-hidden border-4 transition-all hover:scale-110 active:scale-95 shadow-xl cursor-zoom-in relative group ${isHackerMode ? '' : (isDarkMode ? 'border-white/20' : 'border-white')}`} 
                          style={isHackerMode ? { borderColor: hackerColor } : {}}
                        >
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Search className="text-white" size={24} />
                          </div>
                          {currentUserProfile?.photoURL || auth.currentUser?.photoURL ? (
                            <img src={currentUserProfile?.photoURL || auth.currentUser?.photoURL} alt="pfp" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-500/10">
                              <UserIcon size={40} />
                            </div>
                          )}
                        </button>
                      </div>

                      <div className={`p-6 rounded-2xl space-y-4 ${isHackerMode ? (isDarkMode ? 'bg-white/5 border' : 'bg-black/5 border') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`} style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}>
                        <div className="flex items-center gap-4">
                           <UserIcon size={24} style={isHackerMode ? { color: hackerTextColor } : {}} />
                           <div>
                              <p className="font-bold">Identidade</p>
                              <p className={`text-xs ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>Atualize seu avatar visual.</p>
                           </div>
                        </div>
                        
                        <form onSubmit={handleUpdatePhoto} className="space-y-3">
                          <input 
                            type="url"
                            value={newPhotoURL}
                            onChange={(e) => setNewPhotoURL(e.target.value)}
                            placeholder="URL da Foto (https://...)"
                            className={`w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/5')}`}
                            style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerColor } : {}}
                          />
                          <div className="flex gap-2">
                            <button 
                              type="submit"
                              disabled={!newPhotoURL.trim()}
                              className={`flex-[2] py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 ${!isHackerMode ? (isDarkMode ? 'bg-white text-black' : 'bg-black text-white') : 'text-black'}`}
                              style={isHackerMode ? { backgroundColor: hackerColor } : {}}
                            >
                               Atualizar
                            </button>
                            <input 
                              type="file"
                              ref={avatarFileRef}
                              onChange={handleAvatarFileSelect}
                              accept="image/*"
                              className="hidden"
                            />
                            <button 
                              type="button"
                              onClick={() => avatarFileRef.current?.click()}
                              className={`flex-1 flex items-center justify-center rounded-xl transition-all ${isHackerMode ? (isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-black/10 hover:bg-black/20') : (isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-black/10 hover:bg-black/20')}`}
                              style={isHackerMode ? { color: hackerColor } : {}}
                              title="Upload do Arquivo"
                            >
                              <ImageIcon size={20} />
                            </button>
                            {(currentUserProfile?.photoURL || auth.currentUser?.photoURL) && (
                              <button 
                                type="button"
                                onClick={handleRemovePhoto}
                                className="flex-1 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                                title="Remover Foto"
                              >
                                <Trash2 size={20} />
                              </button>
                            )}
                          </div>
                        </form>
                      </div>

                      <div className={`p-6 rounded-2xl space-y-4 ${isHackerMode ? (isDarkMode ? 'bg-white/5 border' : 'bg-black/5 border') : (isDarkMode ? 'bg-white/5' : 'bg-[#f8f8f8]')}`} style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}>
                        <div className="flex items-center gap-4">
                           <Lock size={24} style={isHackerMode ? { color: hackerTextColor } : {}} />
                           <div>
                              <p className="font-bold">{isHackerMode ? 'ROOT_ACCESS' : 'Acesso Restrito'}</p>
                              <p className={`text-xs ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/40' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>{isHackerMode ? 'Portfólio hacker ativo.' : 'Coloque o código secreto.'}</p>
                           </div>
                        </div>
                        <div className="relative">
                          <input 
                            type="password"
                            value={hackerCode}
                            onChange={(e) => handleHackerCode(e.target.value)}
                            placeholder="COLOCAR_CODIGO"
                            className={`w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-black/5')}`}
                            style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerColor } : {}}
                          />
                        </div>
                      </div>


                      {isHackerMode && (
                        <div className={`p-6 rounded-2xl space-y-4 bg-white/5 border`} style={{ borderColor: `${hackerColor}33` }}>
                          <button 
                            onClick={() => setIsHackerMode(false)}
                            className="w-full p-4 rounded-xl font-bold text-xs uppercase tracking-widest border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-all"
                          >
                            [TERMINATE_HACKER_PROTOCOL]
                          </button>
                        </div>
                      )}

                      <button 
                        onClick={handleSignOut}
                        className={`w-full p-6 rounded-2xl flex items-center gap-4 transition-colors ${isHackerMode ? (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5') : (isDarkMode ? 'hover:bg-white/5 text-red-400' : 'hover:bg-black/5 text-red-500')}`}
                        style={isHackerMode ? { color: hackerColor } : {}}
                      >
                        <LogOut size={24} />
                        <span className={`font-bold text-lg ${isHackerMode ? 'uppercase' : ''}`}>{isHackerMode ? 'TERMINATE_SESSION' : 'Sair da Conta'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Channel Modal */}
      <AnimatePresence>
        {showAddChannel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddChannel(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl transition-all ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-[#121212] text-white' : 'bg-white text-[#1a1a1a]')}`}
              style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerColor } : {}}
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h3 className={`text-2xl font-bold tracking-tight ${isHackerMode ? 'uppercase' : ''}`}>{isHackerMode ? '[CREATE_NODE]' : 'New Channel'}</h3>
                  <button onClick={() => setShowAddChannel(false)} className={`p-2 rounded-full ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                    <X size={20} />
                  </button>
                </div>
                
                <form onSubmit={handleAddChannel} className="space-y-6">
                  <div className="space-y-2">
                    <label className={`text-xs font-bold uppercase tracking-wider ${isHackerMode ? 'opacity-40' : (isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>Channel Name</label>
                    <div className="relative">
                      <Hash className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-white/30' : 'text-[#9e9e9e]'}`} size={18} style={isHackerMode ? { color: hackerTextColor, opacity: 0.3 } : {}} />
                      <input
                        type="text"
                        required
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        className={`w-full pl-10 pr-4 py-4 rounded-2xl outline-none transition-all ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-white/5 focus:ring-2 focus:ring-white/10' : 'bg-[#f5f5f5] focus:ring-2 focus:ring-black/10')}`}
                        style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerColor } : {}}
                        placeholder={isHackerMode ? "node_identifier..." : "e.g. general-chat"}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sending || !newChannelName.trim()}
                    className={`w-full py-5 rounded-2xl font-bold text-lg transition-all disabled:opacity-50 ${isHackerMode ? 'text-black' : (isDarkMode ? 'bg-white text-black hover:bg-white/90' : 'bg-[#1a1a1a] text-white hover:bg-black/90')}`}
                    style={isHackerMode ? { backgroundColor: hackerColor } : {}}
                  >
                     {isHackerMode ? 'INITIALIZE_CHANNEL' : 'Create Channel'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Join Requests Modal */}
      <AnimatePresence>
        {showRequestsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl transition-all ${isHackerMode ? (isDarkMode ? 'bg-black border' : 'bg-white border') : (isDarkMode ? 'bg-[#121212] text-white' : 'bg-white text-[#1a1a1a]')}`}
              style={isHackerMode ? { borderColor: `${hackerColor}33`, color: hackerColor } : {}}
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <Shield size={24} style={isHackerMode ? { color: hackerTextColor } : {}} />
                    <h3 className={`text-2xl font-bold tracking-tight ${isHackerMode ? 'uppercase' : ''}`}>
                      {isHackerMode ? 'ACCESS_REQUESTS' : 'Join Requests'}
                    </h3>
                  </div>
                  <button onClick={() => setShowRequestsModal(false)} className={`p-2 rounded-full ${isHackerMode ? 'hover:bg-white/5' : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}`} style={isHackerMode ? { color: hackerTextColor } : {}}>
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide">
                  {joinRequests.filter(r => r.channelId === activeChannel).length === 0 ? (
                    <div className="py-12 text-center opacity-40">
                      <Users size={48} className="mx-auto mb-4 opacity-20" />
                      <p>{isHackerMode ? 'NO_PENDING_REQUESTS' : 'No pending requests for this channel.'}</p>
                    </div>
                  ) : (
                    joinRequests.filter(r => r.channelId === activeChannel).map(request => (
                      <div 
                        key={request.id} 
                        className={`p-4 rounded-2xl flex items-center justify-between border ${isHackerMode ? (isDarkMode ? 'bg-white/5' : 'bg-black/5') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-[#f8f8f8] border-black/5')}`}
                        style={isHackerMode ? { borderColor: `${hackerColor}33` } : {}}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-500/10">
                            {request.userPhoto ? (
                              <img src={request.userPhoto} alt="av" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <UserIcon size={20} />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{request.userName}</p>
                            <p className="text-[10px] opacity-50">{isHackerMode ? 'USR_JOIN_REQ' : 'Wants to join'}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleProcessRequest(request, 'accept')}
                            className={`p-2 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors`}
                          >
                            <Check size={18} />
                          </button>
                          <button 
                            onClick={() => handleProcessRequest(request, 'decline')}
                            className={`p-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors`}
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Photo Modal */}
      <AnimatePresence>
        {fullScreenPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFullScreenPhoto(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative max-w-4xl max-h-[90vh] rounded-[32px] overflow-hidden shadow-2xl flex items-center justify-center"
            >
              <img 
                src={fullScreenPhoto} 
                alt="Profile Full" 
                className="max-w-full max-h-full object-contain rounded-[32px]"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setFullScreenPhoto(null)}
                className="absolute top-6 right-6 p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition-all"
              >
                <X size={24} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {/* Expanded PFP Overlay */}
      <AnimatePresence>
        {expandedPfp && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpandedPfp(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-full max-h-full flex items-center justify-center"
            >
              <img 
                src={expandedPfp} 
                alt="Expanded pfp" 
                className="max-w-[95vw] max-h-[85vh] rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.5)] object-contain border-8 border-white/5 ring-1 ring-white/10"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setExpandedPfp(null)}
                className="absolute -top-16 right-0 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md"
              >
                <X size={28} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl p-8 border ${isHackerMode ? (isDarkMode ? 'bg-black border-red-500/30' : 'bg-white border-red-500/30') : (isDarkMode ? 'bg-[#121212] border-white/5' : 'bg-white border-black/5')}`}
              style={isHackerMode ? { color: hackerColor } : {}}
            >
              <div className="flex flex-col items-center text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${deleteConfirm.type === 'clear' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'}`}>
                  {deleteConfirm.type === 'clear' ? <Trash size={40} /> : <Trash2 size={40} />}
                </div>
                <h3 className={`text-2xl font-bold mb-2 ${isHackerMode ? 'uppercase tracking-tighter' : ''}`}>
                  {isHackerMode ? (deleteConfirm.type === 'clear' ? 'PURGE_MESSAGES?' : 'Deseja apagar?') : (deleteConfirm.type === 'clear' ? 'Confirmar Limpeza' : 'Confirmar Exclusão')}
                </h3>
                <p className={`text-sm mb-8 opacity-60`}>
                  {isHackerMode 
                    ? `Deseja ${deleteConfirm.type === 'clear' ? 'limpar as mensagens' : (deleteConfirm.type === 'channel' ? `apagar este CLUSTER: ${deleteConfirm.name}` : 'apagar DATAFRAME')}? Esta ação é irreversível.` 
                    : `Deseja ${deleteConfirm.type === 'clear' ? 'limpar as mensagens do' : (deleteConfirm.type === 'channel' ? `apagar o canal "${deleteConfirm.name}"` : 'apagar esta mensagem')}?`}
                </p>
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all ${isHackerMode ? (isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/10') : (isDarkMode ? 'bg-white/5' : 'bg-black/5')}`}
                  >
                    {isHackerMode ? 'ABORT' : 'Cancel'}
                  </button>
                  <button 
                    onClick={() => {
                      if (deleteConfirm.type === 'channel') confirmDeleteChannel(deleteConfirm.id);
                      else if (deleteConfirm.type === 'clear') confirmClearChat(deleteConfirm.id);
                      else confirmDeleteMessage(deleteConfirm.id);
                    }}
                    className={`flex-1 py-4 rounded-2xl font-bold text-sm bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20`}
                  >
                    {isHackerMode ? (deleteConfirm.type === 'clear' ? 'PURGE' : 'Delete') : (deleteConfirm.type === 'clear' ? 'Limpar' : 'Delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
