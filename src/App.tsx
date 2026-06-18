import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import NoteEditor from './components/NoteEditor';
import NoteCard from './components/NoteCard';
import Settings from './components/Settings';
import AllNotes from './components/AllNotes';
import { Note } from './types';
import {
  getNotesByDate,
  saveNote,
  deleteNote,
  getAllNotes,
  importNotes,
  parseImportFile,
  requestPersistentStorage,
  getSetting,
  saveSetting,
  updateNativeReminders,
} from './db';

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateLabel(dateStr: string): string {
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  if (dateStr === tomorrow) return 'Завтра';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long' });
}

function AppInner() {
  const { colors, theme } = useTheme();
  const [currentDate, setCurrentDate] = useState(formatDate(new Date()));
  const [headerVisible, setHeaderVisible] = useState(true);
  const [slideAnim, setSlideAnim] = useState<'slide-left' | 'slide-right' | ''>('');
  const lastScrollY = useRef(0);
  const showHeader = useRef(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotesList, setAllNotesList] = useState<Note[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allNotesOpen, setAllNotesOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const reminderInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        setHasFile(true);
      } else if (!window.electronAPI) {
        const handle = await getSetting('syncFileHandle');
        setHasFile(!!handle);
      } else {
        setHasFile(true);
      }
      const data = await getNotesByDate(currentDate);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotes(data);
    } catch (e) {
      console.error('Error loading notes:', e);
    }
    setLoading(false);
  }, [currentDate]);

  const loadAllNotes = useCallback(async () => {
    try {
      const data = await getAllNotes();
      setAllNotesList(data);
    } catch (e) {
      console.error('Error loading all notes:', e);
    }
  }, []);

  // Request persistent storage on mount and load initial data
  useEffect(() => {
    requestPersistentStorage();
    loadNotes();
    loadAllNotes();
    
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    }
  }, [loadNotes, loadAllNotes]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (theme.id === 'dark' || theme.id === 'ocean' || theme.id === 'forest') {
        // Для темных тем используем темные иконки (Style.Dark)
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        StatusBar.setBackgroundColor({ color: theme.id === 'dark' ? '#111827' : theme.id === 'ocean' ? '#0f172a' : '#14532d' }).catch(() => {});
      } else {
        // Для светлых тем используем светлые иконки (Style.Light)
        StatusBar.setStyle({ style: Style.Light }).catch(() => {});
        StatusBar.setBackgroundColor({ color: theme.id === 'sepia' ? '#fdf6e3' : theme.id === 'rose' ? '#fff1f2' : '#ffffff' }).catch(() => {});
      }
    }
  }, [theme.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Scroll handler for auto-hiding header
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY <= 0) {
        if (!showHeader.current) {
          showHeader.current = true;
          setHeaderVisible(true);
        }
        lastScrollY.current = currentScrollY;
        return;
      }

      const scrollingDown = currentScrollY > lastScrollY.current;

      if (scrollingDown && currentScrollY > 60 && showHeader.current) {
        showHeader.current = false;
        setHeaderVisible(false);
      } else if (!scrollingDown && !showHeader.current) {
        showHeader.current = true;
        setHeaderVisible(true);
      }
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reminder checker
  useEffect(() => {
    const initNotifications = async () => {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.requestPermissions();
        await updateNativeReminders();
      } else {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
    };
    initNotifications();

    const checkReminders = async () => {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) return; // Native handles it via LocalNotifications

      try {
        const enabled = await getSetting('globalReminderEnabled');
        if (!enabled) return;

        const time = await getSetting('globalReminderTime');
        if (!time) return;

        const now = new Date();
        const today = formatDate(now);
        const currentTime = now.toTimeString().slice(0, 5);

        if (currentTime >= time) {
          const lastFired = await getSetting('lastReminderFiredDate');
          if (lastFired === today) return; // Already fired today

          // Check if user already created a note today
          const notesToday = await getNotesByDate(today);
          if (notesToday.length > 0) {
            // They made a note, no need to remind. We mark it fired anyway so we don't bother later.
            await saveSetting('lastReminderFiredDate', today);
            return;
          }

          // Trigger reminder!
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📓 Время для заметок!', {
              body: 'Как прошел ваш день? Запишите главные моменты, пока они не забылись.',
              icon: '📝',
            });
            await saveSetting('lastReminderFiredDate', today);
          }
        }
      } catch (e) {
        console.error('Reminder check error:', e);
      }
    };

    checkReminders();
    reminderInterval.current = setInterval(checkReminders, 30000);
    return () => {
      if (reminderInterval.current) clearInterval(reminderInterval.current);
    };
  }, []);

  const handleSave = async (data: { id?: string; text: string; photo?: string; audio?: string }) => {
    const generateId = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
    };
    const note: Note = {
      id: data.id || generateId(),
      date: currentDate,
      createdAt: data.id ? (editingNote?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      text: data.text,
      photo: data.photo,
      audio: data.audio,
    };
    await saveNote(note);
    setEditingNote(null);
    loadNotes();
    loadAllNotes();
    updateNativeReminders();
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    loadNotes();
    loadAllNotes();
    updateNativeReminders();
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setCurrentDate(note.date);
    setEditorOpen(true);
  };

  const changeDate = (offset: number) => {
    setSlideAnim(offset > 0 ? 'slide-left' : 'slide-right');
    const [y, m, d] = currentDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + offset, 12, 0, 0);
    setCurrentDate(formatDate(dateObj));
  };

  const goToday = () => {
    const today = formatDate(new Date());
    if (today > currentDate) setSlideAnim('slide-left');
    else if (today < currentDate) setSlideAnim('slide-right');
    setCurrentDate(today);
  };

  // Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    // Prevent swipe if interacting with modals/viewers
    const target = e.target as HTMLElement;
    if (target.closest && target.closest('.z-50, .z-\\[100\\]')) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;

    // Check if swipe is mostly horizontal and significant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        changeDate(1); // Swipe left -> Next day
      } else {
        changeDate(-1); // Swipe right -> Prev day
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleExport = async (format: 'json' | 'zip' = 'json') => {
    try {
      const all = await getAllNotes();
      if (all.length === 0) {
        showToast('❌ Нет заметок для экспорта');
        return;
      }
      
      let blob: Blob;
      let filename = `notes-export-${formatDate(new Date())}`;
      
      if (format === 'zip') {
        showToast('⏳ Формирование архива...');
        const { exportToZip } = await import('./archive');
        blob = await exportToZip(all);
        filename += '.zip';
      } else {
        const { exportNotesToJSON } = await import('./db');
        const json = await exportNotesToJSON(all);
        blob = new Blob([json], { type: 'application/json' });
        filename += '.json';
      }

      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const { getSetting } = await import('./db');
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const customFolder = await getSetting('androidCustomFolder');
          const basePath = customFolder ? `${customFolder}/` : '';
          const backupsPath = `${basePath}backups`;

          await Filesystem.mkdir({ path: backupsPath, directory: Directory.Documents, recursive: true }).catch(() => {});
          
          await Filesystem.writeFile({
            path: `${backupsPath}/${filename}`,
            data: base64data,
            directory: Directory.Documents
          });
          
          const msg = `✅ Сохранено в Документы/${backupsPath}/${filename}`;
          showToast(msg);
        };
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`✅ Экспортировано ${all.length} заметок`);
      }
    } catch (e) {
      showToast('❌ Ошибка экспорта');
      console.error(e);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = await parseImportFile(file);
      await importNotes(parsed);
      showToast(`✅ Импортировано ${parsed.length} заметок`);
      loadNotes();
      loadAllNotes();
    } catch (e: any) {
      showToast(`❌ ${e.message || 'Ошибка импорта'}`);
      console.error(e);
    }
  };

  const handleOpenAllNotes = async () => {
    await loadAllNotes();
    setAllNotesOpen(true);
  };

  const dateLabel = getDateLabel(currentDate);
  const dayOfWeek = getDayOfWeek(currentDate);
  const isToday = currentDate === formatDate(new Date());

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-300 overflow-x-hidden"
      style={{ backgroundColor: colors.bg, color: colors.text }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header
        className={`fixed w-full top-0 z-40 border-b backdrop-blur-sm pt-safe transition-transform duration-300 ${
          headerVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{
          backgroundColor: `${colors.surface}ee`,
          borderColor: colors.border,
        }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📓</span>
            <h1 className="text-lg font-bold hidden sm:block" style={{ color: colors.text }}>
              Дневник Заметок
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {!isToday && (
              <button
                onClick={goToday}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}
              >
                Сегодня
              </button>
            )}
            <button
              onClick={handleOpenAllNotes}
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Все заметки"
            >
              📋
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div style={{ height: 'calc(env(safe-area-inset-top) + 85px)' }} className="shrink-0 w-full" />

      {/* Date Navigation */}
      <div 
        key={`nav-${currentDate}`}
        className={`max-w-2xl mx-auto w-full px-4 py-4 ${slideAnim}`}
        onAnimationEnd={() => setSlideAnim('')}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => changeDate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors"
            style={{ backgroundColor: colors.surfaceHover, color: colors.text }}
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: colors.text }}>
              {dateLabel}
            </div>
            <div className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
              {isToday ? dayOfWeek : `${dayOfWeek} • ${currentDate}`}
            </div>
          </div>
          <button
            onClick={() => changeDate(1)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors"
            style={{ backgroundColor: colors.surfaceHover, color: colors.text }}
          >
            →
          </button>
        </div>
      </div>

      {/* Notes List */}
      <main 
        key={`main-${currentDate}`}
        className={`flex-1 max-w-2xl mx-auto w-full px-4 pb-24 ${slideAnim}`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-8 h-8 border-3 rounded-full animate-spin"
              style={{ borderColor: colors.border, borderTopColor: colors.primary }}
            />
          </div>
        ) : !hasFile ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
              Файл не выбран
            </h3>
            <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              Для работы необходимо выбрать или создать файл
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-6 py-3 rounded-xl font-semibold transition-colors"
              style={{ backgroundColor: colors.primary, color: colors.primaryText }}
            >
              ⚙️ Открыть настройки
            </button>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
              Нет заметок
            </h3>
            <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              {isToday
                ? 'Начните свой день с новой заметки!'
                : 'В этот день заметок не было'}
            </p>
            <button
              onClick={() => {
                setEditingNote(null);
                setEditorOpen(true);
              }}
              className="px-6 py-3 rounded-xl font-semibold transition-colors"
              style={{ backgroundColor: colors.primary, color: colors.primaryText }}
            >
              ✍️ Создать заметку
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                {notes.length} {notes.length === 1 ? 'заметка' : notes.length < 5 ? 'заметки' : 'заметок'}
              </span>
            </div>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB */}
      {hasFile && (
        <button
          onClick={() => {
            setEditingNote(null);
            setEditorOpen(true);
          }}
          className="fixed right-6 w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all hover:scale-110 active:scale-95 z-30"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryText,
            boxShadow: `0 4px 20px ${colors.primary}60`,
            bottom: Capacitor.isNativePlatform() ? 'max(24px, env(safe-area-inset-bottom))' : '24px',
          }}
        >
          +
        </button>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl shadow-lg text-sm font-medium pb-safe"
          style={{
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: colors.border,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 8px 30px ${colors.shadow}`,
            bottom: Capacitor.isNativePlatform() ? 'max(96px, calc(env(safe-area-inset-bottom) + 72px))' : '96px',
          }}
        >
          {toast}
        </div>
      )}

      {/* Modals */}
      <NoteEditor
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingNote(null);
        }}
        onSave={handleSave}
        editNote={editingNote}
      />
<Settings
  isOpen={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  onExport={handleExport}
  onImport={handleImport}
  onFileConfigured={() => {
    loadNotes();
    loadAllNotes();
  }}
/>
      <AllNotes
        isOpen={allNotesOpen}
        onClose={() => setAllNotesOpen(false)}
        notes={allNotesList}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}