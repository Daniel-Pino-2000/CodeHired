// How far a store that belongs to the signed-in user got loading its data: 'idle' (nobody signed
// in), 'loading', 'ready' or 'error' (the store's `error` says why)
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
