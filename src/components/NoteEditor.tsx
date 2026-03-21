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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onPaste={handlePaste}
    >
      <div
        style={{
          backgroundColor: colors.surface,
          color: colors.text,
          borderColor: colors.border,
        }}
        className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: colors.border }}
        >
          <h2 className="text-lg font-bold">
            {editNote ? '✏️ Редактировать' : '📝 Новая заметка'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors"
            style={{ backgroundColor: colors.surfaceHover, color: colors.textSecondary }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Photo */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: colors.textSecondary }}>
              📸 Фотография (необязательно)
            </label>
            {photo ? (
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={photo}
                  alt="Фото"
                  className="w-full rounded-xl"
                  style={{ maxHeight: '300px', objectFit: 'contain', backgroundColor: colors.input }}
                />
                <button
                  onClick={() => setPhoto(undefined)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: colors.danger }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* Gallery button */}
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors"
                  style={{
                    borderColor: colors.border,
                    color: colors.textSecondary,
                    backgroundColor: colors.input,
                  }}
                >
                  <span className="text-3xl">🖼️</span>
                  <span className="text-xs font-medium">Из галереи</span>
                </button>

                {/* Camera button - show on mobile or always as option */}
                {isMobile && (
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors"
                    style={{
                      borderColor: colors.border,
                      color: colors.textSecondary,
                      backgroundColor: colors.input,
                    }}
                  >
                    <span className="text-3xl">📷</span>
                    <span className="text-xs font-medium">Камера</span>
                  </button>
                )}
              </div>
            )}
            {/* Gallery input - accepts ALL image formats, no capture */}
            <input
              ref={galleryRef}
              type="file"
              accept="image/*,.heic,.heif,.avif,.svg,.bmp,.tiff,.tif,.ico,.raw"
              onChange={handleFileChange}
              className="hidden"
            />
            {/* Camera input - mobile camera capture */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Audio */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: colors.textSecondary }}>
                🎤 Аудио (необязательно)
              </label>
              {audio ? (
                <div className="relative rounded-xl overflow-hidden p-3" style={{ backgroundColor: colors.input }}>
                  <audio controls src={audio} className="w-full" />
                  <button
                    onClick={() => setAudio(undefined)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: colors.danger }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => audioRef.current?.click()}
                  className="w-full py-4 rounded-xl border flex flex-col items-center gap-1 transition-colors"
                  style={{
                    borderColor: colors.border,
                    color: colors.textSecondary,
                    backgroundColor: colors.input,
                  }}
                >
                  <span className="text-2xl">🎵</span>
                  <span className="text-xs font-medium">Прикрепить аудио</span>
                </button>
              )}
              <input
                ref={audioRef}
                type="file"
                accept="audio/*"
                onChange={handleAudioChange}
                className="hidden"
              />
            </div>

            {/* Text */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: colors.textSecondary }}>
              💬 Текст заметки (можно вставить фото из буфера обмена)
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Напишите что-нибудь или вставьте картинку (Ctrl+V) ..."
              rows={4}
              className="w-full rounded-xl px-4 py-3 resize-none outline-none border transition-colors text-base"
              style={{
                backgroundColor: colors.input,
                color: colors.inputText,
                borderColor: colors.border,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 pb-safe border-t flex gap-3" style={{ borderColor: colors.border }}>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold transition-colors border"
            style={{
              borderColor: colors.border,
              color: colors.textSecondary,
              backgroundColor: colors.surface,
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl font-semibold transition-colors"
            style={{
              backgroundColor: (!text.trim() && !photo && !audio) ? colors.surfaceHover : colors.primary,
              color: (!text.trim() && !photo && !audio) ? colors.textSecondary : colors.primaryText,
            }}
          >
            💾 Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}