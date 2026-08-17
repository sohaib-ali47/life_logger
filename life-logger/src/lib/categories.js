// Categorical slots from the validated dark palette, in fixed slot order.
// Order is the CVD-safety mechanism — do not re-order or extend past 8.
// Validated: dark mode, surface #141821, all six checks pass.
export const CATEGORIES = [
  { id: 'study', label: 'Study', color: '#3987e5' },
  { id: 'work', label: 'Work', color: '#d95926' },
  { id: 'exercise', label: 'Exercise', color: '#199e70' },
  { id: 'reading', label: 'Reading', color: '#c98500' },
  { id: 'creative', label: 'Creative', color: '#d55181' },
  { id: 'social', label: 'Social', color: '#008300' },
  { id: 'rest', label: 'Rest', color: '#9085e9' },
  { id: 'other', label: 'Other', color: '#e66767' },
]

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

export const categoryOf = (id) => BY_ID.get(id) ?? CATEGORIES[CATEGORIES.length - 1]
