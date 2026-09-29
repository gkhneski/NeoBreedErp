"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ fileName }: { fileName: string }) {
  // Tarayıcı, PDF dosya adını sayfa başlığından alır.
  function print() {
    const previous = document.title;
    document.title = fileName;
    window.print();
    document.title = previous;
  }

  return (
    <Button onClick={print} className="print:hidden">
      PDF Kaydet / Yazdır
    </Button>
  );
}
