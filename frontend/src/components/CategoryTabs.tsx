import type { Mandate } from '../api/types';
import { titleCase } from '../api/mandates';

interface Props {
  categories: string[];
  mandates: Mandate[];
  selected: string | null;
  onSelect: (category: string) => void;
}

export function CategoryTabs({ categories, mandates, selected, onSelect }: Props) {
  if (categories.length <= 1) return null;
  const covered = new Set(mandates.map((mandate) => mandate.category));

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {categories.map((category) => {
        const active = category === selected;
        const hasMandate = covered.has(category);
        return (
          <button
            key={category}
            onClick={() => onSelect(category)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              padding: '0 16px',
              borderRadius: 'var(--radius-pill)',
              background: active ? 'var(--ink)' : 'var(--panel)',
              border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
              color: active ? '#fff' : 'var(--ink-dim)',
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              boxShadow: active ? 'none' : 'var(--lift)',
            }}
          >
            {titleCase(category)}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: hasMandate ? (active ? '#5fd6a4' : 'var(--ok)') : 'var(--ink-ghost)',
                flexShrink: 0,
              }}
              title={hasMandate ? 'covered by an active mandate' : 'no mandate yet'}
            />
          </button>
        );
      })}
    </div>
  );
}
