import JSZip from 'jszip';
import { Note } from './types';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Extract base64 part
function getBase64Data(dataUrl: string) {
  const matches = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  return matches ? { ext: matches[1] === 'jpeg' ? 'jpg' : matches[1], data: matches[2] } : null;
}

import { unresolveCapMediaUrl, getSetting } from './db';

export async function exportToZip(notes: Note[]): Promise<Blob> {
  const customFolder = await getSetting('androidCustomFolder');
  const basePath = customFolder ? `${customFolder}/` : '';

  const zip = new JSZip();
  const imgFolder = zip.folder('images');
  const audioFolder = zip.folder('audio');
  
  const notesCopy = JSON.parse(JSON.stringify(notes)) as Note[];
  
  for (const note of notesCopy) {
    // Process Photo
    if (note.photo) {
      note.photo = unresolveCapMediaUrl(note.photo, basePath);
    }
    
    if (note.photo && note.photo.startsWith('data:image/')) {
      const parsed = getBase64Data(note.photo);
      if (parsed && imgFolder) {
        const filename = `${note.id}.${parsed.ext}`;
        imgFolder.file(filename, parsed.data, { base64: true });
        // Replace base64 with relative link in the export
        note.photo = `diary-img://${filename}`;
      }
    } else if (note.photo && note.photo.startsWith('cap-img://')) {
      try {
        const filename = note.photo.replace('cap-img://', '');
        const fileData = await Filesystem.readFile({
          path: `${basePath}images/${filename}`,
          directory: Directory.Documents
        });
        if (imgFolder && fileData.data) {
          imgFolder.file(filename, fileData.data, { base64: true });
          note.photo = `diary-img://${filename}`;
        }
      } catch (e) {
        console.error('Failed to include capacitor image in zip:', e);
      }
    } else if (note.photo && note.photo.startsWith('diary-img://')) {
      try {
        if (window.electronAPI) {
          const filename = note.photo.replace('diary-img://', '');
          const base64 = await window.electronAPI.readImage(filename);
          if (base64) {
            const parsed = getBase64Data(base64);
            if (parsed && imgFolder) {
              imgFolder.file(filename, parsed.data, { base64: true });
            }
          }
        }
      } catch (e) {
        console.error('Failed to include image in zip:', e);
      }
    }

    // Process Audio
    if (note.audio) {
      note.audio = unresolveCapMediaUrl(note.audio, basePath);
    }
    
    if (note.audio && note.audio.includes('base64,')) {
      const parts = note.audio.split('base64,');
      if (parts.length === 2 && audioFolder) {
        const mimePart = parts[0];
        let ext = 'mp3';
        if (mimePart.includes('ogg')) ext = 'ogg';
        else if (mimePart.includes('wav')) ext = 'wav';
        else if (mimePart.includes('webm')) ext = 'webm';
        else if (mimePart.includes('mp4')) ext = 'mp4';
        else if (mimePart.includes('aac')) ext = 'aac';
        else ext = 'mp3';
        const filename = `audio_${note.id}.${ext}`;
        audioFolder.file(filename, parts[1], { base64: true });
        note.audio = `diary-audio://${filename}`;
      }
    } else if (note.audio && note.audio.startsWith('cap-audio://')) {
      try {
        const filename = note.audio.replace('cap-audio://', '');
        const fileData = await Filesystem.readFile({
          path: `audio/${filename}`,
          directory: Directory.Documents
        });
        if (audioFolder && fileData.data) {
          audioFolder.file(filename, fileData.data, { base64: true });
          note.audio = `diary-audio://${filename}`;
        }
      } catch (e) {
        console.error('Failed to include capacitor audio in zip:', e);
      }
    } else if (note.audio && note.audio.startsWith('diary-audio://')) {
      try {
        if (window.electronAPI && window.electronAPI.readAudio) {
          const filename = note.audio.replace('diary-audio://', '');
          const base64 = await window.electronAPI.readAudio(filename);
          if (base64) {
            const parts = base64.split('base64,');
            if (parts.length === 2 && audioFolder) {
              audioFolder.file(filename, parts[1], { base64: true });
            }
          }
        }
      } catch (e) {
        console.error('Failed to include audio in zip:', e);
      }
    } else if (note.audio && note.audio.startsWith('diary-img://')) {
      // Legacy audio support
      try {
        if (window.electronAPI) {
          const filename = note.audio.replace('diary-img://', '');
          const base64 = await window.electronAPI.readImage(filename);
          if (base64) {
            const parts = base64.split('base64,');
            if (parts.length === 2 && audioFolder) {
              audioFolder.file(filename, parts[1], { base64: true });
              note.audio = `diary-audio://${filename}`;
            }
          }
        }
      } catch (e) {
        console.error('Failed to include legacy audio in zip:', e);
      }
    }
  }
  
  zip.file('diary_notes_data.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes: notesCopy }, null, 2));
  
  return await zip.generateAsync({ type: 'blob' });
}

export async function importFromZip(file: File): Promise<Note[]> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  
  // Find JSON file anywhere in the archive (handles cases where zip has a root folder)
  const jsonFiles = Object.keys(contents.files).filter((relativePath) => 
    relativePath.endsWith('diary_notes_data.json') || 
    relativePath.endsWith('notes_data.json') || 
    relativePath.endsWith('notes.json')
  );
  
  if (jsonFiles.length === 0) throw new Error('JSON файл не найден в архиве');
  
  const jsonFile = contents.file(jsonFiles[0])!;
  // Extract the root path if the JSON was inside a folder (e.g., "Archive/diary_notes_data.json" -> "Archive/")
  const rootPath = jsonFile.name.substring(0, jsonFile.name.lastIndexOf('/') + 1);
  
  const jsonText = await jsonFile.async('string');
  const data = JSON.parse(jsonText);
  const notes: Note[] = Array.isArray(data) ? data : (data.notes || []);
  
  // Function to find a file safely by its name/path
  const findFile = (path: string) => {
    return contents.file(path) || contents.file(`${rootPath}${path}`);
  };

  // Restore images back to base64 so writeLocalData or IDB can save them
  for (const note of notes) {
    if (note.photo && note.photo.startsWith('diary-img://')) {
      const filename = note.photo.replace('diary-img://', '');
      const imgFile = findFile(`images/${filename}`);
      if (imgFile) {
        const base64Data = await imgFile.async('base64');
        let ext = filename.split('.').pop() || 'jpg';
        if (ext === 'jpg') ext = 'jpeg';
        note.photo = `data:image/${ext};base64,${base64Data}`;
      }
    }

    // Restore audio back to base64
    if (note.audio && note.audio.startsWith('diary-audio://')) {
      const filename = note.audio.replace('diary-audio://', '');
      const audioFile = findFile(`audio/${filename}`);
      if (audioFile) {
        const base64Data = await audioFile.async('base64');
        let ext = filename.split('.').pop() || 'mp3';
        if (ext === 'mp3') ext = 'mpeg';
        note.audio = `data:audio/${ext};base64,${base64Data}`;
      }
    } else if (note.audio && note.audio.startsWith('diary-img://')) {
      // Fallback for older backups where audio was saved in images/
      const filename = note.audio.replace('diary-img://', '');
      const audioFile = findFile(`images/${filename}`);
      if (audioFile) {
        const base64Data = await audioFile.async('base64');
        let ext = filename.split('.').pop() || 'mp3';
        if (ext === 'mp3') ext = 'mpeg';
        note.audio = `data:audio/${ext};base64,${base64Data}`;
      }
    }
  }
  
  return notes;
}