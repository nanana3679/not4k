import { validateChartDocument } from '../shared';
import type { ChartDocumentValidationInput, ChartViolationIndices, ValidationError } from '../shared';

// 불변 배열의 동일 참조를 다시 그릴 때 공용 관계·검증을 반복하지 않는다.
const cache = new WeakMap<ChartDocumentValidationInput['notes'], {
  input: ChartDocumentValidationInput; errors: ValidationError[];
}>();

export function editorChartErrors(input: ChartDocumentValidationInput): ValidationError[] {
  const previous = cache.get(input.notes);
  if (previous && previous.input.trillZones === input.trillZones
    && previous.input.restZones === input.restZones && previous.input.events === input.events) return previous.errors;
  const result = validateChartDocument(input);
  const errors = [...result.structural, ...result.semantic];
  cache.set(input.notes, { input, errors });
  return errors;
}

export function editorChartViolationIndices(input: ChartDocumentValidationInput): ChartViolationIndices {
  const result: ChartViolationIndices = { notes: new Set(), trillZones: new Set(), restZones: new Set(), events: new Set() };
  for (const error of editorChartErrors(input)) for (const ref of error.refs ?? []) {
    if (ref.kind === 'note') result.notes.add(ref.index);
    else if (ref.kind === 'trillZone') result.trillZones.add(ref.index);
    else if (ref.kind === 'restZone') result.restZones.add(ref.index);
    else if (ref.kind === 'event') result.events.add(ref.index);
  }
  return result;
}
