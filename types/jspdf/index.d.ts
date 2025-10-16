declare module 'jspdf' {
  interface PageSize {
    getWidth(): number;
    getHeight(): number;
  }

  interface InternalAPI {
    pageSize: PageSize;
  }

  interface PDFProperties {
    title?: string;
    subject?: string;
    [key: string]: unknown;
  }

  export class jsPDF {
    constructor(options?: Record<string, unknown>);
    internal: InternalAPI;
    addPage(): void;
    text(text: string, x: number, y: number): void;
    setFont(fontName: string, fontStyle?: string): void;
    setFontSize(size: number): void;
    setTextColor(color: number | string): void;
    splitTextToSize(text: string, maxSize: number): string[];
    setProperties(properties: PDFProperties): void;
    save(filename: string): void;
  }
}
