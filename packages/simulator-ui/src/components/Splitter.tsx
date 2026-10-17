/**
 * A draggable separator between two panels. It reports the size its panel would take,
 * `value` plus the pointer's travel (reversed by `direction: -1` for a panel on the far side);
 * the owner clamps it. A double click restores the default size.
 */
import { createSignal } from 'solid-js';

export interface SplitterProps {
  /** `vertical`: a bar between columns, dragged sideways; `horizontal`: between rows. */
  orientation: 'vertical' | 'horizontal';
  /** The size of the panel being resized when the drag starts. */
  value: number;
  direction?: 1 | -1;
  onChange: (size: number) => void;
  /** Called when the drag ends (to remember the size). */
  onCommit?: () => void;
  onReset?: () => void;
  label: string;
}

export function Splitter(props: SplitterProps) {
  let start: { at: number; value: number } | undefined;
  const [dragging, setDragging] = createSignal(false);
  const at = (e: PointerEvent) => props.orientation === 'vertical' ? e.clientX : e.clientY;
  const cursor = () => props.orientation === 'vertical' ? 'sim-resizing' : 'sim-resizing-rows';

  const end = () => {
    if (!start) return;
    start = undefined;
    setDragging(false);
    document.documentElement.classList.remove(cursor());
    props.onCommit?.();
  };

  return (
    <div
      class={`sim-splitter sim-splitter-${props.orientation}${dragging() ? ' sim-dragging' : ''}`}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.label}
      title="Drag to resize; double-click to reset"
      onPointerDown={e => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start = { at: at(e), value: props.value };
        setDragging(true);
        document.documentElement.classList.add(cursor());
      }}
      onPointerMove={e => { if (start) props.onChange(start.value + (props.direction ?? 1) * (at(e) - start.at)); }}
      onPointerUp={end}
      onPointerCancel={end}
      onDblClick={() => props.onReset?.()}
    />
  );
}
