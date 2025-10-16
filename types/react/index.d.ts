declare module 'react' {
  export as namespace React;
  export type Key = string | number | null;

  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    readonly type: T;
    readonly props: P;
    readonly key: Key;
  }

  export interface JSXElementConstructor<P> {
    (props: P): ReactElement | null;
  }

  export interface ReactNodeArray extends Array<ReactNode> {}

  export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNodeArray;

  export interface FC<P = {}> {
    (props: P & { children?: ReactNode }): ReactElement | null;
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
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: ReadonlyArray<unknown>): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;

  export type DependencyList = ReadonlyArray<unknown>;

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
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> {
    key: string;
  }
  export interface DragEvent<T = Element> extends BaseSyntheticEvent<globalThis.DragEvent, T, T> {
    dataTransfer: DataTransfer;
  }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, globalThis.MouseEvent> {}
  export interface PointerEvent<T = Element> extends SyntheticEvent<T, globalThis.PointerEvent> {}

  export namespace JSX {
    interface Element extends ReactElement {}
    interface ElementClass {
      render: () => unknown;
    }
    interface ElementAttributesProperty {
      props: Record<string, unknown>;
    }
    interface ElementChildrenAttribute {
      children: ReactNode;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }

  export const Fragment: unique symbol;

  const React: {
    createElement: (type: any, props: any, ...children: ReactNode[]) => ReactElement;
  };

  export default React;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}
