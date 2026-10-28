import { useQuery } from "@tanstack/react-query";
export let csrfToken = "";
export function setCsrf(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  envelope = false,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`/api${url}`, {
    method,
    credentials: "include",
    headers: {
      ...(form ? {} : { "Content-Type": "application/json" }),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok)
    throw new ApiError(
      res.status,
      result.error?.message ?? "通信に失敗しました",
    );
  return (envelope ? result : result.data) as T;
}
export function usePagedApi<T>(url: string) {
  return useQuery({
    queryKey: [url],
    queryFn: () =>
      api<{
        data: T[];
        pageInfo: { total: number; nextCursor: string | null };
      }>(url, "GET", undefined, true),
    retry: false,
  });
}
export function useApi<T>(url: string, enabled = true, interval?: number) {
  return useQuery({
    queryKey: [url],
    queryFn: () => api<T>(url),
    enabled,
    refetchInterval: interval,
    retry: false,
  });
}
