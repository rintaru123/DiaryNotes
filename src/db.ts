import { Note } from './types';
import { importFromZip } from './archive';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const DB_NAME = 'DailyNotesDB';
let capDocumentsUri = '';

if (Capacitor.isNativePlatform()) {
  Filesystem.getUri({ path: '', directory: Directory.Documents })
    .then(res => {
      capDocumentsUri = res.uri;
    }).catch(e => console.error(e));
}

function resolveCapMediaUrl(url: string | undefined, basePath: string = ''): string | undefined {
  if (!url) return url;
  if (!Capacitor.isNativePlatform() || !capDocumentsUri) return url;
  
  if (url.startsWith('cap-img://')) {
    const filename = url.replace('cap-img://', '');
    return Capacitor.convertFileSrc(`${capDocumentsUri}/${basePath}images/${filename}`);
  }
  if (url.startsWith('cap-audio://')) {
    const filename = url.replace('cap-audio://', '');
    return Capacitor.convertFileSrc(`${capDocumentsUri}/${basePath}audio/${filename}`);
  }
  return url;
}

export function unresolveCapMediaUrl(url: string | undefined, basePath: string = ''): string | undefined {
  if (!url) return url;
  if (!Capacitor.isNativePlatform()) return url;
  
  const capFilePrefix = Capacitor.convertFileSrc(`${capDocumentsUri}/${basePath}images/`);
  if (url.startsWith(capFilePrefix)) {
    return `cap-img://${url.replace(capFilePrefix, '')}`;
  }
  
  const capAudioPrefix = Capacitor.convertFileSrc(`${capDocumentsUri}/${basePath}audio/`);
  if (url.startsWith(capAudioPrefix)) {
    return `cap-audio://${url.replace(capAudioPrefix, '')}`;
  }
  
  return url;
}
const DB_VERSION = 1;
const STORE_NAME = 'notes';
const SETTINGS_STORE = 'settings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Request persistent storage so data is not cleared by browser
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    console.log(`Persistent storage ${granted ? 'granted' : 'denied'}`);
    return granted;
  }
  return false;
}

// Types for Electron
declare global {
  interface Window {
    electronAPI?: {
      readLocalData: () => Promise<Note[]>;
      writeLocalData: (notes: Note[]) => Promise<boolean>;
      readImage: (filename: string) => Promise<string | null>;
      readAudio: (filename: string) => Promise<string | null>;
    };
  }
}

