declare module 'react' {
  export as namespace React;

  export type ReactNode = unknown;
  export interface ReactElement<P = unknown, T extends string | React.JSXElementConstructor<any> = string | React.JSXElementConstructor<any>> {
    readonly type: T;
    readonly props: P;
    readonly key: string | number | null;
  }

  export namespace React {
    type ReactNode = import('react').ReactNode;
    interface ReactElement<P = unknown, T extends string | React.JSXElementConstructor<any> = string | React.JSXElementConstructor<any>> {
      readonly type: T;
      readonly props: P;
      readonly key: string | number | null;
    }
  }

  export interface MutableRefObject<T> {
    current: T;
  }

  export interface RefObject<T> {
    readonly current: T | null;
  }

  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);

  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T;
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: ReadonlyArray<unknown>): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;

  export type DependencyList = ReadonlyArray<unknown>;

  export interface JSXElementConstructor<P> {
    (props: P): ReactElement | null;
  }

  export interface SyntheticEvent<T = EventTarget, E = Event> {
    nativeEvent: E;
    currentTarget: T;
    target: T;
    preventDefault(): void;
    stopPropagation(): void;
  }

  export interface BaseSyntheticEvent<E = Event, C = EventTarget, T = EventTarget> extends SyntheticEvent<T, E> {
    currentTarget: C;
  }

  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {}
  export interface DragEvent<T = Element> extends BaseSyntheticEvent<globalThis.DragEvent, T, T> {
    dataTransfer: DataTransfer;
  }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> {
    key: string;
  }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, globalThis.MouseEvent> {}
  export interface PointerEvent<T = Element> extends SyntheticEvent<T, globalThis.PointerEvent> {}

  export interface Attributes {
    key?: string | number | null | undefined;
  }

  export interface ClassAttributes<T> extends Attributes {
    ref?: MutableRefObject<T | null> | ((instance: T | null) => void) | null;
  }

  export interface HTMLAttributes<T> extends Attributes {
    [key: string]: unknown;
  }

  export interface DetailedHTMLProps<E extends HTMLAttributes<T>, T> extends E {}

  export interface FC<P = {}> {
    (props: P & { children?: ReactNode }): ReactElement | null;
  }

  export interface Context<T> {
    Provider: FC<{ value: T }>;
    Consumer: FC<{ children: (value: T) => ReactNode }>;
  }

  export const Fragment: unique symbol;

  export namespace JSX {
    interface Element extends ReactElement {}
    interface ElementClass {
      render: () => ReactNode;
    }
    interface ElementAttributesProperty {
      props: Record<string, unknown>;
    }
    interface ElementChildrenAttribute {
      children: Record<string, unknown>;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }

  const React: {
    createElement: (...args: unknown[]) => ReactElement;
  };

  export default React;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}
