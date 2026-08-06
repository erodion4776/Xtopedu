'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

const SelectContext = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}>({
  value: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
});

function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <SelectContext.Provider
      value={{ value, onValueChange, open, setOpen }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = React.useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-10 w-full items-center justify-between',
        'rounded-md border border-input bg-background px-3 py-2',
        'text-sm ring-offset-background',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
    </button>
  );
}

function SelectValue({
  placeholder,
}: {
  placeholder?: string;
}) {
  const { value } = React.useContext(SelectContext);
  return (
    <span className={!value ? 'text-muted-foreground' : ''}>
      {value || placeholder}
    </span>
  );
}

function SelectContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { open, setOpen } = React.useContext(SelectContext);
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setOpen(false)}
      />
      <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-white shadow-lg">
        <div className="p-1">{children}</div>
      </div>
    </>
  );
}

function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const {
    onValueChange,
    setOpen,
    value: selected,
  } = React.useContext(SelectContext);
  return (
    <div
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      className={cn(
        'relative flex cursor-pointer select-none items-center',
        'rounded-sm px-2 py-1.5 text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground',
        selected === value && 'bg-accent'
      )}
    >
      {children}
    </div>
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
