import { useState, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Note } from '../types';
import NoteCard from './NoteCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}

export default function AllNotes({ isOpen, onClose, notes, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'photo'>('all');

  const filtered = useMemo(() => {
    let result = [...notes];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.text.toLowerCase().includes(q) ||
          n.date.includes(q)
      );
    }

    // Filter
    if (filterType === 'photo') {
      result = result.filter((n) => !!n.photo);
    }

    // Sort by date desc, then by time desc
    result.sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [notes, search, filterType]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; label: string; notes: Note[] }[] = [];
    let currentDate = '';
    for (const note of filtered) {
      if (note.date !== currentDate) {
        currentDate = note.date;
        const d = new Date(note.date + 'T12:00:00');
        groups.push({
          date: note.date,
          label: d.toLocaleDateString('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          notes: [],
        });
      }
      groups[groups.length - 1].notes.push(note);
    }
    return groups;
  }, [filtered]);

  if (!isOpen) return null;

  return (
    <div
      style={{ backgroundColor: colors.modalOverlay }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
        className="w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border shadow-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <h2 className="text-lg font-bold">📋 Все заметки</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors"
            style={{ backgroundColor: colors.surfaceHover, color: colors.textSecondary }}
          >
            ✕
          </button>
        </div>

        {/* Search & Filters */}
        <div
          className="px-5 py-3 border-b space-y-3"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Поиск по тексту или дате..."
            className="w-full rounded-xl px-4 py-2.5 outline-none border text-sm"
            style={{
              backgroundColor: colors.input,
              color: colors.inputText,
              borderColor: colors.border,
            }}
          />
          <div className="flex gap-2">
            {(['all', 'photo'] as const).map((type) => {
              const labels = { all: '📋 Все', photo: '📸 С фото' };
              const isActive = filterType === type;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? colors.primary : colors.input,
                    color: isActive ? colors.primaryText : colors.textSecondary,
                  }}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🔍</div>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {search ? 'Ничего не найдено' : 'Нет заметок'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-sm" style={{ color: colors.textSecondary }}>
                Найдено: {filtered.length}{' '}
                {filtered.length === 1 ? 'заметка' : filtered.length < 5 ? 'заметки' : 'заметок'}
              </div>
              {grouped.map((group) => (
                <div key={group.date}>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                    style={{ color: colors.primary }}
                  >
                    {group.label}
                  </div>
                  <div className="space-y-3">
                    {group.notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={(n) => {
                          onEdit(n);
                          onClose();
                        }}
                        onDelete={onDelete}
                        showDate={false}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 pb-safe border-t" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-semibold transition-colors"
            style={{ backgroundColor: colors.primary, color: colors.primaryText }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}