import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Note } from '../types';
import PhotoViewer from './PhotoViewer';

interface Props {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
  showDate?: boolean;
}

export default function NoteCard({ note, onEdit, onDelete, showDate }: Props) {
  const { colors } = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);

  const time = new Date(note.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const dateLabel = showDate
    ? new Date(note.date + 'T12:00:00').toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden border transition-all hover:shadow-lg"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          boxShadow: `0 2px 8px ${colors.shadow}`,
        }}
      >
        {/* Photo on top — full image, no crop */}
        {note.photo && (
          <div
            className="relative cursor-pointer"
            onClick={() => setViewerOpen(true)}
          >
            <img
              src={note.photo}
              alt="Фото заметки"
              className="w-full"
              style={{
                maxHeight: '400px',
                objectFit: 'contain',
                backgroundColor: colors.input,
              }}
            />
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              🔍 Нажмите для просмотра
            </div>
          </div>
        )}

        {/* Content below */}
        <div className="p-4">
          {note.audio && (
            <div className="mb-4">
              <audio controls src={note.audio} className="w-full rounded-xl" />
            </div>
          )}

          {note.text && (
            <p
              className="text-base leading-relaxed whitespace-pre-wrap mb-3"
              style={{ color: colors.text }}
            >
              {note.text}
            </p>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {showDate && dateLabel && (
                <span
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${colors.accent}20`, color: colors.accent }}
                >
                  📅 {dateLabel}
                </span>
              )}
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{ backgroundColor: colors.input, color: colors.textSecondary }}
              >
                🕐 {time}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(note)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: colors.textSecondary }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                ✏️
              </button>
              <button
                onClick={() => {
                  if (confirm('Удалить заметку?')) onDelete(note.id);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: colors.danger }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen photo viewer */}
      {note.photo && (
        <PhotoViewer
          isOpen={viewerOpen}
          photo={note.photo}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}