'use client';

import { useRef, useCallback } from 'react';

const MAX_HISTORY = 50;

interface InputHistoryState {
  past: string[];
  present: string;
  future: string[];
}

export function useInputHistory(
  value: string,
  onChange: (value: string) => void
) {
  const stateRef = useRef<InputHistoryState>({ past: [], present: value, future: [] });
  const ignoreRef = useRef(false);

  // Sync external value changes (e.g. voice input) into history
  if (!ignoreRef.current && value !== stateRef.current.present) {
    stateRef.current = {
      past: [...stateRef.current.past, stateRef.current.present].slice(-MAX_HISTORY),
      present: value,
      future: [],
    };
  }
  ignoreRef.current = false;

  const undo = useCallback(() => {
    const s = stateRef.current;
    if (s.past.length === 0) return false;

    ignoreRef.current = true;
    const newPresent = s.past[s.past.length - 1];
    stateRef.current = {
      past: s.past.slice(0, -1),
      present: newPresent,
      future: [s.present, ...s.future],
    };
    onChange(newPresent);
    return true;
  }, [onChange]);

  const redo = useCallback(() => {
    const s = stateRef.current;
    if (s.future.length === 0) return false;

    ignoreRef.current = true;
    const newPresent = s.future[0];
    stateRef.current = {
      past: [...s.past, s.present],
      present: newPresent,
      future: s.future.slice(1),
    };
    onChange(newPresent);
    return true;
  }, [onChange]);

  return { undo, redo, canUndo: stateRef.current.past.length > 0, canRedo: stateRef.current.future.length > 0 };
}
