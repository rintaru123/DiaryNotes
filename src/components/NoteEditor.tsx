import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Note } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Omit<Note, 'id' | 'date' | 'createdAt'> & { id?: string }) => void;
  editNote?: Note | null;
}

export default function NoteEditor({ isOpen, onClose, onSave, editNote }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [audio, setAudio] = useState<string | undefined>(undefined);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editNote) {
        setText(editNote.text);
        setPhoto(editNote.photo);
        setAudio(editNote.audio);
      } else {
        setText('');
        setPhoto(undefined);
        setAudio(undefined);
      }
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, editNote]);

  if (!isOpen) return null;

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // For very large images, compress. Otherwise keep as-is to support all formats
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        if (img.width <= MAX && img.height <= MAX && file.size < 2 * 1024 * 1024) {
          // Small enough, keep original format
          setPhoto(dataUrl);
        } else {
          // Compress
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = (h / w) * MAX; w = MAX; }
            else { w = (w / h) * MAX; h = MAX; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          // Use PNG if original has transparency potential, otherwise JPEG
          const isPng = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
          setPhoto(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
        }
      };
      img.onerror = () => {
        // If Image can't decode (e.g. some HEIC), just use dataUrl directly
        setPhoto(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAudio(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
        }
        break;
      }
    }
  };

  const handleSave = () => {
    if (!text.trim() && !photo && !audio) return;
    onSave({
      id: editNote?.id,
      text: text.trim(),
      photo,
      audio,
    });
    onClose();
  };

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div
      style={{ backgroundColor: colors.modalOverlay }}
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onPaste={handlePaste}
    >
      <div
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
        className="w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-2xl flex flex-col overflow-hidden border-t sm:border shadow-2xl transition-all"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0 pt-safe sm:pt-3"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <button
            onClick={onClose}
            className="text-2xl w-10 h-10 flex items-center justify-center rounded-full transition-colors"
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            ✕
          </button>
          <h2 className="text-lg font-bold">
            {editNote ? 'Редактировать' : 'Новая заметка'}
          </h2>
          <button
            onClick={handleSave}
            disabled={!text.trim() && !photo && !audio}
            className="px-4 py-2 rounded-full font-bold text-sm transition-colors disabled:opacity-50"
            style={{
              backgroundColor: colors.primary,
              color: colors.primaryText,
            }}
          >
            Готово
          </button>
        </div>

        {/* Body (Textarea expands to fill) */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Напишите что-нибудь..."
            className="w-full flex-1 px-5 py-4 resize-none outline-none bg-transparent text-lg leading-relaxed"
            style={{ color: colors.text }}
          />

          {/* Media Previews inline at the bottom of the scrollable area */}
          {(photo || audio) && (
            <div className="px-5 pb-4 space-y-4 shrink-0">
              {photo && (
                <div className="relative inline-block rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
                  <img
                    src={photo}
                    alt="Фото"
                    className="max-h-[200px] w-auto object-contain"
                    style={{ backgroundColor: colors.input }}
                  />
                  <button
                    onClick={() => setPhoto(undefined)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                    style={{ backgroundColor: colors.danger }}
                  >
                    ✕
                  </button>
                </div>
              )}
              {audio && (
                <div className="relative rounded-xl p-3 border flex items-center pr-12" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
                  <audio controls src={audio} className="w-full h-10" />
                  <button
                    onClick={() => setAudio(undefined)}
                    className="absolute right-3 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                    style={{ backgroundColor: colors.danger }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Toolbar (Icons) */}
        <div 
          className="px-4 py-3 border-t shrink-0 flex items-center gap-4 pb-safe" 
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <button
            onClick={() => galleryRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors"
            style={{ color: colors.primary, backgroundColor: `${colors.primary}15` }}
            title="Добавить фото из галереи"
          >
            🖼️
          </button>

          {isMobile && (
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors"
              style={{ color: colors.primary, backgroundColor: `${colors.primary}15` }}
              title="Сделать фото"
            >
              📷
            </button>
          )}

          <button
            onClick={() => audioRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors"
            style={{ color: colors.primary, backgroundColor: `${colors.primary}15` }}
            title="Прикрепить аудио"
          >
            🎤
          </button>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,.heic,.heif,.avif,.svg,.bmp,.tiff,.tif,.ico,.raw"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={audioRef}
          type="file"
          accept="audio/*"
          onChange={handleAudioChange}
          className="hidden"
        />
      </div>
    </div>
  );
}