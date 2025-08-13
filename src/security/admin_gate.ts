export const isAdmin = (id: string | number): boolean => {
  const idStr = String(id);
  const list = String(process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length && list.includes(idStr)) return true;
  const legacy = String(process.env.ADMIN_CHAT_ID || '').trim();
  if (legacy && legacy === idStr) return true;
  return false;
};

export const requireAdmin = (id: string | number): void => {
  if (!isAdmin(id)) {
    const err: any = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
};


