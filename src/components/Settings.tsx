import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { themes } from '../themes';
import { setupPortableFile, disconnectPortableFile, getSetting, saveSetting } from '../db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format?: 'json' | 'zip') => void;
  onImport: (file: File) => void;
  onFileConfigured?: () => void;
}

export default function Settings({ isOpen, onClose, onExport, onImport, onFileConfigured }: Props) {
  const { colors, theme, setThemeById } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isPortable, setIsPortable] = useState<boolean>(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [androidCustomFolder, setAndroidCustomFolder] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      getSetting('syncFileHandle').then((handle) => {
        setIsPortable(!!handle);
      });
      getSetting('androidCustomFolder').then((val) => setAndroidCustomFolder(val || ''));
      getSetting('globalReminderEnabled').then((val) => setReminderEnabled(!!val));
      getSetting('globalReminderTime').then((val) => setReminderTime(val || '20:00'));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateNativeNotification = async (enabled: boolean, timeStr: string) => {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      if (enabled) {
        const [hour, minute] = timeStr.split(':').map(Number);
        await LocalNotifications.schedule({
          notifications: [
            {
              title: '📓 Время для заметок!',
              body: 'Не забудьте оставить запись о сегодняшнем дне.',
              id: 1,
              schedule: { on: { hour, minute }, allowWhileIdle: true },
            }
          ]
        });
      } else {
        await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
      }
    }
  };

  const toggleReminder = async () => {
    const newVal = !reminderEnabled;
    setReminderEnabled(newVal);
    await saveSetting('globalReminderEnabled', newVal);
    
    if (newVal && !((window as any).Capacitor?.isNativePlatform())) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    await updateNativeNotification(newVal, reminderTime);
  };

  const changeReminderTime = async (time: string) => {
    setReminderTime(time);
    await saveSetting('globalReminderTime', time);
    await updateNativeNotification(reminderEnabled, time);
  };

  const handleSetupPortable = async (createNew: boolean) => {
    const success = await setupPortableFile(createNew);
    if (success) {
      setIsPortable(true);
      setImportStatus('✅ Файл подключен!');
      if (onFileConfigured) onFileConfigured();
      setTimeout(() => {
        setImportStatus(null);
        onClose();
      }, 1000);
    }
  };

  const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();

  const handleDisconnectPortable = async () => {
    await disconnectPortableFile();
    setIsPortable(false);
    setImportStatus('❌ Файл отключен');
    setTimeout(() => setImportStatus(null), 2000);
    if (onFileConfigured) onFileConfigured();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      setImportStatus('✅ Импорт выполнен!');
      setTimeout(() => setImportStatus(null), 3000);
    }
    e.target.value = '';
  };

  const handleSaveAndroidCustomFolder = async () => {
    await saveSetting('androidCustomFolder', androidCustomFolder);
    setImportStatus('✅ Папка сохранена!');
    setTimeout(() => {
      setImportStatus(null);
      if (onFileConfigured) onFileConfigured();
    }, 1500);
  };

  return (
    <div
      style={{ backgroundColor: colors.modalOverlay }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          color: colors.text,
          borderColor: colors.border,
        }}
        className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: colors.border }}
        >
          <h2 className="text-lg font-bold">⚙️ Настройки</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors"
            style={{ backgroundColor: colors.surfaceHover, color: colors.textSecondary }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Theme selection */}
          <div>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              🎨 Тема оформления
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setThemeById(t.id)}
                  className="relative flex-col items-start rounded-xl p-4 border-2 transition-all text-left"
                  style={{
                    backgroundColor: t.colors.bg,
                    borderColor: theme.id === t.id ? t.colors.primary : t.colors.border,
                    boxShadow: theme.id === t.id ? `0 0 0 2px ${t.colors.primary}40` : 'none',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{t.emoji}</span>
                    <span className="font-semibold text-sm" style={{ color: t.colors.text }}>
                      {t.name}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {[t.colors.primary, t.colors.surface, t.colors.text, t.colors.accent].map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border"
                        style={{ backgroundColor: c, borderColor: t.colors.border }}
                      />
                    ))}
                  </div>
                  {theme.id === t.id && (
                    <div
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: t.colors.primary, color: t.colors.primaryText }}
                    >
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Reminders */}
          <div>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              🔔 Напоминание
            </h3>
            <div className="p-4 rounded-xl border space-y-4" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: colors.text }}>Ежедневное напоминание</span>
                <button
                  onClick={toggleReminder}
                  className="relative flex items-center w-12 h-7 rounded-full transition-colors shrink-0 outline-none"
                  style={{ backgroundColor: reminderEnabled ? colors.primary : colors.surfaceHover }}
                >
                  <span
                    className="absolute top-[2px] left-0 w-6 h-6 rounded-full bg-white shadow transition-transform"
                    style={{ transform: reminderEnabled ? 'translateX(20px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
              {reminderEnabled && (
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Время:</span>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => changeReminderTime(e.target.value)}
                    className="rounded-lg px-3 py-2 border outline-none text-sm w-full"
                    style={{ backgroundColor: colors.surface, color: colors.inputText, borderColor: colors.border }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Import / Export */}
          <div>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              💾 Данные (Работа с файлом)
            </h3>
            <div className="space-y-3">
              {isNative ? (
                <div className="w-full py-3 px-4 rounded-xl font-medium border flex flex-col items-center gap-2 text-center" style={{ borderColor: colors.primary, color: colors.primary }}>
                  <div>✅ Файлы сохраняются в папку Документы</div>
                  <div className="w-full mt-2">
                    <label className="block text-xs mb-1 opacity-80">Своя папка для хранения (внутри Документов):</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={androidCustomFolder} 
                        onChange={(e) => setAndroidCustomFolder(e.target.value)} 
                        placeholder="Например: MyDiary" 
                        className="flex-1 rounded-lg px-2 py-1 text-sm border outline-none bg-transparent" 
                        style={{ borderColor: colors.border, color: colors.text }}
                      />
                      <button 
                        onClick={handleSaveAndroidCustomFolder}
                        className="px-3 py-1 rounded-lg text-xs" 
                        style={{ backgroundColor: colors.primary, color: colors.primaryText }}
                      >
                        ОК
                      </button>
                    </div>
                  </div>
                </div>
              ) : isPortable ? (
                <div className="w-full py-3 px-4 rounded-xl font-medium border text-center" style={{ borderColor: colors.primary, color: colors.primary }}>
                  ✅ Работаем напрямую с выбранным файлом
                  <button
                    onClick={handleDisconnectPortable}
                    className="block w-full mt-2 text-xs underline"
                    style={{ color: colors.textSecondary }}
                  >
                    Выбрать другой файл
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => handleSetupPortable(false)}
                    className="flex-1 py-3 px-2 rounded-xl font-medium transition-colors border flex flex-col items-center justify-center gap-1 text-sm"
                    style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }}
                  >
                    <span>📂 Выбрать файл</span>
                  </button>
                  <button
                    onClick={() => handleSetupPortable(true)}
                    className="flex-1 py-3 px-2 rounded-xl font-medium transition-colors border flex flex-col items-center justify-center gap-1 text-sm"
                    style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }}
                  >
                    <span>📄 Создать новый</span>
                  </button>
                </div>
              )}

              <div className="flex gap-2 w-full">
                <button
                  onClick={() => onExport('json')}
                  className="flex-1 py-3 px-2 rounded-xl font-medium transition-colors border flex flex-col items-center justify-center gap-1 text-sm"
                  style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }}
                >
                  <span>📄 Экспорт (JSON)</span>
                </button>
                <button
                  onClick={() => onExport('zip')}
                  className="flex-1 py-3 px-2 rounded-xl font-medium transition-colors border flex flex-col items-center justify-center gap-1 text-sm"
                  style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.input }}
                >
                  <span>📦 Экспорт (ZIP)</span>
                </button>
              </div>
              <button
                onClick={() => importRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl font-medium transition-colors border flex items-center justify-center gap-2"
                style={{
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.input,
                }}
              >
                📥 Импорт заметок (JSON)
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json,.zip,application/zip"
                onChange={handleImportFile}
                className="hidden"
              />
              {importStatus && (
                <div
                  className="text-center text-sm py-2 rounded-lg"
                  style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}
                >
                  {importStatus}
                </div>
              )}
              <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                <b>Внимание:</b> всегда делайте Экспорт (ZIP) перед удалением или обновлением приложения, чтобы не потерять данные! Импорт добавляет или восстанавливает заметки из архива (дубликаты обновляются).
              </p>
            </div>
          </div>

          {/* About */}
          <div className="p-4 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
            <h4 className="text-sm font-semibold mb-2" style={{ color: colors.text }}>
              ℹ️ О приложении
            </h4>
            <div className="text-xs space-y-2 leading-relaxed" style={{ color: colors.textSecondary }}>
              <p>
                Дневник Заметок — кроссплатформенное приложение для ведения ежедневных записей.
              </p>
              <p>
                <strong>Автор идеи и улучшений:</strong>{' '}
                <a
                  href="https://github.com/rintaru123"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                  style={{ color: colors.primary }}
                >
                  Rintaru123
                </a>
              </p>
              <p>
                <strong>Разработчик:</strong> AI Assistant
              </p>
              <p className="mt-2 text-[10px] opacity-70">
                В приложении используются иконки из набора Lucide React (лицензия ISC) и стандартные системные эмодзи.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 pb-safe border-t" style={{ borderColor: colors.border }}>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-semibold transition-colors"
            style={{ backgroundColor: colors.primary, color: colors.primaryText }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}