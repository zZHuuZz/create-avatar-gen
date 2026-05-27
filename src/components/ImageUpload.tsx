'use client';

import { useRef, useState } from 'react';

interface Props {
  value: string | null;
  onChange: (base64: string) => void;
  label?: string;
  compact?: boolean;
}

export function ImageUpload({ value, onChange, label = 'Portrait', compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') onChange(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  if (value) {
    return (
      <div className="relative group">
        <img
          src={value}
          alt="Portrait"
          className={`w-full object-cover rounded-xl border border-(--color-border) ${compact ? 'max-h-48' : 'max-h-72'}`}
          style={{ objectPosition: 'top' }}
        />
        <button
          onClick={() => onChange('')}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Change
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all
        ${compact ? 'p-6' : 'p-10'}
        ${dragging
          ? 'border-(--color-primary) bg-(--color-primary-light)'
          : 'border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-muted)'}
      `}
    >
      <div className="w-12 h-12 rounded-xl bg-(--color-muted) flex items-center justify-center text-2xl">
        🖼️
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-(--color-foreground)">
          Drop your {label.toLowerCase()} here
        </p>
        <p className="text-xs text-(--color-secondary) mt-1">or click to browse</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
    </div>
  );
}