export async function getAllNotes(): Promise<Note[]> {
  if (window.electronAPI) {
    return await window.electronAPI.readLocalData();
  }
  if (Capacitor.isNativePlatform()) {
    try {
      if (!capDocumentsUri) {
        const res = await Filesystem.getUri({ path: '', directory: Directory.Documents });
        capDocumentsUri = res.uri;
      }
      const customFolder = await getSetting('androidCustomFolder');
      const basePath = customFolder ? `${customFolder}/` : '';
      
      const result = await Filesystem.readFile({
        path: `${basePath}diary_notes_data.json`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      const data = JSON.parse(result.data as string);
      const notes: Note[] = data.notes || data;
      return notes.map(n => ({
        ...n,
        photo: resolveCapMediaUrl(n.photo, basePath),
        audio: resolveCapMediaUrl(n.audio, basePath)
      }));
    } catch {
      return [];
    }
  }
  const fileHandle = await getSetting('syncFileHandle');
  if (fileHandle) {
    const notes = await loadFromPortableFile(true);
    return notes || [];
  }
  return []; // If no file selected, return empty
}

export async function getNotesByDate(date: string): Promise<Note[]> {
  const all = await getAllNotes();
  return all.filter((n) => n.date === date);
}

export async function saveNote(note: Note): Promise<void> {
  const all = await getAllNotes();
  const index = all.findIndex((n) => n.id === note.id);
  if (index >= 0) all[index] = note;
  else all.push(note);

  await saveAllNotes(all);
}

async function saveAllNotes(all: Note[]): Promise<void> {
  if (window.electronAPI) {
    await window.electronAPI.writeLocalData(all);
    return;
  }
  if (Capacitor.isNativePlatform()) {
    try {
      if (!capDocumentsUri) {
        const res = await Filesystem.getUri({ path: '', directory: Directory.Documents });
        capDocumentsUri = res.uri;
      }
      const customFolder = await getSetting('androidCustomFolder');
      const basePath = customFolder ? `${customFolder}/` : '';
      
      await Filesystem.mkdir({ path: `${basePath}images`, directory: Directory.Documents, recursive: true }).catch(() => {});
      await Filesystem.mkdir({ path: `${basePath}audio`, directory: Directory.Documents, recursive: true }).catch(() => {});

      const savedImageNames = new Set<string>();
      const savedAudioNames = new Set<string>();

      // Work on a copy of notes to avoid mutating the ones actively rendered
      const notesToSave: Note[] = all.map(n => ({ ...n }));

      for (const note of notesToSave) {
        // Photo
        if (note.photo) {
          if (note.photo.startsWith('data:image/')) {
            const matches = note.photo.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (matches) {
              let ext = matches[1];
              if (ext === 'jpeg') ext = 'jpg';
              const base64Data = matches[2];
              const hash = Date.now().toString() + Math.random().toString(36).substring(2, 8);
              const filename = `img_${note.id}_${hash}.${ext}`;
              await Filesystem.writeFile({
                path: `${basePath}images/${filename}`,
                data: base64Data,
                directory: Directory.Documents
              });
              note.photo = `cap-img://${filename}`;
            }
          } else {
            note.photo = unresolveCapMediaUrl(note.photo, basePath);
          }
        }
        if (note.photo && note.photo.startsWith('cap-img://')) {
          savedImageNames.add(note.photo.replace('cap-img://', ''));
        }

        // Audio
        if (note.audio) {
          if (note.audio.includes('base64,')) {
            const parts = note.audio.split('base64,');
            if (parts.length === 2) {
              const mimePart = parts[0];
              let ext = 'mp3';
              if (mimePart.includes('ogg')) ext = 'ogg';
              else if (mimePart.includes('wav')) ext = 'wav';
              else if (mimePart.includes('webm')) ext = 'webm';
              else if (mimePart.includes('mp4')) ext = 'mp4';
              else if (mimePart.includes('aac')) ext = 'aac';
              
              const base64Data = parts[1];
              const hash = Date.now().toString() + Math.random().toString(36).substring(2, 8);
              const filename = `audio_${note.id}_${hash}.${ext}`;
              await Filesystem.writeFile({
                path: `${basePath}audio/${filename}`,
                data: base64Data,
                directory: Directory.Documents
              });
              note.audio = `cap-audio://${filename}`;
            }
          } else {
            note.audio = unresolveCapMediaUrl(note.audio, basePath);
          }
        }
        if (note.audio && note.audio.startsWith('cap-audio://')) {
          savedAudioNames.add(note.audio.replace('cap-audio://', ''));
        }
      }

      await Filesystem.writeFile({
        path: `${basePath}diary_notes_data.json`,
        data: JSON.stringify({ notes: notesToSave }),
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });

      // Cleanup images
      try {
        const imgDir = await Filesystem.readdir({ path: `${basePath}images`, directory: Directory.Documents });
        for (const file of imgDir.files) {
          if (!savedImageNames.has(file.name)) {
            await Filesystem.deleteFile({ path: `${basePath}images/${file.name}`, directory: Directory.Documents }).catch(()=>{});
          }
        }
      } catch (e) {}

      // Cleanup audio
      try {
        const audioDir = await Filesystem.readdir({ path: `${basePath}audio`, directory: Directory.Documents });
        for (const file of audioDir.files) {
          if (!savedAudioNames.has(file.name)) {
            await Filesystem.deleteFile({ path: `${basePath}audio/${file.name}`, directory: Directory.Documents }).catch(()=>{});
          }
        }
      } catch (e) {}

    } catch (e) {
      console.error('Filesystem save error:', e);
    }
    return;
  }
  const fileHandle = await getSetting('syncFileHandle');
  if (fileHandle) {
    await syncToPortableFile(all, true);
  }
}

export async function deleteNote(id: string): Promise<void> {
  let all = await getAllNotes();
  all = all.filter((n) => n.id !== id);
  await saveAllNotes(all);
}

export async function importNotes(notes: Note[]): Promise<void> {
  let all = await getAllNotes();
  const map = new Map(all.map(n => [n.id, n]));
  notes.forEach(n => map.set(n.id, n));
  await saveAllNotes(Array.from(map.values()));
}

export async function clearAllNotes(): Promise<void> {
  await saveAllNotes([]);
}

export async function getSetting(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSetting(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportNotesToJSON(notes: Note[]): Promise<string> {
  const customFolder = await getSetting('androidCustomFolder');
  const basePath = customFolder ? `${customFolder}/` : '';

  const cleanNotes = notes.map(n => ({
    ...n,
    photo: unresolveCapMediaUrl(n.photo, basePath),
    audio: unresolveCapMediaUrl(n.audio, basePath)
  }));
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: cleanNotes,
  }, null, 2);
}

export function downloadJSON(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function parseImportFile(file: File): Promise<Note[]> {
  if (file.name.endsWith('.zip')) {
    return await importFromZip(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.notes && Array.isArray(json.notes)) {
          resolve(json.notes);
        } else if (Array.isArray(json)) {
          resolve(json);
        } else {
          reject(new Error('Неверный формат файла'));
        }
      } catch {
        reject(new Error('Ошибка парсинга JSON'));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file);
  });
}

// Portable Mode (File System Access API)
export async function setupPortableFile(createNew: boolean = false): Promise<boolean> {
  if (window.electronAPI) {
    alert('Вы используете Electron-версию, данные автоматически сохраняются в папке с программой!');
    return false;
  }
  if (!('showOpenFilePicker' in window)) {
    alert('Ваш браузер не поддерживает прямое сохранение в файл. Используйте Chrome, Edge или Opera.');
    return false;
  }
  try {
    let fileHandle;
    const options = {
      types: [{
        description: 'JSON Files',
        accept: { 'application/json': ['.json'] },
      }],
    };
    if (createNew) {
      fileHandle = await (window as any).showSaveFilePicker({
        ...options,
        suggestedName: 'diary_notes_data.json',
      });
      // Initialize with empty notes
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ notes: [] }));
      await writable.close();
    } else {
      const [handle] = await (window as any).showOpenFilePicker(options);
      fileHandle = handle;
    }
    
    await saveSetting('syncFileHandle', fileHandle);
    return true;
  } catch (e) {
    console.error('Ошибка выбора файла', e);
    return false;
  }
}

