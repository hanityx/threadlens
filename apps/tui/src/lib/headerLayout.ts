export function resolveHeaderLayout(input: {
  columns: number;
  apiLabel: string;
}): {
  stacked: boolean;
  metaText: string;
} {
  const { columns, apiLabel } = input;
  if (columns < 96) {
    return {
      stacked: true,
      metaText: `${apiLabel} · ? · q`,
    };
  }
  return {
    stacked: false,
    metaText: `${apiLabel}  ·  ? help  ·  q quit`,
  };
}
