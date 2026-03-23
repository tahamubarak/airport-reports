import React from 'react';
import { STATUS_COLORS, STATUS_DOT_COLORS } from '../../types';

interface BadgeProps {
  label: string;
  variant?: 'status' | 'pill' | 'outline';
  color?: 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple';
}

const COLOR_MAP = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'pill', color = 'slate' }) => {
  if (variant === 'status') {
    const statusClass = STATUS_COLORS[label] || STATUS_COLORS['Unknown'];
    const dotClass = STATUS_DOT_COLORS[label] || STATUS_DOT_COLORS['Unknown'];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${COLOR_MAP[color]}`}
    >
      {label}
    </span>
  );
};

interface AdiProps {
  adi: 'A' | 'D';
}

export const AdiBadge: React.FC<AdiProps> = ({ adi }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
      adi === 'A'
        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
        : 'bg-rose-50 text-rose-700 border-rose-200'
    }`}
  >
    {adi === 'A' ? '↓ ARR' : '↑ DEP'}
  </span>
);
