import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A window whose panel was unmounted a moment ago. Closing waits one tick, so a panel that is
 * mounted again straight away (React's development-mode double mount, or a re-render that
 * recreates it) reuses its window instead of racing a window that is still closing.
 */
const closing = new Map<string, { win: Window; timer: number }>();

/**
 * Renders its children in a window of their own, opened by the pop-out button on a run panel.
 *
 * The children are a React portal, so they stay part of this page: the panel keeps receiving
 * the same live state (frames, console lines, the Terminal session) and stays interactive, with
 * no messages passed between windows. The page's stylesheets are copied into the new window so
 * the panel looks the same there.
 *
 * Closing the window (its own close button, or the operating system's) calls onClosed, which puts
 * the panel back in the overlay. Unmounting this component closes the window, and so does leaving
 * or reloading the page, since a portal has nothing to render into once the page is gone.
 */
export function PopOut({
  name,
  title,
  onClosed,
  children,
}: {
  /** The window's name. Popping the same panel out again reuses its window. */
  name: string;
  title: string;
  onClosed: () => void;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closed = useRef(onClosed);
  closed.current = onClosed;

  useLayoutEffect(() => {
    const pending = closing.get(name);
    if (pending) {
      window.clearTimeout(pending.timer);
      closing.delete(name);
    }
    const win =
      pending && !pending.win.closed ? pending.win : window.open('', 'studio-' + name, 'popup=yes,width=900,height=640');
    if (!win) {
      // Blocked by the browser. The panel stays in the overlay rather than disappear.
      closed.current();
      return;
    }
    const doc = win.document;
    const copyStyles = (): void => {
      doc.head.replaceChildren(
        ...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.cloneNode(true)),
      );
      doc.title = title + ' - Learning Studio';
    };
    copyStyles();
    doc.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') ?? 'dark');
    doc.body.replaceChildren();
    doc.body.className = 'popout-body';
    const root = doc.createElement('div');
    root.className = 'popout';
    doc.body.append(root);
    setHost(root);

    const onUnload = (): void => closed.current();
    win.addEventListener('pagehide', onUnload);
    const closeWithPage = (): void => win.close();
    window.addEventListener('pagehide', closeWithPage);
    win.focus();

    return () => {
      window.removeEventListener('pagehide', closeWithPage);
      win.removeEventListener('pagehide', onUnload);
      closing.set(name, {
        win,
        timer: window.setTimeout(() => {
          closing.delete(name);
          win.close();
        }, 0),
      });
      setHost(null);
    };
  }, [name, title]);

  // Vite injects a new <style> whenever a stylesheet changes in development. Mirror them, so an
  // edit to styles.css shows in a popped-out panel too, without reopening it.
  useEffect(() => {
    if (!host) return;
    const doc = host.ownerDocument;
    const mirror = new MutationObserver(() => {
      doc.head.replaceChildren(
        ...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.cloneNode(true)),
      );
      doc.title = title + ' - Learning Studio';
    });
    mirror.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mirror.disconnect();
  }, [host, title]);

  return host ? createPortal(children, host) : null;
}
