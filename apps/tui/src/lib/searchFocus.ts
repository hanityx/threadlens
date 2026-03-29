type SearchKey = Partial<{
  tab: boolean;
  return: boolean;
  escape: boolean;
  upArrow: boolean;
  downArrow: boolean;
}>;

export function shouldLeaveSearchQueryMode(key: SearchKey): boolean {
  return Boolean(key.tab || key.return || key.escape);
}
