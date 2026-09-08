export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, filename, type = "text/plain") {
    downloadBlob(new Blob([text], { type }), filename);
}

/** Render a standalone SVG string to a PNG blob at the given pixel ratio. */
export function svgToPng(svgMarkup, width, height, ratio = 2) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            const ctx = canvas.getContext("2d");
            ctx.scale(ratio, ratio);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("SVG rasterisation failed"));
        };
        img.src = url;
    });
}
