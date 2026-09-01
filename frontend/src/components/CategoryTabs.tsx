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
              padding: '8px 14px',
              background: active ? 'var(--panel)' : 'transparent',
              border: `1px solid ${active ? 'var(--amber)' : 'var(--line)'}`,
              color: active ? 'var(--amber)' : 'var(--ink-faint)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {titleCase(category)}
            <span
              style={{
                width: 6,
                height: 6,
                background: hasMandate ? 'var(--ok)' : 'var(--ink-ghost)',
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
