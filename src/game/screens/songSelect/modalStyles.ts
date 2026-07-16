import type React from 'react';
import { font, color, surface, edge, radius, primitives } from '../../../shared/theme';

export const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.66)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    background: surface.panel,
    border: `1px solid ${color.line}`,
    borderRadius: radius.md,
    padding: '20px',
    minWidth: '280px',
    color: color.ink,
    fontFamily: font.body,
    boxShadow: `${edge.metal}, 0 20px 60px -20px rgba(0,0,0,0.8)`,
  },
  title: {
    margin: '0 0 16px',
    fontFamily: font.display,
    fontSize: '16px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: color.ink,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '12px',
    fontFamily: font.display,
    fontSize: '13px',
    color: color.inkDim,
  },
  input: {
    minHeight: '40px',
    padding: '6px 10px',
    background: surface.button,
    color: color.ink,
    border: `1px solid ${color.line}`,
    borderRadius: radius.sm,
    fontFamily: font.body,
    fontSize: '14px',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  saveBtn: {
    ...primitives.neonButton,
    padding: '0 16px',
    fontSize: '13px',
  },
  cancelBtn: {
    ...primitives.ghostButton,
    padding: '0 16px',
    fontSize: '13px',
    marginLeft: 'auto',
  },
};
