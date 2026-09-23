import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';

const PAGE_SIZE = 24;

interface ResultState {
  items: MediaAttachment[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
}

interface Options {
  serverUrl: string;
  endpoint: 'gifs' | 'sounds';
  query: string;
  onError: (message: string) => void;
}

/** Loads media pages as the results pane scrolls, caching each query/page locally. */
export function useInfiniteMedia({ serverUrl, endpoint, query, onError }: Options) {
  const normalizedQuery = query.trim();
  const cacheKey = `${serverUrl}|${endpoint}|${normalizedQuery.toLowerCase()}`;
  const [state, setState] = useState<ResultState>({ items: [], loading: true, loadingMore: false, hasMore: true });
  const pageCache = useRef(new Map<string, MediaAttachment[]>());
  const requestId = useRef(0);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchPage = useCallback(async (key: string, page: number): Promise<MediaAttachment[]> => {
    const pageKey = `${key}|${page}`;
    const cached = pageCache.current.get(pageKey);
    if (cached) return cached;

    const path = normalizedQuery
      ? `/api/media/${endpoint}/search?q=${encodeURIComponent(normalizedQuery)}&page=${page}`
      : `/api/media/${endpoint}/trending?page=${page}`;
    const response = await fetch(`${serverUrl}${path}`);
    if (!response.ok) throw new Error(`Media request failed (${response.status})`);
    const body = await response.json();
    const items: MediaAttachment[] = Array.isArray(body.data) ? body.data : [];
    pageCache.current.set(pageKey, items);
    return items;
  }, [cacheKey, endpoint, normalizedQuery, serverUrl]);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    pageRef.current = 0;
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
    setState({ items: [], loading: true, loadingMore: false, hasMore: true });

    const loadFirstPage = async () => {
      try {
        const items = await fetchPage(cacheKey, 1);
        if (cancelled || id !== requestId.current) return;
        pageRef.current = 1;
        hasMoreRef.current = items.length === PAGE_SIZE;
        setState({ items, loading: false, loadingMore: false, hasMore: hasMoreRef.current });
      } catch {
        if (cancelled || id !== requestId.current) return;
        setState({ items: [], loading: false, loadingMore: false, hasMore: true });
        onErrorRef.current(`Could not load ${endpoint}`);
      }
    };

    const timer = setTimeout(() => { void loadFirstPage(); }, normalizedQuery ? 150 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cacheKey, endpoint, fetchPage, normalizedQuery]);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || loadingMoreRef.current || pageRef.current === 0) return;
    const id = requestId.current;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setState((current) => ({ ...current, loadingMore: true }));

    try {
      const nextItems = await fetchPage(cacheKey, nextPage);
      if (id !== requestId.current) return;
      pageRef.current = nextPage;
      hasMoreRef.current = nextItems.length === PAGE_SIZE;
      setState((current) => ({
        items: [...current.items, ...nextItems],
        loading: false,
        loadingMore: false,
        hasMore: hasMoreRef.current,
      }));
    } catch {
      if (id === requestId.current) {
        setState((current) => ({ ...current, loadingMore: false }));
        onErrorRef.current(`Could not load more ${endpoint}`);
      }
    } finally {
      if (id === requestId.current) loadingMoreRef.current = false;
    }
  }, [cacheKey, endpoint, fetchPage]);

  return { ...state, loadMore };
}
