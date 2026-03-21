import { useTheme } from '../context/ThemeContext';

interface Props {
  isOpen: boolean;
  photo: string;
  onClose: () => void;
}

export default function PhotoViewer({ isOpen, photo, onClose }: Props) {
  const { colors } = useTheme();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
      >
        ✕
      </button>

      {/* Download button */}
      <a
        href={photo}
        download={`note-photo-${Date.now()}.jpg`}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
      >
        ⬇️
      </a>

      {/* Full image */}
      <img
        src={photo}
        alt="Полный размер"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 4px 40px ${colors.shadow}` }}
      />
    </div>
  );
}