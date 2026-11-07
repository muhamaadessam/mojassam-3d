export type User = { id: string; email: string; first_name: string; last_name: string; avatar_url: string; is_admin?: boolean };
export async function authRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ الطلب.');
  return result;
}
