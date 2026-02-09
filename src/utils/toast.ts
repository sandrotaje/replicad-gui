export type ToastType = 'success' | 'error' | 'info';

let addToastGlobal: ((message: string, type: ToastType) => void) | null = null;

/** Show a toast notification from anywhere in the app */
export function showToast(message: string, type: ToastType = 'info') {
  addToastGlobal?.(message, type);
}

/** Internal: register the toast handler from ToastContainer */
export function registerToastHandler(handler: (message: string, type: ToastType) => void) {
  addToastGlobal = handler;
}

/** Internal: unregister the toast handler */
export function unregisterToastHandler() {
  addToastGlobal = null;
}
