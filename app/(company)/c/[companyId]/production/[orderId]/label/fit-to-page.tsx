"use client";

import { useLayoutEffect } from "react";

// Kart tek A4'e sığana kadar değişken uzunluktaki bölümün puntosunu küçültür.
export function FitToPage({ cardId, bodyId }: { cardId: string; bodyId: string }) {
  useLayoutEffect(() => {
    const card = document.getElementById(cardId);
    const body = document.getElementById(bodyId);
    if (!card || !body) return;

    const fit = () => {
      let size = parseFloat(getComputedStyle(body).fontSize);
      const min = size * 0.55;
      while (card.scrollHeight > card.clientHeight && size > min) {
        size -= 0.25;
        body.style.fontSize = `${size}px`;
      }
    };

    fit();
    // Web fontu yüklenince satır yükseklikleri değişebilir.
    void document.fonts.ready.then(fit);
  }, [cardId, bodyId]);

  return null;
}