export async function verifyPortablePermission(fileHandle: any, withWrite: boolean = true, promptUser: boolean = true): Promise<boolean> {
  const opts = { mode: withWrite ? 'readwrite' : 'read' };
  if ((await fileHandle.queryPermission(opts)) === 'granted') {
    return true;
  }
  if (!promptUser) {
    console.warn('Требуется разрешение пользователя на доступ к файлу');
    return false;
  }
  try {
    if ((await fileHandle.requestPermission(opts)) === 'granted') {
      return true;
    }
  } catch (e) {
    console.error('Ошибка запроса прав', e);
  }
  return false;
}

export async function syncToPortableFile(notes: Note[], promptUser: boolean = false): Promise<void> {
  if (window.electronAPI) return;
  try {
    const fileHandle = await getSetting('syncFileHandle');
    if (!fileHandle) return;
    
    if (!(await verifyPortablePermission(fileHandle, true, promptUser))) {
      console.warn('Нет прав на запись в файл. Синхронизация приостановлена.');
      return;
    }

    const exportData = await exportNotesToJSON(notes);

    const writable = await fileHandle.createWritable();
    await writable.write(exportData);
    await writable.close();
  } catch (e) {
    console.error('Ошибка записи в файл', e);
  }
}

export async function loadFromPortableFile(promptUser: boolean = false): Promise<Note[] | null> {
  if (window.electronAPI) return null;
  try {
    const fileHandle = await getSetting('syncFileHandle');
    if (!fileHandle) return null;

    if (!(await verifyPortablePermission(fileHandle, false, promptUser))) {
      console.warn('Нет прав на чтение файла');
      return null;
    }

    const file = await fileHandle.getFile();
    const text = await file.text();
    const json = JSON.parse(text);
    
    return json.notes || json;
  } catch (e) {
    console.warn('Файл данных не найден или ошибка чтения', e);
    return null;
  }
}

export async function disconnectPortableFile(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete('syncFileHandle');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}